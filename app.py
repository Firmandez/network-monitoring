# app.py - VERSI THREADING (CLEAN & STABLE)

# IMPORTANT: Monkey Patch untuk Eventlet (Wajib ditaruh paling atas)
import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify, request
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv
import psycopg2
from concurrent.futures import ThreadPoolExecutor
import threading
import subprocess
import platform
import atexit
import signal
import sys
import os
from datetime import datetime

# Import Blueprints dan Config
from auth import auth_bp
from db import close_db
# Import config (Pastikan file config.py ada)
from config import DEVICES, FLOOR_MAPS, FLOOR_LABELS, DEVICE_TYPES, SECRET_KEY

# Muat environment variables dari .env
load_dotenv()

app = Flask(__name__)

# FIX: Agar Flask mengenali IP asli & Protocol dari Caddy (Reverse Proxy)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

app.config['SECRET_KEY'] = SECRET_KEY

# --- TRUST PROXY HEADERS (untuk Caddy reverse proxy) ---
# CRITICAL: Caddy forward X-Forwarded-* headers, Flask perlu trust ini
app.config['TRUSTED_HOSTS'] = ['127.0.0.1', '192.168.68.109', '*']

# --- CSP HEADERS ---
@app.after_request
def set_security_headers(response):
    # PERMISSIVE CSP untuk Socket.IO + source maps
    response.headers['Content-Security-Policy'] = "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.socket.io https:; connect-src 'self' ws: wss: https://cdn.socket.io https:; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    return response

# --- SETTING SOCKET.IO ---
# IMPORTANT: Untuk Gunicorn + Gevent (production)
socketio = SocketIO(
    app, 
    async_mode='eventlet',
    cors_allowed_origins="*",
    # UBAH BARIS DI BAWAH INI:
    transports=['polling', 'websocket'], # Ganti 'http_long_polling' jadi 'polling'
    # ...
    ping_timeout=60,
    ping_interval=25,
    engineio_logger=False,
    logger=False,
)

# Global state
device_status = {}  # Simpan status terakhir
event_logs = []     # Simpan log history

# Lock biar thread gak rebutan data
status_lock = threading.RLock()

# Flag untuk monitoring
monitoring_started = False

# --- PROPER SHUTDOWN HANDLER ---
def shutdown_handler(signum=None, frame=None):
    """Gracefully handle shutdown signals."""
    print(f"\n{'='*50}")
    print(f"Received signal {signum}. Shutting down gracefully...")
    # This will allow atexit and finally blocks to execute
    sys.exit(0)


# Register signal handlers for graceful shutdown
signal.signal(signal.SIGTERM, shutdown_handler)
signal.signal(signal.SIGINT, shutdown_handler)
if hasattr(signal, 'SIGQUIT'):
    signal.signal(signal.SIGQUIT, shutdown_handler)

# Register cleanup functions that will be called on exit
app.teardown_appcontext(close_db)

# --- FUNGSI PING ---
def ping_device(ip):
    try:
        if not ip: return False
        
        # Deteksi OS otomatis
        param = '-n' if platform.system().lower() == 'windows' else '-c'
        timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'
        
        # Command ping
        # NOTE: On Windows '-w' expects milliseconds (use 500ms),
        # on Unix '-W' expects seconds — using 1 second to avoid
        # long blocking pings that stall the server.
        timeout_val = '500' if platform.system().lower() == 'windows' else '1'
        command = ['ping', param, '1', timeout_param, timeout_val, ip]
        
        # Sembunyikan window cmd di Windows
        kwargs = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
        if platform.system().lower() == 'windows':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            
        return subprocess.call(command, **kwargs) == 0
        
    except Exception as e:
        print(f"⚠️ Ping Error ({ip}): {e}")
        return False

# --- WORKER BUAT NGECEK 1 DEVICE ---
def check_single_device(device):
    try:
        device_id = device['id']
        is_online = ping_device(device['ip'])
        
        with status_lock:
            # Cek status lama
            status_info = device_status.get(device_id, {'online': False})
            old_status = status_info.get('online', False)
            
            # Simpan status baru
            device_status[device_id] = {
                'online': is_online,
                'last_checked': datetime.now()
            }
            
            # LOGIC LOGGING
            if device_id in device_status and old_status != is_online:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                status_text = "Online" if is_online else "Offline"
                log_entry = {
                    "timestamp": timestamp,
                    "device": device['name'],
                    "status": status_text,
                    "message": f"{device['name']} is now {status_text}"
                }
                event_logs.insert(0, log_entry)
                if len(event_logs) > 20: event_logs.pop() # Simpan 20 log terakhir
                
                print(f"{device['name']} -> {status_text}")

    except Exception as e:
        print(f"Error checking {device['name']}: {e}")

# --- BACKGROUND TASK ---
def background_monitoring():
    print("Monitoring Service Started (Threading Mode)...")
    
    # Create executor di dalam loop
    while True:
        try:
            # A. PING SEMUA DEVICE (Parallel 20 Thread)
            with ThreadPoolExecutor(max_workers=20, thread_name_prefix="ping_") as executor:
                futures = []
                for device in DEVICES:
                    future = executor.submit(check_single_device, device)
                    futures.append(future)
                
                # Wait for all to complete
                for future in futures:
                    try:
                        future.result(timeout=10)
                    except Exception as e:
                        print(f"Ping error: {e}")
            
            # B. BROADCAST DATA via emit_update
            emit_update()
            
            # C. Istirahat 5 detik
            socketio.sleep(5)
            
        except Exception as e:
            print(f"Loop Error: {e}")
            socketio.sleep(10)

# --- ROUTES ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/config')
def get_config():
    return jsonify({
        'floor_maps': FLOOR_MAPS,
        'floor_labels': FLOOR_LABELS,
        'device_types': DEVICE_TYPES
    })

# --- SOCKET.IO EVENTS ---
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print(f"[Socket.IO] Client connected: {request.sid}")
    print(f"   - Remote: {request.remote_addr}")
    print(f"   - User-Agent: {request.headers.get('User-Agent', 'Unknown')[:50]}")
    # Broadcast initial data
    emit_update()

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnect"""
    print(f"[Socket.IO] Client disconnected: {request.sid}")

@socketio.on('connect_error')
def handle_connect_error(data):
    """Handle connection error"""
    print(f"[Socket.IO] Connection error: {data}")

def emit_update():
    """Emit data update to all connected clients"""
    devices_data = []
    total_online = 0
    total_offline = 0
    
    with status_lock:
        for device in DEVICES:
            d_stat = device_status.get(device['id'], {'online': False})
            is_online = d_stat['online']
            
            if is_online: total_online += 1
            else: total_offline += 1
            
            devices_data.append({
                **device,
                'online': is_online
            })

    packet = {
        'devices': devices_data,
        'global': {
            'total': len(DEVICES),
            'online': total_online,
            'offline': total_offline
        },
        'logs': event_logs[:10],
        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    socketio.emit('update_data', packet)

# --- START MONITORING ON APP INIT ---
def start_monitoring():
    global monitoring_started
    if not monitoring_started:
        monitoring_started = True
        print("\n" + "="*60)
        print("Starting background monitoring...")
        print("="*60 + "\n")
        socketio.start_background_task(background_monitoring)

# Auto-start monitoring ketika app dijalankan (baik dev maupun production)
# IMPORTANT: harus jalan setelah socketio.init_app()
start_monitoring()

# --- REGISTER BLUEPRINTS ---
app.register_blueprint(auth_bp, url_prefix='/auth')

# --- MAIN ENTRY POINT ---
if __name__ == '__main__':
    print("="*60)
    print("NOC Network Monitoring System")
    print("="*60)
    print("\nDevelopment Server (use gunicorn for production)")
    print("Server running at http://0.0.0.0:5000")
    print("="*60 + "\n")
    
    socketio.run(
        app, 
        host='0.0.0.0',
        port=5000,
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=False
    )
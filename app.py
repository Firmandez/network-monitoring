# app.py - VERSI THREADING (CLEAN & STABLE)

# IMPORTANT: Monkey Patch untuk Eventlet (Wajib ditaruh paling atas)
import eventlet
eventlet.monkey_patch()

from flask import Flask, g, render_template, jsonify, request
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import DictCursor, execute_batch
import concurrent.futures
import threading
import subprocess
import platform
import atexit
import signal
import sys
import os
from datetime import datetime

# Import Blueprints, DB, dan Config
from auth import auth_bp, login_required
from db import get_db, close_db
from admin import admin_bp
# Import config (DEVICES sekarang diambil dari DB)
from config import FLOOR_MAPS, FLOOR_LABELS, DEVICE_TYPES, SECRET_KEY

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

# --- CONTEXT PROCESSOR (Suntikkan variabel ke semua template) ---
@app.context_processor
def inject_user():
    """Membuat 'g.user' tersedia di semua template."""
    # g.user di-set oleh @auth_bp.before_app_request di auth.py
    return dict(user=g.get('user', None))

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

# --- FUNGSI PENGAMBILAN DATA DEVICE DARI DATABASE ---
def get_devices_from_db():
    """Mengambil semua device aktif dari database."""
    db = get_db()
    cur = db.cursor(cursor_factory=DictCursor)
    cur.execute("SELECT id, name, ip, type, floor_id, pos_top, pos_left FROM devices WHERE is_active = TRUE ORDER BY name")
    rows = cur.fetchall()
    cur.close()
    
    devices = []
    for row in rows:
        devices.append({
            "id": row['id'],
            "name": row['name'],
            "ip": str(row['ip']),
            "type": row['type'],
            "floor_id": row['floor_id'],
            "position": { "top": f"{row['pos_top']}%", "left": f"{row['pos_left']}%" }
        })
    return devices

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
        # long blocking pings. We'll use 0.5s for both for consistency.
        timeout_val = '500' if platform.system().lower() == 'windows' else '0.5'
        command = ['ping', param, '1', timeout_param, timeout_val, ip]
        
        # Sembunyikan window cmd di Windows
        kwargs = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
        if platform.system().lower() == 'windows':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            
        return subprocess.call(command, **kwargs) == 0
        
    except Exception as e:
        print(f"⚠️ Ping Error ({ip}): {e}")
        return False

# --- BACKGROUND TASK ---
def background_monitoring():
    print("Monitoring Service Started (Threading Mode)...")
    
    while True:
        try:
            with app.app_context():
                db = get_db()
                cur = db.cursor(cursor_factory=DictCursor)

                # 1. Ambil semua device aktif dari DB
                current_devices = get_devices_from_db()
                device_map = {d['id']: d for d in current_devices}

                # 2. Ambil status terakhir dari tabel device_status
                cur.execute("SELECT device_id, online FROM device_status")
                old_statuses_db = {row['device_id']: row['online'] for row in cur.fetchall()}

                # 3. Ping semua device secara paralel
                ping_results = {}
                with concurrent.futures.ThreadPoolExecutor(max_workers=20, thread_name_prefix="ping_") as executor:
                with concurrent.futures.ThreadPoolExecutor(max_workers=50, thread_name_prefix="ping_") as executor:
                    future_to_device = {executor.submit(ping_device, d['ip']): d for d in current_devices}
                    for future in concurrent.futures.as_completed(future_to_device):
                        device = future_to_device[future]
                        try:
                            ping_results[device['id']] = future.result()
                        except Exception as exc:
                            print(f"Error pinging {device['name']}: {exc}")
                            ping_results[device['id']] = False

                # 4. Proses hasil, bandingkan status, dan siapkan update
                db_updates = []
                with status_lock:
                    new_logs = []
                    for device_id, is_online in ping_results.items():
                        # Ambil status lama dari cache, atau buat state baru jika belum ada
                        current_state = device_status.get(device_id, {'status': 'online', 'failures': 0})
                        old_status = current_state['status']
                        new_status = old_status

                        if is_online:
                            # Jika berhasil, langsung set Online dan reset failures
                            new_status = 'online'
                            current_state['failures'] = 0
                        else:
                            # Jika gagal, increment failures dan tentukan status baru
                            current_state['failures'] += 1
                            if current_state['failures'] == 1:
                                new_status = 'unstable' # Gagal pertama kali -> Unstable
                            elif current_state['failures'] >= 2:
                                new_status = 'offline'  # Gagal kedua kali -> Konfirm Offline

                        # Update cache di memori
                        current_state['status'] = new_status
                        current_state['last_checked'] = datetime.now()
                        device_status[device_id] = current_state

                        # Jika status benar-benar berubah, buat log dan siapkan update DB
                        if old_status != is_online:
                            device_name = device_map[device_id]['name']
                            # Update DB hanya untuk status final (online/offline)
                            db_updates.append((device_id, new_status == 'online', datetime.now()))

                            # Buat log entry
                            log_entry = {
                                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                "device": device_name,
                                "status": new_status,
                                "message": f"{device_name} is now {new_status.capitalize()}"
                            }
                            new_logs.append(log_entry)
                            print(f"{device_name} -> {new_status.capitalize()}")
                    
                    # Tambahkan log baru ke awal list
                    if new_logs:
                        event_logs.extend(new_logs)
                        # Keep last 100 logs in memory, sort by timestamp descending
                        event_logs.sort(key=lambda x: x['timestamp'], reverse=True)
                        del event_logs[100:]

                # 5. Lakukan batch update ke database jika ada perubahan
                if db_updates:
                    upsert_query = """
                        INSERT INTO device_status (device_id, online, last_checked)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (device_id) DO UPDATE SET
                            online = EXCLUDED.online,
                            last_checked = EXCLUDED.last_checked;
                    """
                    execute_batch(cur, upsert_query, db_updates)
                    db.commit()
                
                cur.close()

                # 6. Broadcast data terbaru ke semua client
                emit_update(current_devices)
            
            # 7. Istirahat sebelum loop berikutnya
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
    # FIX: Start the background task only on the first client connection
    # This ensures the app is fully initialized before the thread starts.
    global monitoring_started
    with status_lock: # Use lock to prevent race conditions from multiple simultaneous connections
        if not monitoring_started:
            start_monitoring()

    print(f"[Socket.IO] Client connected: {request.sid}")
    print(f"   - Remote: {request.remote_addr}")
    print(f"   - User-Agent: {request.headers.get('User-Agent', 'Unknown')[:50]}")
    # Broadcast initial data
    emit_update()

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnect"""
    print(f"[Socket.IO] Client disconnected: {request.sid}")

@socketio.on('clear_logs')
@login_required
def handle_clear_logs():
    """Clears the in-memory event logs. Only logged-in users can do this."""
    with status_lock:
        event_logs.clear()
    print(f"Event logs cleared by user: {g.user['username']}")
    # Broadcast an update to all clients to refresh their log view
    emit_update()

@socketio.on('request_update')
def handle_request_update():
    """Forces a data refresh when a client clicks the refresh button."""
    print(f"Client {request.sid} requested a manual update.")
    # emit_update() will send fresh data to all connected clients.
    emit_update()

@socketio.on('connect_error')
def handle_connect_error(data):
    """Handle connection error"""
    print(f"[Socket.IO] Connection error: {data}")

def emit_update(current_devices=None):
    """Emit data update to all connected clients"""
    devices_data = []
    total_online = 0
    total_offline = 0
    
    # FIX: Jika fungsi dipanggil tanpa argumen (misal saat koneksi baru),
    # ambil sendiri data device dari database.
    if current_devices is None:
        with app.app_context():
            current_devices = get_devices_from_db()

    with status_lock:
        for device in current_devices:
            # Ambil state dari cache, atau default ke 'online' jika baru
            d_stat = device_status.get(device['id'], {'status': 'online', 'failures': 0, 'last_checked': None})
            status = d_stat['status']
            
            if status == 'online': total_online += 1
            elif status == 'offline': total_offline += 1
            # Perangkat 'unstable' kita hitung sebagai 'offline' di statistik utama
            else: total_offline += 1
            
            # Format the timestamp into a readable string
            last_checked_str = d_stat['last_checked'].strftime("%Y-%m-%d %H:%M:%S") if d_stat['last_checked'] else "N/A"

            devices_data.append({
                **device,
                'status': status, # Ganti 'online' menjadi 'status'
                'last_checked': last_checked_str # Tambahkan field ini
            })

    packet = {
        'devices': devices_data,
        'global': {
            'total': len(current_devices),
            'online': total_online,
            'offline': total_offline
        },
        'logs': event_logs, # Send all logs, let frontend decide how many to show
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

# --- REGISTER BLUEPRINTS ---
app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(admin_bp, url_prefix='/admin')

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
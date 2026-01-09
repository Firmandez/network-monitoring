# app.py - VERSI THREADING (CLEAN & STABLE)

from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO
from concurrent.futures import ThreadPoolExecutor
import threading
import time
import subprocess
import platform
import atexit
import signal
import sys
import os
from datetime import datetime

# Import config (Pastikan file config.py ada)
from config import DEVICES, FLOOR_MAPS, FLOOR_LABELS, DEVICE_TYPES

app = Flask(__name__)
app.config['SECRET_KEY'] = 'L4b0r4nft1'

# --- CSP HEADERS ---
@app.after_request
def set_security_headers(response):
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' https://cdn.socket.io https:; connect-src 'self' ws: wss: https:; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    return response

# --- SETTING SOCKET.IO ---
# async_mode='threading' = Pakai cara standar Python (Stabil & Gak Rewel)
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*", engineio_logger=False)

# Global state
device_status = {}  # Simpan status terakhir
event_logs = []     # Simpan log history

# Lock biar thread gak rebutan data
status_lock = threading.RLock()

# Flag untuk monitoring
monitoring_started = False

# --- PROPER SHUTDOWN HANDLER ---
def shutdown_handler(signum=None, frame=None):
    """Clean shutdown handler"""
    print(f"\n{'='*50}")
    print(f"Received shutdown signal")
    print("Cleaning up threads and processes...")
    
    # Force exit
    os._exit(0)


# Register signal handlers
signal.signal(signal.SIGTERM, shutdown_handler)
signal.signal(signal.SIGINT, shutdown_handler)
signal.signal(signal.SIGQUIT, shutdown_handler)

# Register cleanup
atexit.register(lambda: print("Application exited cleanly"))

def signal_handler(signum, frame):
    print(f"Received signal {signum}, shutting down...")
    sys.exit(0)

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

# --- FUNGSI PING ---
def ping_device(ip):
    try:
        if not ip: return False
        
        # Deteksi OS otomatis
        param = '-n' if platform.system().lower() == 'windows' else '-c'
        timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'
        
        # Command ping (timeout dipercepat jadi 500ms biar ngebut)
        command = ['ping', param, '1', timeout_param, '500', ip]
        
        # Sembunyikan window cmd di Windows
        kwargs = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
        if platform.system().lower() == 'windows':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            
        return subprocess.call(command, **kwargs) == 0
        
    except Exception:
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
            # A. PING SEMUA DEVICE (Parallel 50 Thread)
            with ThreadPoolExecutor(max_workers=20, thread_name_prefix="ping_") as executor:  # Kurangi workers
                futures = []
                for device in DEVICES:
                    future = executor.submit(check_single_device, device)
                    futures.append(future)
                
                # Wait for all to complete
                for future in futures:
                    future.result(timeout=10)  # Timeout 10 detik
            
            # B. RAKIT DATA (sisa kode tetap)
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
            
            # C. BROADCAST
            socketio.emit('update_data', packet)
            
            # D. Istirahat 5 detik (lebih lama)
            socketio.sleep(5)
            
        except Exception as e:
            print(f"Loop Error: {e}")
            print("Restarting monitoring in 10 seconds...")
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

# --- START MONITORING ON APP INIT ---
def start_monitoring():
    global monitoring_started
    if not monitoring_started:
        monitoring_started = True
        print("Starting background monitoring...")
        socketio.start_background_task(background_monitoring)

# Auto-start monitoring ketika app dijalankan (baik dev maupun production)
start_monitoring()

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
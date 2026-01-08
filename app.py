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

# --- SETTING SOCKET.IO ---
# async_mode='threading' = Pakai cara standar Python (Stabil & Gak Rewel)
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")

# Global state
device_status = {}  # Simpan status terakhir
event_logs = []     # Simpan log history

# Lock biar thread gak rebutan data
status_lock = threading.RLock()

# --- SHUTDOWN HANDLER ---
def cleanup_on_exit():
    print("Performing cleanup...")
    import os
    os._exit(0)

# Register cleanup
atexit.register(cleanup_on_exit)

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

# --- START SERVER ---
if __name__ == '__main__':
    # Set default port
    PORT = 82  # PORT PRODUCTION
    # PORT = 5000  # PORT DEVELOPMENT
    
    import sys
    if '--port' in sys.argv:
        try:
            PORT = int(sys.argv[sys.argv.index('--port') + 1])
        except:
            pass
    
    print(f"Starting NOC Dashboard on port {PORT}...")
    
    try:
        # Nyalakan background task
        socketio.start_background_task(background_monitoring)
        
        # Jalankan server
        socketio.run(
            app, 
            host='0.0.0.0', 
            port=PORT,
            debug=False,           # Set False untuk production
            use_reloader=False, 
            allow_unsafe_werkzeug=True,
            log_output=False       # Kurangi log noise
        )
    except KeyboardInterrupt:
        print("Shutdown requested by user")
    except Exception as e:
        print(f"Fatal error: {e}")
        print("Restarting in 10 seconds...")
        time.sleep(10)
        # Auto-restart
        os.execv(sys.executable, ['python'] + sys.argv)
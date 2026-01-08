# app.py - VERSI THREADING (CLEAN & STABLE)

from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO
from concurrent.futures import ThreadPoolExecutor
import threading
import time
import subprocess
import platform
from datetime import datetime
import json

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
    
    while True:
        try:
            # A. PING SEMUA DEVICE (Parallel 50 Thread)
            with ThreadPoolExecutor(max_workers=50) as executor:
                executor.map(check_single_device, DEVICES)
            
            # B. RAKIT DATA BUAT DIKIRIM KE BROWSER
            devices_data = []
            total_online = 0
            total_offline = 0
            
            with status_lock:
                for device in DEVICES:
                    d_stat = device_status.get(device['id'], {'online': False})
                    is_online = d_stat['online']
                    
                    if is_online: total_online += 1
                    else: total_offline += 1
                    
                    # Gabungkan data config + status updated
                    devices_data.append({
                        **device, # Ambil semua data dari config
                        'online': is_online
                    })

            # Format Paket Data JSON
            packet = {
                'devices': devices_data,
                'global': {
                    'total': len(DEVICES),
                    'online': total_online,
                    'offline': total_offline
                },
                'logs': event_logs[:10], # Kirim 10 log terakhir
                'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            # C. BROADCAST KE SEMUA BROWSER (Real-Time)
            socketio.emit('update_data', packet)
            
            # D. Istirahat 2 detik sebelum loop lagi
            socketio.sleep(2)
            
        except Exception as e:
            print(f"Critical Loop Error: {e}")
            socketio.sleep(5)

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
    # Nyalakan background task
    socketio.start_background_task(background_monitoring)
    
    print("Server NOC Dashboard Running...")
    print("Open: http://localhost:5000")
    
    # allow_unsafe_werkzeug=True biar gak error di environment development baru
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=False, allow_unsafe_werkzeug=True)
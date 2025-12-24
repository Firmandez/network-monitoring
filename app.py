# app.py
# Flask Backend for NOC Network Monitoring System

from flask import Flask, render_template, jsonify
from concurrent.futures import ThreadPoolExecutor
import threading
import time
import subprocess
import platform
import traceback
from datetime import datetime
from config import DEVICES, FLOOR_MAPS, FLOOR_LABELS, DEVICE_TYPES

app = Flask(__name__)

# Global state
device_status = {}  # {device_id: {"online": bool, "last_checked": datetime}}
event_logs = []     # List of status change events (max 50, show last 10)

# Lock for thread-safe operations
status_lock = threading.RLock()

def ping_device(ip):
    """
    Ping a device to check if it's online.
    Windows compatible: uses -n instead of -c
    Returns True if online, False if offline
    """
    try:
        # Validate IP address
        if not ip or ip == "" or ip is None:
            print(f"    └─> Invalid IP: '{ip}'")
            return False
        
        # Detect OS
        is_windows = platform.system().lower() == 'windows'
        
        # Build ping command
        if is_windows:
            # Windows: ping -n 1 -w 1000 <ip>
            # -w 1000 = timeout 1 second
            command = ['ping', '-n', '1', '-w', '500', ip]
        else:
            # Linux/Mac: ping -c 1 -W 1 <ip>
            command = ['ping', '-c', '1', '-W', '1', ip]
        
        # Set creation flags to hide window on Windows
        kwargs = {
            'stdout': subprocess.DEVNULL,  # Ignore output for speed
            'stderr': subprocess.DEVNULL,  # Ignore errors for speed
            'stdin': subprocess.DEVNULL,
            'timeout': 2,  # Hard timeout limit
            'shell': False
        }
        
        if is_windows:
            try:
                kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            except AttributeError:
                pass
        
        # Execute ping - this will NOT hang even if device is offline
        result = subprocess.run(command, **kwargs)
        
        # Return code 0 = success (online)
        # Return code 1 = failure (offline)
        return result.returncode == 0
        
    except subprocess.TimeoutExpired:
        # Timeout means device is not responding
        print(f"    └─> Timeout")
        return False
        
    except FileNotFoundError:
        print(f"    └─> Ping command not found!")
        return False
        
    except OSError as e:
        # Network errors
        print(f"    └─> Network error: {e}")
        return False
        
    except Exception as e:
        print(f"    └─> Exception: {type(e).__name__}: {e}")
        return False

def add_log_event(device_name, old_status, new_status):
    """Add a status change event to the log"""
    with status_lock:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        status_text = "Online" if new_status else "Offline"
        event = {
            "timestamp": timestamp,
            "device": device_name,
            "status": status_text,
            "message": f"{device_name} went {status_text}"
        }
        event_logs.insert(0, event)  # Add to beginning
        
        # Keep only last 50 events
        if len(event_logs) > 50:
            event_logs.pop()

def check_single_device(device):
    """Fungsi worker yang akan dijalankan oleh banyak thread sekaligus"""
    try:
        device_id = device['id']
        device_name = device['name']
        device_ip = device['ip']
        
        # Ping (Makan waktu, tapi karena banyak thread, gak masalah)
        is_online = ping_device(device_ip)
        
        # Update Status (Pakai Lock biar gak rebutan variable global)
        with status_lock:
            # Ambil status lama
            status_info = device_status.get(device_id, {'online': False})
            old_status = status_info.get('online', False)
            
            # Simpan status baru
            device_status[device_id] = {
                'online': is_online,
                'last_checked': datetime.now()
            }
            
            # Cek Log kalau berubah (Logic yang tadi udah bener)
            if device_id in device_status and old_status != is_online:
                 add_log_event(device_name, old_status, is_online)
                 print(f"  [Thread] {device_name} -> {'Online' if is_online else 'Offline'}")
                 
    except Exception as e:
        print(f"Error checking {device.get('name')}: {e}")

def ping_all_devices():
    print("=" * 60)
    print(f"STARTING PARALLEL MONITORING (ThreadPool) FOR {len(DEVICES)} DEVICES")
    print("=" * 60)
    
    cycle_count = 0
    
    while True:
        try:
            cycle_count += 1
            start_time = time.time() # Mulai stopwatch
            
            print(f"\n--- CYCLE #{cycle_count} START - {datetime.now().strftime('%H:%M:%S')} ---")
            
            # --- MAGIC HAPPENS HERE ---
            # 50 threads
            # Mereka bakal ngerjain fungsi 'check_single_device' barengan
            with ThreadPoolExecutor(max_workers=50) as executor:
                # executor.map itu kayak ngirim semua item di DEVICES ke worker
                executor.map(check_single_device, DEVICES)
            
            # Hitung durasi selesai
            duration = time.time() - start_time
            
            # Hitung statistik cepat
            online_count = sum(1 for d in device_status.values() if d['online'])
            offline_count = len(DEVICES) - online_count
            
            print(f"--- CYCLE DONE in {duration:.2f} seconds! ---")
            print(f"Status: {online_count} Online | {offline_count} Offline")
            
            time.sleep(1) #jeda 1 detik
            
        except KeyboardInterrupt:
            print("\n\nPing thread interrupted by user (Ctrl+C)")
            break
            
        except Exception as e:
            print(f"\n!!! CRITICAL ERROR IN PING THREAD !!!")
            print(f"Error Type: {type(e).__name__}")
            print(f"Error Message: {e}")
            print(f"Traceback:")
            traceback.print_exc()
            print(f"\nRestarting ping thread in 3 seconds...")
            time.sleep(3)
            
        # FORCE CONTINUE OUTER LOOP
        finally:
            pass

# Routes
@app.route('/')
def index():
    """Render main dashboard"""
    return render_template('index.html')

@app.route('/api/status')
def get_status():
    """
    API endpoint to get all device statuses + global count
    Returns: {
        "devices": [...],
        "global": {"total": X, "online": Y, "offline": Z}
    }
    """
    try:
        with status_lock:
            # Build device list with current status
            devices_data = []
            total_online = 0
            total_offline = 0
            
            for device in DEVICES:
                device_id = device['id']
                
                # Get status, default to offline if not yet checked
                status_info = device_status.get(device_id, {'online': False, 'last_checked': None})
                
                is_online = status_info.get('online', False)
                if is_online:
                    total_online += 1
                else:
                    total_offline += 1
                
                devices_data.append({
                    'id': device_id,
                    'name': device['name'],
                    'ip': device['ip'],
                    'type': device['type'],
                    'floor_id': device['floor_id'],
                    'position': device['position'],
                    'online': is_online
                })
            
            return jsonify({
                'devices': devices_data,
                'global': {
                    'total': len(DEVICES),
                    'online': total_online,
                    'offline': total_offline
                },
                'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'status': 'ok'
            })
    except Exception as e:
        print(f"Error in /api/status: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/api/logs')
def get_logs():
    """
    API endpoint to get last 10 status change events
    """
    with status_lock:
        return jsonify({
            'logs': event_logs[:10]  # Return last 10 events
        })

@app.route('/api/config')
def get_config():
    """
    API endpoint to get floor maps and device types configuration
    """
    return jsonify({
        'floor_maps': FLOOR_MAPS,
        'floor_labels': FLOOR_LABELS,
        'device_types': DEVICE_TYPES
    })

@app.route('/api/health')
def health_check():
    """
    Health check endpoint to verify server is running
    """
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        'devices_tracked': len(DEVICES),
        'devices_with_status': len(device_status)
    })

if __name__ == '__main__':
    # Start background ping thread
    ping_thread = threading.Thread(target=ping_all_devices, daemon=True)
    ping_thread.start()
    
    # Start Flask app
    print("Starting NOC Monitoring Dashboard...")
    print("Open browser at: http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
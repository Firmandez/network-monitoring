# app.py - VERSI THREADING (CLEAN & STABLE)

# IMPORTANT: Monkey Patch untuk Eventlet (Wajib ditaruh paling atas)
import eventlet
eventlet.monkey_patch()

from flask import Flask, g, render_template, jsonify, request
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv
from eventlet.greenpool import GreenPool
import psycopg2
from psycopg2.extras import DictCursor, execute_batch
import threading
import atexit
import signal
import sys
import os
import random
from datetime import datetime

# Import Blueprints, DB, dan Config
from auth import auth_bp, login_required
from db import get_db, close_db
from admin import admin_bp
# Import config (DEVICES sekarang diambil dari DB)
from config import FLOOR_MAPS, FLOOR_LABELS, DEVICE_TYPES, SECRET_KEY

# Import ping3 library
import ping3

# Muat environment variables dari .env
load_dotenv()

app = Flask(__name__)

# FIX: Agar Flask mengenali IP asli & Protocol dari Caddy (Reverse Proxy)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

app.config['SECRET_KEY'] = SECRET_KEY

# --- TRUST PROXY HEADERS (untuk Caddy reverse proxy) ---
# CRITICAL: Caddy forward X-Forwarded-* headers, Flask perlu trust ini
app.config['TRUSTED_HOSTS'] = ['127.0.0.1', '192.168.68.109', '*', 'localhost']

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
def ping_device(ip, timeout=1, seq=0):
    """
    Pings a device using ping3 library.
    Returns latency (float) on success, None on timeout, False on other errors.
    """
    try:
        if not ip:
            return False
        # ping3.ping returns False on fail, None on timeout, and latency as float on success.
        # We'll use a timeout of 1 second and get the result in seconds.
        # FIX: Pass 'seq' to ensure unique identification of packets in concurrent threads
        latency = ping3.ping(ip, timeout=timeout, unit='s', seq=seq)
        return latency
    except Exception as e:
        # ping3 can raise various exceptions (e.g., PermissionError on Linux without root)
        # We'll log them but treat them as a failed ping.
        if isinstance(e, PermissionError):
             print(f"🔒 PermissionError pinging {ip}. Run as root or with 'sudo setcap cap_net_raw+ep $(which python)'. Treating as offline.")
        else:
             print(f"⚠️ Ping Error ({ip}): {e}")
        return False

# --- FUNGSI UNTUK MEMUAT LOG DARI DATABASE SAAT STARTUP ---
def load_initial_logs():
    """Memuat 100 log terakhir dari database ke memori saat aplikasi dimulai."""
    print("Loading initial logs from database...")
    with app.app_context():
        db = get_db()
        cur = db.cursor(cursor_factory=DictCursor)
        # Join dengan tabel devices untuk mendapatkan nama perangkat
        cur.execute("""
            SELECT l.created_at, d.name as device_name, l.status, l.message
            FROM event_logs l
            JOIN devices d ON l.device_id = d.id
            ORDER BY l.created_at DESC
            LIMIT 100;
        """)
        rows = cur.fetchall()
        cur.close()

        with status_lock:
            event_logs.clear()
            for row in reversed(rows): # Dibalik agar urutan di frontend benar (tertua di atas)
                event_logs.append({ "timestamp": row['created_at'].strftime("%Y-%m-%d %H:%M:%S"), "device": row['device_name'], "status": row['status'], "message": row['message'] })
        print(f"Loaded {len(event_logs)} logs from database.")

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

                # 3. Ping semua device secara paralel menggunakan GreenPool
                pool = GreenPool(size=50) # Create a pool of greenlets
                ping_results = {}

                def do_ping(device):
                    # This wrapper function will be executed by the greenlet
                    # FIX: Generate unique sequence number (0-65535) to prevent packet collision/cross-talk
                    # between threads. This fixes "Offline devices marked as Online".
                    seq_id = random.randint(0, 65535)
                    latency = ping_device(device['ip'], seq=seq_id)
                    ping_results[device['id']] = latency

                for device in current_devices:
                    pool.spawn_n(do_ping, device)
                
                pool.waitall() # Wait for all pings to complete

                # 4. Proses hasil, bandingkan status, dan siapkan update
                db_updates = []
                log_db_inserts = [] # List untuk menampung log yang akan di-insert ke DB
                with status_lock:
                    new_logs_for_memory = []
                    for device_id, latency in ping_results.items():
                        # Ambil status lama dari cache, atau buat state baru jika belum ada.
                        # Logika 'failures' tidak lagi diperlukan.
                        current_state = device_status.get(device_id, {'status': 'online'})
                        old_status = current_state['status']
                        new_status = old_status

                        if isinstance(latency, float): # Ping berhasil, `latency` adalah float
                            new_status = 'online' if latency <= 0.5 else 'unstable'
                        else: # Ping gagal, `latency` adalah None atau False
                            new_status = 'offline'

                        # Update cache di memori
                        current_state['status'] = new_status
                        current_state['last_checked'] = datetime.now()
                        device_status[device_id] = current_state

                        # Jika status benar-benar berubah, buat log dan siapkan update DB
                        if old_status != new_status:
                            device_name = device_map[device_id]['name']
                            # Update DB hanya untuk status final (online/offline)
                            db_updates.append((device_id, new_status == 'online', datetime.now()))

                            # Buat log entry untuk memori dan siapkan untuk DB
                            message = f"{device_name} is now {new_status.capitalize()}"
                            log_entry_for_memory = {
                                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                "device": device_name,
                                "status": new_status,
                                "message": message
                            }
                            new_logs_for_memory.append(log_entry_for_memory)
                            log_db_inserts.append((device_id, new_status, message, datetime.now()))

                            print(f"{device_name} -> {new_status.capitalize()}")
                    
                    # Tambahkan log baru ke awal list
                    if new_logs_for_memory:
                        event_logs.extend(new_logs_for_memory)
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
                
                # 5b. Lakukan batch insert log ke database
                if log_db_inserts:
                    log_insert_query = """
                        INSERT INTO event_logs (device_id, status, message, created_at)
                        VALUES (%s, %s, %s, %s);
                    """
                    execute_batch(cur, log_insert_query, log_db_inserts)

                # Commit semua perubahan DB sekaligus
                if db_updates or log_db_inserts:
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

@app.route('/device/<string:device_id>')
@login_required
def device_detail(device_id):
    """Menampilkan halaman detail untuk satu perangkat."""
    device = None
    with app.app_context():
        db = get_db()
        cur = db.cursor(cursor_factory=DictCursor)
        # 1. Ambil data statis perangkat
        cur.execute("SELECT id, name, ip, type, floor_id FROM devices WHERE id = %s", (device_id,))
        device_data = cur.fetchone()
        cur.close()

        if not device_data:
            return "Device not found", 404

        device = dict(device_data)

    # 2. Ambil data status dinamis dari cache real-time
    with status_lock:
        d_stat = device_status.get(device_id, {'status': 'unknown', 'last_checked': None})
        device['status'] = d_stat.get('status', 'unknown')
        device['last_checked'] = d_stat['last_checked'].strftime("%Y-%m-%d %H:%M:%S") if d_stat.get('last_checked') else "N/A"

    # 3. Ambil label dari config
    device['type_label'] = DEVICE_TYPES.get(device['type'], {}).get('label', device['type'])
    device['floor_label'] = FLOOR_LABELS.get(device['floor_id'], device['floor_id'])

    return render_template('device_detail.html', device=device)

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
            load_initial_logs() # Muat log dari DB saat koneksi pertama
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
    """Menghapus semua log dari memori dan database."""
    with app.app_context():
        db = get_db()
        cur = db.cursor()
        try:
            with status_lock:
                # Hapus dari database (TRUNCATE lebih cepat dari DELETE)
                cur.execute("TRUNCATE TABLE event_logs RESTART IDENTITY;")
                db.commit()
                # Hapus dari memori
                event_logs.clear()
            print(f"Event logs cleared by user: {g.user['username']}")
            emit_update() # Kirim update ke semua klien dengan log kosong
        except Exception as e:
            db.rollback()
            print(f"Error clearing logs: {e}")
        finally:
            cur.close()

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
    
    # FIX: Jika fungsi dipanggil tanpa argumen (misal saat koneksi baru),
    # ambil sendiri data device dari database.
    if current_devices is None:
        with app.app_context():
            current_devices = get_devices_from_db()

    # The entire packet creation must be atomic to prevent race conditions
    # where logs are cleared after device statuses are read but before logs are read.
    with status_lock:
        devices_data = []
        total_online = 0
        total_offline = 0

        for device in current_devices:
            # Ambil state dari cache, atau default ke 'online' jika baru
            d_stat = device_status.get(device['id'], {'status': 'online', 'failures': 0, 'last_checked': None})
            status = d_stat['status']
            
            if status == 'online':
                total_online += 1
            elif status == 'offline':
                total_offline += 1
            # Perangkat 'unstable' kita hitung sebagai 'offline' di statistik utama
            else:
                total_offline += 1
            
            # Format the timestamp into a readable string
            last_checked_str = d_stat['last_checked'].strftime("%Y-%m-%d %H:%M:%S") if d_stat['last_checked'] else "N/A"

            devices_data.append({
                **device,
                'status': status,
                'last_checked': last_checked_str
            })

        packet = {
            'devices': devices_data,
            'global': {
                'total': len(current_devices),
                'online': total_online,
                'offline': total_offline
            },
            'logs': list(event_logs), # Use a copy of the list at this moment
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
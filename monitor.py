from flask import Blueprint, render_template, g, abort, request, redirect, url_for
from auth import login_required
from db import get_db
from psycopg2.extras import DictCursor
from config import FLOOR_LABELS
from urllib.parse import quote

# Nama blueprint disamarkan jadi 'monitor'
monitor_bp = Blueprint('monitor', __name__)

# --- KONFIGURASI DEFAULT RTSP ---
# Sesuaikan credential default CCTV di sini
RTSP_USER = "admin"
RTSP_PASS = "k4m3r4cctvft1"

@monitor_bp.route('/')
@login_required
def dashboard():
    allowed_users = ['insider']
    
    if g.user['username'] not in allowed_users:
        return redirect(url_for('index'))

    # --- DYNAMIC STREAM SERVER URL ---
    # Otomatis mendeteksi IP Host (LAN atau Tailscale)
    host_ip = request.host.split(':')[0]
    stream_server_url = f"http://{host_ip}:1984"

    # 2. Ambil Data CCTV dari Database
    groups = {}
    try:
        db = get_db()
        cur = db.cursor(cursor_factory=DictCursor)
        
        # Ambil device dengan type 'cctv' yang aktif
        # Kita urutkan berdasarkan lantai agar rapi
        cur.execute("""
            SELECT d.id, d.name, d.ip, d.floor_id, s.online
            FROM devices d
            LEFT JOIN device_status s ON d.id = s.device_id
            WHERE d.type = 'cctv' AND d.is_active = TRUE 
            ORDER BY d.floor_id, d.name
        """)
        cameras = cur.fetchall()
        cur.close()

        for cam in cameras:
            # Mapping ID lantai ke Nama Lantai (dari config.py)
            floor_key = cam['floor_id'] if cam['floor_id'] else "unknown"
            
            # Safety check: pastikan floor_key string sebelum di-replace
            display_name = floor_key.replace('_', ' ').title() if isinstance(floor_key, str) else "Unknown Floor"
            floor_name = FLOOR_LABELS.get(floor_key, display_name)
            
            if floor_name not in groups:
                groups[floor_name] = []
            
            # Construct URL RTSP secara dinamis dari IP database
            # Format: rtsp://user:pass@IP/Streaming/Channels/101
            # Kita siapkan SD (102) dan HD (101)
            base_rtsp = f"rtsp://{RTSP_USER}:{RTSP_PASS}@{cam['ip']}/Streaming/Channels"
            
            encoded_sd = quote(f"{base_rtsp}/102", safe='')
            encoded_hd = quote(f"{base_rtsp}/101", safe='')
            
            groups[floor_name].append({
                "id": cam['id'],
                "name": cam['name'],
                "ip": cam['ip'],
                "online": cam['online'], # Status Online/Offline (True/False/None)
                "rtsp_sd": encoded_sd,
                "rtsp_hd": encoded_hd
            })
            
    except Exception as e:
        print(f"Error loading CCTV from DB: {e}")

    # 3. Render Template dengan data dinamis
    return render_template('monitor.html', groups=groups, stream_server=stream_server_url)

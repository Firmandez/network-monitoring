from flask import Blueprint, render_template, g, abort
from auth import login_required
from db import get_db
from psycopg2.extras import DictCursor
from config import FLOOR_LABELS

# Nama blueprint disamarkan jadi 'monitor'
monitor_bp = Blueprint('monitor', __name__)

# --- KONFIGURASI DEFAULT RTSP ---
# Sesuaikan credential default CCTV di sini
RTSP_USER = "admin"
RTSP_PASS = "k4m3r4cctvft1"
RTSP_PATH = "/stream1"

# Alamat Server go2rtc (Streaming Engine)
# Sesuaikan IP ini dengan IP server Proxmox/Debian Anda
STREAM_SERVER_URL = "http://192.168.68.109:1984" 

@monitor_bp.route('/')
@login_required
def dashboard():
    allowed_users = ['insider']
    
    if g.user['username'] not in allowed_users:
        return render_template('eror_403.html', message="Restricted Page."), 403

    # 2. Ambil Data CCTV dari Database
    groups = {}
    try:
        db = get_db()
        cur = db.cursor(cursor_factory=DictCursor)
        
        # Ambil device dengan type 'cctv' yang aktif
        # Kita urutkan berdasarkan lantai agar rapi
        cur.execute("""
            SELECT id, name, ip, floor_id 
            FROM devices 
            WHERE type = 'cctv' AND is_active = TRUE 
            ORDER BY floor_id, name
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
            # Format: rtsp://user:pass@IP:554/stream1
            rtsp_url = f"rtsp://{RTSP_USER}:{RTSP_PASS}@{cam['ip']}:{RTSP_PATH}"
            
            groups[floor_name].append({
                "id": cam['id'],
                "name": cam['name'],
                "rtsp": rtsp_url
            })
            
    except Exception as e:
        print(f"Error loading CCTV from DB: {e}")

    # 3. Render Template dengan data dinamis
    return render_template('monitor.html', groups=groups, stream_server=STREAM_SERVER_URL)

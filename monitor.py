from flask import Blueprint, render_template, g, abort, request, Response, url_for
from auth import login_required
from db import get_db
from psycopg2.extras import DictCursor
from config import FLOOR_LABELS
from urllib.parse import quote
import requests

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
            # Format: rtsp://user:pass@IP/Streaming/Channels/101
            # Kita siapkan SD (102) dan HD (101)
            base_rtsp = f"rtsp://{RTSP_USER}:{RTSP_PASS}@{cam['ip']}/Streaming/Channels"
            
            encoded_sd = quote(f"{base_rtsp}/102", safe='')
            encoded_hd = quote(f"{base_rtsp}/101", safe='')
            
            groups[floor_name].append({
                "id": cam['id'],
                "name": cam['name'],
                "ip": cam['ip'],
                "rtsp_sd": encoded_sd,
                "rtsp_hd": encoded_hd
            })
            
    except Exception as e:
        print(f"Error loading CCTV from DB: {e}")

    # 3. Render Template dengan data dinamis
    return render_template('monitor.html', groups=groups)

@monitor_bp.route('/api/whep', methods=['POST'])
@login_required
def whep_proxy():
    """
    Proxy request WHEP dari frontend ke go2rtc untuk menghindari masalah CORS.
    Frontend -> Flask (Port 5000) -> go2rtc (Port 1984)
    """
    src = request.args.get('src')
    if not src:
        return "Missing src parameter", 400
    
    # Target ke go2rtc lokal (server-side request tidak terkena CORS)
    go2rtc_url = "http://127.0.0.1:1984/api/whep"
    
    try:
        # Forward POST request beserta body (SDP Offer) dan headers
        resp = requests.post(go2rtc_url, params={'src': src}, data=request.get_data(), headers={'Content-Type': request.headers.get('Content-Type')})
        return Response(resp.content, status=resp.status_code, content_type=resp.headers.get('Content-Type'))
    except Exception as e:
        return f"WHEP Proxy Error: {e}", 500

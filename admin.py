from flask import Blueprint, render_template, request, jsonify, url_for
from db import get_db
from auth import login_required # Import decorator
import psycopg2

admin_bp = Blueprint('admin', __name__, template_folder='templates')

@admin_bp.route('/')
@login_required
def dashboard():
    """Menampilkan halaman utama admin."""
    # Ambil data statis untuk form
    from config import FLOOR_LABELS, DEVICE_TYPES, FLOOR_MAPS
    # Tentukan floor pertama sebagai default untuk map picker
    initial_map = FLOOR_MAPS.get('floor_1', '')
    return render_template('admin/admin_dashboard.html', floor_labels=FLOOR_LABELS, device_types=DEVICE_TYPES, floor_maps=FLOOR_MAPS, initial_map=initial_map)

@admin_bp.route('/api/devices', methods=['GET'])
@login_required
def get_devices():
    """API endpoint untuk mengambil semua device dari DB."""
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id, name, ip, type, floor_id, pos_top, pos_left, is_active FROM devices ORDER BY created_at DESC")
    devices = cur.fetchall()
    cur.close()
    
    # Ubah ke format JSON
    device_list = []
    for row in devices:
        device_list.append({
            "id": row[0],
            "name": row[1],
            "ip": str(row[2]),
            "type": row[3],
            "floor_id": row[4],
            "pos_top": float(row[5]),
            "pos_left": float(row[6]),
            "is_active": row[7]
        })
    return jsonify(device_list)

@admin_bp.route('/api/devices', methods=['POST'])
@login_required
def add_device():
    """API endpoint untuk menambah device baru."""
    data = request.get_json()
    
    # Validasi sederhana
    required_fields = ['name', 'ip', 'type', 'floor_id', 'pos_top', 'pos_left']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Data tidak lengkap"}), 400

    try:
        db = get_db()
        cur = db.cursor()
        cur.execute(
            """
            INSERT INTO devices (name, ip, type, floor_id, pos_top, pos_left)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (data['name'], data['ip'], data['type'], data['floor_id'], data['pos_top'], data['pos_left'])
        )
        new_id = cur.fetchone()[0]
        db.commit()
        cur.close()
        return jsonify({"message": "Device berhasil ditambahkan", "id": new_id}), 201
    except psycopg2.Error as e:
        db.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500

@admin_bp.route('/api/devices/<int:device_id>', methods=['DELETE'])
@login_required
def delete_device(device_id):
    """API endpoint untuk menghapus device."""
    try:
        db = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM devices WHERE id = %s", (device_id,))
        db.commit()
        
        if cur.rowcount == 0:
            return jsonify({"error": "Device tidak ditemukan"}), 404
            
        return jsonify({"message": "Device berhasil dihapus"}), 200
    except psycopg2.Error as e:
        db.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500
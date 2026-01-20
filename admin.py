from flask import Blueprint, render_template, request, jsonify, url_for
from db import get_db
from auth import login_required # Import decorator
import psycopg2
from psycopg2 import IntegrityError

admin_bp = Blueprint('admin', __name__, template_folder='templates')

@admin_bp.route('/')
@login_required
def dashboard():
    """Menampilkan halaman utama admin."""
    # Ambil data statis untuk form
    from config import FLOOR_LABELS, DEVICE_TYPES, FLOOR_MAPS
    # FIX: Tentukan floor pertama secara dinamis dari konfigurasi
    # Ini memastikan gambar peta dan pilihan dropdown selalu sinkron.
    first_floor_id = next(iter(FLOOR_LABELS), 'floor_1') # Ambil key pertama, fallback ke 'floor_1'
    initial_map = FLOOR_MAPS.get(first_floor_id, '')
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
    required_fields = ['name', 'ip', 'type', 'floor_id', 'pos_top', 'pos_left', 'is_active']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Data tidak lengkap"}), 400

    # Generate ID from IP address (dots replaced with underscores)
    new_id = data['ip'].replace('.', '_')
    try:
        db = get_db()
        cur = db.cursor()
        # FIX: Tambahkan is_active ke dalam statement INSERT
        cur.execute("""
            INSERT INTO devices (id, name, ip, type, floor_id, pos_top, pos_left, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (new_id, data['name'], data['ip'], data['type'], data['floor_id'], data['pos_top'], data['pos_left'], data['is_active'])
        )
        db.commit()
        cur.close()
        return jsonify({"message": "Device berhasil ditambahkan", "id": new_id}), 201
    except IntegrityError as e:
        db.rollback()
        # Check for unique violation on IP or ID
        if 'devices_ip_key' in str(e):
            return jsonify({"error": f"IP address '{data['ip']}' sudah terdaftar."}), 409
        if 'devices_pkey' in str(e):
            return jsonify({"error": f"Device dengan ID '{new_id}' sudah ada."}), 409
        return jsonify({"error": f"Database integrity error: {e}"}), 500
    except psycopg2.Error as e:
        db.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500

@admin_bp.route('/api/devices/<string:device_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def handle_device(device_id):
    """API endpoint untuk GET, UPDATE, atau DELETE satu device."""
    db = get_db()

    # --- GET ---
    if request.method == 'GET':
        cur = db.cursor()
        cur.execute("SELECT id, name, ip, type, floor_id, pos_top, pos_left, is_active FROM devices WHERE id = %s", (device_id,))
        row = cur.fetchone()
        cur.close()
        if not row:
            return jsonify({"error": "Device tidak ditemukan"}), 404
        device = {
            "id": row[0], "name": row[1], "ip": str(row[2]), "type": row[3],
            "floor_id": row[4], "pos_top": float(row[5]), "pos_left": float(row[6]),
            "is_active": row[7]
        }
        return jsonify(device)

    # --- PUT (UPDATE) ---
    if request.method == 'PUT':
        data = request.get_json()
        required_fields = ['name', 'ip', 'type', 'floor_id', 'pos_top', 'pos_left', 'is_active']
        if not all(field in data for field in required_fields):
            return jsonify({"error": "Data tidak lengkap"}), 400
        try:
            cur = db.cursor()
            cur.execute(
                "UPDATE devices SET name = %s, ip = %s, type = %s, floor_id = %s, pos_top = %s, pos_left = %s, is_active = %s WHERE id = %s;",
                (data['name'], data['ip'], data['type'], data['floor_id'], data['pos_top'], data['pos_left'], data['is_active'], device_id)
            )
            db.commit()
            if cur.rowcount == 0: return jsonify({"error": "Device tidak ditemukan untuk diupdate"}), 404
            cur.close()
            return jsonify({"message": "Device berhasil diperbarui"}), 200
        except IntegrityError as e:
            db.rollback()
            if 'devices_ip_key' in str(e): return jsonify({"error": f"IP address '{data['ip']}' sudah terdaftar untuk device lain."}), 409
            return jsonify({"error": f"Database integrity error: {e}"}), 500
        except psycopg2.Error as e:
            db.rollback()
            return jsonify({"error": f"Database error: {e}"}), 500

    # --- DELETE ---
    if request.method == 'DELETE':
        try:
            cur = db.cursor()
            cur.execute("DELETE FROM devices WHERE id = %s", (device_id,))
            db.commit()
            if cur.rowcount == 0: return jsonify({"error": "Device tidak ditemukan"}), 404
            cur.close()
            return jsonify({"message": "Device berhasil dihapus"}), 200
        except psycopg2.Error as e:
            db.rollback()
            return jsonify({"error": f"Database error: {e}"}), 500
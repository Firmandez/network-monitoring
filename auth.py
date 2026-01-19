from flask import Blueprint, render_template, request, redirect, session, g, url_for
from werkzeug.security import check_password_hash
from functools import wraps
from psycopg2.extras import DictCursor

# Import fungsi untuk mendapatkan koneksi DB per-request
from db import get_db

# Ganti nama blueprint menjadi 'auth_bp' agar lebih jelas
auth_bp = Blueprint('auth', __name__)

# DECORATOR UNTUK MEMASTIKAN USER SUDAH LOGIN
def login_required(view):
    @wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for('auth.login'))
        return view(**kwargs)
    return wrapped_view

@auth_bp.before_app_request
def load_logged_in_user():
    """Jika user_id ada di session, ambil data user dari DB."""
    user_id = session.get('user_id')
    if user_id is None:
        g.user = None
    else:
        db = get_db()
        cur = db.cursor(cursor_factory=DictCursor) # FIX: Use DictCursor to get dict-like rows
        cur.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
        g.user = cur.fetchone() # Now g.user will be a DictRow object
        cur.close()

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        user = request.form['username']
        pw = request.form['password']

        db = get_db()
        cur = db.cursor(cursor_factory=DictCursor)
        cur.execute("SELECT * FROM users WHERE username = %s", (user,))
        db_user = cur.fetchone()
        cur.close()

        if db_user and check_password_hash(db_user['password_hash'], pw):
            session.clear() # Hapus session lama sebelum membuat yang baru
            session['user_id'] = db_user['id']
            # Jika user adalah admin, arahkan ke dashboard admin
            if db_user['username'] == 'admin':
                return redirect(url_for('admin.dashboard'))
            return redirect(url_for('index')) # Redirect ke dashboard utama setelah login
        
        error = "Login gagal: Username atau password salah."

    return render_template('login.html', error=error)

@auth_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth.login'))

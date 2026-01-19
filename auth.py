from flask import Blueprint, render_template, request, redirect, session
from werkzeug.security import check_password_hash

# Import fungsi untuk mendapatkan koneksi DB per-request
from db import get_db

# Ganti nama blueprint menjadi 'auth_bp' agar lebih jelas
auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = request.form['username']
        pw = request.form['password']

        db = get_db()
        cur = db.cursor()
        try:
            cur.execute("SELECT id, password_hash FROM users WHERE username = %s", (user,))
            row = cur.fetchone()
        finally:
            cur.close() # Selalu tutup cursor setelah selesai

        if row and check_password_hash(row[1], pw):
            session.clear() # Hapus session lama sebelum membuat yang baru
            session['user_id'] = row[0]
            return redirect('/') # Redirect ke dashboard utama setelah login
        return "Login gagal: Username atau password salah.", 401

    return render_template('login.html')

@auth_bp.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect('/auth/login')

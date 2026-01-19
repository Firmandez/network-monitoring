import os
import psycopg2
from werkzeug.security import generate_password_hash
from dotenv import load_dotenv

load_dotenv()

# --- KONFIGURASI ---
# Baca dari environment variable, atau gunakan default jika tidak ada.
# Ini memungkinkan pengaturan password yang lebih aman di production.
ADMIN_USERNAME = os.getenv("ADMIN_USER", "firmandez") # Ganti dengan username-mu
ADMIN_PASSWORD = os.getenv("ADMIN_PASS", "passwordrahasia") # Ganti dengan password-mu

conn = None
cur = None
try:
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST'),
        dbname=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASS')
    )
    cur = conn.cursor()

    print(f"Membuat atau memperbarui user: {ADMIN_USERNAME}")

    if not ADMIN_PASSWORD:
        raise ValueError("ADMIN_PASS environment variable tidak boleh kosong.")

    # Hash password
    password_hash = generate_password_hash(ADMIN_PASSWORD)

    # Masukkan ke database
    # ON CONFLICT memastikan jika user sudah ada, passwordnya akan di-update.
    cur.execute(
        "INSERT INTO users (username, password_hash) VALUES (%s, %s) ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;",
        (ADMIN_USERNAME, password_hash)
    )

    conn.commit()

    print("✅ User admin berhasil dibuat/diperbarui.")

except Exception as e:
    print(f"❌ Gagal membuat user: {e}")

finally:
    if cur:
        cur.close()
    if conn:
        conn.close()

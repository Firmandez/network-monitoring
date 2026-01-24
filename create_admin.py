import os
import psycopg2
from werkzeug.security import generate_password_hash
from dotenv import load_dotenv

load_dotenv()

# --- KONFIGURASI ---
# Daftar user yang akan dibuat atau di-update
# Format: (username, password)
USERS_TO_CREATE = [
    ("insider", "mastergame2004"),
]

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

    for username, password in USERS_TO_CREATE:
        print(f"Membuat atau memperbarui user: {username}")

        if not password:
            print(f"⚠️  Password untuk user '{username}' kosong, user dilewati.")
            continue

        # Hash password
        password_hash = generate_password_hash(password)

        # Masukkan ke database
        # ON CONFLICT memastikan jika user sudah ada, passwordnya akan di-update.
        cur.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s) ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;",
            (username, password_hash)
        )

    conn.commit()
    print(f"\n✅ {len(USERS_TO_CREATE)} user berhasil diproses.")

except Exception as e:
    print(f"❌ Gagal membuat user: {e}")

finally:
    if cur:
        cur.close()
    if conn:
        conn.close()

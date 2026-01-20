import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# Database connection
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

    # ==============================================================================
    # Skrip ini dirancang untuk aman dijalankan berulang kali.
    # Perintah `CREATE TABLE IF NOT EXISTS` memastikan tabel hanya dibuat jika belum ada.
    # TIDAK ADA perintah `DROP TABLE` untuk mencegah kehilangan data.
    # ==============================================================================
    print("Memeriksa dan membuat tabel jika diperlukan...")

    # Create users table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """)

    # Create devices table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        ip INET UNIQUE NOT NULL,
        type VARCHAR(50) NOT NULL,
        floor_id VARCHAR(50) NOT NULL,
        pos_top NUMERIC(5,2) NOT NULL,
        pos_left NUMERIC(5,2) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """)

    # Create device_status table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS device_status (
        device_id VARCHAR(255) PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
        online BOOLEAN NOT NULL,
        last_checked TIMESTAMP WITH TIME ZONE
    );
    """)

    # Create event_logs table for persistent history
    cur.execute("""
    CREATE TABLE IF NOT EXISTS event_logs (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        status VARCHAR(10) NOT NULL,
        message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """)
    print("Tabel-tabel dasar berhasil dibuat.")

    # --- TRIGGERS & FUNCTIONS ---
    # Membuat fungsi yang akan dijalankan oleh trigger untuk update kolom 'updated_at'
    print("Membuat fungsi trigger untuk 'updated_at'...")
    cur.execute("""
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
       NEW.updated_at = NOW();
       RETURN NEW;
    END;
    $$ language 'plpgsql';
    """)

    # Memasang trigger ke tabel 'devices'
    print("Memasang trigger pada tabel 'devices'...")
    cur.execute("""
    DROP TRIGGER IF EXISTS update_devices_updated_at ON devices;
    CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
    """)

    conn.commit()
    print("✅ Skema database dan trigger berhasil disiapkan.")

except Exception as e:
    print(f"❌ Failed to create tables: {e}")

finally:
    if cur:
        cur.close()
    if conn:
        conn.close()

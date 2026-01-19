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

    # Create users table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    );
    """)

    # Create devices table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        ip INET NOT NULL,
        type VARCHAR(50) NOT NULL,
        floor_id VARCHAR(50) NOT NULL,
        pos_top NUMERIC(5,2) NOT NULL,
        pos_left NUMERIC(5,2) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
    );
    """)

    # Create device_status table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS device_status (
        device_id INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
        online BOOLEAN NOT NULL,
        last_checked TIMESTAMP
    );
    """)

    conn.commit()
    print("✅ Database tables created successfully.")

except Exception as e:
    print(f"❌ Failed to create tables: {e}")

finally:
    if cur:
        cur.close()
    if conn:
        conn.close()

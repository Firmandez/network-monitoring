import psycopg2
import os
from flask import g

def get_db():
    """
    Membuka koneksi database baru jika belum ada untuk konteks aplikasi saat ini.
    Koneksi disimpan di `g` agar bisa diakses di seluruh request.
    """
    if 'db' not in g:
        g.db = psycopg2.connect(
            host=os.getenv('DB_HOST'),
            dbname=os.getenv('DB_NAME'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASS')
        )
    return g.db

def close_db(e=None):
    """Menutup koneksi database."""
    db = g.pop('db', None)

    if db is not None:
        db.close()

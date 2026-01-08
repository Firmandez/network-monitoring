import csv
import json
import os

# --- KONFIGURASI ---
INPUT_FILE = 'lantai2.csv'  # Pastikan nama file sama
OUTPUT_FILE = 'config_snippet.txt'

def generate_config():
    print("================================")
    print(f"GENERATING CONFIG FROM {INPUT_FILE}...")
    print("================================")

    if not os.path.exists(INPUT_FILE):
        print(f"Error: File '{INPUT_FILE}' gak ketemu bro!")
        return

    devices = []
    
    try:
        # FIX UTAMA DISINI: pake 'utf-8-sig' buat ngilangin hantu Excel
        with open(INPUT_FILE, mode='r', encoding='utf-8-sig') as csvfile:
            # Kita baca dulu headernya buat mastiin gak ada spasi nyempil
            reader = csv.DictReader(csvfile)
            
            # Bersihin nama kolom dari spasi (misal " Name" jadi "Name")
            reader.fieldnames = [name.strip() for name in reader.fieldnames]

            # Cek kolom wajib
            required_columns = ['Name', 'IP', 'type', 'floor_id', 'top', 'left']
            for col in required_columns:
                if col not in reader.fieldnames:
                    print(f"Error: Kolom '{col}' gak ada di CSV. Cek header!")
                    print(f"Header yang kebaca: {reader.fieldnames}")
                    return

            for row in reader:
                # Skip baris kosong
                if not row['Name']:
                    continue

                device = {
                    "id": row['IP'].replace('.', '_'), # Bikin ID unik dari IP
                    "name": row['Name'].strip(),
                    "ip": row['IP'].strip(),
                    "type": row['type'].strip().lower(),
                    "floor_id": row['floor_id'].strip(),
                    "position": {
                        "top": row['top'].strip(),
                        "left": row['left'].strip()
                    },
                }
                devices.append(device)

    except Exception as e:
        print(f"Ada Error Script: {e}")
        return

    # Convert ke format JSON string yang rapi
    json_output = json.dumps(devices, indent=4)
    
    # Hapus kurung siku [] di awal dan akhir biar tinggal copy-paste isinya
    json_output = json_output[1:-1] 

    # Simpan ke file txt biar gampang dicopy
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(json_output)

    print(f"✅ SUKSES! {len(devices)} devices berhasil di-generate.")
    print(f"👉 Cek file '{OUTPUT_FILE}', lalu Copy-Paste isinya ke 'config.py'")

if __name__ == "__main__":
    generate_config()
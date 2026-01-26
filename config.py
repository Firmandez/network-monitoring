# config.py
# Configuration file for NOC Network Monitoring System

# Secret Key for Flask session
SECRET_KEY = 'L4b0r4nft1' # Ganti dengan key yang lebih aman di production

# Device List - SEKARANG DIAMBIL DARI DATABASE

# Map Configuration - Mapping floor_id to image path
FLOOR_MAPS = {
    "ground": "maps/denah_lt0.jpg",
    "floor_1": "maps/denah_lt1.jpg",
    "floor_2": "maps/denah_lt2.jpg",
    "floor_3": "maps/denah_lt3.jpg",
    "floor_4": "maps/denah_lt4.jpg",
    "floor_4e": "maps/denah_lt4e.jpg",
    "floor_5": "maps/denah_lt5.jpg",
    "floor_6": "maps/denah_lt6.jpg",
}

# Floor Labels for Navigation
FLOOR_LABELS = {
    "ground": "Ground",
    "floor_1": "Lantai 1",
    "floor_2": "Lantai 2",
    "floor_3": "Lantai 3",
    "floor_4": "Lantai 4",
    "floor_4e": "Lantai 4E",
    "floor_5": "Lantai 5",
    "floor_6": "Lantai 6",
}

# Device Type Configuration
DEVICE_TYPES = {
    "crs": {"label": "CRS"},
    "ccr": {"label": "CCR"},
    "cctv": {"label": "CCTV"},
    "server":{"label": "Server"},
    "wifi": {"label": "WiFi/AP"},
    "voip": {"label": "VoIP"},
}
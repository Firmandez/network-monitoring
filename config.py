# config.py
# Configuration file for NOC Network Monitoring System

# Device List - Each device must have a floor_id
DEVICES = [
    # GROUND FLOOR

    
    # FLOOR 1
    {
        "id": "192_168_20_1",
        "name": "CCTV FTI120",
        "ip": "192.168.20.1",
        "type": "cctv",
        "floor_id": "floor_1",
        "position": {
            "top": "64.5%",
            "left": "67.2%"
        },

    },
    {
        "id": "192_168_20_3",
        "name": "CCTV Dosen Kiri",
        "ip": "192.168.20.3",
        "type": "cctv",
        "floor_id": "floor_1",
        "position": {
            "top": "32.5%",
            "left": "45.8%"
        },
    },
    {
        "id": "192_168_20_6",
        "name": "Tata Usaha",
        "ip": "192.168.20.6",
        "type": "cctv",
        "floor_id": "floor_1",
        "position": {
            "top": "69.1%",
            "left": "41.8%"
        },
    },
    {
        "id": "192_168_20_31",
        "name": "CCTV Kanan",
        "ip": "192.168.20.31",
        "type": "cctv",
        "floor_id": "floor_1",
        "position": {
            "top": "48.1%",
            "left": "34.5%"
        },
    },
    {
        "id": "192_168_20_9",
        "name": "CCTV Dosen Kanan",
        "ip": "192.168.20.9",
        "type": "cctv",
        "floor_id": "floor_1",
        "position": {
            "top": "32.7%",
            "left": "42.7%"
        },
    },
    {
        "id": "192_168_20_10",
        "name": "CCTV Kiri",
        "ip": "192.168.20.10",
        "type": "cctv",
        "floor_id": "floor_1",
        "position": {
            "top": "32.8%",
            "left": "83.5%"
        },
    },
    {
        "id": "192_168_20_5",
        "name": "CCTV Pintu Depan",
        "ip": "192.168.20.5",
        "type": "cctv",
        "floor_id": "floor_1",
        "position": {
            "top": "40.2%",
            "left": "40.0%"
        },
    },

    # FLOOR 2 (Placeholder for testing)

    {
        "id": "192_168_20_21",
        "name": "Sarpras",
        "ip": "192.168.20.21",
        "type": "cctv",
        "floor_id": "floor_2",
        "position": {
            "top": "30.7%",
            "left": "75.3%"
        },
    },
    {
        "id": "192_168_20_2",
        "name": "CCTV Dosen Kiri",
        "ip": "192.168.20.2",
        "type": "cctv",
        "floor_id": "floor_2",
        "position": {
            "top": "45.2%",
            "left": "46.5%"
        },
    },
    {
        "id": "192_168_20_19",
        "name": "CCTV Kanan",
        "ip": "192.168.20.19",
        "type": "cctv",
        "floor_id": "floor_2",
        "position": {
            "top": "43.7%",
            "left": "3.2%"
        },
    },
    {
        "id": "192_168_20_18",
        "name": "Lab LK",
        "ip": "192.168.20.18",
        "type": "cctv",
        "floor_id": "floor_2",
        "position": {
            "top": "49.6%",
            "left": "90.1%"
        },
    },
    {
        "id": "192_168_20_20",
        "name": "CCTV Dosen Kanan",
        "ip": "192.168.20.20",
        "type": "cctv",
        "floor_id": "floor_2",
        "position": {
            "top": "28.4%",
            "left": "33.1%"
        },
    },
    {
        "id": "192_168_20_32",
        "name": "CCTV Kiri",
        "ip": "192.168.20.32",
        "type": "cctv",
        "floor_id": "floor_2",
        "position": {
            "top": "45.6%",
            "left": "95.8%"
        },
    },
    {
        "id": "192_168_20_52",
        "name": "Coworking Space 1",
        "ip": "192.168.20.52",
        "type": "cctv",
        "floor_id": "floor_2",
        "position": {
            "top": "11.7%",
            "left": "62.9%"
        },
    },
    {
        "id": "192_168_20_28",
        "name": "Coworking Space 2",
        "ip": "192.168.20.28",
        "type": "cctv",
        "floor_id": "floor_2",
        "position": {
            "top": "48.1%",
            "left": "73.4%"
        },
    },

    #Floor 4
        {
        "id": "192_168_20_28",
        "name": "PC Belakang 456",
        "ip": "192.168.68.126",
        "type": "cctv",
        "floor_id": "floor_4",
        "position": {
            "top": "64%",
            "left": "68.6%"
        },
    },

]

# Map Configuration - Mapping floor_id to image path
FLOOR_MAPS = {
    "ground": "static/maps/denah_lt0.jpg",
    "floor_1": "static/maps/denah_lt1.jpg",
    "floor_2": "static/maps/denah_lt2.jpg",
    "floor_3": "static/maps/denah_lt3.jpg",
    "floor_4": "static/maps/denah_lt4.jpg",
    "floor_4e": "static/maps/denah_lt4e.jpg",
    "floor_5": "static/maps/denah_lt5.jpg",
    "floor_6": "static/maps/denah_lt6.jpg",
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
    "switch": {"label": "Switch"},
    "switch_poe": {"label": "Switch POE"},
    "cctv": {"label": "CCTV"},
    "server":{"label": "Server"},
    "wifi": {"label": "WiFi/AP"},
    "voip": {"label": "VoIP"},
}
# config.py
# Configuration file for NOC Network Monitoring System

# Device List - Each device must have a floor_id
DEVICES = [
    # ground FLOOR
    {
        "id": "olt-isp-main",
        "name": "OLT ISP MyRepublic",
        "ip": "192.168.18.1",
        "type": "wifi",
        "floor_id": "ground",
        "position": {"top": "15%", "left": "50%"}
    },
    {
        "id": "mob-1-user",
        "name": "Infinix Note 40",
        "ip": "192.168.18.3",
        "type": "voip",
        "floor_id": "ground",
        "position": {"top": "20%", "left": "70%"}
    },
    {
        "id": "cctv-g-lobby",
        "name": "CCTV Lobby ground",
        "ip": "192.168.1.11",
        "type": "cctv",
        "floor_id": "ground",
        "position": {"top": "40%", "left": "50%"}
    },
    {
        "id": "srv-g-main",
        "name": "Server Utama ground",
        "ip": "192.168.1.100",
        "type": "server",
        "floor_id": "ground",
        "position": {"top": "60%", "left": "50%"}
    },
    {
        "id": "voip-g-reception",
        "name": "VoIP Reception ground",
        "ip": "192.168.1.50",
        "type": "voip",
        "floor_id": "ground",
        "position": {"top": "30%", "left": "20%"}
    },
    
    # FLOOR 1
    {
        "id": "sw-lt1-main",
        "name": "Switch Utama Lt.1",
        "ip": "192.168.2.1",
        "type": "switch",
        "floor_id": "floor_1",
        "position": {"top": "20%", "left": "45%"}
    },
    {
        "id": "ap-lt1-north",
        "name": "Access Point Lt.1 Utara",
        "ip": "192.168.2.10",
        "type": "wifi",
        "floor_id": "floor_1",
        "position": {"top": "15%", "left": "60%"}
    },
    {
        "id": "ap-lt1-south",
        "name": "Access Point Lt.1 Selatan",
        "ip": "192.168.2.11",
        "type": "wifi",
        "floor_id": "floor_1",
        "position": {"top": "70%", "left": "60%"}
    },
    {
        "id": "cctv-lt1-corridor",
        "name": "CCTV Koridor Lt.1",
        "ip": "192.168.2.20",
        "type": "cctv",
        "floor_id": "floor_1",
        "position": {"top": "40%", "left": "30%"}
    },
    {
        "id": "cctv-lt1-classroom",
        "name": "CCTV Ruang Kelas Lt.1",
        "ip": "192.168.2.21",
        "type": "cctv",
        "floor_id": "floor_1",
        "position": {"top": "50%", "left": "70%"}
    },
    {
        "id": "voip-lt1-office",
        "name": "VoIP Office Lt.1",
        "ip": "192.168.2.50",
        "type": "voip",
        "floor_id": "floor_1",
        "position": {"top": "35%", "left": "80%"}
    },
    {
        "id": "srv-lt1-storage",
        "name": "Server Storage Lt.1",
        "ip": "192.168.2.100",
        "type": "server",
        "floor_id": "floor_1",
        "position": {"top": "80%", "left": "40%"}
    },
    
    # FLOOR 2 (Placeholder for testing)
    {
        "id": "sw-lt2-main",
        "name": "Switch Utama Lt.2",
        "ip": "192.168.3.1",
        "type": "switch",
        "floor_id": "floor_2",
        "position": {"top": "25%", "left": "50%"}
    },
    {
        "id": "cctv-lt2-lab",
        "name": "CCTV Lab Lt.2",
        "ip": "192.168.3.20",
        "type": "cctv",
        "floor_id": "floor_2",
        "position": {"top": "45%", "left": "55%"}
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
    "switch": {"label": "Switch", "color": "#3498db"},
    "cctv": {"label": "CCTV", "color": "#e74c3c"},
    "server": {"label": "Server", "color": "#9b59b6"},
    "wifi": {"label": "WiFi/AP", "color": "#f39c12"},
    "voip": {"label": "VoIP", "color": "#1abc9c"},
}
// dashboard.js - FINAL FIXED VERSION
// Fitur: Real-time Socket.IO, Perfect Zoom/Pan, TV Mode Stabil, Auto-Reconnect

// GLOBAL VARIABLES & SOCKET SETUP
let allDevices = [];
let config = {};
let currentFloor = 'ground'; // Default floor
let activeFilters = new Set();
let mapZoom = 1;
let isPanning = false;
let translateX = 0, translateY = 0;
let isFullscreenMode = false;
let clockInterval = null;

// DOM Elements
const socket = window.io(); // Initialize Socket.IO Global
const floorNav = document.getElementById('floor-nav');
const filterPanel = document.getElementById('filter-panel');
const mapContainer = document.getElementById('map-container');
const mapContent = document.getElementById('map-content'); // Wrapper Peta
const floorMap = document.getElementById('floor-map');
const deviceDotsContainer = document.getElementById('device-dots-container');
const currentFloorTitle = document.getElementById('current-floor-title');
const lastUpdateSpan = document.getElementById('last-update');
const logContainer = document.getElementById('log-container');
const tooltip = document.getElementById('tooltip');
const fullscreenContainer = document.getElementById('fullscreen-container');
const fullscreenGrid = document.getElementById('fullscreen-grid');

// Stats elements
const statTotal = document.getElementById('stat-total');
const statOnline = document.getElementById('stat-online');
const statOffline = document.getElementById('stat-offline');

// Fullscreen stats elements
const fsTotal = document.getElementById('fs-total');
const fsOnline = document.getElementById('fs-online');
const fsOffline = document.getElementById('fs-offline');
const fsLastUpdate = document.getElementById('fs-last-update');
const fsClock = document.getElementById('fs-clock');

// --- SOCKET LISTENERS ---

// 1. Connect
socket.on('connect', () => {
    console.log("✅ Terhubung ke Server Real-Time!");
    if(lastUpdateSpan) lastUpdateSpan.style.color = '#2ecc71';
});

// 2. Disconnect
socket.on('disconnect', () => {
    console.log("❌ Koneksi Putus!");
    if(lastUpdateSpan) {
        lastUpdateSpan.textContent = "Connection Lost...";
        lastUpdateSpan.style.color = 'red';
    }
});

// 3. Update Data
socket.on('update_data', (data) => {
    // A. Simpan Data Device
    allDevices = data.devices; 
    console.log(`📡 Data Masuk: ${allDevices.length} devices`);

    // B. Update Stats Global
    if (data.global) {
        if(statTotal) statTotal.textContent = data.global.total || 0;
        if(statOnline) statOnline.textContent = data.global.online || 0;
        if(statOffline) statOffline.textContent = data.global.offline || 0;
        
        // Update Stats Fullscreen Mode
        if (fsTotal) fsTotal.textContent = data.global.total || 0;
        if (fsOnline) fsOnline.textContent = data.global.online || 0;
        if (fsOffline) fsOffline.textContent = data.global.offline || 0;
    }
    
    if (data.timestamp) {
        if(lastUpdateSpan) lastUpdateSpan.textContent = data.timestamp;
        if (fsLastUpdate) fsLastUpdate.textContent = data.timestamp;
    }

    // C. Render Logs
    if (data.logs) {
        renderEventLogs(data.logs);
    }

    // D. Cek Config Terload
    if (!config || !config.floor_maps) {
        return; 
    }

    // E. Render Ulang Tampilan
    if (isFullscreenMode) {
        updateFullscreenStats();
    } else {
        renderDevices();
    }
});

// INITIALIZATION
async function init() {
    console.log('Initializing dashboard...');

    try {
        // Load configuration
        const configLoaded = await loadConfig();
        
        if (!configLoaded) {
            console.error('Failed to load configuration. Retrying...');
            setTimeout(init, 2000); 
            return;
        }
                
        // Generate UI Components
        generateFloorNavigation();
        generateFilterPanel();
        
        // Setup Map
        setInitialFloorMap();
        setupZoomControls();
        
        console.log('Dashboard initialized successfully!');

        // Initial Render jika data sudah ada
        if (allDevices.length > 0) {
            renderDevices();
        }
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
    }
}
document.addEventListener('DOMContentLoaded', init);

// CORE FUNCTIONS (Config & Map)
// Load Config from API
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        config = await response.json();
        console.log('Configuration loaded:', config);
        
        if (!config.floor_maps || !config.floor_labels || !config.device_types) {
            console.error('Configuration is incomplete!');
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error loading config:', error);
        return false;
    }
}

// Set initial map image
function setInitialFloorMap() {
    if (config.floor_maps && config.floor_maps[currentFloor]) {
        // Set Floor Title
        if (config.floor_labels && config.floor_labels[currentFloor]) {
            currentFloorTitle.textContent = config.floor_labels[currentFloor];
        }
        
        const mapPath = '/' + config.floor_maps[currentFloor];
        
        // Preload Image
        const img = new Image();
        img.onload = function() {
            floorMap.src = mapPath;
            floorMap.classList.add('loaded');
            floorMap.style.opacity = '1';
        };
        img.onerror = function() {
            console.error('Failed to load map:', mapPath);
            floorMap.alt = 'Map not found';
        };
        img.src = mapPath;
    }
}

// Generate Floor Buttons
function generateFloorNavigation() {
    floorNav.innerHTML = '';
    Object.keys(config.floor_labels).forEach(floorId => {
        const btn = document.createElement('button');
        btn.className = 'floor-btn';
        btn.textContent = config.floor_labels[floorId];
        btn.dataset.floor = floorId;
        
        if (floorId === currentFloor) btn.classList.add('active');
        
        btn.addEventListener('click', () => switchFloor(floorId));
        floorNav.appendChild(btn);
    });
}

// Generate Filter Checkboxes
function generateFilterPanel() {
    filterPanel.innerHTML = '';
    Object.keys(config.device_types).forEach(typeId => {
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `filter-${typeId}`;
        checkbox.value = typeId;
        checkbox.checked = true;
        activeFilters.add(typeId);
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) activeFilters.add(typeId);
            else activeFilters.delete(typeId);
            renderDevices();
        });
        
        const label = document.createElement('label');
        label.htmlFor = `filter-${typeId}`;
        label.textContent = config.device_types[typeId].label;
        
        filterItem.appendChild(checkbox);
        filterItem.appendChild(label);
        filterPanel.appendChild(filterItem);
    });
}

// Switch Floor Logic
function switchFloor(floorId) {
    currentFloor = floorId;
    
    // Update active button
    document.querySelectorAll('.floor-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.floor === floorId) btn.classList.add('active');
    });
    
    // Update Title
    currentFloorTitle.textContent = config.floor_labels[floorId];
    
    // Change Map Image
    floorMap.classList.remove('loaded');
    floorMap.style.opacity = '0.3';
    
    const mapPath = '/' + config.floor_maps[floorId];
    const img = new Image();
    img.onload = function() {
        floorMap.src = mapPath;
        floorMap.classList.add('loaded');
        floorMap.style.opacity = '1';
    };
    img.src = mapPath;
    
    // Reset Zoom & Pan
    resetMapPosition();
    
    // Re-render devices
    renderDevices();
}

// Render Devices (Single Mode)
function renderDevices() {
    deviceDotsContainer.innerHTML = '';
    
    if (!allDevices || !Array.isArray(allDevices)) return;
    
    // Filter devices
    const filteredDevices = allDevices.filter(device => {
        return device.floor_id === currentFloor && activeFilters.has(device.type);
    });
    
    // Create Dots
    filteredDevices.forEach(device => {
        try {
            const dot = document.createElement('div');
            dot.className = 'device-dot';
            dot.classList.add(device.online ? 'online' : 'offline');
            
            // Posisi
            dot.style.top = device.position.top;
            dot.style.left = device.position.left;
            dot.style.transform = 'translate(-50%, -50%)';
            
            // Events
            dot.addEventListener('click', () => window.open(`http://${device.ip}`, '_blank'));
            dot.addEventListener('mouseenter', (e) => showTooltip(e, device));
            dot.addEventListener('mouseleave', hideTooltip);
            
            deviceDotsContainer.appendChild(dot);
        } catch (error) {
            console.error('Error rendering device:', device);
        }
    });
}

// Tooltip Functions
function showTooltip(event, device) {
    const statusText = device.online ? 
        '<span style="color: #2ecc71;">● Online</span>' : 
        '<span style="color: #e74c3c;">● Offline</span>';
    
    tooltip.innerHTML = `
        <strong>${device.name}</strong><br>
        IP: ${device.ip}<br>
        Type: ${config.device_types[device.type] ? config.device_types[device.type].label : device.type}<br>
        Status: ${statusText}
    `;
    
    tooltip.style.left = (event.pageX + 15) + 'px';
    tooltip.style.top = (event.pageY + 15) + 'px';
    tooltip.classList.add('show');
}

function hideTooltip() {
    tooltip.classList.remove('show');
}


// Render Logs (VERSI KUAT / ANTI-CRASH)
function renderEventLogs(logs) {
    const safeLogContainer = document.getElementById('log-container');

    if (!safeLogContainer) {
        return; 
    }

    if (!logs || logs.length === 0) {
        safeLogContainer.innerHTML = '<p class="log-empty">No events yet...</p>';
        return;
    }
    
    safeLogContainer.innerHTML = '';
    logs.forEach(log => {
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        const statusClass = log.status ? log.status.toLowerCase() : 'unknown';
        logItem.classList.add(`status-${statusClass}`);
        
        logItem.innerHTML = `
            <div class="log-timestamp">${log.timestamp || '-'}</div>
            <div class="log-message">${log.message || '-'}</div>
        `;
        safeLogContainer.appendChild(logItem);
    });
}

// ZOOM & PAN CONTROLS (Perfect Wrapper)
function setupZoomControls() {
    // Reset Origin
    mapContent.style.transformOrigin = '0 0';

    // Mouse Wheel Zoom
    mapContainer.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Hitung relatif terhadap WRAPPER (map-content)
        const rect = mapContent.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Titik asli sebelum zoom
        const pointX = mouseX / mapZoom;
        const pointY = mouseY / mapZoom;

        // Calculate Zoom
        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        let newZoom = mapZoom * delta;
        newZoom = Math.min(Math.max(0.5, newZoom), 5); // Limit 0.5x - 5x

        // Adjust Translate biar zoom ke arah cursor
        translateX += mouseX - (pointX * newZoom);
        translateY += mouseY - (pointY * newZoom);

        mapZoom = newZoom;
        updateMapTransform();
    });

    // Double Click Reset
    mapContainer.addEventListener('dblclick', resetMapPosition);

    setupPanControls();
}

function setupPanControls() {
    let isDragging = false;
    let startX, startY;
    let startTransX, startTransY;

    mapContainer.addEventListener('mousedown', (e) => {
        if (e.target.closest('.device-dot')) return;
        e.preventDefault();

        isDragging = true;
        mapContainer.style.cursor = 'grabbing';

        startX = e.clientX;
        startY = e.clientY;
        startTransX = translateX;
        startTransY = translateY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const x = e.clientX - startX;
        const y = e.clientY - startY;

        translateX = startTransX + x;
        translateY = startTransY + y;

        updateMapTransform();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        mapContainer.style.cursor = 'grab';
    });
    
    window.addEventListener('mouseleave', () => {
        isDragging = false;
        mapContainer.style.cursor = 'grab';
    });
}

function updateMapTransform() {
    mapContent.style.transform = `translate(${translateX}px, ${translateY}px) scale(${mapZoom})`;
}

function resetMapPosition() {
    mapZoom = 1;
    translateX = 0;
    translateY = 0;
    updateMapTransform();
}

// FULLSCREEN (Multi-View)

// Button Listeners
document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
document.getElementById('exit-fullscreen-btn').addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
    isFullscreenMode = !isFullscreenMode;
    if (isFullscreenMode) enterFullscreenMode();
    else exitFullscreenMode();
}

function enterFullscreenMode() {
    fullscreenContainer.classList.add('active');
    
    // Native Fullscreen Request
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
    }
    
    generateFloorGrids();
    startClock();
    updateFullscreenStats();
    console.log('Entered Fullscreen Mode');
}

function exitFullscreenMode() {
    isFullscreenMode = false;
    fullscreenContainer.classList.remove('active');
    
    // Exit Native Fullscreen
    if (document.exitFullscreen) document.exitFullscreen().catch(e=>{});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }

    // Hard Reset Visual (Anti-Blank)
    mapContainer.style.display = 'none';
    void mapContainer.offsetHeight; // Force reflow
    mapContainer.style.display = 'flex';
    
    resetMapPosition();
    console.log('Exited Fullscreen Mode');
}

// Generate Grid Layout
function generateFloorGrids() {
    fullscreenGrid.innerHTML = '';
    
    Object.keys(config.floor_labels).forEach(floorId => {
        const floorLabel = config.floor_labels[floorId];
        const floorMap = config.floor_maps[floorId];
        
        // Hitung Stats
        const floorDevices = allDevices.filter(d => d.floor_id === floorId);
        const onlineCount = floorDevices.filter(d => d.online).length;
        const offlineCount = floorDevices.length - onlineCount;
        
        // Grid Item
        const gridItem = document.createElement('div');
        gridItem.className = 'floor-grid-item';
        gridItem.dataset.floorId = floorId;

        // Red Alert Logic
        if (offlineCount > 0) gridItem.classList.add('critical');

        gridItem.innerHTML = `
            <div class="floor-grid-header">
                <h3>${floorLabel}</h3>
                <div class="floor-grid-stats" style="display: flex; align-items: center; gap: 8px; font-weight: 500;">
                    <span title="Total">Total: ${floorDevices.length}</span>
                    <span style="opacity: 0.3;">|</span>
                    <span class="online" style="color: #2ecc71;">🟢 ${onlineCount}</span>
                    <span style="opacity: 0.3;">|</span>
                    <span class="offline" style="color: #e74c3c;">🔴 ${offlineCount}</span>
                </div>
            </div>
            <div class="floor-grid-map">
                <img src="/${floorMap}" alt="${floorLabel}">
                <div class="floor-grid-dots"></div>
            </div>
        `;
        
        fullscreenGrid.appendChild(gridItem);
        renderFloorGridDevices(floorId);
    });
}

// Render Dots di Grid
function renderFloorGridDevices(floorId) {
    const gridItem = document.querySelector(`.floor-grid-item[data-floor-id="${floorId}"]`);
    if (!gridItem) return;
    
    const dotsContainer = gridItem.querySelector('.floor-grid-dots');
    dotsContainer.innerHTML = '';
    
    const floorDevices = allDevices.filter(d => d.floor_id === floorId);
    
    floorDevices.forEach(device => {
        const dot = document.createElement('div');
        dot.className = 'floor-grid-dot';
        dot.classList.add(device.online ? 'online' : 'offline');
        
        dot.style.top = device.position.top;
        dot.style.left = device.position.left;
        
        // Hover Tooltip juga aktif di TV Mode
        dot.addEventListener('mouseenter', (e) => showTooltip(e, device));
        dot.addEventListener('mouseleave', hideTooltip);
        
        dotsContainer.appendChild(dot);
    });
}

// Update Stats & Visual saat Data Masuk (Tanpa Re-generate semua HTML)
function updateFullscreenStats() {
    if (!isFullscreenMode) return;
    
    // Global Stats
    if(fsTotal) fsTotal.textContent = statTotal.textContent;
    if(fsOnline) fsOnline.textContent = statOnline.textContent;
    if(fsOffline) fsOffline.textContent = statOffline.textContent;
    
    // Per Floor Stats
    Object.keys(config.floor_labels).forEach(floorId => {
        // Re-render dots biar warna berubah
        renderFloorGridDevices(floorId);
        
        const gridItem = document.querySelector(`.floor-grid-item[data-floor-id="${floorId}"]`);
        if (gridItem) {
            const floorDevices = allDevices.filter(d => d.floor_id === floorId);
            const onlineCount = floorDevices.filter(d => d.online).length;
            const offlineCount = floorDevices.length - onlineCount;
            
            // Update Red Alert Border
            if (offlineCount > 0) gridItem.classList.add('critical');
            else gridItem.classList.remove('critical');

            // Update Header Stats (Pakai Icon)
            const statsDiv = gridItem.querySelector('.floor-grid-stats');
            if(statsDiv) {
                statsDiv.innerHTML = `
                    <span title="Total">Total: ${floorDevices.length}</span>
                    <span style="opacity: 0.3;">|</span>
                    <span class="online" style="color: #2ecc71;">🟢 ${onlineCount}</span>
                    <span style="opacity: 0.3;">|</span>
                    <span class="offline" style="color: #e74c3c;">🔴 ${offlineCount}</span>
                `;
            }
        }
    });
}

// Clock Logic
function startClock() {
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-GB'); // Format HH:MM:SS
    if (fsClock) fsClock.textContent = timeString;
}

// EVENT LISTENERS & FIXES

// Handle Tombol ESC / F11
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFullscreenMode) exitFullscreenMode();
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isFullscreenMode) {
        exitFullscreenMode();
    }
});

// Fix Alt+Tab Black Screen (Visibility Change)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isFullscreenMode) {
        console.log('User returned, refreshing TV layout...');
        setTimeout(() => {
            generateFloorGrids();
            updateFullscreenStats();
        }, 150);
    }
});

// Fix Resize Window
window.addEventListener('resize', () => {
    if (isFullscreenMode) {
        generateFloorGrids();
    } else {
        updateMapTransform();
    }
});
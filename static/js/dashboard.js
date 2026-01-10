// Fitur: Real-time Socket.IO, Perfect Zoom/Pan, TV Mode Stabil, Auto-Reconnect

// Socket.IO akan di-initialize setelah DOM ready
let socket = null;

// GLOBAL VARIABLES & SOCKET SETUP
let allDevices = [];
let config = {};
let currentFloor = 'floor_1'; // Default floor - akan di-update dari config keys
let activeFilters = new Set();
let mapZoom = 1;
let isPanning = false;
let translateX = 0, translateY = 0;
let isFullscreenMode = false;
let clockInterval = null;

// DOM Elements - dengan null checks
// Socket di-init di init() function
const floorNav = document.getElementById('floor-nav');
const filterPanel = document.getElementById('filter-panel');
const mapContainer = document.getElementById('map-container');
const mapContent = document.getElementById('map-content'); // Wrapper Peta
const floorMap = document.getElementById('floor-map');
const deviceDotsContainer = document.getElementById('device-dots-container');
const currentFloorTitle = document.getElementById('current-floor-title');
const lastUpdateSpan = document.getElementById('last-update');
const logContainer = document.getElementById('log-container');

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

// --- SOCKET LISTENERS SETUP ---
function setupSocketListeners() {
    if (!socket) return;

    // 1. Connect
    socket.on('connect', () => {
        console.log("✅ Terhubung ke Server Real-Time!");
        console.log('Transport:', socket.io.engine.transport.name); // Debug: lihat transport yang dipakai
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
    socket.on('update_data', onUpdateData);
    
    // 4. Error handling
    socket.on('connect_error', (error) => {
        console.warn('Socket.IO connection error:', error);
    });
}

function onUpdateData(data) {
    // A. Simpan Data Device
    allDevices = data.devices; 
    console.log(`📡 Data Masuk: ${allDevices.length} devices`);
    console.log('First device:', allDevices[0]); // DEBUG: lihat struktur data

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
        console.warn('Config not loaded yet, skipping render');
        return; 
    }

    // E. Render Ulang Tampilan
    console.log('Current Floor:', currentFloor, 'Active Filters:', Array.from(activeFilters));
    if (isFullscreenMode) {
        updateFullscreenStats();
    } else {
        renderDevices();
    }
}

// INITIALIZATION
async function init() {
    console.log('Initializing dashboard...');

    try {
        // A. Initialize Socket.IO
        if (!socket) {
            socket = io();
            setupSocketListeners();
            console.log('Socket.IO initialized');
        }
        
        // B. Load configuration
        const configLoaded = await loadConfig();
        
        if (!configLoaded) {
            console.error('Failed to load configuration. Retrying...');
            setTimeout(init, 2000); 
            return;
        }
                
        // C. Generate UI Components
        generateFloorNavigation();
        generateFilterPanel();
        
        // D. Setup Map
        setInitialFloorMap();
        setupZoomControls();
        
        // E. Setup Button Listeners
        setupButtonListeners();
        
        console.log('✅ Dashboard initialized successfully!');

        // F. Initial Render jika data sudah ada
        if (allDevices.length > 0) {
            renderDevices();
        }
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
    }
}
document.addEventListener('DOMContentLoaded', init);

// --- SETUP BUTTON LISTENERS ---
function setupButtonListeners() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    if (exitFullscreenBtn) {
        exitFullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }
}

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
    const floorKeys = Object.keys(config.floor_labels);
    
    // Set first floor as default if not set
    if (floorKeys.length > 0 && !floorKeys.includes(currentFloor)) {
        currentFloor = floorKeys[0];
        console.log('Auto-set floor to:', currentFloor);
    }
    
    floorKeys.forEach(floorId => {
        const btn = document.createElement('button');
        btn.className = 'floor-btn';
        btn.textContent = config.floor_labels[floorId];
        btn.dataset.floor = floorId;
        
        if (floorId === currentFloor) {
            btn.classList.add('active');
        }
        
        btn.addEventListener('click', () => switchFloor(floorId));
        floorNav.appendChild(btn);
    });
}

// Generate Filter Checkboxes
function generateFilterPanel() {
    filterPanel.innerHTML = '';
    activeFilters.clear(); // Clear before regenerating
    
    Object.keys(config.device_types).forEach(typeId => {
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `filter-${typeId}`;
        checkbox.value = typeId;
        checkbox.checked = true; // All checked by default
        activeFilters.add(typeId);
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) activeFilters.add(typeId);
            else activeFilters.delete(typeId);
            console.log('Filter changed, active filters:', Array.from(activeFilters));
            renderDevices();
        });
        
        const label = document.createElement('label');
        label.htmlFor = `filter-${typeId}`;
        label.textContent = config.device_types[typeId].label;
        
        filterItem.appendChild(checkbox);
        filterItem.appendChild(label);
        filterPanel.appendChild(filterItem);
    });
    
    console.log('Filters initialized:', Array.from(activeFilters));
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
    console.log('renderDevices called. Container:', deviceDotsContainer, 'Devices:', allDevices.length);
    
    if (!deviceDotsContainer) {
        console.error('❌ Device dots container not found!');
        return;
    }
    
    deviceDotsContainer.innerHTML = '';
    
    if (!allDevices || !Array.isArray(allDevices)) {
        console.warn('No devices or not array');
        return;
    }
    
    // Filter devices
    const filteredDevices = allDevices.filter(device => {
        const match = device.floor_id === currentFloor && activeFilters.has(device.type);
        if (!match) {
            console.log(`Filtered out: ${device.name} (floor: ${device.floor_id}, type: ${device.type})`);
        }
        return match;
    });
    
    console.log(`Filtered: ${filteredDevices.length} devices untuk floor ${currentFloor}`);
    
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
            dot.addEventListener('mouseover', (e) => showTooltip(device, e));
            dot.addEventListener('mouseout', hideTooltip);

            deviceDotsContainer.appendChild(dot);
        } catch (error) {
            console.error('Error rendering device:', device, error);
        }
    });
    
    console.log(`✅ Rendered ${filteredDevices.length} device dots`);
}

// Tooltip Functions
const tooltip = document.getElementById('tooltip');

function showTooltip(device, event) {
    if (!tooltip) return;

    tooltip.innerHTML = `
        <strong>${device.name}</strong><br>
        IP: ${device.ip}<br>
        Type: ${config.device_types[device.type].label}<br>
        Status: ${device.online ? 'Online' : 'Offline'}<br>
        Floor: ${config.floor_labels[device.floor_id]}
    `;

    tooltip.classList.add('show');
    // Position after the content has been rendered
    setTimeout(() => positionTooltip(event), 0);
}

function hideTooltip() {
    if (!tooltip) return;
    tooltip.classList.remove('show');
}

function positionTooltip(event) {
    if (!tooltip) return;

    const tooltipRect = tooltip.getBoundingClientRect();
    let x = event.pageX + 2;
    let y = event.pageY + 2;

    // Adjust if tooltip goes off screen
    if (x + tooltipRect.width > window.innerWidth) {
        x = event.pageX - tooltipRect.width - 2;
    }

    if (y + tooltipRect.height > window.innerHeight) {
        y = event.pageY - tooltipRect.height - 2;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
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
    if (mapContent) mapContent.style.transformOrigin = '0 0';

    // Mouse Wheel Zoom
    if (mapContainer) mapContainer.addEventListener('wheel', (e) => {
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
    setupTouchControls();
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
    if (mapContent) mapContent.style.transform = `translate(${translateX}px, ${translateY}px) scale(${mapZoom})`;
}

function resetMapPosition() {
    mapZoom = 1;
    translateX = 0;
    translateY = 0;
    updateMapTransform();
}

// Sidebar Toggle Function
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay') || createOverlay();

    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('show');
    }
}

// Create overlay for mobile sidebar
function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', toggleSidebar);
    document.body.appendChild(overlay);
    return overlay;
}

// Touch Controls for Mobile Zoom and Pan
function setupTouchControls() {
    let initialDistance = 0;
    let initialZoom = 1;
    let initialTranslateX = 0;
    let initialTranslateY = 0;
    let isPinching = false;
    let isPanning = false;
    let lastTouchX = 0;
    let lastTouchY = 0;

    mapContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Pinch start
            e.preventDefault();
            isPinching = true;
            isPanning = false;

            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            initialDistance = getDistance(touch1, touch2);
            initialZoom = mapZoom;
            initialTranslateX = translateX;
            initialTranslateY = translateY;

            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            const rect = mapContent.getBoundingClientRect();
            const pointX = (centerX - rect.left) / mapZoom;
            const pointY = (centerY - rect.top) / mapZoom;

            // Store center point for zoom
            mapContainer.dataset.zoomCenterX = pointX;
            mapContainer.dataset.zoomCenterY = pointY;
        } else if (e.touches.length === 1) {
            // Pan start
            e.preventDefault();
            isPanning = true;
            isPinching = false;

            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            initialTranslateX = translateX;
            initialTranslateY = translateY;
        }
    });

    mapContainer.addEventListener('touchmove', (e) => {
        if (isPinching && e.touches.length === 2) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = getDistance(touch1, touch2);
            const scale = currentDistance / initialDistance;

            let newZoom = initialZoom * scale;
            newZoom = Math.min(Math.max(0.5, newZoom), 5);

            const pointX = parseFloat(mapContainer.dataset.zoomCenterX);
            const pointY = parseFloat(mapContainer.dataset.zoomCenterY);
            const rect = mapContent.getBoundingClientRect();
            const centerX = rect.left + pointX * initialZoom;
            const centerY = rect.top + pointY * initialZoom;

            translateX = initialTranslateX + (centerX - rect.left) - (pointX * newZoom);
            translateY = initialTranslateY + (centerY - rect.top) - (pointY * newZoom);

            mapZoom = newZoom;
            updateMapTransform();
        } else if (isPanning && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const deltaX = touch.clientX - lastTouchX;
            const deltaY = touch.clientY - lastTouchY;

            translateX = initialTranslateX + deltaX;
            translateY = initialTranslateY + deltaY;

            updateMapTransform();
        }
    });

    mapContainer.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            isPinching = false;
            isPanning = false;
        }
    });

    // Helper function to calculate distance between two touches
    function getDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

// FULLSCREEN (Multi-View)

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
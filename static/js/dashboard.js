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

// LOG VARIABLES
let currentLogsData = [];
let logSearchTerm = '';
let logStatusFilter = 'all';

// --- HELPER UNTUK AKSI YANG MEMBUTUHKAN LOGIN ---
function performAuthenticatedAction(action) {
    // We determine if the user is authenticated by checking for an element
    // (misal: tombol 'Clear History' atau tombol 'Logout' yang akan kita tambahkan).
    const isAuthenticated = !!document.querySelector('#clear-logs-btn, .btn-logout');

    if (isAuthenticated) {
        action();
    } else {
        // Jika belum login, langsung arahkan ke halaman login.
        window.location.href = '/auth/login';
    }
}

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
const clearLogsBtn = document.getElementById('clear-logs-btn');
const refreshLogBtn = document.getElementById('refresh-log-btn');

const fullscreenContainer = document.getElementById('fullscreen-container');
const fullscreenGrid = document.getElementById('fullscreen-grid');
const focusViewContainer = document.getElementById('focus-view-container');

// Modal elements
const deviceListModal = document.getElementById('device-list-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalCloseBtn = document.getElementById('modal-close-btn');

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
        console.log("Terhubung ke Server Real-Time!");
        console.log('Transport:', socket.io.engine.transport.name); // Debug: lihat transport yang dipakai
        if(lastUpdateSpan) lastUpdateSpan.style.color = '#2ecc71';
    });

    // 2. Disconnect
    socket.on('disconnect', () => {
        console.log("Koneksi Putus!");
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
    console.log(`Data Masuk: ${allDevices.length} devices`);
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
        currentLogsData = data.logs; // Simpan data mentah
        renderEventLogs(currentLogsData); // Render dengan filter saat ini
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
        
        // F. Setup Log Panel (Accordion & Filter)
        setupLogPanel();
        
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
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    // Stat box listeners
    // FIX: Gunakan ID elemen anak untuk menemukan parent .stat-box agar lebih robust
    const statTotalEl = document.getElementById('stat-total');
    const statOnlineEl = document.getElementById('stat-online');
    const statOfflineEl = document.getElementById('stat-offline');
    
    const statTotalBox = statTotalEl ? statTotalEl.closest('.stat-box') : null;
    const statOnlineBox = statOnlineEl ? statOnlineEl.closest('.stat-box') : null;
    const statOfflineBox = statOfflineEl ? statOfflineEl.closest('.stat-box') : null;

    if (statTotalBox) statTotalBox.addEventListener('click', () => showDeviceListModal('total'));
    if (statOnlineBox) statOnlineBox.addEventListener('click', () => showDeviceListModal('online'));
    if (statOfflineBox) statOfflineBox.addEventListener('click', () => showDeviceListModal('offline'));

    const modalClose = modalCloseBtn || document.getElementById('modal-close-btn');
    if (modalClose) modalClose.addEventListener('click', hideDeviceListModal);

    const modal = deviceListModal || document.getElementById('device-list-modal');
    if (modal) modal.addEventListener('click', (e) => {
        // Close modal if overlay is clicked, but not its content
        if (e.target === modal) hideDeviceListModal();
    });

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    if (exitFullscreenBtn) {
        exitFullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', toggleSidebar);
    }

    // Add listeners for log buttons
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all activity logs from memory?')) {
                socket.emit('clear_logs');
            }
        });
    }

    if (refreshLogBtn) {
        refreshLogBtn.addEventListener('click', () => {
            // Meminta server mengirim ulang data terbaru
            socket.emit('request_update');
            // Beri feedback visual sederhana
            refreshLogBtn.textContent = 'Refreshing...';
            setTimeout(() => {
                refreshLogBtn.textContent = 'Refresh';
            }, 1000);
        });
    }
}

// --- DEVICE DOT INTERACTION HANDLER (REFACTORED) ---
function addDeviceDotInteraction(dot, device) {
    const isMobile = window.innerWidth <= 768;

    const openDetailPage = () => performAuthenticatedAction(
        () => window.open(`/device/${device.id}`, '_blank')
    );

    if (isMobile) {
        let pressTimer = null;
        let longPressTriggered = false;

        const handleTouchStart = (e) => {
            longPressTriggered = false;
            pressTimer = setTimeout(() => {
                longPressTriggered = true;
                showTooltip(device, e.touches[0]); // Show tooltip on long press
            }, 400); // Hold for 400ms
        };

        const handleTouchEnd = (e) => {
            clearTimeout(pressTimer);
            hideTooltip(); // Hide tooltip on release
            if (longPressTriggered) {
                e.preventDefault(); // Prevent click event after a long press
            }
        };

        dot.addEventListener('touchstart', handleTouchStart);
        dot.addEventListener('touchend', handleTouchEnd);
        dot.addEventListener('touchcancel', handleTouchEnd); // Also hide on cancel
        dot.addEventListener('click', openDetailPage);
        dot.addEventListener('contextmenu', e => e.preventDefault()); // Prevent default menu
    } else {
        // Desktop logic
        dot.addEventListener('click', openDetailPage);
        dot.addEventListener('mouseover', (e) => showTooltip(device, e));
        dot.addEventListener('mouseout', hideTooltip);
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
        
        const mapPath = '/static/' + config.floor_maps[currentFloor];
        
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

        // Make the entire item clickable to toggle the checkbox
        filterItem.addEventListener('click', (e) => {
            // Only trigger if the click is on the container, not the checkbox/label itself
            if (e.target === filterItem) {
                checkbox.checked = !checkbox.checked;
                // Manually dispatch a 'change' event so the filter logic runs
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

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
    
    const mapPath = '/static/' + config.floor_maps[floorId];
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
        console.error('Device dots container not found!');
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
            dot.classList.add(device.status || 'offline'); // Gunakan device.status

            // Posisi
            dot.style.top = device.position.top;
            dot.style.left = device.position.left;
            dot.style.transform = 'translate(-50%, -50%)';

            addDeviceDotInteraction(dot, device);

            deviceDotsContainer.appendChild(dot);
        } catch (error) {
            console.error('Error rendering device:', device, error);
        }
    });
    
    console.log(`Rendered ${filteredDevices.length} device dots`);
}

// Render Devices for Focus View (uses main .device-dot style)
function renderFocusViewDevices(floorId, container) {
    if (!container) return;
    container.innerHTML = '';

    const filteredDevices = allDevices.filter(device => device.floor_id === floorId);

    filteredDevices.forEach(device => {
        try {
            const dot = document.createElement('div');
            dot.className = 'device-dot'; // Use the main dot style
            dot.classList.add(device.status || 'offline'); // Gunakan device.status
            dot.style.top = device.position.top;
            dot.style.left = device.position.left;

            addDeviceDotInteraction(dot, device);

            container.appendChild(dot);
        } catch (error) {
            console.error('Error rendering focus view device:', device, error);
        }
    });
}

function setupFocusMapInteraction(containerEl, contentEl) {
    let zoom = 1, transX = 0, transY = 0;
    let isDragging = false;
    let startX, startY, startTransX, startTransY;

    const resetFocusMapPosition = () => {
        zoom = 1;
        transX = 0;
        transY = 0;
        updateTransform();
    };

    const updateTransform = () => {
        if (contentEl) {
            contentEl.style.transform = `translate(${transX}px, ${transY}px) scale(${zoom})`;
        }
    };

    const onWheel = e => {
        e.preventDefault();
        const rect = contentEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
        const pointX = mouseX / zoom, pointY = mouseY / zoom;
        const newZoom = Math.min(Math.max(0.5, zoom * (e.deltaY < 0 ? 1.1 : 0.9)), 8); // Increased max zoom
        transX += mouseX - (pointX * newZoom);
        transY += mouseY - (pointY * newZoom);
        zoom = newZoom;
        updateTransform();
    };

    const onMouseDown = e => {
        if (e.target.closest('.device-dot')) return;
        e.preventDefault();
        isDragging = true;
        containerEl.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        startTransX = transX;
        startTransY = transY;
    };

    const onMouseMove = e => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.clientX - startX;
        const y = e.clientY - startY;
        transX = startTransX + x;
        transY = startTransY + y;
        updateTransform();
    };

    const onMouseUp = () => {
        isDragging = false;
        containerEl.style.cursor = 'grab';
    };

    containerEl.addEventListener('wheel', onWheel);
    containerEl.addEventListener('dblclick', resetFocusMapPosition); // Add double-click listener
    containerEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseleave', onMouseUp); // Also stop on mouse leave

    // Return a cleanup function
    return () => {
        containerEl.removeEventListener('wheel', onWheel);
        containerEl.removeEventListener('dblclick', resetFocusMapPosition); // Remove double-click listener
        containerEl.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('mouseleave', onMouseUp);
    };
}

// Tooltip Functions
const tooltip = document.getElementById('tooltip');

function showTooltip(device, event) {
    if (!tooltip) return;

    // Tambahkan class status ke tooltip utama untuk styling (misal: border color)
    tooltip.className = 'tooltip'; // Reset class dulu
    tooltip.classList.add(`status-${device.status}`); // Gunakan device.status

    const statusText = device.status.charAt(0).toUpperCase() + device.status.slice(1);
    const statusClass = device.status;

    tooltip.innerHTML = `
        <strong>
            <span class="tooltip-type">${config.device_types[device.type].label}</span>
            ${device.name}
        </strong>
        <div class="tooltip-body">
            IP: ${device.ip}<br>
            Status: <span class="status-indicator ${statusClass}">${statusText}</span><br>
            Floor: ${config.floor_labels[device.floor_id]}
        </div>
        <div class="tooltip-meta">
            Last Checked: ${device.last_checked || 'N/A'}
        </div>
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

    const dot = event.target;
    if (!dot) return;

    const dotRect = dot.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    // Position the top-left corner of the tooltip at the center of the dot.
    let x = dotRect.left + (dotRect.width / 2);
    let y = dotRect.top + (dotRect.height / 2);
    
    let originX = 'left';
    let originY = 'top';

    // Adjust X position and origin if it goes off the right edge
    if (x + tooltipRect.width > window.innerWidth) {
        x = dotRect.left + (dotRect.width / 2) - tooltipRect.width;
        originX = 'right';
    }

    // Adjust Y position and origin if it goes off the bottom edge
    if (y + tooltipRect.height > window.innerHeight) {
        y = dotRect.top + (dotRect.height / 2) - tooltipRect.height;
        originY = 'bottom';
    }
    
    // Final check for left/top edges to prevent going off-screen
    if (x < 0) {
        x = 10;
    }
    if (y < 0) {
        y = 10;
    }

    tooltip.style.transformOrigin = `${originY} ${originX}`;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}


// Render Logs (VERSI KUAT / ANTI-CRASH)
function renderEventLogs(logs) {
    const safeLogContainer = document.getElementById('log-container');

    if (!safeLogContainer) {
        return; 
    }

    // 1. Filter Logs Client-Side
    const filteredLogs = logs.filter(log => {
        // Filter by Status
        const matchesStatus = logStatusFilter === 'all' || log.status === logStatusFilter;
        
        // Filter by Search (Device Name or Message)
        const term = logSearchTerm.toLowerCase();
        const matchesSearch = (log.device && log.device.toLowerCase().includes(term)) || 
                              (log.message && log.message.toLowerCase().includes(term));
        
        return matchesStatus && matchesSearch;
    });

    if (!filteredLogs || filteredLogs.length === 0) {
        safeLogContainer.innerHTML = '<p class="log-empty">No events yet...</p>';
        return;
    }
    
    safeLogContainer.innerHTML = '';
    filteredLogs.forEach(log => {
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        const statusClass = log.status ? log.status.toLowerCase() : 'unknown';
        logItem.classList.add(`status-${statusClass}`);
        
        // Tampilkan Badge Tipe Device jika ada
        const typeBadge = log.type ? `<span class="device-type-badge">${log.type}</span>` : '';

        logItem.innerHTML = `
            <div class="log-timestamp">${log.timestamp || '-'}</div>
            <div class="log-message">${typeBadge}${log.message || '-'}</div>
        `;
        safeLogContainer.appendChild(logItem);
    });
}

// --- LOG PANEL LOGIC (ACCORDION & FILTER) ---
function setupLogPanel() {
    const logPanel = document.querySelector('.log-panel');
    const logHeader = document.querySelector('.log-header');
    const logContainer = document.getElementById('log-container');
    
    if (!logPanel || !logHeader) return;

    // 1. Accordion Toggle (Klik Header untuk Expand/Collapse)
    logHeader.addEventListener('click', (e) => {
        // Jangan toggle jika yang diklik adalah tombol di dalam header (misal refresh/clear)
        if (e.target.closest('button') || e.target.closest('input')) return;
        logPanel.classList.toggle('expanded');
        
        // Ganti icon panah jika ada (opsional)
        const title = logHeader.querySelector('h3');
        if (title) {
            title.textContent = logPanel.classList.contains('expanded') ? 'Activity Logs 🔽' : 'Activity Logs 🔼';
        }
    });

    // 2. Inject Controls (Search & Filter) secara dinamis
    // Kita masukkan sebelum logContainer
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'log-controls';
    controlsDiv.innerHTML = `
        <input type="text" id="log-search" class="log-search" placeholder="Search device or message...">
        <div class="log-filter-group" style="display:flex; gap:5px;">
            <button class="log-filter-btn active" data-filter="all">All</button>
            <button class="log-filter-btn" data-filter="online">Online</button>
            <button class="log-filter-btn" data-filter="offline">Offline</button>
            <button class="log-filter-btn" data-filter="unstable">Unstable</button>
        </div>
    `;
    
    logPanel.insertBefore(controlsDiv, logContainer);

    // 3. Event Listeners untuk Search
    const searchInput = document.getElementById('log-search');
    searchInput.addEventListener('input', (e) => {
        logSearchTerm = e.target.value;
        renderEventLogs(currentLogsData);
    });

    // 4. Event Listeners untuk Filter Buttons
    const filterBtns = document.querySelectorAll('.log-filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Stop propagation agar tidak men-trigger accordion
            e.stopPropagation();
            
            // Update UI Active State
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update Filter Logic
            logStatusFilter = btn.dataset.filter;
            renderEventLogs(currentLogsData);
        });
    });
    
    // Tambahkan indikator panah di judul awal
    const title = logHeader.querySelector('h3');
    if (title) title.textContent = 'Activity Logs 🔼';
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

// --- MODAL FUNCTIONS ---
function showDeviceListModal(status) {
    // Re-query elements to ensure they exist (in case of loading race conditions)
    const modal = deviceListModal || document.getElementById('device-list-modal');
    const titleEl = modalTitle || document.getElementById('modal-title');
    const bodyEl = modalBody || document.getElementById('modal-body');

    if (!modal || !titleEl || !bodyEl) return;

    let initialDevices = [];
    let title = '';

    switch (status) {
        case 'online':
            initialDevices = allDevices.filter(d => d.status === 'online');
            title = 'Online Devices';
            break;
        case 'offline':
            initialDevices = allDevices.filter(d => d.status !== 'online'); // Offline & Unstable
            title = 'Offline Devices';
            break;
        case 'total':
        default:
            initialDevices = [...allDevices]; // Create a copy to sort
            title = 'All Devices';
            break;
    }

    titleEl.textContent = `${title} (${initialDevices.length})`;
    bodyEl.innerHTML = ''; // Clear previous content

    // 1. Create filter controls
    const filterControls = document.createElement('div');
    filterControls.className = 'modal-filter-controls';
    
    const deviceTypesInList = [...new Set(initialDevices.map(d => d.type))];

    // Only show filters if there's more than one type and the list is not empty
    if (deviceTypesInList.length > 1) {
        // "All" button
        const allBtn = document.createElement('button');
        allBtn.className = 'modal-filter-btn active';
        allBtn.textContent = `All (${initialDevices.length})`;
        allBtn.dataset.type = 'all';
        filterControls.appendChild(allBtn);

        // Buttons for each type
        deviceTypesInList.sort().forEach(type => {
            const typeCount = initialDevices.filter(d => d.type === type).length;
            const typeBtn = document.createElement('button');
            typeBtn.className = 'modal-filter-btn';
            typeBtn.textContent = `${config.device_types[type]?.label || type} (${typeCount})`;
            typeBtn.dataset.type = type;
            filterControls.appendChild(typeBtn);
        });
        bodyEl.appendChild(filterControls);
    }

    // 2. Create list container
    const listContainer = document.createElement('div');
    bodyEl.appendChild(listContainer);

    // 3. Function to render the list
    function renderList(devices) {
        listContainer.innerHTML = ''; // Clear only the list
        if (devices.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center; color: #a0aec0;">No devices to show.</p>';
            return;
        }

        const list = document.createElement('ul');
        list.className = 'modal-device-list';

        // Sort devices: offline first, then by name
        devices.sort((a, b) => {
            if (a.status === 'online' && b.status !== 'online') return 1;
            if (a.status !== 'online' && b.status === 'online') return -1;
            return a.name.localeCompare(b.name);
        });

        devices.forEach(device => {
            const item = document.createElement('li');
            item.className = `modal-device-item ${device.status}`;
            // Make the item clickable to open detail page
            item.style.cursor = 'pointer';
            item.addEventListener('click', (e) => {
                // Ensure the click is on the item itself, not the 'Access' button
                if (e.target.tagName !== 'A' && !e.target.closest('a')) {
                    performAuthenticatedAction(() =>
                        window.open(`/device/${device.id}`, '_blank')
                    );
                }
            });
            item.innerHTML = `
                <div class="modal-device-info">
                    <span class="modal-device-name">${device.name}</span>
                    <span class="modal-device-ip">${device.ip}</span>
                </div>
                <a href="http://${device.ip}" target="_blank" class="btn" style="padding: 5px 10px; font-size: 12px;">Access</a>
            `;
            list.appendChild(item);
        });
        listContainer.appendChild(list);
    }

    // 4. Initial render
    renderList(initialDevices);

    // 5. Add event listeners to filter buttons
    filterControls.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            // Deactivate all buttons
            filterControls.querySelectorAll('.modal-filter-btn').forEach(btn => btn.classList.remove('active'));
            // Activate clicked button
            e.target.classList.add('active');

            const filterType = e.target.dataset.type;
            const filteredDevices = filterType === 'all'
                ? initialDevices
                : initialDevices.filter(d => d.type === filterType);
            
            renderList(filteredDevices);
        }
    });

    modal.classList.add('show');
}

function hideDeviceListModal() {
    const modal = deviceListModal || document.getElementById('device-list-modal');
    if (!modal) return;
    modal.classList.remove('show');
}

// Sidebar Toggle Function
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('show');
}

// The createOverlay function is no longer needed as the overlay is now part of the HTML structure.
// The event listener is added in setupButtonListeners.
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
    if (isFullscreenMode && isInFocusMode) {
        exitFocusMode();
    }
    isFullscreenMode = !isFullscreenMode;
    if (isFullscreenMode) enterFullscreenMode();
    else exitFullscreenMode();
}

function enterFullscreenMode() {
    document.body.classList.add('fullscreen-active');
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
    document.body.classList.remove('fullscreen-active');
    if (isInFocusMode) {
        exitFocusMode();
    }
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
        const onlineCount = floorDevices.filter(d => d.status === 'online').length;
        const offlineCount = floorDevices.length - onlineCount;
        
        // Grid Item
        const gridItem = document.createElement('div');
        gridItem.className = 'floor-grid-item';
        gridItem.dataset.floorId = floorId;

        // Red Alert Logic
        if (offlineCount > 0) gridItem.classList.add('critical');

        // Add click listener for focus mode
        gridItem.addEventListener('click', () => enterFocusMode(floorId));

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
                <img src="/static/${floorMap}" alt="${floorLabel}">
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
        dot.className = `floor-grid-dot ${device.status}`;
        
        dot.style.top = device.position.top;
        dot.style.left = device.position.left;

        addDeviceDotInteraction(dot, device);

        dotsContainer.appendChild(dot);
    });
}

let isInFocusMode = false;
let destroyFocusMapListeners = () => {};

function enterFocusMode(floorId) {
    if (!config || !config.floor_maps) return;
    isInFocusMode = true;

    // Hide grid, show focus container
    fullscreenGrid.style.display = 'none';
    focusViewContainer.classList.add('active');
    focusViewContainer.innerHTML = ''; // Clear previous

    // Create map structure
    const focusMapHTML = `
        <div class="map-container" id="focus-map-container">
            <div id="focus-map-content" class="map-content">
                <img id="focus-floor-map" src="" class="floor-map">
                <div id="focus-device-dots-container" class="device-dots-container"></div>
            </div>
        </div>
        <button id="focus-close-btn" class="exit-fullscreen-btn focus-close-btn">Back to Grid</button>
    `;
    focusViewContainer.innerHTML = focusMapHTML;

    // Get new elements
    const focusMapContainer = document.getElementById('focus-map-container');
    const focusMapContent = document.getElementById('focus-map-content');
    const focusFloorMap = document.getElementById('focus-floor-map');
    const focusDotsContainer = document.getElementById('focus-device-dots-container');
    const focusCloseBtn = document.getElementById('focus-close-btn');

    focusCloseBtn.addEventListener('click', exitFocusMode);

    focusFloorMap.src = '/static/' + config.floor_maps[floorId];
    renderFocusViewDevices(floorId, focusDotsContainer);

    destroyFocusMapListeners = setupFocusMapInteraction(focusMapContainer, focusMapContent);
}

function exitFocusMode() {
    isInFocusMode = false;
    
    if (destroyFocusMapListeners) {
        destroyFocusMapListeners();
        destroyFocusMapListeners = () => {};
    }

    focusViewContainer.classList.remove('active');
    focusViewContainer.innerHTML = '';
    fullscreenGrid.style.display = 'grid';
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
            const onlineCount = floorDevices.filter(d => d.status === 'online').length;
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
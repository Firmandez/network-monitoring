// dashboard.js - NOC Monitoring Dashboard Frontend Logic

// Global State
let allDevices = [];
let config = {};
let currentFloor = 'ground';
let activeFilters = new Set();
let mapZoom = 1;
let isPanning = false;
let startX, startY, translateX = 0, translateY = 0;

// DOM Elements
const floorNav = document.getElementById('floor-nav');
const filterPanel = document.getElementById('filter-panel');
const mapContainer = document.getElementById('map-container');
const floorMap = document.getElementById('floor-map');
const deviceDotsContainer = document.getElementById('device-dots-container');
const currentFloorTitle = document.getElementById('current-floor-title');
const lastUpdateSpan = document.getElementById('last-update');
const logContainer = document.getElementById('log-container');
const tooltip = document.getElementById('tooltip');

// Stats elements
const statTotal = document.getElementById('stat-total');
const statOnline = document.getElementById('stat-online');
const statOffline = document.getElementById('stat-offline');

// Initialize dashboard
async function init() {
    console.log('Initializing dashboard...');
    
    try {
        // Load configuration first (wait for it to complete)
        const configLoaded = await loadConfig();
        
        if (!configLoaded) {
            console.error('Failed to load configuration. Retrying...');
            setTimeout(init, 2000); // Retry after 2 seconds
            return;
        }
        
        // Generate floor navigation
        generateFloorNavigation();
        
        // Generate filter checkboxes
        generateFilterPanel();
        
        // Set initial floor map image (after config is loaded)
        setInitialFloorMap();
        
        // Load initial data
        await fetchDeviceStatus();
        
        // Start polling for updates every 5 seconds
        setInterval(fetchDeviceStatus, 5000);
        
        // Load event logs
        await fetchEventLogs();
        
        // Setup refresh button
        document.getElementById('refresh-log-btn').addEventListener('click', fetchEventLogs);
        
        // Setup zoom controls
        setupZoomControls();
        
        console.log('Dashboard initialized successfully!');
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
    }
}

// Set initial floor map on page load
function setInitialFloorMap() {
    if (config.floor_maps && config.floor_maps[currentFloor]) {
        // Set floor title
        if (config.floor_labels && config.floor_labels[currentFloor]) {
            currentFloorTitle.textContent = config.floor_labels[currentFloor];
        }
        
        const mapPath = '/' + config.floor_maps[currentFloor];
        
        // Preload image before setting src
        const img = new Image();
        img.onload = function() {
            floorMap.src = mapPath;
            floorMap.classList.add('loaded');
            floorMap.style.opacity = '0.95';
            console.log('Initial map loaded successfully:', mapPath);
        };
        img.onerror = function() {
            console.error('Failed to load initial map:', mapPath);
            floorMap.alt = 'Failed to load map image. Check if file exists: ' + mapPath;
        };
        img.src = mapPath;
    } else {
        console.error('Floor map configuration not found for:', currentFloor);
    }
}

// Load configuration from API
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        config = await response.json();
        console.log('Configuration loaded:', config);
        
        // Verify config has required data
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

// Generate floor navigation buttons
function generateFloorNavigation() {
    floorNav.innerHTML = '';
    
    Object.keys(config.floor_labels).forEach(floorId => {
        const btn = document.createElement('button');
        btn.className = 'floor-btn';
        btn.textContent = config.floor_labels[floorId];
        btn.dataset.floor = floorId;
        
        // Set active class for current floor
        if (floorId === currentFloor) {
            btn.classList.add('active');
        }
        
        btn.addEventListener('click', () => switchFloor(floorId));
        floorNav.appendChild(btn);
    });
    
    console.log('Floor navigation generated. Current floor:', currentFloor);
}

// Generate device type filter checkboxes
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
            if (e.target.checked) {
                activeFilters.add(typeId);
            } else {
                activeFilters.delete(typeId);
            }
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

// Switch to a different floor
function switchFloor(floorId) {
    currentFloor = floorId;
    
    // Update active button
    document.querySelectorAll('.floor-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.floor === floorId) {
            btn.classList.add('active');
        }
    });
    
    // Update floor title
    currentFloorTitle.textContent = config.floor_labels[floorId];
    
    // Update map image
    floorMap.src = config.floor_maps[floorId];
    
    // Re-render devices
    renderDevices();
}

// Fetch device status from API
async function fetchDeviceStatus() {
    try {
        const response = await fetch('/api/status');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Check if response has error
        if (data.status === 'error') {
            console.error('API returned error:', data.error);
            return;
        }
        
        // Verify data structure
        if (!data.devices || !Array.isArray(data.devices)) {
            console.error('Invalid data structure received:', data);
            return;
        }
        
        allDevices = data.devices;
        
        // Update global stats
        if (data.global) {
            statTotal.textContent = data.global.total || 0;
            statOnline.textContent = data.global.online || 0;
            statOffline.textContent = data.global.offline || 0;
        }
        
        // Update last update timestamp
        if (data.timestamp) {
            lastUpdateSpan.textContent = data.timestamp;
        }
        
        // Render devices on current floor
        renderDevices();
        
        console.log(`Status updated: ${data.global.online}/${data.global.total} online`);
        
    } catch (error) {
        console.error('Error fetching device status:', error);
        
        // Show error in UI
        lastUpdateSpan.textContent = 'Error - Retrying...';
        lastUpdateSpan.style.color = '#e74c3c';
        
        // Reset color after 2 seconds
        setTimeout(() => {
            lastUpdateSpan.style.color = '';
        }, 2000);
    }
}

// Render device dots on the map
function renderDevices() {
    // Clear existing dots
    deviceDotsContainer.innerHTML = '';
    
    // Verify allDevices is valid
    if (!allDevices || !Array.isArray(allDevices)) {
        console.error('allDevices is not valid:', allDevices);
        return;
    }
    
    // Filter devices by current floor and active filters
    const filteredDevices = allDevices.filter(device => {
        return device.floor_id === currentFloor && activeFilters.has(device.type);
    });
    
    console.log(`Rendering ${filteredDevices.length} devices on floor ${currentFloor}`);
    
    // Create dots for filtered devices
    filteredDevices.forEach(device => {
        try {
            const dot = document.createElement('div');
            dot.className = 'device-dot';
            dot.classList.add(device.online ? 'online' : 'offline');
            dot.dataset.type = device.type;
            dot.dataset.deviceId = device.id;
            
            // Position the dot
            dot.style.top = device.position.top;
            dot.style.left = device.position.left;
            dot.style.transform = 'translate(-50%, -50%)';
            
            // Click event - open device IP in new tab
            dot.addEventListener('click', () => {
                window.open(`http://${device.ip}`, '_blank');
            });
            
            // Hover event - show tooltip
            dot.addEventListener('mouseenter', (e) => showTooltip(e, device));
            dot.addEventListener('mouseleave', hideTooltip);
            
            deviceDotsContainer.appendChild(dot);
        } catch (error) {
            console.error('Error rendering device:', device, error);
        }
    });
}

// Show tooltip on hover
function showTooltip(event, device) {
    const statusText = device.online ? 
        '<span style="color: #2ecc71;">● Online</span>' : 
        '<span style="color: #e74c3c;">● Offline</span>';
    
    tooltip.innerHTML = `
        <strong>${device.name}</strong><br>
        IP: ${device.ip}<br>
        Type: ${config.device_types[device.type].label}<br>
        Status: ${statusText}
    `;
    
    tooltip.style.left = event.pageX + 15 + 'px';
    tooltip.style.top = event.pageY + 15 + 'px';
    tooltip.classList.add('show');
}

// Hide tooltip
function hideTooltip() {
    tooltip.classList.remove('show');
}

// Fetch event logs from API
async function fetchEventLogs() {
    try {
        const response = await fetch('/api/logs');
        const data = await response.json();
        
        renderEventLogs(data.logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
    }
}

// Render event logs
function renderEventLogs(logs) {
    if (logs.length === 0) {
        logContainer.innerHTML = '<p class="log-empty">No events yet...</p>';
        return;
    }
    
    logContainer.innerHTML = '';
    
    logs.forEach(log => {
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        logItem.classList.add(`status-${log.status.toLowerCase()}`);
        
        logItem.innerHTML = `
            <div class="log-timestamp">${log.timestamp}</div>
            <div class="log-message">${log.message}</div>
        `;
        
        logContainer.appendChild(logItem);
    });
}

// Start the dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Setup zoom and pan controls
function setupZoomControls() {
    // Mouse wheel zoom
    mapContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        mapZoom = Math.min(Math.max(0.5, mapZoom * delta), 3);
        updateMapTransform();
    });
    
    // Double click to reset zoom
    mapContainer.addEventListener('dblclick', (e) => {
        if (e.target === mapContainer || e.target === floorMap) {
            mapZoom = 1;
            translateX = 0;
            translateY = 0;
            updateMapTransform();
        }
    });
}

function updateMapTransform() {
    floorMap.style.transform = `scale(${mapZoom}) translate(${translateX}px, ${translateY}px)`;
    deviceDotsContainer.style.transform = `scale(${mapZoom})`;
}
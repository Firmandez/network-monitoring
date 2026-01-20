document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('add-device-form');
    const formTitle = document.getElementById('form-title');
    const floorSelect = document.getElementById('floor_id');
    const mapPicker = document.getElementById('map-picker');
    const mapImage = document.getElementById('map-picker-img');
    const clickMarker = document.getElementById('click-marker');
    const posTopInput = document.getElementById('pos_top');
    const posLeftInput = document.getElementById('pos_left');
    const isActiveCheckbox = document.getElementById('is_active');
    const editDeviceIdInput = document.getElementById('edit-device-id');
    const submitButton = form.querySelector('button[type="submit"]');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    const devicesTableBody = document.querySelector('#devices-table tbody');
    const searchInput = document.getElementById('search-input');
    const filterFloorSelect = document.getElementById('filter-floor');
    const filterTypeSelect = document.getElementById('filter-type');

    let allDevices = []; // Cache all devices locally
    const urlTemplate = mapPicker.dataset.urlTemplate;

    // --- CRITICAL ELEMENT CHECK ---
    if (!devicesTableBody) {
        console.error("Fatal Error: The element '#devices-table tbody' was not found. Please ensure your HTML has a table with id='devices-table' and a <tbody> element inside.");
        alert("Error: The device list table could not be found on the page. The page may not display correctly.");
        return; // Stop script execution if the main table is missing
    }

    // 1. Load initial devices
    loadAndRenderDevices();

    // 2. Handle map picker
    floorSelect.addEventListener('change', () => {
        const selectedFloor = floorSelect.value;
        if (FLOOR_MAPS[selectedFloor]) {
            mapImage.src = urlTemplate.replace('__FILENAME__', FLOOR_MAPS[selectedFloor]);
            clickMarker.style.display = 'none';
            posTopInput.value = '';
            posLeftInput.value = '';
        }
    });

    mapPicker.addEventListener('click', (e) => {
        if (e.target.id !== 'map-picker-img') return;
        const rect = mapPicker.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const topPercent = ((y / rect.height) * 100).toFixed(2);
        const leftPercent = ((x / rect.width) * 100).toFixed(2);
        posTopInput.value = topPercent;
        posLeftInput.value = leftPercent;
        clickMarker.style.top = `${topPercent}%`;
        clickMarker.style.left = `${leftPercent}%`;
        clickMarker.style.display = 'block';
    });

    // 3. Handle form submission (Add vs. Update)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const deviceId = editDeviceIdInput.value;
        const data = {
            name: formData.get('name'),
            ip: formData.get('ip'),
            type: formData.get('type'),
            floor_id: formData.get('floor_id'),
            pos_top: parseFloat(formData.get('pos_top')),
            pos_left: parseFloat(formData.get('pos_left')),
            is_active: isActiveCheckbox.checked,
        };

        const method = deviceId ? 'PUT' : 'POST';
        const url = deviceId ? `/admin/api/devices/${deviceId}` : '/admin/api/devices';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to ${deviceId ? 'update' : 'add'} device`);
            }

            alert(`Device ${deviceId ? 'updated' : 'added'} successfully!`);
            resetForm();
            loadAndRenderDevices();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    });

    // 4. Handle search and filter inputs
    [searchInput, filterFloorSelect, filterTypeSelect].forEach(el => {
        if (el) {
            el.addEventListener('input', renderDevicesTable);
        } else {
            // Peringatan ini membantu diagnosis jika ada elemen HTML yang hilang.
            console.warn("Peringatan: Elemen input untuk filter/pencarian tidak ditemukan di HTML. Salah satu fitur filter tidak akan berfungsi.");
        }
    });

    // 5. Handle table clicks for Edit/Delete (Event Delegation)
    devicesTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const deviceId = target.dataset.id;
        if (target.classList.contains('btn-edit')) {
            await startEdit(deviceId);
        } else if (target.classList.contains('btn-delete')) {
            if (confirm(`Are you sure you want to delete device ID ${deviceId}?`)) {
                deleteDevice(deviceId);
            }
        }
    });

    // 6. Handle Cancel Edit button
    cancelEditBtn.addEventListener('click', resetForm);

    // --- FUNCTIONS ---

    async function loadAndRenderDevices() {
        try {
            const response = await fetch('/admin/api/devices');
            if (!response.ok) throw new Error('Failed to fetch devices');
            allDevices = await response.json();
            populateFilterDropdowns();
            renderDevicesTable();
        } catch (error) {
            devicesTableBody.innerHTML = `<tr><td colspan="7">Error loading devices: ${error.message}</td></tr>`;
        }
    }

    function populateFilterDropdowns() {
        const floors = [...new Set(allDevices.map(d => d.floor_id))];
        const types = [...new Set(allDevices.map(d => d.type))];

        filterFloorSelect.innerHTML = '<option value="">All Floors</option>';
        floors.sort().forEach(floor => {
            filterFloorSelect.innerHTML += `<option value="${floor}">${FLOOR_LABELS[floor] || floor}</option>`;
        });

        filterTypeSelect.innerHTML = '<option value="">All Types</option>';
        types.sort().forEach(type => {
            filterTypeSelect.innerHTML += `<option value="${type}">${DEVICE_TYPES[type]?.label || type}</option>`;
        });
    }

    function renderDevicesTable() {
        const searchTerm = searchInput.value.toLowerCase();
        const floorFilter = filterFloorSelect.value;
        const typeFilter = filterTypeSelect.value;

        const filteredDevices = allDevices.filter(device => {
            const matchesSearch = device.name.toLowerCase().includes(searchTerm) || device.ip.includes(searchTerm);
            const matchesFloor = !floorFilter || device.floor_id === floorFilter;
            const matchesType = !typeFilter || device.type === typeFilter;
            return matchesSearch && matchesFloor && matchesType;
        });

        devicesTableBody.innerHTML = '';
        if (filteredDevices.length === 0) {
            devicesTableBody.innerHTML = '<tr><td colspan="7">No devices match filters.</td></tr>';
            return;
        }

        filteredDevices.forEach(device => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${device.name}</td>
                <td>${device.ip}</td>
                <td>${DEVICE_TYPES[device.type]?.label || device.type}</td>
                <td>${FLOOR_LABELS[device.floor_id] || device.floor_id}</td>
                <td><span class="status-badge ${device.is_active ? 'active' : 'inactive'}">${device.is_active ? 'Yes' : 'No'}</span></td>
                <td>
                    <button class="btn btn-edit" data-id="${device.id}">Edit</button>
                    <button class="btn btn-delete" data-id="${device.id}">Delete</button>
                </td>
            `;
            devicesTableBody.appendChild(row);
        });
    }

    async function startEdit(deviceId) {
        try {
            const response = await fetch(`/admin/api/devices/${deviceId}`);
            if (!response.ok) throw new Error('Could not fetch device details.');
            const device = await response.json();

            form.elements['name'].value = device.name;
            form.elements['ip'].value = device.ip;
            form.elements['type'].value = device.type;
            form.elements['floor_id'].value = device.floor_id;
            posTopInput.value = device.pos_top;
            posLeftInput.value = device.pos_left;
            isActiveCheckbox.checked = device.is_active;
            editDeviceIdInput.value = device.id;

            mapImage.src = urlTemplate.replace('__FILENAME__', FLOOR_MAPS[device.floor_id]);
            clickMarker.style.top = `${device.pos_top}%`;
            clickMarker.style.left = `${device.pos_left}%`;
            clickMarker.style.display = 'block';

            formTitle.textContent = 'Edit Device';
            submitButton.textContent = 'Save Changes';
            cancelEditBtn.style.display = 'inline-block';
            form.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            alert(`Error starting edit: ${error.message}`);
        }
    }

    async function deleteDevice(deviceId) {
        try {
            const response = await fetch(`/admin/api/devices/${deviceId}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete device');
            }
            alert('Device deleted successfully!');
            loadAndRenderDevices();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }

    function resetForm() {
        form.reset();
        editDeviceIdInput.value = '';
        clickMarker.style.display = 'none';
        formTitle.textContent = 'Add New Device';
        submitButton.textContent = 'Add Device';
        cancelEditBtn.style.display = 'none';
        const firstFloor = floorSelect.options[0].value;
        floorSelect.value = firstFloor;
        floorSelect.dispatchEvent(new Event('change'));
    }
});
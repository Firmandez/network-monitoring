document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('add-device-form');
    const floorSelect = document.getElementById('floor_id');
    const mapPicker = document.getElementById('map-picker');
    const mapImage = document.getElementById('map-picker-img');
    const clickMarker = document.getElementById('click-marker');
    const posTopInput = document.getElementById('pos_top');
    const posLeftInput = document.getElementById('pos_left');
    const devicesTableBody = document.querySelector('#devices-table tbody');

    // 1. Load initial devices
    loadDevices();

    const urlTemplate = mapPicker.dataset.urlTemplate;

    // 2. Handle map picker
    floorSelect.addEventListener('change', () => {
        const selectedFloor = floorSelect.value;
        if (FLOOR_MAPS[selectedFloor]) {
            mapImage.src = urlTemplate.replace('__FILENAME__', FLOOR_MAPS[selectedFloor]);
            clickMarker.style.display = 'none'; // Hide marker when map changes
        }
    });

    mapPicker.addEventListener('click', (e) => {
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

    // 3. Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = {
            name: formData.get('name'),
            ip: formData.get('ip'),
            type: formData.get('type'),
            floor_id: formData.get('floor_id'),
            pos_top: parseFloat(formData.get('pos_top')),
            pos_left: parseFloat(formData.get('pos_left')),
        };

        try {
            const response = await fetch('/admin/api/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to add device');
            }

            alert('Device added successfully!');
            form.reset();
            clickMarker.style.display = 'none';
            loadDevices(); // Refresh the list
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    });

    // Function to load and render devices
    async function loadDevices() {
        try {
            const response = await fetch('/admin/api/devices');
            const devices = await response.json();
            renderDevicesTable(devices);
        } catch (error) {
            devicesTableBody.innerHTML = `<tr><td colspan="6">Error loading devices: ${error.message}</td></tr>`;
        }
    }

    // Function to render the table
    function renderDevicesTable(devices) {
        devicesTableBody.innerHTML = '';
        if (devices.length === 0) {
            devicesTableBody.innerHTML = '<tr><td colspan="6">No devices found.</td></tr>';
            return;
        }

        devices.forEach(device => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${device.name}</td>
                <td>${device.ip}</td>
                <td>${device.type}</td>
                <td>${device.floor_id}</td>
                <td>${device.is_active ? 'Yes' : 'No'}</td>
                <td>
                    <button class="btn btn-delete" data-id="${device.id}">Delete</button>
                </td>
            `;
            devicesTableBody.appendChild(row);
        });
    }
    
    // 4. Handle delete button clicks (event delegation)
    devicesTableBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-delete')) {
            const deviceId = e.target.dataset.id;
            if (confirm(`Are you sure you want to delete device ID ${deviceId}?`)) {
                try {
                    const response = await fetch(`/admin/api/devices/${deviceId}`, { method: 'DELETE' });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to delete device');
                    }
                    alert('Device deleted successfully!');
                    loadDevices(); // Refresh list
                } catch (error) {
                    alert(`Error: ${error.message}`);
                }
            }
        }
    });
});
window.addEventListener('pageshow', (event) => {
    if (event.persisted || !localStorage.getItem('access_token')) {
        window.location.replace('../auth/login.html');
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = '../auth/login.html';
        return;
    }

    const inventoryTableBody = document.getElementById('inventoryTableBody');
    const emptyState = document.getElementById('emptyState');
    const productCountHeader = document.getElementById('productCountHeader');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const resetFilters = document.getElementById('resetFilters');

    // Drawer elements
    const productDrawer = document.getElementById('productDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const closeDrawer = document.getElementById('closeDrawer');
    const closeDrawerBtn = document.getElementById('closeDrawerBtn');

    // Add Product elements
    const addProductBtn = document.getElementById('addProductBtn');
    const addProductDrawer = document.getElementById('addProductDrawer');
    const closeAddDrawer = document.getElementById('closeAddDrawer');
    const addProductForm = document.getElementById('addProductForm');

    let allInventory = [];
    let filteredInventory = [];
    let currentPage = 1;
    const rowsPerPage = 8;

    // --- Initialize Stock Distribution Doughnut Chart ---
    let stockChart = null;
    function initStockChart(inStock = 0, lowStock = 0, outStock = 0) {
        const ctx = document.getElementById('stockDistributionChart');
        if (!ctx) return;

        if (stockChart) stockChart.destroy();

        stockChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['In Stock', 'Low Stock', 'Out of Stock'],
                datasets: [{
                    data: [inStock, lowStock, outStock],
                    backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
                    borderWidth: 0,
                    cutout: '75%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } }
            }
        });
    }
    initStockChart();

    // Back to Dashboard Routing
    const backDashboardBtn = document.getElementById('backDashboardBtn');
    if (backDashboardBtn) {
        backDashboardBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const response = await fetch('http://127.0.0.1:5000/api/auth/me', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const result = await response.json();
                    const role = (result.data?.role || 'staff').toLowerCase();
                    if (role === 'admin') window.location.href = '../dashboard/dashboard.html';
                    else if (role === 'manager') window.location.href = '../manager/dashboard.html';
                    else if (role === 'cashier') window.location.href = '../cashier/dashboard.html';
                    else window.location.href = '../staff/dashboard.html';
                } else {
                    window.location.href = '../auth/login.html';
                }
            } catch (err) {
                window.location.href = '../dashboard/dashboard.html';
            }
        });
    }

    function formatINR(amount) {
        const num = parseFloat(amount) || 0;
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Load Inventory Ledger from Products/Inventory APIs
    async function loadInventory() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/products', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error('Failed to fetch inventory records.');

            const result = await response.json();
            allInventory = result.data || [];
            filteredInventory = [...allInventory];
            
            updateMetricsAndWidgets(allInventory);
            renderTable();
        } catch (err) {
            console.error("Inventory ledger sync error:", err);
            inventoryTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--danger); padding: 30px;">Failed to connect to telemetry server.</td></tr>`;
        }
    }

    function updateMetricsAndWidgets(data) {
        let totalProducts = data.length;
        let totalUnits = 0;
        let healthy = 0;
        let low = 0;
        let out = 0;
        let totalInventoryValue = 0;

        const categoryCounts = {};
        const lowStockItems = [];

        data.forEach(item => {
            const qty = parseInt(item.stock_quantity ?? item.stock ?? 0);
            const costPrice = parseFloat(item.cost_price || item.unit_price || 0);
            
            totalUnits += qty;
            totalInventoryValue += (qty * costPrice);

            if (qty === 0) {
                out++;
                lowStockItems.push(item);
            } else if (qty <= 10) {
                low++;
                lowStockItems.push(item);
            } else {
                healthy++;
            }

            const cat = item.category || 'General';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        // Update KPIs
        document.getElementById('kpiTotalProducts').textContent = totalProducts;
        document.getElementById('kpiTotalUnits').textContent = totalUnits;
        document.getElementById('kpiLowStock').textContent = low + out;
        document.getElementById('kpiInventoryValue').textContent = formatINR(totalInventoryValue);

        // Update Doughnut Chart & Legend
        document.getElementById('doughnutTotalProducts').textContent = totalProducts;
        initStockChart(healthy, low, out);

        const totalForPct = totalProducts > 0 ? totalProducts : 1;
        document.getElementById('legendInStock').textContent = `${Math.round((healthy / totalForPct) * 100)}% (${healthy})`;
        document.getElementById('legendLowStock').textContent = `${Math.round((low / totalForPct) * 100)}% (${low})`;
        document.getElementById('legendOutStock').textContent = `${Math.round((out / totalForPct) * 100)}% (${out})`;

        // Update Category Breakdown List
        const catListEl = document.getElementById('categoryBreakdownList');
        if (catListEl) {
            catListEl.innerHTML = '';
            const sortedCats = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
            if (sortedCats.length === 0) {
                catListEl.innerHTML = `<p style="color: var(--text-muted); font-size: 11px;">No categories available.</p>`;
            } else {
                sortedCats.forEach(([catName, count]) => {
                    catListEl.innerHTML += `<div style="display: flex; justify-content: space-between; align-items: center;"><span>${catName}</span><strong style="font-family: var(--font-mono);">${count}</strong></div>`;
                });
            }
        }

        // Update Low Stock Alerts Widget
        const alertsListEl = document.getElementById('lowStockAlertsList');
        const alertsTitleEl = document.getElementById('lowStockAlertsTitle');
        if (alertsTitleEl) alertsTitleEl.textContent = `Low Stock Alerts (${lowStockItems.length})`;

        if (alertsListEl) {
            alertsListEl.innerHTML = '';
            if (lowStockItems.length === 0) {
                alertsListEl.innerHTML = `<p style="color: var(--text-muted); font-size: 11px;">No low stock alerts detected.</p>`;
            } else {
                lowStockItems.slice(0, 3).forEach(alertItem => {
                    const alertQty = parseInt(alertItem.stock_quantity ?? 0);
                    alertsListEl.innerHTML += `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="font-size: 12px; display: block;">${alertItem.name}</strong>
                                <small style="color: var(--danger); font-size: 10px;">${alertQty} pcs left</small>
                            </div>
                            <button class="btn btn-primary" style="height: 26px; padding: 0 10px; font-size: 9px;" onclick="alert('Reordering ${alertItem.name}...')">Reorder</button>
                        </div>
                    `;
                });
            }
        }
    }

    function renderTable() {
        inventoryTableBody.innerHTML = '';

        if (!filteredInventory || filteredInventory.length === 0) {
            emptyState.style.display = 'block';
            productCountHeader.textContent = '0';
            document.getElementById('paginationInfo').textContent = 'Showing 0 of 0 products';
            return;
        }

        emptyState.style.display = 'none';
        productCountHeader.textContent = filteredInventory.length;

        const totalPages = Math.ceil(filteredInventory.length / rowsPerPage);
        if (currentPage > totalPages) currentPage = totalPages;
        const startIndex = (currentPage - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        const paginatedData = filteredInventory.slice(startIndex, endIndex);

        paginatedData.forEach((item, index) => {
            const absoluteIndex = startIndex + index + 1;
            const qty = parseInt(item.stock_quantity ?? item.stock ?? 0);
            let statusClass = 'healthy';
            let statusText = 'In Stock';

            if (qty === 0) {
                statusClass = 'out';
                statusText = 'Out of Stock';
            } else if (qty <= 10) {
                statusClass = 'low';
                statusText = 'Low Stock';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${absoluteIndex}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 32px; height: 32px; background: rgba(99,102,241,0.15); color: #818cf8; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px;"><i class="fa-solid fa-box"></i></div>
                        <strong style="color: #f3f4f6;">${item.name}</strong>
                    </div>
                </td>
                <td><span class="sku">${item.sku}</span></td>
                <td><span class="category">${item.category || 'General'}</span></td>
                <td><span class="stock">${qty}</span></td>
                <td>pcs</td>
                <td>${formatINR(item.cost_price || item.unit_price || 0)}</td>
                <td>${formatINR(item.selling_price || item.unit_price * 1.2 || 0)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td><button class="btn btn-secondary" style="height: 28px; padding: 0 10px; font-size: 10px;"><i class="fa-regular fa-eye"></i> View</button></td>
            `;

            tr.addEventListener('click', () => openProductDrawer(item, qty, statusClass, statusText));
            inventoryTableBody.appendChild(tr);
        });

        document.getElementById('paginationInfo').textContent = `Showing ${startIndex + 1} to ${Math.min(endIndex, filteredInventory.length)} of ${filteredInventory.length} products`;
        
        const controls = document.getElementById('paginationControls');
        controls.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.style.width = '28px';
            btn.style.height = '28px';
            btn.style.borderRadius = '6px';
            btn.style.fontWeight = '700';
            btn.style.cursor = 'pointer';
            if (i === currentPage) {
                btn.style.background = 'var(--accent-glow)';
                btn.style.color = 'white';
                btn.style.border = 'none';
            } else {
                btn.style.background = 'rgba(30, 41, 59, 0.6)';
                btn.style.color = 'var(--text-muted)';
                btn.style.border = '1px solid var(--border-cyber)';
            }
            btn.addEventListener('click', () => {
                currentPage = i;
                renderTable();
            });
            controls.appendChild(btn);
        }
    }

    async function openProductDrawer(item, qty, statusClass, statusText) {
        document.getElementById('drawerProductName').textContent = item.name;
        document.getElementById('drawerSkuText').textContent = `SKU: ${item.sku}`;
        document.getElementById('drawerStockQty').textContent = `${qty} Units`;
        
        const badge = document.getElementById('drawerStatusBadge');
        badge.className = `status-badge ${statusClass}`;
        badge.textContent = statusText;

        const purchaseList = document.getElementById('purchaseMovementsList');
        const saleList = document.getElementById('saleMovementsList');
        const adjList = document.getElementById('adjustmentsList');

        purchaseList.innerHTML = `<p class="empty-hint">Loading purchase movements...</p>`;
        saleList.innerHTML = `<p class="empty-hint">Loading sales dispatches...</p>`;
        adjList.innerHTML = `<p class="empty-hint">Loading adjustments...</p>`;

        productDrawer.classList.add('active');
        drawerOverlay.classList.add('active');

        try {
            const response = await fetch(`http://127.0.0.1:5000/api/inventory/movements?product_id=${item.id}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            if (response.ok && result.status === 'success') {
                const movements = result.data || [];
                
                const purchases = movements.filter(m => m.movement_type === 'PURCHASE');
                const sales = movements.filter(m => m.movement_type === 'SALE');
                const adjustments = movements.filter(m => m.movement_type === 'MANUAL_ADJUSTMENT');

                purchaseList.innerHTML = purchases.length > 0 ? purchases.map(m => `
                    <div class="movement-item">
                        <span>Change: +${m.change_quantity} Units</span>
                        <span class="sku">${new Date(m.created_at).toLocaleString()}</span>
                    </div>
                `).join('') : `<p class="empty-hint">No purchase movements logged yet.</p>`;

                saleList.innerHTML = sales.length > 0 ? sales.map(m => `
                    <div class="movement-item">
                        <span>Dispatch: ${m.change_quantity} Units</span>
                        <span class="sku">${new Date(m.created_at).toLocaleString()}</span>
                    </div>
                `).join('') : `<p class="empty-hint">No sales dispatches logged yet.</p>`;

                adjList.innerHTML = adjustments.length > 0 ? adjustments.map(m => `
                    <div class="movement-item">
                        <span>Adjustment: ${m.change_quantity > 0 ? '+' + m.change_quantity : m.change_quantity} Units</span>
                        <span class="sku">${new Date(m.created_at).toLocaleString()}</span>
                    </div>
                `).join('') : `<p class="empty-hint">No manual adjustments logged yet.</p>`;

            } else {
                purchaseList.innerHTML = `<p class="empty-hint">No movements logged.</p>`;
                saleList.innerHTML = `<p class="empty-hint">No dispatches logged.</p>`;
                adjList.innerHTML = `<p class="empty-hint">No adjustments logged.</p>`;
            }
        } catch (err) {
            purchaseList.innerHTML = `<p class="empty-hint">No movements logged.</p>`;
            saleList.innerHTML = `<p class="empty-hint">No dispatches logged.</p>`;
            adjList.innerHTML = `<p class="empty-hint">No adjustments logged.</p>`;
        }
    }

    function closeDrawerHandler() {
        productDrawer.classList.remove('active');
        drawerOverlay.classList.remove('active');
    }

    closeDrawer.addEventListener('click', closeDrawerHandler);
    closeDrawerBtn.addEventListener('click', closeDrawerHandler);
    drawerOverlay.addEventListener('click', closeDrawerHandler);

    // --- Add Product Drawer Handlers ---
    if (addProductBtn) {
        addProductBtn.addEventListener('click', () => {
            addProductDrawer.classList.add('active');
            drawerOverlay.classList.add('active');
        });
    }

    function closeAddDrawerHandler() {
        addProductDrawer.classList.remove('active');
        drawerOverlay.classList.remove('active');
        addProductForm.reset();
    }

    if (closeAddDrawer) closeAddDrawer.addEventListener('click', closeAddDrawerHandler);

    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('newProdName').value;
            const sku = document.getElementById('newProdSku').value;
            const category = document.getElementById('newProdCategory').value;
            const cost_price = parseFloat(document.getElementById('newProdCost').value) || 0;
            const unit_price = parseFloat(document.getElementById('newProdPrice').value) || 0;
            const initial_stock = parseInt(document.getElementById('newProdStock').value) || 0;

            const payload = {
                name,
                sku,
                category,
                cost_price,
                unit_price,
                is_active: true
            };

            try {
                const prodResponse = await fetch('http://127.0.0.1:5000/api/products', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const prodResult = await prodResponse.json();
                if (prodResponse.ok && prodResult.status === 'success') {
                    const newProductId = prodResult.data.id;

                    await fetch(`http://127.0.0.1:5000/api/inventory/${newProductId}/initialize`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ initial_stock: initial_stock, reorder_level: 5 })
                    });

                    alert('Product and inventory added successfully!');
                    closeAddDrawerHandler();
                    await loadInventory();
                } else {
                    alert(`Failed to create product: ${prodResult.message || 'Unknown error'}`);
                }
            } catch (err) {
                console.error("Add product network error:", err);
                alert("Failed to connect to backend server.");
            }
        });
    }

    document.querySelectorAll('.audit-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.audit-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.movement-box').forEach(b => b.classList.remove('active-movement'));

            e.target.classList.add('active');
            const targetId = e.target.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active-movement');
        });
    });

    function filterInventory() {
        const query = searchInput.value.toLowerCase();
        const stat = statusFilter.value;
        const cat = categoryFilter.value.toLowerCase();

        filteredInventory = allInventory.filter(item => {
            const qty = parseInt(item.stock_quantity ?? item.stock ?? 0);
            const matchesQuery = item.name.toLowerCase().includes(query) || item.sku.toLowerCase().includes(query);
            const matchesCat = cat === 'all' || (item.category || '').toLowerCase() === cat;
            
            let matchesStatus = true;
            if (stat === 'healthy') matchesStatus = qty > 10;
            else if (stat === 'low') matchesStatus = qty > 0 && qty <= 10;
            else if (stat === 'out') matchesStatus = qty === 0;

            return matchesQuery && matchesCat && matchesStatus;
        });

        currentPage = 1;
        renderTable();
    }

    searchInput.addEventListener('input', filterInventory);
    statusFilter.addEventListener('change', filterInventory);
    categoryFilter.addEventListener('change', filterInventory);

    resetFilters.addEventListener('click', () => {
        searchInput.value = '';
        statusFilter.value = 'all';
        categoryFilter.value = 'all';
        filteredInventory = [...allInventory];
        currentPage = 1;
        renderTable();
    });

    await loadInventory();
});
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

    // --- Dynamic Back to Dashboard Routing ---
    const backDashboardBtn = document.getElementById('backDashboardBtn');
    if (backDashboardBtn) {
        backDashboardBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const token = localStorage.getItem('access_token');
            if (!token) {
                window.location.href = '../auth/login.html';
                return;
            }

            try {
                const response = await fetch('http://127.0.0.1:5000/api/auth/me', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const result = await response.json();
                    const role = (result.data?.role || 'staff').toLowerCase();
                    
                    if (role === 'admin') {
                        window.location.href = '../dashboard/dashboard.html';
                    } else if (role === 'manager') {
                        window.location.href = '../manager/dashboard.html';
                    } else if (role === 'cashier') {
                        window.location.href = '../cashier/dashboard.html';
                    } else {
                        window.location.href = '../staff/dashboard.html';
                    }
                } else {
                    window.location.href = '../auth/login.html';
                }
            } catch (err) {
                console.error("Navigation error:", err);
                window.location.href = '../dashboard/dashboard.html';
            }
        });
    }

    // --- DOM Elements ---
    const purchaseTableBody = document.getElementById('purchaseTableBody');
    const purchaseSearch = document.getElementById('purchaseSearch');
    const supplierFilter = document.getElementById('supplierFilter');
    const statusFilter = document.getElementById('statusFilter');
    
    const statTotalPurchases = document.getElementById('statTotalPurchases');
    const statTotalOrders = document.getElementById('statTotalOrders');
    const statActiveSuppliers = document.getElementById('statActiveSuppliers');
    const statItemsPurchased = document.getElementById('statItemsPurchased');
    const totalPoCountEl = document.getElementById('totalPoCount');
    
    // Preview Elements
    const previewPoTitle = document.getElementById('previewPoTitle');
    const previewPoNo = document.getElementById('previewPoNo');
    const previewDate = document.getElementById('previewDate');
    const previewSupplier = document.getElementById('previewSupplier');
    const previewItemsBody = document.getElementById('previewItemsBody');
    const previewTotalCost = document.getElementById('previewTotalCost');
    const previewStatusBadge = document.getElementById('previewStatusBadge');
    
    // Drawer elements
    const drawerOverlay = document.getElementById('drawerOverlay');
    const purchaseDrawer = document.getElementById('purchaseDrawer');
    const openPurchaseBtn = document.getElementById('openPurchaseBtn');
    const closePurchaseBtn = document.getElementById('closePurchaseBtn');
    const cancelPurchaseBtn = document.getElementById('cancelPurchaseBtn');
    const purchaseForm = document.getElementById('purchaseForm');
    
    const supplierInput = document.getElementById('supplierInput');
    const productInput = document.getElementById('productInput');
    const quantityInput = document.getElementById('quantityInput');
    const costInput = document.getElementById('costInput');
    const totalAmountEl = document.getElementById('totalAmount');

    let allPurchases = [];
    let filteredPurchases = [];
    let suppliersList = [];
    let productsList = [];

    let currentPage = 1;
    const rowsPerPage = 5;

    // --- Helper: Format Currency in INR ---
    function formatINR(amount) {
        const num = parseFloat(amount) || 0;
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // --- 1. Load Dropdowns ---
    async function loadDropdownOptions() {
        try {
            const [supRes, prodRes] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/suppliers', { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null),
                fetch('http://127.0.0.1:5000/api/products', { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null)
            ]);

            if (supRes && supRes.ok) {
                const supData = await supRes.json();
                suppliersList = supData.data || [];
            }

            if (prodRes && prodRes.ok) {
                const prodData = await prodRes.json();
                productsList = prodData.data || [];
            }

            supplierInput.innerHTML = '<option value="">Select Supplier</option>';
            supplierFilter.innerHTML = '<option value="">All Suppliers</option>';
            suppliersList.forEach(sup => {
                supplierInput.innerHTML += `<option value="${sup.id}">${sup.name}</option>`;
                supplierFilter.innerHTML += `<option value="${sup.name}">${sup.name}</option>`;
            });

            productInput.innerHTML = '<option value="">Select Product</option>';
            productsList.forEach(prod => {
                const price = prod.cost_price || prod.unit_price || 0;
                productInput.innerHTML += `<option value="${prod.id}" data-cost="${price}">${prod.name || prod.product_name}</option>`;
            });

            if (statActiveSuppliers) {
                statActiveSuppliers.textContent = suppliersList.length;
            }

        } catch (err) {
            console.error("Failed to load dropdown options:", err);
        }
    }

    productInput.addEventListener('change', (e) => {
        const selectedOption = e.target.selectedOptions[0];
        const cost = selectedOption ? selectedOption.getAttribute('data-cost') : '';
        if (cost) {
            costInput.value = cost;
            calculateTotal();
        }
    });

    // --- 2. Load Purchases from Backend API ---
    async function loadPurchases() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/purchases', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const result = await response.json();
                allPurchases = result.data || [];
            } else {
                allPurchases = [];
            }

            filteredPurchases = [...allPurchases];
            currentPage = 1;
            renderPurchasesTable();
            updateStats(allPurchases);

            if (filteredPurchases.length > 0) {
                populatePurchasePreview(filteredPurchases[0]);
            }

        } catch (err) {
            console.error("Failed to load purchases:", err);
            allPurchases = [];
            filteredPurchases = [];
            renderPurchasesTable();
            updateStats([]);
        }
    }

    function renderPurchasesTable() {
        if (!purchaseTableBody) return;
        purchaseTableBody.innerHTML = '';

        if (!filteredPurchases || filteredPurchases.length === 0) {
            purchaseTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 25px;">No procurement records found.</td></tr>`;
            document.getElementById('paginationInfo').textContent = 'Showing 0 of 0 purchase orders';
            document.getElementById('paginationControls').innerHTML = '<button class="active">1</button>';
            if (totalPoCountEl) totalPoCountEl.textContent = '0';
            return;
        }

        if (totalPoCountEl) totalPoCountEl.textContent = filteredPurchases.length;

        const totalPages = Math.ceil(filteredPurchases.length / rowsPerPage);
        if (currentPage > totalPages) currentPage = totalPages;
        const startIndex = (currentPage - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        const paginatedPurchases = filteredPurchases.slice(startIndex, endIndex);

        paginatedPurchases.forEach((pur, index) => {
            const absoluteIndex = startIndex + index + 1;
            const poNo = pur.po_no || `PO-${String(pur.id || absoluteIndex).padStart(4, '0')}`;
            const supplierName = pur.supplier_name || pur.supplier || 'General Supplier';
            const initials = supplierName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            
            const dateObj = new Date(pur.purchase_date || pur.created_at || Date.now());
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const itemsCount = pur.items_count || (pur.items ? pur.items.length : 1);
            const totalCost = pur.total_cost || pur.total_amount || 0;
            const status = pur.status || 'Received';
            
            let statusClass = 'success';
            const stLower = status.toLowerCase();
            if (stLower === 'pending') statusClass = 'warning';
            else if (stLower === 'in transit') statusClass = 'info';
            else if (stLower === 'cancelled') statusClass = 'danger';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${absoluteIndex}</td>
                <td>${dateStr}<br><small style="color: var(--text-muted);">${timeStr}</small></td>
                <td><strong class="purchase-id">${poNo}</strong></td>
                <td>
                    <div class="supplier-name">
                        <div class="supplier-avatar">${initials}</div>
                        ${supplierName}
                    </div>
                </td>
                <td><span class="product-count">${itemsCount}</span></td>
                <td><span class="badge-inr">${formatINR(totalCost)}</span></td>
                <td><span class="badge-pill ${statusClass}">${status}</span></td>
                <td>
                    <button class="view-btn" data-purchase-id="${pur.id}">
                        <i class="fa-regular fa-eye"></i> View
                    </button>
                </td>
            `;

            tr.querySelector('.view-btn').addEventListener('click', () => {
                populatePurchasePreview(pur);
            });

            purchaseTableBody.appendChild(tr);
        });

        document.getElementById('paginationInfo').textContent = `Showing ${startIndex + 1} to ${Math.min(endIndex, filteredPurchases.length)} of ${filteredPurchases.length} purchase orders`;
        
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
                btn.classList.add('active');
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
                renderPurchasesTable();
            });
            controls.appendChild(btn);
        }
    }

    // --- Populate Purchase Preview Card with Exact Item Details ---
    // --- Populate Purchase Preview Card with Exact Item Details ---
    function populatePurchasePreview(pur) {
        const poNo = pur.po_no || `PO-${String(pur.id).padStart(4, '0')}`;
        if (previewPoTitle) previewPoTitle.textContent = `Purchase Order Details (${poNo})`;
        if (previewPoNo) previewPoNo.textContent = `#${poNo}`;
        
        const dateObj = new Date(pur.purchase_date || pur.created_at || Date.now());
        if (previewDate) previewDate.textContent = dateObj.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        if (previewSupplier) previewSupplier.textContent = pur.supplier_name || pur.supplier || 'General Supplier';
        
        const totalCost = parseFloat(pur.total_cost || pur.total_amount || 0);
        if (previewTotalCost) previewTotalCost.textContent = formatINR(totalCost);

        const status = pur.status || 'Received';
        if (previewStatusBadge) {
            previewStatusBadge.textContent = status;
            previewStatusBadge.className = 'badge-pill ' + (status.toLowerCase() === 'pending' ? 'warning' : 'success');
        }

        if (previewItemsBody) {
            previewItemsBody.innerHTML = '';
            
            // Check for items in standard properties or fallback to synthesized line item
            const items = pur.items || pur.purchase_items || [];

            if (items.length === 0) {
                // Fallback graceful line item using total cost if backend item array is empty
                previewItemsBody.innerHTML = `
                    <tr>
                        <td style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">Procured Stock Item</td>
                        <td style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">1</td>
                        <td style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${formatINR(totalCost)}</td>
                        <td style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${formatINR(totalCost)}</td>
                    </tr>
                `;
                return;
            }

            items.forEach(it => {
                let pName = it.product_name || it.name;
                if (!pName && it.product_id && productsList.length > 0) {
                    const matchedProd = productsList.find(p => (p.id || p.product_id) === parseInt(it.product_id));
                    if (matchedProd) {
                        pName = matchedProd.name || matchedProd.product_name;
                    }
                }
                if (!pName) pName = 'Inventory Item';

                const qty = parseInt(it.quantity || 1);
                const cost = parseFloat(it.unit_cost || it.unit_price || (totalCost / qty));
                const subtotal = parseFloat(it.subtotal || (qty * cost) || totalCost);

                previewItemsBody.innerHTML += `
                    <tr>
                        <td style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${pName}</td>
                        <td style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${qty}</td>
                        <td style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${formatINR(cost)}</td>
                        <td style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${formatINR(subtotal)}</td>
                    </tr>
                `;
            });
        }
    }

    function updateStats(purchases) {
        let totalCostSum = 0;
        let totalUnits = 0;

        purchases.forEach(p => {
            const cost = parseFloat(p.total_cost || p.total_amount || 0);
            totalCostSum += cost;
            const items = p.items || [];
            items.forEach(it => {
                totalUnits += parseInt(it.quantity || 1);
            });
            if (items.length === 0) totalUnits += 1;
        });

        if (statTotalPurchases) statTotalPurchases.textContent = formatINR(totalCostSum);
        if (statTotalOrders) statTotalOrders.textContent = purchases.length;
        if (statItemsPurchased) statItemsPurchased.textContent = totalUnits;
    }

    // --- 4. Live Calculation in Drawer ---
    function calculateTotal() {
        const qty = parseFloat(quantityInput.value) || 0;
        const cost = parseFloat(costInput.value) || 0;
        const total = qty * cost;
        totalAmountEl.textContent = formatINR(total);
    }

    quantityInput.addEventListener('input', calculateTotal);
    costInput.addEventListener('input', calculateTotal);

    // --- 5. Drawer Toggle Logic ---
    function toggleDrawer(open) {
        if (open) {
            purchaseDrawer.classList.add('active');
            drawerOverlay.classList.add('active');
        } else {
            purchaseDrawer.classList.remove('active');
            drawerOverlay.classList.remove('active');
            purchaseForm.reset();
            totalAmountEl.textContent = '₹0';
        }
    }

    openPurchaseBtn.addEventListener('click', () => toggleDrawer(true));
    closePurchaseBtn.addEventListener('click', () => toggleDrawer(false));
    cancelPurchaseBtn.addEventListener('click', () => toggleDrawer(false));
    drawerOverlay.addEventListener('click', () => toggleDrawer(false));

    // --- 6. Handle New Purchase Form Submission ---
    purchaseForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const supplierId = supplierInput.value;
        const productId = productInput.value;
        const quantity = parseInt(quantityInput.value) || 1;
        const unitCost = parseFloat(costInput.value) || 0;
        const totalCost = quantity * unitCost;

        const payload = {
            supplier_id: parseInt(supplierId),
            total_cost: totalCost,
            items: [
                {
                    product_id: parseInt(productId),
                    quantity: quantity,
                    unit_cost: unitCost,
                    subtotal: totalCost
                }
            ]
        };

        try {
            const response = await fetch('http://127.0.0.1:5000/api/purchases', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (response.ok && result.status === 'success') {
                alert('Purchase created successfully and inventory updated!');
                toggleDrawer(false);
                loadPurchases();
            } else {
                alert(`Failed to create purchase: ${result.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error("Purchase submission error:", err);
            alert("Failed to connect to backend server.");
        }
    });

    // --- 7. Search & Filter Functionality ---
    function filterPurchases() {
        const query = purchaseSearch.value.toLowerCase();
        const selectedSupplier = supplierFilter.value;
        const selectedStatus = statusFilter.value.toLowerCase();

        filteredPurchases = allPurchases.filter(pur => {
            const poNo = (pur.po_no || '').toLowerCase();
            const supName = (pur.supplier_name || pur.supplier || '').toLowerCase();
            const matchesQuery = poNo.includes(query) || supName.includes(query);
            
            const matchesSupplier = selectedSupplier === '' || (pur.supplier_name || pur.supplier) === selectedSupplier;
            const matchesStatus = selectedStatus === '' || (pur.status || '').toLowerCase() === selectedStatus;

            return matchesQuery && matchesSupplier && matchesStatus;
        });

        currentPage = 1;
        renderPurchasesTable();
    }

    purchaseSearch.addEventListener('input', filterPurchases);
    supplierFilter.addEventListener('change', filterPurchases);
    statusFilter.addEventListener('change', filterPurchases);

    // --- Initialize Operations ---
    await loadDropdownOptions();
    await loadPurchases();

    console.log("RetailAI Procurement Terminal synchronized successfully.");
});
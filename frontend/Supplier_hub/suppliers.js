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

    // --- Back to Dashboard Routing Logic ---
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

    // --- DOM Elements ---
    const supplierTableBody = document.getElementById('supplierTableBody');
    const emptyState = document.getElementById('emptyState');
    const recordCount = document.getElementById('recordCount');
    const supplierCountHeader = document.getElementById('supplierCountHeader');
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const statusFilter = document.getElementById('statusFilter');
    const resetSearchBtn = document.getElementById('resetSearch');

    // KPI Elements
    const kpiTotalSuppliers = document.getElementById('kpiTotalSuppliers');
    const kpiActiveSuppliers = document.getElementById('kpiActiveSuppliers');
    const kpiPendingPayments = document.getElementById('kpiPendingPayments');
    const kpiTotalPurchases = document.getElementById('kpiTotalPurchases');

    // Right-Pane Details Elements
    const paneAvatar = document.getElementById('paneAvatar');
    const paneName = document.getElementById('paneName');
    const paneCategory = document.getElementById('paneCategory');
    const paneStatusBadge = document.getElementById('paneStatusBadge');
    const paneContactPerson = document.getElementById('paneContactPerson');
    const panePhone = document.getElementById('panePhone');
    const paneEmail = document.getElementById('paneEmail');
    const paneAddress = document.getElementById('paneAddress');
    const paneTotalPurchase = document.getElementById('paneTotalPurchase');
    const paneOutstanding = document.getElementById('paneOutstanding');
    const paneSince = document.getElementById('paneSince');
    const paneEditBtn = document.getElementById('paneEditBtn');
    const paneRecentPurchasesBody = document.getElementById('paneRecentPurchasesBody');

    // Add Supplier Drawer Elements
    const addSupplierBtn = document.getElementById('addSupplierBtn');
    const addSupplierDrawer = document.getElementById('addSupplierDrawer');
    const closeAddDrawer = document.getElementById('closeAddDrawer');
    const addSupplierForm = document.getElementById('addSupplierForm');
    const drawerOverlay = document.getElementById('drawerOverlay');

    let allSuppliers = [];
    let filteredSuppliers = [];
    let allPurchases = [];
    let selectedSupplier = null;

    // --- Helper: Format INR ---
    function formatINR(amount) {
        const num = parseFloat(amount) || 0;
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // --- Add Supplier Drawer Management ---
    if (addSupplierBtn) {
        addSupplierBtn.addEventListener('click', () => {
            if (addSupplierDrawer) addSupplierDrawer.classList.add('active');
            if (drawerOverlay) drawerOverlay.classList.add('active');
        });
    }

    function closeAddDrawerHandler() {
        if (addSupplierDrawer) addSupplierDrawer.classList.remove('active');
        if (drawerOverlay) drawerOverlay.classList.remove('active');
        if (addSupplierForm) addSupplierForm.reset();
    }

    if (closeAddDrawer) closeAddDrawer.addEventListener('click', closeAddDrawerHandler);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeAddDrawerHandler);

    if (addSupplierForm) {
        addSupplierForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('suppName').value.trim();
            const contact_person = document.getElementById('suppContact').value.trim();
            const phone = document.getElementById('suppPhone').value.trim();
            const email = document.getElementById('suppEmail').value.trim();
            const address = document.getElementById('suppAddress').value.trim();

            const payload = { name, contact_person, phone, email, address };

            try {
                const response = await fetch('http://127.0.0.1:5000/api/suppliers', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                if (response.ok && result.status === 'success') {
                    alert('Supplier added successfully!');
                    closeAddDrawerHandler();
                    await loadData();
                } else {
                    alert(`Failed to add supplier: ${result.message || 'Unknown error'}`);
                }
            } catch (err) {
                console.error("Add supplier error:", err);
                alert("Failed to connect to backend server.");
            }
        });
    }

    // --- Fetch Suppliers & Purchases from Backend ---[cite: 11]
    async function loadData() {
        try {
            const [supRes, purRes] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/suppliers', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                }),
                fetch('http://127.0.0.1:5000/api/purchases', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                })
            ]);

            if (supRes.ok) {
                const supData = await supRes.json();
                allSuppliers = supData.data || [];
            }

            if (purRes.ok) {
                const purData = await purRes.json();
                allPurchases = purData.data || [];
            }

            filteredSuppliers = [...allSuppliers];

            updateKPIs(allSuppliers, allPurchases);
            renderTable(filteredSuppliers);

            if (filteredSuppliers.length > 0) {
                populateSupplierPane(filteredSuppliers[0]);
            }
        } catch (err) {
            console.error("Supplier hub sync error:", err);
            if (supplierTableBody) {
                supplierTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--danger); padding: 30px;">Failed to connect to backend server.</td></tr>`;
            }
        }
    }

    // --- Update KPI Bento Cards ---
    function updateKPIs(suppliers, purchases) {
        const total = suppliers.length;
        const active = suppliers.filter(s => s.is_active !== false).length;
        
        let totalPurchasesSum = 0;
        let totalPendingSum = 0;

        purchases.forEach(p => {
            const cost = parseFloat(p.total_cost || p.total_amount || 0);
            totalPurchasesSum += cost;
            totalPendingSum += parseFloat(p.amount_due || 0);
        });

        if (kpiTotalSuppliers) kpiTotalSuppliers.textContent = total;
        if (kpiActiveSuppliers) kpiActiveSuppliers.textContent = active;
        if (kpiTotalPurchases) kpiTotalPurchases.textContent = formatINR(totalPurchasesSum);
        if (kpiPendingPayments) kpiPendingPayments.textContent = formatINR(totalPendingSum);
    }

    // --- Render Table ---
    function renderTable(suppliers) {
        if (!supplierTableBody) return;
        supplierTableBody.innerHTML = '';

        if (!suppliers || suppliers.length === 0) {
            emptyState.style.display = 'block';
            if (recordCount) recordCount.textContent = '0 RECORDS';
            if (supplierCountHeader) supplierCountHeader.textContent = '0';
            return;
        }

        emptyState.style.display = 'none';
        if (recordCount) recordCount.textContent = `${suppliers.length} RECORD${suppliers.length > 1 ? 'S' : ''}`;
        if (supplierCountHeader) supplierCountHeader.textContent = suppliers.length;

        suppliers.forEach((supp, index) => {
            const initials = (supp.name || 'S').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const isActive = supp.is_active !== false;
            const statusClass = isActive ? 'active' : 'inactive';
            const statusText = isActive ? 'Active' : 'Inactive';
            
            const suppPurchases = allPurchases.filter(p => (p.supplier_id === supp.id) || (p.supplier_name === supp.name));
            const totalSuppPurchaseVal = suppPurchases.reduce((acc, curr) => acc + parseFloat(curr.total_cost || curr.total_amount || 0), 0);
            const outstandingVal = suppPurchases.reduce((acc, curr) => acc + parseFloat(curr.amount_due || 0), 0);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: var(--font-mono); color: var(--text-dim);">#${index + 1}</td>
                <td>
                    <div class="supplier-cell">
                        <div class="supplier-avatar">${initials}</div>
                        <div class="supplier-details">
                            <strong>${supp.name}</strong>
                            <span>SUP-${String(supp.id).padStart(3, '0')}</span>
                        </div>
                    </div>
                </td>
                <td><span class="contact">${supp.contact_person || 'General Contact'}</span></td>
                <td><span class="contact" style="font-family: var(--font-mono);">${supp.phone || 'N/A'}</span></td>
                <td><span class="email">${supp.email || 'N/A'}</span></td>
                <td><span class="category" style="color: var(--accent-cyan); font-size: 10px;">Electronics</span></td>
                <td><span class="purchase-value">${formatINR(totalSuppPurchaseVal)}</span></td>
                <td style="font-family: var(--font-mono); color: ${outstandingVal > 0 ? 'var(--warning)' : 'var(--text-dim)'};">${formatINR(outstandingVal)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td style="text-align: right;">
                    <button class="action-btn view-row" data-id="${supp.id}" title="View Details"><i class="fa-regular fa-eye"></i></button>
                </td>
            `;

            tr.addEventListener('click', () => {
                document.querySelectorAll('.supplier-table tbody tr').forEach(r => r.classList.remove('selected-row'));
                tr.classList.add('selected-row');
                populateSupplierPane(supp);
            });

            supplierTableBody.appendChild(tr);
        });

        const firstRow = supplierTableBody.querySelector('tr');
        if (firstRow) firstRow.classList.add('selected-row');
    }

    // --- Populate Right Pane Supplier Details & Recent Purchases ---
    function populateSupplierPane(supp) {
        selectedSupplier = supp;
        if (!supp) return;

        const initials = (supp.name || 'S').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        if (paneAvatar) paneAvatar.textContent = initials;
        if (paneName) paneName.textContent = supp.name;
        if (paneCategory) paneCategory.textContent = 'Electronics & IT Products';
        
        const isActive = supp.is_active !== false;
        if (paneStatusBadge) {
            paneStatusBadge.className = `status-badge ${isActive ? 'active' : 'inactive'}`;
            paneStatusBadge.textContent = isActive ? 'Active' : 'Inactive';
        }

        if (paneContactPerson) paneContactPerson.textContent = supp.contact_person || 'Primary Contact';
        if (panePhone) panePhone.textContent = supp.phone || 'N/A';
        if (paneEmail) paneEmail.textContent = supp.email || 'N/A';
        if (paneAddress) paneAddress.textContent = supp.address || 'India, IN';
        if (paneSince) paneSince.textContent = supp.created_at ? new Date(supp.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '15 Jan 2023';

        const suppPurchases = allPurchases.filter(p => (p.supplier_id === supp.id) || (p.supplier_name === supp.name));
        const totalSuppPurchaseVal = suppPurchases.reduce((acc, curr) => acc + parseFloat(curr.total_cost || curr.total_amount || 0), 0);
        const outstandingVal = suppPurchases.reduce((acc, curr) => acc + parseFloat(curr.amount_due || 0), 0);

        if (paneTotalPurchase) paneTotalPurchase.textContent = formatINR(totalSuppPurchaseVal);
        if (paneOutstanding) paneOutstanding.textContent = formatINR(outstandingVal);

        if (paneRecentPurchasesBody) {
            paneRecentPurchasesBody.innerHTML = '';
            if (suppPurchases.length === 0) {
                paneRecentPurchasesBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 12px; color: var(--text-dim);">No purchase records found for this supplier.</td></tr>`;
            } else {
                suppPurchases.slice(0, 5).forEach(pur => {
                    const dateObj = new Date(pur.purchase_date || pur.created_at || Date.now());
                    const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    const poNo = pur.po_no || `PUR-${String(pur.id).padStart(4, '0')}`;
                    const amount = parseFloat(pur.total_cost || pur.total_amount || 0);

                    paneRecentPurchasesBody.innerHTML += `
                        <tr>
                            <td style="padding: 8px 10px; color: var(--text-dim);">${dateStr}</td>
                            <td style="padding: 8px 10px; font-family: var(--font-mono);">${poNo}</td>
                            <td style="padding: 8px 10px; font-family: var(--font-mono); color: var(--success);">${formatINR(amount)}</td>
                        </tr>
                    `;
                });
            }
        }
    }

    if (paneEditBtn) {
        paneEditBtn.addEventListener('click', () => {
            if (selectedSupplier) {
                alert(`Editing supplier: ${selectedSupplier.name}`);
            } else {
                alert('Please select a supplier first.');
            }
        });
    }

    // --- Search & Filtering ---
    function filterSuppliers() {
        const query = searchInput.value.toLowerCase().trim();
        const statVal = statusFilter.value.toLowerCase();

        filteredSuppliers = allSuppliers.filter(supp => {
            const matchesQuery = (supp.name && supp.name.toLowerCase().includes(query)) ||
                                 (supp.email && supp.email.toLowerCase().includes(query)) ||
                                 (supp.phone && supp.phone.toLowerCase().includes(query)) ||
                                 (supp.contact_person && supp.contact_person.toLowerCase().includes(query));
            
            const matchesStatus = statVal === 'all' || (statVal === 'active' ? supp.is_active !== false : supp.is_active === false);

            return matchesQuery && matchesStatus;
        });

        renderTable(filteredSuppliers);
    }

    if (searchInput) searchInput.addEventListener('input', filterSuppliers);
    if (categoryFilter) categoryFilter.addEventListener('change', filterSuppliers);
    if (statusFilter) statusFilter.addEventListener('change', filterSuppliers);

    if (resetSearchBtn) {
        resetSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            categoryFilter.value = 'all';
            statusFilter.value = 'all';
            filteredSuppliers = [...allSuppliers];
            renderTable(filteredSuppliers);
        });
    }

    // Initial Load
    await loadData();
});
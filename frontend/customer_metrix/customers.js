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

    let customersData = [];
    let currentEditingId = null;

    // DOM Elements
    const customerBody = document.getElementById('customerBody');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const addCustomerBtn = document.getElementById('addCustomerBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeModal = document.getElementById('closeModal');
    const customerForm = document.getElementById('customerForm');
    const modalTitle = document.querySelector('.modal-header h2');
    const saveCustomerBtn = document.querySelector('.save-btn');
    const customerCountHeader = document.getElementById('customerCountHeader');

    // KPI Elements
    const kpiTotalCustomers = document.getElementById('kpiTotalCustomers');
    const kpiTotalOrders = document.getElementById('kpiTotalOrders');
    const kpiTotalSales = document.getElementById('kpiTotalSales');
    const kpiOutstanding = document.getElementById('kpiOutstanding');

    // Right Pane Elements
    const paneAvatar = document.getElementById('paneAvatar');
    const paneName = document.getElementById('paneName');
    const paneEmail = document.getElementById('paneEmail');
    const panePhone = document.getElementById('panePhone');
    const paneTotalOrders = document.getElementById('paneTotalOrders');
    const paneTotalSpent = document.getElementById('paneTotalSpent');
    const paneOutstanding = document.getElementById('paneOutstanding');
    const paneRecentOrdersBody = document.getElementById('paneRecentOrdersBody');
    const paneEditCustomerBtn = document.getElementById('paneEditCustomerBtn');
    const paneCloseBtn = document.getElementById('paneCloseBtn');

    // Drawer Elements (Fallback)
    const customerDrawer = document.getElementById('customerDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const closeDrawer = document.getElementById('closeDrawer');
    const drawerAvatar = document.getElementById('drawerAvatar');
    const drawerName = document.getElementById('drawerName');
    const drawerEmail = document.getElementById('drawerEmail');
    const drawerContactEmail = document.getElementById('drawerContactEmail');
    const drawerPhone = document.getElementById('drawerPhone');
    const drawerPurchases = document.getElementById('drawerPurchases');
    const purchaseHistory = document.getElementById('purchaseHistory');
    const recentTransactions = document.getElementById('recentTransactions');
    const editCustomerBtn = document.getElementById('editCustomerBtn');
    const viewCustomerBtn = document.getElementById('viewCustomerBtn');

    // --- Dynamic Back to Dashboard Routing ---
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
                window.location.href = '../manager/dashboard.html';
            }
        });
    }

    let activeSelectedCustomer = null;

    // --- Helper: Format Currency in INR ---
    function formatINR(amount) {
        if (amount === null || amount === undefined) return '₹0.00';
        const num = parseFloat(amount);
        if (isNaN(num)) return '₹0.00';
        const absVal = Math.abs(num).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return num < 0 ? `-₹${absVal}` : `₹${absVal}`;
    }

    // --- Fetch Customers from Backend API ---
    async function fetchCustomers() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/customers', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch customers');

            const result = await response.json();
            if (result.status === 'success') {
                customersData = result.data || [];
                updateKPIs(customersData);
                renderCustomers(customersData);

                if (customersData.length > 0) {
                    populateCustomerPane(customersData[0]);
                }
            }
        } catch (error) {
            console.error("Error fetching customers:", error);
        }
    }

    function updateKPIs(data) {
        const totalCust = data.length;
        let totalSalesSum = 0;
        let totalOrdersSum = 0;

        data.forEach(c => {
            const spent = parseFloat(c.total_purchases || c.total_spent || 0);
            totalSalesSum += spent;
            // Simulated orders count based on purchases or default
            totalOrdersSum += parseInt(c.total_orders || Math.floor(spent / 2500) + 1);
        });

        if (kpiTotalCustomers) kpiTotalCustomers.textContent = totalCust;
        if (kpiTotalOrders) kpiTotalOrders.textContent = totalOrdersSum.toLocaleString('en-IN');
        if (kpiTotalSales) kpiTotalSales.textContent = formatINR(totalSalesSum);
        if (kpiOutstanding) kpiOutstanding.textContent = formatINR(totalSalesSum * 0.08); // Calculated estimate or 0
    }

    // --- Render Customers Table ---
    function renderCustomers(list) {
        customerBody.innerHTML = '';
        if (list.length === 0) {
            emptyState.style.display = 'block';
            if (customerCountHeader) customerCountHeader.textContent = '0';
            return;
        }
        emptyState.style.display = 'none';
        if (customerCountHeader) customerCountHeader.textContent = list.length;

        list.forEach((cust, index) => {
            const initials = (cust.name || 'C').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const spent = parseFloat(cust.total_purchases || cust.total_spent || 0);
            const orders = cust.total_orders || Math.floor(spent / 2500) + 1;
            const outstanding = spent > 15000 ? 1200.00 : 0.00;

            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.innerHTML = `
                <td style="font-family:'JetBrains Mono',monospace; color:var(--text-dim);">#${index + 1}</td>
                <td>
                    <div class="customer-cell">
                        <div class="customer-avatar-small">${initials}</div>
                        <div>
                            <div class="customer-name">${cust.name}</div>
                        </div>
                    </div>
                </td>
                <td><span class="customer-phone">${cust.phone || 'N/A'}</span></td>
                <td><span class="customer-email">${cust.email}</span></td>
                <td style="font-family:'JetBrains Mono',monospace; font-weight:600;">${orders}</td>
                <td><span class="purchase-value">${formatINR(spent)}</span></td>
                <td style="font-family:'JetBrains Mono',monospace; color: ${outstanding > 0 ? 'var(--warning)' : 'var(--text-dim)'};">${formatINR(outstanding)}</td>
                <td style="color:var(--text-muted); font-size:11px;">12 Sep 2025</td>
                <td>
                    <div class="actions">
                        <button class="action-btn view-action" data-id="${cust.id}">View</button>
                        <button class="action-btn edit-action" data-id="${cust.id}">Edit</button>
                    </div>
                </td>
            `;

            row.addEventListener('click', (e) => {
                if (!e.target.closest('button')) populateCustomerPane(cust);
            });

            customerBody.appendChild(row);
        });

        document.querySelectorAll('.view-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const cust = customersData.find(c => c.id == btn.getAttribute('data-id'));
                if (cust) populateCustomerPane(cust);
            });
        });
        document.querySelectorAll('.edit-action').forEach(btn => {
            e_stopPropagation = true;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(btn.getAttribute('data-id'));
            });
        });
    }

    function e_stopPropagation(e) { e.stopPropagation(); }

    // --- Populate Right-Pane Customer Details ---
    async function populateCustomerPane(cust) {
        activeSelectedCustomer = cust;
        if (!cust) return;

        paneAvatar.textContent = (cust.name || 'C').substring(0, 2).toUpperCase();
        paneName.textContent = cust.name;
        paneEmail.textContent = cust.email;
        panePhone.textContent = cust.phone || 'N/A';
        
        const spent = parseFloat(cust.total_purchases || cust.total_spent || 0);
        const orders = cust.total_orders || Math.floor(spent / 2500) + 1;
        const outstanding = spent > 15000 ? 1200.00 : 0.00;

        paneTotalOrders.textContent = orders;
        paneTotalSpent.textContent = formatINR(spent);
        paneOutstanding.textContent = formatINR(outstanding);

        // Fetch Customer Sales History from Backend
        try {
            const histRes = await fetch(`http://127.0.0.1:5000/api/customers/${cust.id}/history`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const histResult = await histRes.json();
            
            if (histRes.ok && histResult.status === 'success' && histResult.data.length > 0) {
                const sales = histResult.data;
                paneRecentOrdersBody.innerHTML = sales.map(s => `
                    <tr style="border-bottom: 1px solid rgba(30,41,59,0.4);">
                        <td style="padding: 8px 10px; font-family:'JetBrains Mono',monospace;">INV-${String(s.id).padStart(4, '0')}</td>
                        <td style="padding: 8px 10px; color: var(--text-dim);">${new Date(s.sale_date).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric' })}</td>
                        <td style="padding: 8px 10px; font-family:'JetBrains Mono',monospace;">${formatINR(s.total_amount)}</td>
                        <td style="padding: 8px 10px; color: var(--success, #10b981);">Completed</td>
                    </tr>
                `).join('');
            } else {
                paneRecentOrdersBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:12px; color:var(--text-dim);">No recent orders recorded.</td></tr>`;
            }
        } catch (err) {
            console.error("Error fetching customer history for pane:", err);
        }
    }

    if (paneEditCustomerBtn) {
        paneEditCustomerBtn.addEventListener('click', () => {
            if (activeSelectedCustomer) openEditModal(activeSelectedCustomer.id);
            else alert('Please select a customer first.');
        });
    }

    if (paneCloseBtn) {
        paneCloseBtn.addEventListener('click', () => {
            // Optional collapse or toggle right pane if desired
        });
    }

    // --- Search Filter ---
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = customersData.filter(c => 
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.phone && c.phone.toLowerCase().includes(query))
        );
        renderCustomers(filtered);
    });

    // --- Modal Controls (Add / Edit) ---
    addCustomerBtn.addEventListener('click', () => {
        currentEditingId = null;
        modalTitle.textContent = 'Add Customer';
        saveCustomerBtn.textContent = 'Add Customer';
        customerForm.reset();
        modalOverlay.classList.add('open');
    });

    closeModal.addEventListener('click', () => {
        modalOverlay.classList.remove('open');
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.classList.remove('open');
    });

    function openEditModal(id) {
        const cust = customersData.find(c => c.id == id);
        if (!cust) return;
        currentEditingId = cust.id;
        modalTitle.textContent = 'Edit Customer';
        saveCustomerBtn.textContent = 'Update Customer';
        
        document.getElementById('customerName').value = cust.name || '';
        document.getElementById('customerEmail').value = cust.email || '';
        document.getElementById('customerPhone').value = cust.phone || '';
        
        modalOverlay.classList.add('open');
    }

    // --- Form Submit (Create or Update) ---
    customerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('customerName').value.trim(),
            email: document.getElementById('customerEmail').value.trim(),
            phone: document.getElementById('customerPhone').value.trim()
        };

        try {
            const url = currentEditingId 
                ? `http://127.0.0.1:5000/api/customers/${currentEditingId}`
                : 'http://127.0.0.1:5000/api/customers';
            
            const method = currentEditingId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                modalOverlay.classList.remove('open');
                fetchCustomers();
            } else {
                const errRes = await response.json();
                alert(errRes.message || 'Operation failed');
            }
        } catch (error) {
            console.error("Error saving customer:", error);
        }
    });

    // --- Drawer Controls (Fallback) ---
    closeDrawer.addEventListener('click', closeDrawerHandler);
    drawerOverlay.addEventListener('click', closeDrawerHandler);

    function closeDrawerHandler() {
        customerDrawer.classList.remove('open');
        drawerOverlay.classList.remove('open');
    }

    if (editCustomerBtn) {
        editCustomerBtn.addEventListener('click', () => {
            if (activeSelectedCustomer) {
                closeDrawerHandler();
                openEditModal(activeSelectedCustomer.id);
            }
        });
    }

    if (viewCustomerBtn) {
        viewCustomerBtn.addEventListener('click', () => {
            closeDrawerHandler();
        });
    }

    // Initial load
    fetchCustomers();
});
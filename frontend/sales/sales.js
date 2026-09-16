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
    const salesTableBody = document.getElementById('salesTableBody');
    const searchInput = document.getElementById('searchSale');
    const paymentFilter = document.getElementById('paymentFilter');
    const dateFilter = document.getElementById('dateFilter');
    const customerFilter = document.getElementById('customerFilter');
    const resetFiltersBtn = document.getElementById('resetFilters');

    // Modal elements
    const saleModal = document.getElementById('saleModal');
    const openSaleModalBtn = document.getElementById('openSaleModal');
    const closeSaleModalBtn = document.getElementById('closeSaleModal');
    const cancelSaleBtn = document.getElementById('cancelSale');
    const saleForm = document.getElementById('saleForm');

    // Form Inputs
    const customerSelect = document.getElementById('customer');
    const productSelect = document.getElementById('product');
    const quantityInput = document.getElementById('quantity');
    const priceInput = document.getElementById('price');
    const paymentMethodSelect = document.getElementById('paymentMethod');
    const subtotalEl = document.getElementById('subtotal');
    const totalEl = document.getElementById('total');

    // Summary Card Elements
    const statTotalSales = document.querySelector('.summary-grid .stat-card:nth-child(1) .stat-value');
    const statCompleted = document.querySelector('.summary-grid .stat-card:nth-child(2) .stat-value');
    const statPending = document.querySelector('.summary-grid .stat-card:nth-child(3) .stat-value');
    const statCustomers = document.querySelector('.summary-grid .stat-card:nth-child(4) .stat-value');

    let allSales = [];
    let filteredSales = [];
    let productsList = [];
    let customersList = [];

    // Pagination State (Max 5 rows per page)
    let currentPage = 1;
    const rowsPerPage = 5;

    // --- 1. User Profile Sync ---
    try {
        const profileResponse = await fetch('http://127.0.0.1:5000/api/auth/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!profileResponse.ok) {
            throw new Error('Unauthorized access');
        }
    } catch (e) {
        console.error("Auth session expired:", e);
        localStorage.removeItem('access_token');
        window.location.href = '../auth/login.html';
        return;
    }

    // --- Helper: Format INR ---
    function formatINR(amount) {
        const num = parseFloat(amount) || 0;
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // --- 2. Load Dropdowns (Products & Customers) ---
    async function loadFormDropdowns() {
        try {
            const [prodRes, custRes] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/products', { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null),
                fetch('http://127.0.0.1:5000/api/customers', { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null)
            ]);

            if (prodRes && prodRes.ok) {
                const prodData = await prodRes.json();
                productsList = prodData.data || [];
                productSelect.innerHTML = '<option value="">Select product</option>';
                productsList.forEach(prod => {
                    const price = prod.unit_price || prod.selling_price || 0;
                    productSelect.innerHTML += `<option value="${prod.id}" data-price="${price}">${prod.name || prod.product_name}</option>`;
                });
            }

            if (custRes && custRes.ok) {
                const custData = await custRes.json();
                customersList = custData.data || [];
                customerSelect.innerHTML = '<option value="">Select customer</option>';
                customerFilter.innerHTML = '<option value="all">All Customers</option>';
                customersList.forEach(cust => {
                    customerSelect.innerHTML += `<option value="${cust.id}">${cust.name}</option>`;
                    customerFilter.innerHTML += `<option value="${cust.name}">${cust.name}</option>`;
                });
            }
        } catch (err) {
            console.error("Failed to load form dropdowns:", err);
        }
    }

    productSelect.addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        const price = opt ? opt.getAttribute('data-price') : 0;
        if (price) {
            priceInput.value = price;
            calculateModalTotal();
        }
    });

    function calculateModalTotal() {
        const qty = parseFloat(quantityInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        const subtotal = qty * price;
        subtotalEl.textContent = formatINR(subtotal);
        totalEl.textContent = formatINR(subtotal);
    }

    quantityInput.addEventListener('input', calculateModalTotal);
    priceInput.addEventListener('input', calculateModalTotal);

    // --- 3. Load Sales Ledger ---
    async function loadSales() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/sales', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const result = await response.json();
                allSales = result.data || [];
                filteredSales = [...allSales];
                currentPage = 1;
                renderSalesTable();
                updateSummaryMetrics(allSales);

                // Auto-preview first sale if available
                if (allSales.length > 0) {
                    populateInvoicePreview(allSales[0]);
                }
            } else {
                filteredSales = [];
                renderSalesTable();
            }
        } catch (err) {
            console.error("Failed to fetch sales ledger:", err);
            filteredSales = [];
            renderSalesTable();
        }
    }

    function renderSalesTable() {
        const tbody = document.getElementById('salesTableBody');
        if (!filteredSales || filteredSales.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No sales records found.</td></tr>`;
            document.querySelector('.pagination span').textContent = 'Showing 0 of 0 transactions';
            document.getElementById('paginationControls').innerHTML = '<button class="active">1</button>';
            return;
        }

        // Pagination slicing (Max 5 rows per page)
        const totalPages = Math.ceil(filteredSales.length / rowsPerPage);
        if (currentPage > totalPages) currentPage = totalPages;
        const startIndex = (currentPage - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        const paginatedSales = filteredSales.slice(startIndex, endIndex);

        tbody.innerHTML = '';
        paginatedSales.forEach((sale, index) => {
            const absoluteIndex = startIndex + index + 1;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${absoluteIndex}</td>
                <td>${new Date(sale.sale_date || sale.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}<br><small style="color: var(--text-muted);">${new Date(sale.sale_date || sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></td>
                <td><span class="sale-id">#INV-${String(sale.id).padStart(4, '0')}</span></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="avatar" style="width: 28px; height: 28px; font-size: 0.7rem;">${(sale.customer_name || 'W').substring(0, 2).toUpperCase()}</div>
                        <div>
                            <strong>${sale.customer_name || 'Walk-in Customer'}</strong>
                            <small style="display: block; color: var(--text-muted); font-size: 0.68rem;">client@retail.ai</small>
                        </div>
                    </div>
                </td>
                <td>${sale.items_count || (sale.items ? sale.items.length : 1)}</td>
                <td><span class="cyber-pill cyan-pill">${sale.payment_method || 'CASH'}</span></td>
                <td class="amount">${formatINR(sale.total_amount)}</td>
                <td><span class="badge-pill success">● Completed</span></td>
                <td><button class="btn btn-ghost view-btn" data-sale-id="${sale.id}">View</button></td>`;

            // Attach event listener to populate Invoice Preview card on click
            tr.querySelector('.view-btn').addEventListener('click', () => {
                populateInvoicePreview(sale);
            });

            tbody.appendChild(tr);
        });

        // Update Pagination Info & Controls
        document.querySelector('.pagination span').textContent = `Showing ${startIndex + 1}–${Math.end = Math.min(endIndex, filteredSales.length)} of ${filteredSales.length} transactions`;
        
        const controls = document.getElementById('paginationControls');
        controls.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            if (i === currentPage) btn.classList.add('active');
            btn.addEventListener('click', () => {
                currentPage = i;
                renderSalesTable();
            });
            controls.appendChild(btn);
        }
    }

    function populateInvoicePreview(sale) {
        document.querySelector('.invoice-preview-header h3').textContent = `Invoice Preview (#INV-${String(sale.id).padStart(4, '0')})`;
        
        // Update date, customer, payment mode
        const metaGrid = document.querySelector('.inv-meta-grid');
        const formattedDate = new Date(sale.sale_date || sale.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        metaGrid.innerHTML = `
            <div>
                <span>Date</span>
                <strong>${formattedDate}</strong>
            </div>
            <div>
                <span>Customer</span>
                <strong>${sale.customer_name || 'Walk-in Customer'}</strong>
            </div>
            <div>
                <span>Payment Mode</span>
                <strong>${sale.payment_method || 'CASH'}</strong>
            </div>
        `;

        // Update items table inside invoice preview
        const invTableBody = document.querySelector('.inv-items-table tbody');
        invTableBody.innerHTML = '';
        
        const items = sale.items && sale.items.length > 0 ? sale.items : [{ product_name: 'General Retail Item', quantity: 1, unit_price: sale.total_amount, subtotal: sale.total_amount }];
        
        items.forEach((item, idx) => {
            invTableBody.innerHTML += `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${item.product_name || item.name || 'SKU Item'}</td>
                    <td>${item.quantity || 1}</td>
                    <td>${formatINR(item.unit_price || item.price || 0)}</td>
                    <td>${formatINR(item.subtotal || (item.quantity * item.unit_price) || sale.total_amount)}</td>
                </tr>
            `;
        });

        // Update totals
        const subtotal = parseFloat(sale.total_amount) || 0;
        document.querySelector('.inv-totals-box').innerHTML = `
            <div class="inv-t-row">
                <span>Subtotal</span>
                <strong>${formatINR(subtotal)}</strong>
            </div>
            <div class="inv-t-row discount">
                <span>Discount</span>
                <strong>-₹0.00</strong>
            </div>
            <div class="inv-t-row final-total">
                <span>Total Amount</span>
                <strong style="color:var(--success); font-size:1.15rem;">${formatINR(subtotal)}</strong>
            </div>
        `;
    }

    function updateSummaryMetrics(sales) {
        let totalRevenue = 0;
        let completedCount = 0;
        let pendingAmount = 0;
        const uniqueCustomers = new Set();

        sales.forEach(s => {
            const amt = parseFloat(s.total_amount || s.amount || 0);
            totalRevenue += amt;
            if ((s.status || 'completed').toLowerCase() === 'completed') {
                completedCount++;
            } else {
                pendingAmount += amt;
            }
            if (s.customer_name || s.customer_id) {
                uniqueCustomers.add(s.customer_name || s.customer_id);
            }
        });

        if (statTotalSales) statTotalSales.textContent = formatINR(totalRevenue);
        if (statCompleted) statCompleted.textContent = completedCount;
        if (statPending) statPending.textContent = formatINR(pendingAmount);
        if (statCustomers) statCustomers.textContent = uniqueCustomers.size;
    }

    // --- 4. Modal Interactions ---
    function toggleModal(show) {
        if (show) {
            saleModal.classList.add('show');
        } else {
            saleModal.classList.remove('show');
            saleForm.reset();
            subtotalEl.textContent = '₹0.00';
            totalEl.textContent = '₹0.00';
        }
    }

    openSaleModalBtn.addEventListener('click', () => toggleModal(true));
    closeSaleModalBtn.addEventListener('click', () => toggleModal(false));
    cancelSaleBtn.addEventListener('click', () => toggleModal(false));
    saleModal.addEventListener('click', (e) => {
        if (e.target === saleModal) toggleModal(false);
    });

    // --- 5. Submit New Sale Form ---
    saleForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const customerId = customerSelect.value;
        const productId = productSelect.value;
        const quantity = parseInt(quantityInput.value) || 1;
        const unitPrice = parseFloat(priceInput.value) || 0;
        const paymentMethod = paymentMethodSelect.value.toUpperCase();
        const subtotal = quantity * unitPrice;

        const payload = {
            customer_id: customerId ? parseInt(customerId) : null,
            payment_method: paymentMethod,
            total_amount: subtotal,
            items: [
                {
                    product_id: parseInt(productId),
                    quantity: quantity,
                    unit_price: unitPrice,
                    subtotal: subtotal
                }
            ]
        };

        try {
            const response = await fetch('http://127.0.0.1:5000/api/sales', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (response.ok && result.status === 'success') {
                alert('Sale created successfully and inventory updated!');
                toggleModal(false);
                loadSales();
            } else {
                alert(`Checkout failed: ${result.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error("Sale transaction network error:", err);
            alert("Failed to connect to backend server.");
        }
    });

    // --- 6. Filtering & Search ---
    function filterSalesRecords() {
        const query = searchInput.value.toLowerCase();
        const payVal = paymentFilter.value.toLowerCase();
        const custVal = customerFilter.value.toLowerCase();

        filteredSales = allSales.filter(sale => {
            const saleId = `sl-${sale.id}`.toLowerCase();
            const invNo = `inv-${String(sale.id).padStart(4, '0')}`.toLowerCase();
            const custName = (sale.customer_name || sale.customer_identifier || '').toLowerCase();
            const matchesQuery = saleId.includes(query) || invNo.includes(query) || custName.includes(query);

            const matchesPayment = payVal === 'all' || (sale.payment_method || '').toLowerCase() === payVal;
            const matchesCustomer = custVal === 'all' || custName.includes(custVal);

            return matchesQuery && matchesPayment && matchesCustomer;
        });

        currentPage = 1;
        renderSalesTable();
    }

    searchInput.addEventListener('input', filterSalesRecords);
    paymentFilter.addEventListener('change', filterSalesRecords);
    customerFilter.addEventListener('change', filterSalesRecords);

    resetFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        paymentFilter.value = 'all';
        dateFilter.value = 'all';
        customerFilter.value = 'all';
        filteredSales = [...allSales];
        currentPage = 1;
        renderSalesTable();
    });

    // --- Initialize Data Feeds ---
    await loadFormDropdowns();
    await loadSales();

    console.log("RetailAI Sales Ledger terminal fully synchronized.");
});
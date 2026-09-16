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

    // --- Dynamic User Profile & Strict Cashier Role Verification ---
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    const headerAvatarInitials = document.getElementById('headerAvatarInitials');

    try {
        const profileResponse = await fetch('http://127.0.0.1:5000/api/auth/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (profileResponse.ok) {
            const profileResult = await profileResponse.json();
            if (profileResult.status === 'success' && profileResult.data) {
                const userData = profileResult.data;
                const normalizedRole = (userData.role || '').toLowerCase();

                if (normalizedRole !== 'cashier') {
                    console.warn("[Access Control] Cashier dashboard access denied. Unauthorized role:", userData.role);
                    localStorage.removeItem('access_token');
                    window.location.replace('../auth/login.html');
                    return;
                }

                const fullName = userData.username || userData.email || 'Cashier User';
                if (userNameDisplay) userNameDisplay.textContent = fullName;
                if (userRoleDisplay) userRoleDisplay.textContent = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);
                if (headerAvatarInitials) {
                    headerAvatarInitials.textContent = fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                }
            }
        }
    } catch (e) {
        console.error("Profile sync error:", e);
    }

    // --- Logout Handler ---
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('access_token');
            window.location.replace('../auth/login.html');
        });
    }

    // --- Helper: Format INR ---
    function formatINR(amount) {
        const num = parseFloat(amount) || 0;
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // --- POS State ---
    let currentCart = [];
    let availableProducts = [];
    let selectedCustomerId = null; // Track live customer binding for POS checkout

    // --- Customer Matrix Live Lookup Handler ---
    const customerLookupInput = document.getElementById('customerSearch');
    if (customerLookupInput) {
        let timeoutId;
        customerLookupInput.addEventListener('input', (e) => {
            clearTimeout(timeoutId);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                selectedCustomerId = null;
                customerLookupInput.style.borderColor = '';
                return;
            }

            timeoutId = setTimeout(async () => {
                try {
                    const response = await fetch(`http://127.0.0.1:5000/api/customers/search?q=${encodeURIComponent(query)}`, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const result = await response.json();
                    
                    if (response.ok && result.status === 'success' && result.data && result.data.length > 0) {
                        const customer = result.data[0];
                        selectedCustomerId = customer.id;
                        customerLookupInput.style.borderColor = '#10b981';
                        console.log(`[POS Checkout] Customer Linked: ${customer.name} (ID: ${customer.id})`);
                    } else {
                        selectedCustomerId = null;
                        customerLookupInput.style.borderColor = '#ef4444';
                    }
                } catch (err) {
                    console.error("Customer lookup error:", err);
                    selectedCustomerId = null;
                }
            }, 300);
        });
    }

    // --- 1. Load Cashier Metrics mapped to Sales Schema (`total_amount`) ---
    async function loadCashierMetrics() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/sales', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                const sales = result.data || [];
                let totalSales = 0;
                let totalItems = 0;

                sales.forEach(sale => {
                    totalSales += parseFloat(sale.total_amount || sale.amount || 0);
                    
                    if (sale.items && Array.isArray(sale.items)) {
                        sale.items.forEach(item => {
                            totalItems += parseInt(item.quantity || 1);
                        });
                    }
                });

                const txCount = sales.length;
                document.getElementById('kpiTodaySales').textContent = formatINR(totalSales);
                document.getElementById('kpiTodayTxns').textContent = txCount;
                document.getElementById('kpiItemsSold').textContent = totalItems;
                document.getElementById('kpiAvgSale').textContent = formatINR(txCount > 0 ? totalSales / txCount : 0);
            }
        } catch (err) {
            console.error("Failed to load cashier metrics:", err);
        }
    }

    // --- 2. Load Products Catalog mapped to schema (`unit_price`) ---
    async function loadProductsCatalog() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/products', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                availableProducts = result.data || [];
                renderQuickProductGrid(availableProducts);
            }
        } catch (err) {
            console.error("Failed to load products catalog:", err);
        }
    }

    function renderQuickProductGrid(products) {
        const quickGrid = document.getElementById('quickProductGrid');
        quickGrid.innerHTML = '';
        if (products.length === 0) {
            quickGrid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem;">No products available in inventory.</p>`;
            return;
        }

        products.forEach(prod => {
            const itemPrice = parseFloat(prod.unit_price ?? prod.selling_price ?? prod.price ?? 0);
            
            const tile = document.createElement('div');
            tile.className = 'quick-product-tile';
            tile.innerHTML = `
                <div class="qp-name">${prod.name || prod.product_name || 'Unnamed SKU'}</div>
                <div class="qp-price">${formatINR(itemPrice)}</div>
            `;
            tile.addEventListener('click', () => {
                addToCart({
                    id: parseInt(prod.id || prod.product_id),
                    name: prod.name || prod.product_name || 'Unnamed SKU',
                    price: itemPrice
                });
            });
            quickGrid.appendChild(tile);
        });
    }

    function addToCart(prod) {
        const existing = currentCart.find(i => i.id === prod.id);
        if (existing) {
            existing.quantity += 1;
        } else {
            currentCart.push({ ...prod, quantity: 1 });
        }
        updateCartUI();
    }

    function updateCartUI() {
        const tbody = document.getElementById('cartTableBody');
        const subtotalEl = document.getElementById('cartSubtotal');
        const taxEl = document.getElementById('cartTax');
        const totalEl = document.getElementById('cartTotal');

        if (currentCart.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Cart is empty. Scan items to begin.</td></tr>`;
            subtotalEl.textContent = formatINR(0);
            taxEl.textContent = formatINR(0);
            totalEl.textContent = formatINR(0);
            return;
        }

        tbody.innerHTML = '';
        let subtotal = 0;

        currentCart.forEach((item) => {
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${formatINR(item.price)}</td>
                <td>${formatINR(itemTotal)}</td>
            `;
            tbody.appendChild(tr);
        });

        const tax = subtotal * 0.18;
        const total = subtotal + tax;

        subtotalEl.textContent = formatINR(subtotal);
        taxEl.textContent = formatINR(tax);
        totalEl.textContent = formatINR(total);
    }

    document.getElementById('clearCartBtn').addEventListener('click', () => {
        currentCart = [];
        updateCartUI();
    });

    // --- 3. Process Checkout mapped to Sales & Sale_items schema ---
    async function processCheckout(paymentMode) {
        if (currentCart.length === 0) {
            alert("Cart is empty. Add products before checkout.");
            return;
        }

        const customerInput = document.getElementById('customerSearch').value.trim();
        const payload = {
            items: currentCart.map(i => ({ product_id: parseInt(i.id), quantity: i.quantity, unit_price: i.price })),
            payment_method: paymentMode.toUpperCase(),
            customer_id: selectedCustomerId || null, // Bound resolved customer ID
            customer_identifier: customerInput || "Walk-in Customer"
        };

        try {
            const response = await fetch('http://127.0.0.1:5000/api/sales', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (response.ok && result.status === 'success') {
                alert(`Checkout Successful via ${paymentMode.toUpperCase()}!`);
                currentCart = [];
                selectedCustomerId = null;
                if (customerLookupInput) {
                    customerLookupInput.value = '';
                    customerLookupInput.style.borderColor = '';
                }
                updateCartUI();
                loadCashierMetrics();
                loadRecentSales();
            } else {
                alert(`Checkout Failed: ${result.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error("Checkout network error:", err);
            alert("Failed to connect to checkout server.");
        }
    }

    document.getElementById('payCashBtn').addEventListener('click', () => processCheckout('CASH'));
    document.getElementById('payUpiBtn').addEventListener('click', () => processCheckout('UPI'));

    // --- 4. Load Recent Sales mapped to schema (`total_amount`, `sale_date`) ---
    async function loadRecentSales() {
        const recentSalesList = document.getElementById('recentSalesList');
        try {
            const response = await fetch('http://127.0.0.1:5000/api/sales', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                const sales = result.data || [];
                if (sales.length === 0) {
                    recentSalesList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem;">No recent transactions recorded yet.</p>`;
                    return;
                }

                recentSalesList.innerHTML = '';
                sales.slice(0, 5).forEach(sale => {
                    const div = document.createElement('div');
                    div.style.cssText = "padding: 0.5rem 0; border-bottom: 1px solid var(--border-cyber); font-size: 0.8rem;";
                    div.innerHTML = `
                        <div style="display: flex; justify-content: space-between; font-weight: 600;">
                            <span>Txn #${sale.id || sale.sale_id}</span>
                            <span style="color: var(--success);">${formatINR(sale.total_amount)}</span>
                        </div>
                        <div style="color: var(--text-muted); font-size: 0.725rem;">Mode: ${sale.payment_method || 'CASH'} • ${new Date(sale.sale_date || sale.created_at || Date.now()).toLocaleTimeString()}</div>
                    `;
                    recentSalesList.appendChild(div);
                });
            }
        } catch (err) {
            console.error("Failed to load recent sales:", err);
        }
    }

    // --- Product Search Filter ---
    const searchInput = document.getElementById('productSearchInput');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = availableProducts.filter(p => (p.name || p.product_name || '').toLowerCase().includes(query));
        renderQuickProductGrid(filtered);
    });

    // --- Initialize Data ---
    await loadCashierMetrics();
    await loadProductsCatalog();
    await loadRecentSales();

    console.log("RetailAI Cashier POS Terminal synchronized with database schema.");
});
window.addEventListener('pageshow', (event) => {
    if (event.persisted || !localStorage.getItem('access_token')) {
        window.location.replace('./auth/login.html');
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = './auth/login.html';
        return;
    }

    // --- DOM Elements ---
    const productGridContainer = document.getElementById('productGridContainer');
    const productListContainer = document.getElementById('productListContainer');
    const productTableBody = document.getElementById('productTableBody');
    const emptyState = document.getElementById('emptyState');
    const productCountHeader = document.getElementById('productCountHeader');
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const statusFilter = document.getElementById('statusFilter');
    const resetFiltersBtn = document.getElementById('resetFilters');

    // View toggles
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    let isGridView = true;

    // Stat KPI elements
    const statTotalProducts = document.getElementById('statTotalProducts');
    const statCategories = document.getElementById('statCategories');
    const statActiveProducts = document.getElementById('statActiveProducts');
    const statLowStock = document.getElementById('statLowStock');

    // Right-pane detail elements
    const detailName = document.getElementById('detailName');
    const detailSku = document.getElementById('detailSku');
    const detailCategory = document.getElementById('detailCategory');
    const detailStatusBadge = document.getElementById('detailStatusBadge');
    const detailPrice = document.getElementById('detailPrice');
    const detailStock = document.getElementById('detailStock');
    const detailBrand = document.getElementById('detailBrand');
    const detailCatMeta = document.getElementById('detailCatMeta');
    const detailCost = document.getElementById('detailCost');
    const detailSell = document.getElementById('detailSell');
    const paneEditBtn = document.getElementById('paneEditBtn');

    // Drawer Elements
    const productDrawer = document.getElementById('productDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const addProductBtn = document.getElementById('addProductBtn');
    const closeDrawerBtn = document.getElementById('closeDrawer');
    const cancelBtn = document.getElementById('cancelBtn');
    const productForm = document.getElementById('productForm');
    const drawerTitle = document.getElementById('drawerTitle');

    // Form Fields
    const productIdInput = document.getElementById('productId');
    const productNameInput = document.getElementById('productName');
    const productSkuInput = document.getElementById('productSku');
    const productCategoryInput = document.getElementById('productCategory');
    const sellingPriceInput = document.getElementById('sellingPrice');
    const purchaseCostInput = document.getElementById('purchaseCost');
    const productDescriptionInput = document.getElementById('productDescription');
    const productStatusInput = document.getElementById('productStatus');

    let allProducts = [];
    let currentSelectedProduct = null;

    // --- 1. Dynamic Back to Dashboard Routing ---
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

    // --- Helper: Format INR ---
    function formatINR(amount) {
        const num = parseFloat(amount) || 0;
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // --- 2. Fetch and Load Products from Backend ---
    async function loadProducts() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/products', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to retrieve products catalog.');
            }

            const result = await response.json();
            allProducts = result.data || [];
            
            updateMetrics(allProducts);
            renderCatalog(allProducts);

            if (allProducts.length > 0) {
                populateProductDetails(allProducts[0]);
            }
        } catch (err) {
            console.error("Catalog fetch error:", err);
            productGridContainer.innerHTML = `<div style="grid-column: span 3; text-align: center; color: var(--danger); padding: 30px;">Failed to connect to backend server.</div>`;
        }
    }

    function updateMetrics(products) {
        const total = products.length;
        const categories = new Set(products.map(p => p.category).filter(Boolean)).size;
        const active = products.filter(p => p.is_active !== false).length;
        const lowStock = products.filter(p => parseInt(p.stock_quantity ?? 0) <= 10).length;

        if (statTotalProducts) statTotalProducts.textContent = total;
        if (statCategories) statCategories.textContent = categories;
        if (statActiveProducts) statActiveProducts.textContent = active;
        if (statLowStock) statLowStock.textContent = lowStock;
    }

    // --- 3. Render Catalog (Grid & List View) ---
    function renderCatalog(products) {
        productGridContainer.innerHTML = '';
        productTableBody.innerHTML = '';

        if (!products || products.length === 0) {
            emptyState.style.display = 'block';
            productCountHeader.textContent = '0';
            document.getElementById('paginationInfo').textContent = 'Showing 0 of 0 products';
            return;
        }

        emptyState.style.display = 'none';
        productCountHeader.textContent = products.length;
        document.getElementById('paginationInfo').textContent = `Showing 1 to ${products.length} of ${products.length} products`;

        products.forEach(prod => {
            const isActive = prod.is_active !== false;
            const statusClass = isActive ? 'active' : 'inactive';
            const statusText = isActive ? 'Active' : 'Inactive';
            const stockQty = parseInt(prod.stock_quantity ?? 0);
            const stockClass = stockQty <= 10 ? 'stock-low' : 'stock-normal';

            // 1. Render Grid Card
            const card = document.createElement('div');
            card.style.cssText = "background: rgba(3,7,18,0.6); border: 1px solid var(--border-cyber); border-radius: 12px; padding: 14px; cursor: pointer; transition: 0.2s ease;";
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div style="width: 38px; height: 38px; background: rgba(99,102,241,0.15); color: #818cf8; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-box"></i></div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <strong style="font-size: 12px; display: block; color: #f3f4f6; margin-bottom: 2px;">${prod.name}</strong>
                <span style="font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); display: block; margin-bottom: 8px;">${prod.sku}</span>
                <span style="font-size: 10px; color: var(--accent-cyan); display: block; margin-bottom: 12px;">${prod.category || 'General'}</span>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(148,163,184,0.08); padding-top: 8px;">
                    <strong style="font-family: var(--font-mono); font-size: 11px; color: var(--text-main);">${formatINR(prod.unit_price)}</strong>
                    <span style="font-family: var(--font-mono); font-size: 10px;" class="${stockClass}">Stock: ${stockQty}</span>
                </div>
            `;
            card.addEventListener('click', () => populateProductDetails(prod));
            productGridContainer.appendChild(card);

            // 2. Render List Row
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="product-cell">
                        <div class="product-icon"><i class="fa-solid fa-box"></i></div>
                        <div class="product-details">
                            <strong>${prod.name}</strong>
                            <span>${prod.category || 'General'}</span>
                        </div>
                    </div>
                </td>
                <td><span class="sku">${prod.sku}</span></td>
                <td><span class="category">${prod.category || 'General'}</span></td>
                <td><span class="price">${formatINR(prod.unit_price)}</span></td>
                <td><span class="stock ${stockClass}">${stockQty}</span></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="row-actions">
                        <button class="row-btn edit-row" data-id="${prod.id}" title="Edit Product"><i class="fa-regular fa-pen-to-square"></i></button>
                        <button class="row-btn delete delete-row" data-id="${prod.id}" title="Deactivate"><i class="fa-solid fa-ban"></i></button>
                    </div>
                </td>
            `;
            tr.addEventListener('click', (e) => {
                if (!e.target.closest('button')) populateProductDetails(prod);
            });
            productTableBody.appendChild(tr);
        });

        document.querySelectorAll('.edit-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditDrawer(parseInt(e.currentTarget.getAttribute('data-id')));
            });
        });

        document.querySelectorAll('.delete-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deactivateProduct(parseInt(e.currentTarget.getAttribute('data-id')));
            });
        });
    }

    // --- Populate Right-Pane Product Details ---
    function populateProductDetails(prod) {
        currentSelectedProduct = prod;
        if (!prod) return;

        detailName.textContent = prod.name;
        detailSku.textContent = prod.sku;
        detailCategory.textContent = prod.category || 'General Catalog';
        
        const isActive = prod.is_active !== false;
        detailStatusBadge.className = `status-badge ${isActive ? 'active' : 'inactive'}`;
        detailStatusBadge.textContent = isActive ? 'Active' : 'Inactive';

        detailPrice.textContent = formatINR(prod.unit_price);
        detailStock.textContent = `${prod.stock_quantity ?? 0} pcs`;
        detailBrand.textContent = 'CoreSys';
        detailCatMeta.textContent = prod.category || 'General';
        detailCost.textContent = formatINR(prod.cost_price);
        detailSell.textContent = formatINR(prod.unit_price);
    }

    if (paneEditBtn) {
        paneEditBtn.addEventListener('click', () => {
            if (currentSelectedProduct) openEditDrawer(currentSelectedProduct.id);
            else alert('Please select a product first.');
        });
    }

    // --- View Toggle Logic ---
    gridViewBtn.addEventListener('click', () => {
        isGridView = true;
        gridViewBtn.style.background = 'var(--accent-glow)';
        gridViewBtn.style.color = 'white';
        listViewBtn.style.background = 'transparent';
        listViewBtn.style.color = 'var(--text-muted)';
        productGridContainer.style.display = 'grid';
        productListContainer.style.display = 'none';
    });

    listViewBtn.addEventListener('click', () => {
        isGridView = false;
        listViewBtn.style.background = 'var(--accent-glow)';
        listViewBtn.style.color = 'white';
        gridViewBtn.style.background = 'transparent';
        gridViewBtn.style.color = 'var(--text-muted)';
        productListContainer.style.display = 'block';
        productGridContainer.style.display = 'none';
    });

    // --- Drawer Control ---
    function toggleDrawer(open, isEdit = false) {
        if (open) {
            productDrawer.classList.add('active');
            drawerOverlay.classList.add('active');
        } else {
            productDrawer.classList.remove('active');
            drawerOverlay.classList.remove('active');
            productForm.reset();
            productIdInput.value = '';
            drawerTitle.textContent = 'Add Product';
        }
    }

    addProductBtn.addEventListener('click', () => toggleDrawer(true, false));
    closeDrawerBtn.addEventListener('click', () => toggleDrawer(false));
    cancelBtn.addEventListener('click', () => toggleDrawer(false));
    drawerOverlay.addEventListener('click', () => toggleDrawer(false));

    async function openEditDrawer(id) {
        const prod = allProducts.find(p => p.id === id);
        if (!prod) return;

        productIdInput.value = prod.id;
        productNameInput.value = prod.name;
        productSkuInput.value = prod.sku;
        productCategoryInput.value = prod.category || '';
        sellingPriceInput.value = prod.unit_price;
        purchaseCostInput.value = prod.cost_price;
        productDescriptionInput.value = prod.description || '';
        productStatusInput.value = prod.is_active !== false ? 'true' : 'false';

        drawerTitle.textContent = 'Edit Product';
        toggleDrawer(true, true);
    }

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = productIdInput.value;
        const payload = {
            name: productNameInput.value.trim(),
            sku: productSkuInput.value.trim().toUpperCase(),
            category: productCategoryInput.value,
            unit_price: parseFloat(sellingPriceInput.value),
            cost_price: parseFloat(purchaseCostInput.value),
            is_active: productStatusInput.value === 'true'
        };

        const url = id ? `http://127.0.0.1:5000/api/products/${id}` : 'http://127.0.0.1:5000/api/products';
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (response.ok && result.status === 'success') {
                alert(id ? 'Product updated successfully!' : 'Product created successfully!');
                toggleDrawer(false);
                loadProducts();
            } else {
                alert(`Operation failed: ${result.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error("Product submit network error:", err);
            alert("Failed to communicate with backend server.");
        }
    });

    async function deactivateProduct(id) {
        if (!confirm('Are you sure you want to deactivate this product?')) return;

        try {
            const response = await fetch(`http://127.0.0.1:5000/api/products/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();
            if (response.ok && result.status === 'success') {
                alert('Product deactivated successfully.');
                loadProducts();
            } else {
                alert(`Deactivation failed: ${result.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error("Deactivation error:", err);
            alert("Failed to connect to server.");
        }
    }

    function filterProducts() {
        const query = searchInput.value.toLowerCase();
        const catVal = categoryFilter.value.toLowerCase();
        const statVal = statusFilter.value.toLowerCase();

        const filtered = allProducts.filter(prod => {
            const matchesQuery = prod.name.toLowerCase().includes(query) || prod.sku.toLowerCase().includes(query);
            const matchesCategory = catVal === 'all' || (prod.category || '').toLowerCase() === catVal;
            const matchesStatus = statVal === 'all' || (statVal === 'active' ? prod.is_active !== false : prod.is_active === false);

            return matchesQuery && matchesCategory && matchesStatus;
        });

        renderCatalog(filtered);
    }

    searchInput.addEventListener('input', filterProducts);
    categoryFilter.addEventListener('change', filterProducts);
    statusFilter.addEventListener('change', filterProducts);

    resetFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        categoryFilter.value = 'all';
        statusFilter.value = 'all';
        renderCatalog(allProducts);
    });

    await loadProducts();
});
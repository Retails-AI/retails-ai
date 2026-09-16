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
                window.location.href = '../admin/dashboard.html';
            }
        });
    }

    // --- Currency Formatter ---
    function formatINR(amount) {
        const num = parseFloat(amount) || 0;
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // --- Chart Instances ---
    let charts = {};

    function initCharts() {
        const commonLineOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { 
                    grid: { color: 'rgba(255, 255, 255, 0.03)' }, 
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } } 
                },
                y: { 
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.04)' }, 
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } } 
                }
            }
        };

        // Specific Bar Chart Options to fix left-alignment and spacing issues
        const commonBarOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { 
                    grid: { display: false, offset: true }, 
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } },
                    offset: true
                },
                y: { 
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.04)' }, 
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } } 
                }
            }
        };

        // 1. Revenue Trend Line Chart
        charts.revenue = new Chart(document.getElementById('revenueTrendChart').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ data: [], borderColor: '#06b6d4', borderWidth: 2.5, fill: true, backgroundColor: 'rgba(6, 182, 212, 0.08)', tension: 0.4 }] },
            options: commonLineOptions
        });

        // 2. Profit Trend Line Chart
        charts.profit = new Chart(document.getElementById('profitTrendChart').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ data: [], borderColor: '#34d399', borderWidth: 2.5, fill: true, backgroundColor: 'rgba(52, 211, 153, 0.08)', tension: 0.4 }] },
            options: commonLineOptions
        });

        // 3. Expense Trend Bar Chart
        charts.expense = new Chart(document.getElementById('expenseTrendChart').getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ data: [], backgroundColor: 'rgba(245, 158, 11, 0.8)', borderRadius: 6, barPercentage: 0.6, categoryPercentage: 0.7 }] },
            options: commonBarOptions
        });

        // 4. Purchase Trend Bar Chart
        charts.purchase = new Chart(document.getElementById('purchaseTrendChart').getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ data: [], backgroundColor: 'rgba(99, 102, 241, 0.8)', borderRadius: 6, barPercentage: 0.6, categoryPercentage: 0.7 }] },
            options: commonBarOptions
        });

        // 5. Category Revenue Bar Chart
        charts.category = new Chart(document.getElementById('categoryRevenueChart').getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ data: [], backgroundColor: '#6366f1', borderRadius: 6, barPercentage: 0.5, categoryPercentage: 0.6 }] },
            options: commonBarOptions
        });

        // 6. Expense Categories Doughnut Chart
        charts.expenseCat = new Chart(document.getElementById('expenseCategoriesChart').getContext('2d'), {
            type: 'doughnut',
            data: { labels: [], datasets: [{ data: [], backgroundColor: ['#6366f1', '#06b6d4', '#f59e0b', '#34d399', '#ef4444'], borderWidth: 0 }] },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11, family: 'Plus Jakarta Sans' }, boxWidth: 12, padding: 15 } } 
                },
                cutout: '70%'
            }
        });
    }

    initCharts();

    // --- Fetch Data from /api/reports/summary ---
    async function loadAuditReports(period = '7d') {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/reports/summary?period=${period}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error('Failed to fetch summary telemetry.');

            const result = await response.json();
            if (result.status === 'success' && result.data) {
                const data = result.data;

                // 1. Update KPIs
                const fin = data.financial_summary || {};
                document.getElementById('kpiRevenue').textContent = formatINR(fin.total_sales_revenue);
                document.getElementById('kpiCogs').textContent = formatINR(fin.total_cogs);
                document.getElementById('kpiGrossProfit').textContent = formatINR(fin.gross_profit);
                document.getElementById('kpiExpenses').textContent = formatINR(fin.total_expenses);
                document.getElementById('kpiNetProfit').textContent = formatINR(fin.net_profit);

                // 2. Extract & Format Trends Data
                const trends = data.trends || {};
                const salesTrends = trends.sales_trends || [];
                const purchaseTrends = trends.purchase_trends || [];
                const expenseTrends = trends.expense_trends || [];

                const labels = salesTrends.map(i => {
                    const d = new Date(i.date);
                    return isNaN(d) ? i.date : d.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' });
                });

                // Revenue Trend
                charts.revenue.data.labels = labels;
                charts.revenue.data.datasets[0].data = salesTrends.map(i => parseFloat(i.total_amount || 0));
                charts.revenue.update();

                // Profit Trend (derived calculation)
                charts.profit.data.labels = labels;
                charts.profit.data.datasets[0].data = salesTrends.map(i => parseFloat(i.total_amount || 0) * 0.4);
                charts.profit.update();

                // Purchase Trend
                const purchaseLabels = purchaseTrends.map(i => {
                    const d = new Date(i.date);
                    return isNaN(d) ? i.date : d.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' });
                });

                charts.purchase.data.labels = purchaseLabels.length > 0 ? purchaseLabels : labels;
                charts.purchase.data.datasets[0].data = purchaseTrends.map(i => parseFloat(i.total_amount || 0));
                charts.purchase.update();

                // Expense Trend (Using real database expense_trends instead of mock sales formula)
                const expenseLabels = expenseTrends.map(i => {
                    const d = new Date(i.date);
                    return isNaN(d) ? i.date : d.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' });
                });

                charts.expense.data.labels = expenseLabels.length > 0 ? expenseLabels : labels;
                charts.expense.data.datasets[0].data = expenseTrends.map(i => parseFloat(i.total_amount || 0));
                charts.expense.update();

                // 3. Performance Metrics (Categories & Expenses)
                const perf = data.performance_metrics || {};
                const catRev = perf.category_revenue || [];
                charts.category.data.labels = catRev.length > 0 ? catRev.map(i => i.category || 'General') : ['General'];
                charts.category.data.datasets[0].data = catRev.length > 0 ? catRev.map(i => parseFloat(i.total_revenue || 0)) : [0];
                charts.category.update();

                const expCat = perf.category_expenses || [];
                charts.expenseCat.data.labels = expCat.length > 0 ? expCat.map(i => i.category || 'General') : ['General'];
                charts.expenseCat.data.datasets[0].data = expCat.length > 0 ? expCat.map(i => parseFloat(i.total_amount || 0)) : [1];
                charts.expenseCat.update();

                // 4. Top Selling Products Table
                const topProds = perf.top_selling_products || [];
                const topProdBody = document.getElementById('topProductsBody');
                topProdBody.innerHTML = '';
                if (topProds.length > 0) {
                    topProds.forEach(p => {
                        topProdBody.innerHTML += `<tr><td>${p.product_name}</td><td>${p.total_quantity_sold} units</td><td>${formatINR(p.total_revenue)}</td></tr>`;
                    });
                } else {
                    topProdBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No sales recorded in this period.</td></tr>`;
                }

                // 5. Inventory Health Matrix
                const inv = data.inventory_summary || {};
                document.getElementById('invUnits').textContent = inv.total_units_in_stock ?? 0;
                document.getElementById('invLowStock').textContent = inv.low_stock_count ?? 0;
                document.getElementById('invTracked').textContent = inv.total_products_tracked ?? 0;
            }
        } catch (err) {
            console.error("Audit reports telemetry error:", err);
        }
    }

    // --- Filter Pills Event Binding ---
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            loadAuditReports(e.target.getAttribute('data-period'));
        });
    });

    // --- Export / Print Handler ---
    document.getElementById('exportReportBtn').addEventListener('click', () => {
        window.print();
    });

    // --- Initial Load ---
    await loadAuditReports('7d');
});
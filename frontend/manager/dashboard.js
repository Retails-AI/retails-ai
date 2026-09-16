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

    // --- Dynamic User Profile Binding & Manager Role Verification ---
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

                // Frontend-level role verification for Manager Dashboard[cite: 5]
                if (normalizedRole !== 'manager') {
                    console.warn("[Access Control] Manager dashboard access denied. Unauthorized role:", userData.role);
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('user_profile');
                    window.location.replace('../auth/login.html');
                    return;
                }

                const fullName = userData.username || userData.email || 'Manager User';
                const displayRole = userData.role || 'Manager';

                if (userNameDisplay) userNameDisplay.textContent = fullName;
                if (userRoleDisplay) userRoleDisplay.textContent = displayRole.charAt(0).toUpperCase() + displayRole.slice(1);
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

    // --- Chart Instances ---
    let salesTrendChartInstance = null;
    let expenseDoughnutChartInstance = null;
    let categoryBarChartInstance = null;

    // --- Chart.js Initializations with Professional Styling ---
    const salesCtx = document.getElementById('salesTrendChart').getContext('2d');
    const salesGradient = salesCtx.createLinearGradient(0, 0, 0, 240);
    salesGradient.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
    salesGradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    salesTrendChartInstance = new Chart(salesCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Sales Revenue (₹)',
                data: [],
                borderColor: '#06b6d4',
                backgroundColor: salesGradient,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#06b6d4',
                pointBorderColor: '#030712',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: '700' },
                    bodyFont: { family: 'JetBrains Mono', size: 12 },
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.02)', drawBorder: false },
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false },
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } }
                }
            }
        }
    });

    const expenseCtx = document.getElementById('expenseDoughnutChart').getContext('2d');
    expenseDoughnutChartInstance = new Chart(expenseCtx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: ['#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Plus Jakarta Sans', size: 10 },
                        boxWidth: 10,
                        padding: 12
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    bodyFont: { family: 'JetBrains Mono', size: 11 },
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                    borderWidth: 1,
                    padding: 8
                }
            },
            cutout: '75%'
        }
    });

    const categoryCtx = document.getElementById('categoryBarChart').getContext('2d');
    categoryBarChartInstance = new Chart(categoryCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Revenue (₹)',
                data: [],
                backgroundColor: 'rgba(99, 102, 241, 0.85)',
                borderColor: '#6366f1',
                borderWidth: 1,
                borderRadius: 8,
                barThickness: 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: '700' },
                    bodyFont: { family: 'JetBrains Mono', size: 12 },
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                    borderWidth: 1,
                    padding: 10
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false },
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } }
                }
            }
        }
    });

    // --- Load Dashboard Telemetry Data ---
    async function loadDashboardData(period = '7d') {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/reports/summary?period=${period}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch telemetry summary');

            const result = await response.json();
            if (result.status === 'success' && result.data) {
                const data = result.data;
                const financials = data.financial_summary || {};
                const inventory = data.inventory_summary || {};
                const performance = data.performance_metrics || {};

                // Update KPIs
                document.getElementById('kpiRevenue').textContent = formatINR(financials.total_sales_revenue);
                document.getElementById('kpiGrossProfit').textContent = formatINR(financials.gross_profit);
                document.getElementById('kpiNetProfit').textContent = formatINR(financials.net_profit);
                document.getElementById('kpiExpenses').textContent = formatINR(financials.total_expenses);

                // Update Inventory Metrics
                document.getElementById('invActiveUnits').textContent = inventory.total_units_in_stock ?? 0;
                document.getElementById('invLowStock').textContent = inventory.low_stock_count ?? 0;
                const healthySkus = Math.max(0, (inventory.total_products_tracked ?? 0) - (inventory.low_stock_count ?? 0));
                document.getElementById('invHealthySkus').textContent = healthySkus;
                document.getElementById('invWarningBadge').textContent = `${inventory.low_stock_count ?? 0} Warnings`;

                // Update Charts Data
                updateCharts(data);
                
                // Render Top Products Table
                renderTopProducts(performance.top_selling_products || []);
            }
        } catch (error) {
            console.error("Dashboard sync error:", error);
        }
    }

    function updateCharts(data) {
        const salesTrends = data.trends?.sales_trends || [];
        const labels = salesTrends.map(item => new Date(item.date).toLocaleDateString('en-IN', { month: 'short', day: '2-digit' }));
        const values = salesTrends.map(item => parseFloat(item.total_amount));

        if (salesTrendChartInstance) {
            salesTrendChartInstance.data.labels = labels;
            salesTrendChartInstance.data.datasets[0].data = values;
            salesTrendChartInstance.update();
        }

        const categoryExpenses = data.performance_metrics?.category_expenses || [];
        if (expenseDoughnutChartInstance) {
            expenseDoughnutChartInstance.data.labels = categoryExpenses.map(i => i.category || 'General');
            expenseDoughnutChartInstance.data.datasets[0].data = categoryExpenses.map(i => parseFloat(i.total_amount));
            expenseDoughnutChartInstance.update();
        }

        const categoryRevenue = data.performance_metrics?.category_revenue || [];
        if (categoryBarChartInstance) {
            categoryBarChartInstance.data.labels = categoryRevenue.map(i => i.category || 'General');
            categoryBarChartInstance.data.datasets[0].data = categoryRevenue.map(i => parseFloat(i.total_revenue));
            categoryBarChartInstance.update();
        }
    }

    function renderTopProducts(products) {
        const tableBody = document.querySelector('.dash-table tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        if (products.length > 0) {
            products.forEach(prod => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><span class="sku-name">${prod.product_name}</span></td>
                    <td><span class="badge-pill">${prod.total_quantity_sold} units</span></td>
                    <td><span class="badge-inr">${formatINR(prod.total_revenue)}</span></td>
                `;
                tableBody.appendChild(row);
            });
        } else {
            tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No sales data available.</td></tr>`;
        }
    }

    // --- Timeframe Pill Filter Events ---
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            const periodMap = { '7D': '7d', '1M': '1m', '1Y': '1y' };
            loadDashboardData(periodMap[e.target.textContent.trim()] || '7d');
        });
    });

    // --- Load Initial 7D Data ---
    await loadDashboardData('7d');

    // --- Backend AI Insights Integration ---
    const aiCopilotBody = document.getElementById('aiCopilotBody') || document.getElementById('managerAiInsightBox');
    try {
        const aiResponse = await fetch('http://127.0.0.1:5000/api/ai/insights', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const aiResult = await aiResponse.json();
        
        if (aiResponse.ok && aiResult.status === 'success' && aiResult.data) {
            const data = aiResult.data;
            
            // Map directly to the actual keys returned by the API
            const primaryInsight = data.financial_overview || data.sales_performance || data.overall_business_insight || "Operational telemetry normal.";
            const secondaryInsight = data.inventory_status || data.transaction_activity || "";
            
            const cleanText = `${primaryInsight} ${secondaryInsight}`.replace(/\\n/g, '<br>').replace(/\*\*/g, '');
            const recommendations = data.actionable_recommendations || [
                "Maintain healthy stock levels across high-performing categories.",
                "Review expense outflows regularly to maximize net profit margins."
            ];
            const recsHtml = recommendations.map(r => `<li>${r}</li>`).join('');
            
            if (aiCopilotBody) {
                aiCopilotBody.innerHTML = `
                    <h3 id="aiInsightText" style="font-size: 0.95rem; line-height: 1.5; color: var(--text-main);">"${cleanText}"</h3>
                    <div style="margin-top: 0.6rem; border-top: 1px solid var(--border-cyber); padding-top: 0.4rem;">
                        <span style="font-size: 0.7rem; font-family: var(--font-mono); color: var(--accent-cyan); text-transform: uppercase;">Manager Recommendations:</span>
                        <ul style="padding-left: 1.15rem; font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">${recsHtml}</ul>
                    </div>
                `;
            }
        }
    } catch (err) {
        console.error("AI Insight fetch error:", err);
        if (aiCopilotBody) {
            aiCopilotBody.innerHTML = `<h3 style="color: var(--danger); font-size: 0.85rem;">⚠️ Autonomous AI telemetry temporarily unavailable.</h3>`;
        }
    }
});
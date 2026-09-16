window.addEventListener('pageshow', (event) => {
    if (event.persisted || !localStorage.getItem('access_token')) {
        window.location.replace('../auth/login.html');
    }
});
document.addEventListener('DOMContentLoaded', async () => {

    // --- Authentication Token Retrieval (Must be at the top to avoid Temporal Dead Zone) ---
    const token = localStorage.getItem('access_token');
    if (!token) {
        console.error("[Dashboard Error] JWT access_token not found in localStorage. Redirecting to login.");
        window.location.href = '../auth/login.html';
        return;
    }

    // --- Dynamic User Profile & Session Binding via Backend /api/auth/me ---
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

        if (!profileResponse.ok) {
            throw new Error(`Profile Telemetry Error: Status ${profileResponse.status}`);
        }

        const profileResult = await profileResponse.json();

        if (profileResult.status === 'success' && profileResult.data) {
            const userData = profileResult.data;
            const fullName = userData.username || userData.email || 'Enterprise User';
            const role = userData.role || 'Administrator';

            if (userNameDisplay) userNameDisplay.textContent = fullName;
            if (userRoleDisplay) userRoleDisplay.textContent = role.charAt(0).toUpperCase() + role.slice(1);

            if (headerAvatarInitials) {
                const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                headerAvatarInitials.textContent = initials || 'EU';
            }
            console.log("[Auth Profile API] → success[cite: 12]");
        } else {
            throw new Error('Failed to retrieve valid profile record from database.');
        }

    } catch (profileError) {
        console.error("[Profile Sync Error]:", profileError);
        // Fallback redirection on invalid or expired token
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_name');
        window.location.href = '../index.html';
        return;
    }

    // --- Logout Handler Integration ---
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('access_token');
            localStorage.removeItem('user_name');
            console.log("[Auth Session] User logged out successfully. Redirecting to login portal.[cite: 12]");
            window.location.replace('../auth/login.html'); 
        });
    }

    // --- Sidebar Navigation Handler (Connected to Procurement & Modules) ---
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const sectionName = item.textContent.trim().toLowerCase();
            
            // If Procurement is clicked, redirect directly to the standalone procrument page
            if (sectionName.includes('procurement')) {
                e.preventDefault();
                window.location.href = '../procrument/procrument.html';
                return;
            }

            // Default SPA behavior for other sections if applicable
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            console.log(`[Dashboard Navigation] Switched view context to: ${item.textContent.trim()}[cite: 12]`);
        });
    });

    // --- Helper: Format Currency in Indian Number Style / Standard Decimal ---
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

    // --- DOM Elements for KPIs ---
    const kpiCards = document.querySelectorAll('.kpi-card');
    const salesCardTitle = kpiCards[0]?.querySelector('.kpi-title');
    const salesCardValue = kpiCards[0]?.querySelector('.kpi-value');
    const salesCardSub = kpiCards[0]?.querySelector('.kpi-sub');
    
    const grossCardValue = kpiCards[1]?.querySelector('.kpi-value');
    const grossCardSub = kpiCards[1]?.querySelector('.kpi-sub');
    
    const netCardValue = kpiCards[2]?.querySelector('.kpi-value');
    const netCardSub = kpiCards[2]?.querySelector('.kpi-sub');
    
    const expenseCardValue = kpiCards[3]?.querySelector('.kpi-value');
    const expenseCardSub = kpiCards[3]?.querySelector('.kpi-sub');

    // Neutralize fake static percentage indicators
    const trendBadges = document.querySelectorAll('.kpi-trend');
    trendBadges.forEach(badge => {
        badge.textContent = 'Active';
        badge.className = 'kpi-trend neutral';
    });

    // DOM Elements for Inventory Matrix
    const invActiveUnits = document.getElementById('invActiveUnits');
    const invLowStock = document.getElementById('invLowStock');
    const invHealthySkus = document.getElementById('invHealthySkus');
    const invStockouts = document.getElementById('invStockouts');
    const invWarningBadge = document.getElementById('invWarningBadge');

    // Set Loading State
    [salesCardValue, grossCardValue, netCardValue, expenseCardValue, invActiveUnits, invLowStock, invHealthySkus, invStockouts].forEach(el => {
        if (el) el.textContent = '...';
    });

    // --- Chart Instances for Dynamic Updates ---
    let salesTrendChartInstance = null;
    let expenseDoughnutChartInstance = null;
    let categoryBarChartInstance = null;

    // --- Core Data Fetching & Dashboard Synchronization Function ---
    async function loadDashboardData(period = '7d') {
        console.log(`[Dashboard Telemetry] Fetching report summary for timeframe period: ${period}[cite: 12]`);
        
        if (salesCardTitle) {
            salesCardTitle.textContent = `Total Sales (${period.toUpperCase()})`;
        }

        try {
            const response = await fetch(`http://127.0.0.1:5000/api/reports/summary?period=${period}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.status === 'success' && result.data) {
                const data = result.data;

                // 1. Update KPIs
                const financials = data.financial_summary || {};
                const counts = data.transaction_counts || {};

                const totalSales = financials.total_sales_revenue ?? 0;
                const grossProfit = financials.gross_profit ?? 0;
                const netProfit = financials.net_profit ?? 0;
                const totalExpenses = financials.total_expenses ?? 0;
                const txCount = counts.sales_count ?? 0;

                if (salesCardValue) salesCardValue.textContent = formatINR(totalSales);
                if (salesCardSub) salesCardSub.textContent = `Across ${txCount} authorized transactions`;

                if (grossCardValue) grossCardValue.textContent = formatINR(grossProfit);
                if (grossCardSub) grossCardSub.textContent = `Blended revenue yield`;

                if (netCardValue) netCardValue.textContent = formatINR(netProfit);
                if (netCardSub) netCardSub.textContent = `Net after operational overhead`;

                if (expenseCardValue) expenseCardValue.textContent = formatINR(totalExpenses);
                if (expenseCardSub) expenseCardSub.textContent = `Registered business outflows`;

                // 2. Update Inventory Health Matrix
                const inventory = data.inventory_summary || {};
                const activeUnits = inventory.total_units_in_stock ?? 0;
                const lowStockCount = inventory.low_stock_count ?? 0;
                const totalTracked = inventory.total_products_tracked ?? 0;
                const healthySkus = Math.max(0, totalTracked - lowStockCount);

                if (invActiveUnits) invActiveUnits.textContent = activeUnits;
                if (invLowStock) invLowStock.textContent = lowStockCount;
                if (invHealthySkus) invHealthySkus.textContent = healthySkus;
                if (invStockouts) invStockouts.textContent = '-'; 
                if (invWarningBadge) invWarningBadge.textContent = `${lowStockCount} Warnings`;

                // 3. Extract Real Sales Daily Trends for Line Chart
                const trends = data.trends || {};
                const salesTrends = trends.sales_trends || [];

                let salesLabels = [];
                let salesDataValues = [];

                if (salesTrends.length > 0) {
                    const sortedSales = [...salesTrends].sort((a, b) => new Date(a.date) - new Date(b.date));
                    salesLabels = sortedSales.map(item => {
                        const d = new Date(item.date);
                        return d.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' });
                    });
                    salesDataValues = sortedSales.map(item => parseFloat(item.total_amount));
                }

                if (salesTrendChartInstance) {
                    salesTrendChartInstance.data.labels = salesLabels;
                    salesTrendChartInstance.data.datasets[0].data = salesDataValues;
                    salesTrendChartInstance.update();
                }

                // 4. Extract Real Expense Categories for Doughnut Chart
                const performance = data.performance_metrics || {};
                const categoryExpenses = performance.category_expenses || [];
                let expenseLabels = [];
                let expenseDataValues = [];

                if (categoryExpenses.length > 0) {
                    expenseLabels = categoryExpenses.map(item => item.category || 'General');
                    expenseDataValues = categoryExpenses.map(item => parseFloat(item.total_amount));
                }

                if (expenseDoughnutChartInstance) {
                    expenseDoughnutChartInstance.data.labels = expenseLabels;
                    expenseDoughnutChartInstance.data.datasets[0].data = expenseDataValues;
                    expenseDoughnutChartInstance.update();
                }

                // 5. Extract Category Revenue for Bar Chart
                const categoryRevenue = performance.category_revenue || [];
                let categoryLabels = [];
                let categoryDataValues = [];

                if (categoryRevenue.length > 0) {
                    categoryLabels = categoryRevenue.map(item => item.category || 'General');
                    categoryDataValues = categoryRevenue.map(item => parseFloat(item.total_revenue));
                }

                if (categoryBarChartInstance) {
                    categoryBarChartInstance.data.labels = categoryLabels;
                    categoryBarChartInstance.data.datasets[0].data = categoryDataValues;
                    categoryBarChartInstance.update();
                }

                // 6. Extract Top Selling Products for Table Population
                const topProducts = performance.top_selling_products || [];
                const tableBody = document.querySelector('.dash-table tbody');
                
                if (tableBody) {
                    tableBody.innerHTML = '';
                    if (topProducts.length > 0) {
                        topProducts.forEach(prod => {
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td><span class="sku-name">${prod.product_name}</span></td>
                                <td><span class="badge-pill">${prod.total_quantity_sold} units</span></td>
                                <td><span class="badge-inr">${formatINR(prod.total_revenue)}</span></td>
                            `;
                            tableBody.appendChild(row);
                        });
                    } else {
                        tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No top-selling products data available for this timeframe.</td></tr>`;
                    }
                }

                console.log("[Dashboard API] → success[cite: 12]");
            } else {
                throw new Error(result.message || 'Failed to retrieve report summary data.');
            }

        } catch (error) {
            console.error("[Dashboard API Error]:", error);
            [salesCardValue, grossCardValue, netCardValue, expenseCardValue].forEach(el => {
                if (el) el.textContent = 'Sync Failed';
            });
        }
    }

    // --- Interactive Timeframe Filter Pills Event Binding ---
    const filterPills = document.querySelectorAll('.filter-pill');
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            const pillText = pill.textContent.trim();
            const periodMap = {
                '7D': '7d',
                '1M': '1m',
                '1Y': '1y'
            };
            const selectedPeriod = periodMap[pillText] || '7d';
            console.log(`[Analytics Filter] Timeframe updated to: ${pillText}[cite: 12]`);
            loadDashboardData(selectedPeriod);
        });
    });

    // --- Chart.js Initializations ---
    const salesCtx = document.getElementById('salesTrendChart').getContext('2d');
    const salesGradient = salesCtx.createLinearGradient(0, 0, 0, 220);
    salesGradient.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    salesGradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    salesTrendChartInstance = new Chart(salesCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Sales (₹)',
                data: [],
                borderColor: '#06b6d4',
                backgroundColor: salesGradient,
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#06b6d4',
                pointBorderColor: '#020617',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Plus Jakarta Sans', size: 12 },
                    bodyFont: { family: 'JetBrains Mono', size: 12 },
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
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
                        font: { family: 'Plus Jakarta Sans', size: 11 },
                        boxWidth: 10,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    bodyFont: { family: 'JetBrains Mono', size: 12 },
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                    borderWidth: 1,
                    padding: 10
                }
            },
            cutout: '72%'
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
                borderRadius: 6,
                barThickness: 28
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Plus Jakarta Sans', size: 12 },
                    bodyFont: { family: 'JetBrains Mono', size: 12 },
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                    borderWidth: 1,
                    padding: 10
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
                }
            }
        }
    });

    // --- Load Initial Dashboard Data (Default: 7D) ---
    await loadDashboardData('7d');

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

    console.log("RetailAI Executive Enterprise Dashboard fully synchronized with live database metrics.[cite: 12]");
});
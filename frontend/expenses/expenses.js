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

    let expensesData = [];
    let filteredExpenses = [];
    let currentSelectedExpense = null;

    // DOM Elements
    const expenseBody = document.getElementById('expenseBody');
    const emptyState = document.getElementById('emptyState');
    const expenseCountHeader = document.getElementById('expenseCountHeader');
    const paginationInfo = document.getElementById('paginationInfo');
    const totalExpensesEl = document.getElementById('totalExpenses');
    const totalTransactionsEl = document.getElementById('totalTransactions');
    const avgExpenseDayEl = document.getElementById('avgExpenseDay');
    const highestExpenseVal = document.getElementById('highestExpenseVal');
    const highestExpenseSub = document.getElementById('highestExpenseSub');
    
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const resetFiltersBtn = document.getElementById('resetFilters');

    const addExpenseBtn = document.getElementById('addExpenseBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeModal = document.getElementById('closeModal');
    const expenseForm = document.getElementById('expenseForm');
    const modalTitle = document.getElementById('modalTitle');
    const expenseIdInput = document.getElementById('expenseId');
    const backDashboardBtn = document.getElementById('backDashboardBtn');

    // Right Pane Elements
    const paneDescription = document.getElementById('paneDescription');
    const paneCategoryMeta = document.getElementById('paneCategoryMeta');
    const paneStatusBadge = document.getElementById('paneStatusBadge');
    const paneAmount = document.getElementById('paneAmount');
    const paneDate = document.getElementById('paneDate');
    const paneCreatedBy = document.getElementById('paneCreatedBy');
    const paneDeleteBtn = document.getElementById('paneDeleteBtn');
    const recentExpensesList = document.getElementById('recentExpensesList');

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

    // --- Helper: Clean Date Display ---
    function formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            }
            return dateStr.split('T')[0];
        } catch (e) {
            return dateStr;
        }
    }

    // --- Dynamic Back to Dashboard Routing ---
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
                    const role = (result.data?.role || 'manager').toLowerCase();
                    if (role === 'admin') window.location.href = '../dashboard/dashboard.html';
                    else if (role === 'manager') window.location.href = '../manager/dashboard.html';
                    else window.location.href = '../cashier/dashboard.html';
                } else {
                    window.location.href = '../auth/login.html';
                }
            } catch (err) {
                window.location.href = '../dashboard/dashboard.html';
            }
        });
    }

    // --- Fetch Expenses from Backend API ---[cite: 23]
    async function fetchExpenses() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/expenses', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch expenses');

            const result = await response.json();
            if (result.status === 'success') {
                expensesData = result.data || [];
                filteredExpenses = [...expensesData];
                updateKPIs(expensesData);
                renderTable(filteredExpenses);

                if (filteredExpenses.length > 0) {
                    populateExpensePane(filteredExpenses[0]);
                }
            }
        } catch (error) {
            console.error("Error fetching expenses:", error);
            updateKPIs([]);
            renderTable([]);
        }
    }

    // --- Update KPI Bento Cards ---
    function updateKPIs(list) {
        let totalSum = 0;
        let maxVal = -1;
        let highestObj = null;

        list.forEach(exp => {
            const amount = parseFloat(exp.amount) || 0;
            totalSum += amount;
            if (amount > maxVal) {
                maxVal = amount;
                highestObj = exp;
            }
        });

        if (totalExpensesEl) totalExpensesEl.textContent = formatINR(totalSum);
        if (totalTransactionsEl) totalTransactionsEl.textContent = list.length;
        if (avgExpenseDayEl) avgExpenseDayEl.textContent = formatINR(list.length > 0 ? totalSum / 30 : 0);

        if (highestObj && highestExpenseVal) {
            highestExpenseVal.textContent = formatINR(maxVal);
            highestExpenseSub.textContent = `${highestObj.category || 'Expense'} (${formatDate(highestObj.expense_date || highestObj.date)})`;
        } else if (highestExpenseVal) {
            highestExpenseVal.textContent = formatINR(0);
            highestExpenseSub.textContent = '—';
        }
    }

    // --- Render Table ---
    function renderTable(list) {
        if (!expenseBody) return;
        expenseBody.innerHTML = '';

        if (!list || list.length === 0) {
            emptyState.style.display = 'block';
            if (expenseCountHeader) expenseCountHeader.textContent = '0';
            if (paginationInfo) paginationInfo.textContent = 'Showing 0 of 0 expenses';
            if (recentExpensesList) recentExpensesList.innerHTML = '<div style="color:var(--text-dim);">No recent expenses.</div>';
            return;
        }

        emptyState.style.display = 'none';
        if (expenseCountHeader) expenseCountHeader.textContent = list.length;
        if (paginationInfo) paginationInfo.textContent = `Showing 1 to ${list.length} of ${list.length} expenses`;

        list.forEach((exp, index) => {
            const amount = parseFloat(exp.amount) || 0;
            const cat = exp.category || 'General';
            const dateStr = formatDate(exp.expense_date || exp.date);
            const desc = exp.description || '—';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="font-family:'JetBrains Mono',monospace; color:var(--text-dim);">#${index + 1}</td>
                <td><span class="expense-date">${dateStr}</span></td>
                <td><span class="expense-description"><strong>${desc}</strong></span></td>
                <td><span class="expense-category">${cat}</span></td>
                <td><span class="expense-amount">${formatINR(amount)}</span></td>
                <td style="text-align: right;">
                    <button class="action-btn view-row" data-id="${exp.id}" title="View Details" style="background:none; border:none; color:var(--accent-cyan); cursor:pointer;"><i class="fa-regular fa-eye"></i></button>
                </td>
            `;

            row.addEventListener('click', () => {
                document.querySelectorAll('tbody tr').forEach(r => r.style.background = 'transparent');
                row.style.background = 'rgba(6, 182, 212, 0.05)';
                populateExpensePane(exp);
            });

            expenseBody.appendChild(row);
        });

        // Render Recent Expenses Widget List
        if (recentExpensesList) {
            recentExpensesList.innerHTML = '';
            list.slice(0, 5).forEach(exp => {
                recentExpensesList.innerHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(148,163,184,0.06);">
                        <div>
                            <strong style="display: block; color: #f3f4f6;">${exp.description || exp.category}</strong>
                            <span style="font-size: 9px; color: var(--text-dim);">${formatDate(exp.expense_date || exp.date)}</span>
                        </div>
                        <strong style="font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--success);">${formatINR(exp.amount)}</strong>
                    </div>
                `;
            });
        }
    }

    // --- Populate Right Pane Expense Details ---
    function populateExpensePane(exp) {
        currentSelectedExpense = exp;
        if (!exp) return;

        if (paneDescription) paneDescription.textContent = exp.description || exp.category;
        if (paneCategoryMeta) paneCategoryMeta.textContent = exp.category || 'General';
        if (paneStatusBadge) paneStatusBadge.textContent = 'Paid';
        if (paneAmount) paneAmount.textContent = formatINR(exp.amount);
        if (paneDate) paneDate.textContent = formatDate(exp.expense_date || exp.date);
        if (paneCreatedBy) paneCreatedBy.textContent = exp.staff_username || 'Admin User';
    }

    // --- Modal Controls ---
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', () => {
            if (expenseForm) expenseForm.reset();
            if (expenseIdInput) expenseIdInput.value = '';
            if (modalTitle) modalTitle.textContent = 'Add Expense';
            const todayStr = new Date().toISOString().split('T')[0];
            const dateInput = document.getElementById('expenseDate');
            if (dateInput) dateInput.value = todayStr;
            modalOverlay.classList.add('open');
        });
    }

    if (closeModal) {
        closeModal.addEventListener('click', () => {
            modalOverlay.classList.remove('open');
        });
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.classList.remove('open');
        });
    }

    if (paneDeleteBtn) {
        paneDeleteBtn.addEventListener('click', async () => {
            if (!currentSelectedExpense) {
                alert('Please select an expense first.');
                return;
            }
            if (!confirm('Are you sure you want to delete this expense?')) return;
            
            try {
                const response = await fetch(`http://127.0.0.1:5000/api/expenses/${currentSelectedExpense.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    alert('Expense deleted successfully.');
                    fetchExpenses();
                } else {
                    alert('Failed to delete expense.');
                }
            } catch (err) {
                console.error("Delete error:", err);
                alert('Server connection error.');
            }
        });
    }

    // --- Form Submit (Create Expense) ---[cite: 23, 24]
    if (expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                category: document.getElementById('expenseCategory').value,
                amount: parseFloat(document.getElementById('expenseAmount').value),
                expense_date: document.getElementById('expenseDate').value,
                description: document.getElementById('expenseDescription').value.trim()
            };

            try {
                const response = await fetch('http://127.0.0.1:5000/api/expenses', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    modalOverlay.classList.remove('open');
                    fetchExpenses();
                } else {
                    const errRes = await response.json();
                    alert(errRes.message || 'Failed to save expense');
                }
            } catch (error) {
                console.error("Error saving expense:", error);
                alert('An error occurred while saving the expense.');
            }
        });
    }

    // --- Search & Filtering ---
    function filterExpenses() {
        const query = searchInput.value.toLowerCase().trim();
        const catVal = categoryFilter.value.toLowerCase();

        filteredExpenses = expensesData.filter(exp => {
            const matchesQuery = (exp.description && exp.description.toLowerCase().includes(query)) ||
                                 (exp.category && exp.category.toLowerCase().includes(query));
            
            const matchesCat = catVal === 'all' || (exp.category || '').toLowerCase() === catVal;

            return matchesQuery && matchesCat;
        });

        renderTable(filteredExpenses);
    }

    if (searchInput) searchInput.addEventListener('input', filterExpenses);
    if (categoryFilter) categoryFilter.addEventListener('change', filterExpenses);

    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            searchInput.value = '';
            categoryFilter.value = 'all';
            filteredExpenses = [...expensesData];
            renderTable(filteredExpenses);
        });
    }

    // Initial load
    fetchExpenses();
});
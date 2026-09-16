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

    // DOM Elements
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const avatar = document.getElementById('avatar');
    const nameValue = document.getElementById('nameValue');
    const emailValue = document.getElementById('emailValue');
    const roleValue = document.getElementById('roleValue');
    const roleBadge = document.getElementById('roleBadge');
    const backDashboardBtn = document.getElementById('backDashboardBtn');
    
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    const passwordModal = document.getElementById('passwordModal');
    const closePasswordModal = document.getElementById('closePasswordModal');
    const passwordForm = document.getElementById('passwordForm');
    const passwordMessage = document.getElementById('passwordMessage');

    const businessInfoBtn = document.getElementById('businessInfoBtn');
    const businessModal = document.getElementById('businessModal');
    const closeBusinessModal = document.getElementById('closeBusinessModal');
    const businessForm = document.getElementById('businessForm');
    const businessNameInput = document.getElementById('businessName');
    const currencySelect = document.getElementById('currency');

    const compactToggle = document.getElementById('compactToggle');
    const notificationToggle = document.getElementById('notificationToggle');
    const saveBtn = document.getElementById('saveBtn');
    const saveMessage = document.getElementById('saveMessage');

    let currentUserRole = 'Manager';

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
                window.location.href = '../manager/dashboard.html';
            }
        });
    }

    // --- Fetch User Profile ---
    async function fetchUserProfile() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/auth/me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch profile');

            const result = await response.json();
            if (result.status === 'success' && result.data) {
                const user = result.data;
                const name = user.username || user.email || 'User';
                const email = user.email || 'user@retailai.os';
                currentUserRole = user.role || 'Manager';

                if (profileName) profileName.textContent = name;
                if (profileEmail) profileEmail.textContent = email;
                if (nameValue) nameValue.textContent = name;
                if (emailValue) emailValue.textContent = email;
                if (roleValue) roleValue.textContent = currentUserRole.charAt(0).toUpperCase() + currentUserRole.slice(1);
                if (roleBadge) roleBadge.textContent = currentUserRole.toUpperCase();
                
                if (avatar) {
                    avatar.textContent = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                }
            }
        } catch (error) {
            console.error("Error fetching user profile:", error);
        }
    }

    // --- Modal Controls for Password ---
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            passwordForm.reset();
            passwordMessage.textContent = '';
            passwordModal.classList.add('open');
        });
    }

    if (closePasswordModal) {
        closePasswordModal.addEventListener('click', () => {
            passwordModal.classList.remove('open');
        });
    }

    if (passwordModal) {
        passwordModal.addEventListener('click', (e) => {
            if (e.target === passwordModal) passwordModal.classList.remove('open');
        });
    }

    // --- Password Form Submit ---
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (newPassword !== confirmPassword) {
                passwordMessage.textContent = 'New passwords do not match.';
                return;
            }

            try {
                const response = await fetch('http://127.0.0.1:5000/api/auth/change-password', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
                });

                if (response.ok) {
                    passwordMessage.style.color = '#10b981';
                    passwordMessage.textContent = 'Password updated successfully!';
                    setTimeout(() => {
                        passwordModal.classList.remove('open');
                    }, 1200);
                } else {
                    const errRes = await response.json();
                    passwordMessage.style.color = '#ef4444';
                    passwordMessage.textContent = errRes.message || 'Failed to update password.';
                }
            } catch (error) {
                console.error("Error updating password:", error);
                passwordMessage.style.color = '#ef4444';
                passwordMessage.textContent = 'An error occurred. Please try again.';
            }
        });
    }

    // --- Modal Controls for Business Settings ---
    if (businessInfoBtn) {
        businessInfoBtn.addEventListener('click', () => {
            businessModal.classList.add('open');
        });
    }

    if (closeBusinessModal) {
        closeBusinessModal.addEventListener('click', () => {
            businessModal.classList.remove('open');
        });
    }

    if (businessModal) {
        businessModal.addEventListener('click', (e) => {
            if (e.target === businessModal) businessModal.classList.remove('open');
        });
    }

    if (businessForm) {
        businessForm.addEventListener('submit', (e) => {
            e.preventDefault();
            businessModal.classList.remove('open');
            if (saveMessage) {
                saveMessage.textContent = 'Business settings updated locally.';
                setTimeout(() => { saveMessage.textContent = 'All changes are saved automatically.'; }, 3000);
            }
        });
    }

    // --- Save Preferences Button ---
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const preferences = {
                compactInterface: compactToggle ? compactToggle.checked : false,
                smartNotifications: notificationToggle ? notificationToggle.checked : true
            };
            localStorage.setItem('user_preferences', JSON.stringify(preferences));
            if (saveMessage) {
                saveMessage.textContent = 'Preferences saved successfully!';
                setTimeout(() => { saveMessage.textContent = 'All changes are saved automatically.'; }, 3000);
            }
        });
    }

    // Load saved preferences on init
    const savedPrefs = localStorage.getItem('user_preferences');
    if (savedPrefs) {
        try {
            const prefs = JSON.parse(savedPrefs);
            if (compactToggle) compactToggle.checked = !!prefs.compactInterface;
            if (notificationToggle) notificationToggle.checked = prefs.smartNotifications !== false;
        } catch (e) {
            console.error("Error parsing preferences", e);
        }
    }

    // Initial profile fetch
    fetchUserProfile();
});
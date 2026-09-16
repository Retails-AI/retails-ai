document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorBanner = document.getElementById('errorBanner');
    const submitBtn = document.getElementById('submitBtn');

    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const identifier = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!identifier || !password) {
            showError("Please enter both username/email and password.");
            return;
        }

        // Set loading state
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text').textContent = 'Authenticating...';
        hideError();

        try {
            // 1. Authenticate against login API endpoint using 'identifier' as expected by backend routes[cite: 21]
            const response = await fetch('http://127.0.0.1:5000/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ identifier, password })
            });

            const result = await response.json();

            if (!response.ok || result.status !== 'success') {
                throw new Error(result.message || 'Authentication failed. Invalid credentials.');
            }

            const token = result.access_token || result.data?.access_token;
            if (!token) {
                throw new Error('Access token missing from server response.');
            }

            // Save token securely in localStorage
            localStorage.setItem('access_token', token);

            // 2. Fetch user role and profile via /api/auth/me to determine precise role redirection
            const profileResponse = await fetch('http://127.0.0.1:5000/api/auth/me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            let userRole = 'staff'; // default fallback role
            if (profileResponse.ok) {
                const profileResult = await profileResponse.json();
                if (profileResult.status === 'success' && profileResult.data) {
                    userRole = (profileResult.data.role || 'staff').toLowerCase();
                }
            }

            // 3. Role-Based Navigation Routing
            console.log(`[Auth Terminal] Login successful. User role detected: ${userRole}`);

            if (userRole === 'admin') {
                window.location.replace('../dashboard/dashboard.html');
            } else if (userRole === 'manager') {
                window.location.replace('../manager/dashboard.html');
            } else if (userRole === 'cashier') {
                window.location.replace('../cashier/dashboard.html');
            } else {
                window.location.replace('../staff/dashboard.html');
            }

        } catch (err) {
            console.error("[Login Error]:", err);
            showError(err.message || 'Network error while communicating with authentication server.');
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').textContent = 'Authenticate Session';
        }
    });

    function showError(message) {
        if (errorBanner) {
            errorBanner.textContent = message;
            errorBanner.classList.remove('hidden');
        }
    }

    function hideError() {
        if (errorBanner) {
            errorBanner.textContent = '';
            errorBanner.classList.add('hidden');
        }
    }
});
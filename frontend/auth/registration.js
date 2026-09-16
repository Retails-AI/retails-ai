document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const formAlert = document.getElementById('formAlert');
    const submitBtn = document.getElementById('submitBtn');

    function showAlert(message, isSuccess = false) {
        formAlert.style.display = 'block';
        formAlert.textContent = message;
        formAlert.style.backgroundColor = isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        formAlert.style.color = isSuccess ? '#10b981' : '#ef4444';
        formAlert.style.border = `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`;
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formAlert.style.display = 'none';

        const fullName = document.getElementById('fullName').value.trim();
        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const role = document.getElementById('role').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validation checks
        if (password.length < 6) {
            showAlert('Password must be at least 6 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            showAlert('Passwords do not match.');
            return;
        }

        if (!role) {
            showAlert('Please select a valid role.');
            return;
        }

        const payload = {
            full_name: fullName,
            username: username,
            email: email,
            role: role,
            password: password
        };

        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Creating Account...';

        try {
            const response = await fetch('http://127.0.0.1:5000/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                showAlert('Account created successfully! Redirecting to login...', true);
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            } else {
                showAlert(result.message || 'Registration failed. Please try again.');
                submitBtn.disabled = false;
                submitBtn.querySelector('span').textContent = 'Create Account';
            }
        } catch (error) {
            console.error('Registration network error:', error);
            showAlert('Unable to connect to the backend server. Please check if the API is running.');
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'Create Account';
        }
    });
});
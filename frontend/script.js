document.addEventListener('DOMContentLoaded', () => {
    // Hamburger menu toggle for mobile viewports
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.querySelector('.nav-links');
    const navActions = document.querySelector('.nav-actions');

    if (hamburger) {
        hamburger.addEventListener('click', () => {
            // Toggle active states for mobile navigation display
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
            if (navLinks.style.display === 'flex') {
                navLinks.style.flexDirection = 'column';
                navLinks.style.position = 'absolute';
                navLinks.style.top = '100%';
                navLinks.style.left = '0';
                navLinks.style.width = '100%';
                navLinks.style.background = 'var(--bg-secondary)';
                navLinks.style.padding = '1.5rem';
                navLinks.style.borderBottom = '1px solid var(--border-color)';
            }
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // --- Landing Page to Login / Workspace Connection ---
    const navSignInBtn = document.getElementById('navSignInBtn');
    const heroLaunchBtn = document.getElementById('heroLaunchBtn');
    const navInitBtn = document.getElementById('navInitBtn');

    function handleAuthRedirect() {
        const token = localStorage.getItem('access_token');
        if (token) {
            // If token is already active, redirect directly to dashboard
            window.location.href = 'dashboard/dashboard.html'; 
        } else {
            // Otherwise redirect to the login/auth portal
            window.location.href = './auth/login.html'; 
        }
    }

    if (navSignInBtn) navSignInBtn.addEventListener('click', handleAuthRedirect);
    if (heroLaunchBtn) heroLaunchBtn.addEventListener('click', handleAuthRedirect);
    if (navInitBtn) navInitBtn.addEventListener('click', handleAuthRedirect);

    // Console confirmation log for frontend foundation readiness
    console.log("RetailAI Frontend Foundation initialized successfully.");
});
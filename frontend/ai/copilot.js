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

    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const chips = document.querySelectorAll('.chip');
    const backDashboardBtn = document.getElementById('backDashboardBtn');

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

    sendBtn.addEventListener('click', () => {
        const query = userInput.value.trim();
        if (query) submitQuery(query);
    });

    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = userInput.value.trim();
            if (query) submitQuery(query);
        }
    });

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const query = chip.getAttribute('data-question');
            submitQuery(query);
        });
    });

    async function submitQuery(question) {
        appendMessage(question, 'user-message');
        userInput.value = '';

        const loadingId = appendMessage('<i class="fa-solid fa-spinner fa-spin"></i> Analyzing business telemetry...', 'ai-message loading');

        try {
            const response = await fetch('http://127.0.0.1:5000/api/assistant/ask', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                // Sending both 'question' and 'query' to prevent key mismatch errors
                body: JSON.stringify({ question: question, query: question })
            });

            const result = await response.json();
            document.getElementById(loadingId).remove();

            if (response.ok && result.status === 'success') {
                const answerText = result.answer || result.data?.answer || result.response || "Processed query successfully.";
                appendAIMessage(formatAIResponse(answerText));
            } else {
                appendAIMessage(`Error: ${result.message || 'Unable to retrieve insights.'}`);
            }

        } catch (error) {
            document.getElementById(loadingId).remove();
            appendAIMessage("Failed to communicate with AI neural server.");
            console.error("Copilot API Error:", error);
        }
    }

    function formatAIResponse(rawText) {
        let formatted = rawText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\s\*\s/g, '<br>• ');
        formatted = formatted.replace(/\*\s/g, '<br>• ');
        formatted = formatted.replace(/\\n/g, '<br>');
        return formatted;
    }

    function appendMessage(htmlContent, className) {
        const msgDiv = document.createElement('div');
        const msgId = 'msg-' + Date.now();
        msgDiv.id = msgId;
        msgDiv.className = `message ${className}`;
        msgDiv.innerHTML = htmlContent;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return msgId;
    }

    function appendAIMessage(htmlContent) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ai-message';
        msgDiv.innerHTML = `
            <div class="msg-icon"><i class="fa-solid fa-robot"></i></div>
            <div class="msg-content">
                <strong>AI Assistant</strong>
                <div class="response-body">${htmlContent}</div>
            </div>
        `;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});
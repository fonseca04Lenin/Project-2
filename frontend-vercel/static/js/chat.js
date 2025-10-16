/**
 * AI Chatbot Frontend Integration
 * Handles chat interface, API communication, and real-time messaging
 */

class StockChatbot {
    constructor() {
        this.isOpen = false;
        this.isTyping = false;
        this.currentUser = null;
        this.messageHistory = [];
        this.rateLimitInfo = null;
        
        // DOM Elements
        this.chatWidget = null;
        this.chatToggleBtn = null;
        this.chatMessages = null;
        this.chatInput = null;
        this.chatSendBtn = null;
        this.typingIndicator = null;
        
        // API Configuration
        this.apiBaseUrl = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://stock-watchlist-backend-8bea295dd646.herokuapp.com';
        
        this.init();
    }
    
    init() {
        this.createChatInterface();
        this.setupEventListeners();
        this.checkAuthStatus();
        this.loadChatHistory();
    }
    
    createChatInterface() {
        // Create chat toggle button
        this.chatToggleBtn = document.createElement('button');
        this.chatToggleBtn.className = 'chat-toggle-btn';
        this.chatToggleBtn.innerHTML = '<i class="fas fa-robot"></i>';
        this.chatToggleBtn.title = 'Ask AI about stocks';
        document.body.appendChild(this.chatToggleBtn);
        
        // Create chat widget
        this.chatWidget = document.createElement('div');
        this.chatWidget.className = 'chat-widget';
        this.chatWidget.innerHTML = `
            <div class="chat-header">
                <h3>
                    <span class="ai-icon">🤖</span>
                    AI Stock Advisor
                </h3>
                <button class="chat-close-btn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="chat-messages" id="chatMessages">
                <div class="chat-welcome">
                    <h4>👋 Hi! I'm your AI Stock Advisor</h4>
                    <p>Ask me about stocks, your watchlist, or get investment advice. I have access to real-time market data!</p>
                </div>
            </div>
            <div class="chat-quick-actions">
                <button class="chat-quick-action" data-message="How is my watchlist performing?">📊 Watchlist Performance</button>
                <button class="chat-quick-action" data-message="What's the current price of AAPL?">💰 Stock Price</button>
                <button class="chat-quick-action" data-message="Should I buy more Apple stock?">💡 Investment Advice</button>
                <button class="chat-quick-action" data-message="Compare Apple vs Microsoft">⚖️ Compare Stocks</button>
            </div>
            <div class="chat-input-container">
                <div class="chat-input-wrapper">
                    <textarea class="chat-input" placeholder="Ask me about stocks..." rows="1"></textarea>
                    <button class="chat-send-btn" id="chatSendBtn">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(this.chatWidget);
        
        // Get references to elements
        this.chatMessages = this.chatWidget.querySelector('#chatMessages');
        this.chatInput = this.chatWidget.querySelector('.chat-input');
        this.chatSendBtn = this.chatWidget.querySelector('#chatSendBtn');
        this.typingIndicator = this.createTypingIndicator();
    }
    
    setupEventListeners() {
        // Toggle chat
        this.chatToggleBtn.addEventListener('click', () => this.toggleChat());
        
        // Close chat
        this.chatWidget.querySelector('.chat-close-btn').addEventListener('click', () => this.closeChat());
        
        // Send message
        this.chatSendBtn.addEventListener('click', () => this.sendMessage());
        
        // Send on Enter (but allow Shift+Enter for new lines)
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Auto-resize textarea
        this.chatInput.addEventListener('input', () => {
            this.autoResizeTextarea();
        });
        
        // Quick action buttons
        this.chatWidget.querySelectorAll('.chat-quick-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const message = e.target.getAttribute('data-message');
                this.chatInput.value = message;
                this.sendMessage();
            });
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.chatWidget.contains(e.target) && !this.chatToggleBtn.contains(e.target)) {
                this.closeChat();
            }
        });
    }
    
    checkAuthStatus() {
        // Check if user is authenticated (using existing auth system)
        if (typeof currentUser !== 'undefined' && currentUser) {
            this.currentUser = currentUser;
            this.updateChatStatus('online');
        } else {
            this.updateChatStatus('offline');
        }
    }
    
    toggleChat() {
        if (this.isOpen) {
            this.closeChat();
        } else {
            this.openChat();
        }
    }
    
    openChat() {
        this.isOpen = true;
        this.chatWidget.classList.add('open');
        this.chatToggleBtn.classList.add('chat-open');
        this.chatToggleBtn.innerHTML = '<i class="fas fa-times"></i>';
        
        // Focus input after animation
        setTimeout(() => {
            this.chatInput.focus();
        }, 300);
        
        // Load chat history if not already loaded
        if (this.messageHistory.length === 0) {
            this.loadChatHistory();
        }
    }
    
    closeChat() {
        this.isOpen = false;
        this.chatWidget.classList.remove('open');
        this.chatToggleBtn.classList.remove('chat-open');
        this.chatToggleBtn.innerHTML = '<i class="fas fa-robot"></i>';
    }
    
    autoResizeTextarea() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 100) + 'px';
    }
    
    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || this.isTyping) return;
        
        // Check authentication
        if (!this.currentUser) {
            this.showError('Please log in to use the AI advisor');
            return;
        }
        
        // Check rate limit
        if (this.rateLimitInfo && !this.rateLimitInfo.can_send) {
            this.showError('Rate limit exceeded. Please wait before sending another message.');
            return;
        }
        
        // Clear input and disable send button
        this.chatInput.value = '';
        this.autoResizeTextarea();
        this.setSendButtonState(true);
        
        // Add user message to chat
        this.addMessage(message, 'user');
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            // Send message to backend
            const response = await this.callChatAPI(message);
            
            // Remove typing indicator
            this.hideTypingIndicator();
            
            if (response.success) {
                // Add AI response to chat
                this.addMessage(response.response, 'ai');
                
                // Update rate limit info
                if (response.rate_limit) {
                    this.rateLimitInfo = response.rate_limit;
                }
            } else {
                this.showError(response.error || 'Failed to get response from AI');
            }
        } catch (error) {
            console.error('Chat API error:', error);
            this.hideTypingIndicator();
            this.showError('Failed to connect to AI service. Please try again.');
        }
        
        this.setSendButtonState(false);
    }
    
    async callChatAPI(message) {
        const token = await this.getAuthToken();
        
        const response = await fetch(`${this.apiBaseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    async getAuthToken() {
        // Get Firebase auth token
        if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
            return await firebase.auth().currentUser.getIdToken();
        }
        throw new Error('No authentication token available');
    }
    
    async loadChatHistory() {
        try {
            const token = await this.getAuthToken();
            
            const response = await fetch(`${this.apiBaseUrl}/api/chat/history`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.history.length > 0) {
                    this.messageHistory = data.history;
                    this.renderChatHistory();
                }
            }
        } catch (error) {
            console.log('Could not load chat history:', error);
        }
    }
    
    renderChatHistory() {
        // Clear welcome message
        const welcome = this.chatMessages.querySelector('.chat-welcome');
        if (welcome) {
            welcome.remove();
        }
        
        // Add historical messages
        this.messageHistory.forEach(msg => {
            this.addMessage(msg.content, msg.role === 'user' ? 'user' : 'ai', false);
        });
        
        // Scroll to bottom
        this.scrollToBottom();
    }
    
    addMessage(content, sender, animate = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}`;
        
        const avatar = sender === 'user' ? 
            (this.currentUser?.email?.charAt(0).toUpperCase() || 'U') : 
            '🤖';
        
        messageDiv.innerHTML = `
            <div class="chat-message-avatar">${avatar}</div>
            <div class="chat-message-content">${this.formatMessage(content)}</div>
        `;
        
        // Add to chat if not animating (for history)
        if (!animate) {
            this.chatMessages.appendChild(messageDiv);
            return;
        }
        
        // Animate new messages
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
        
        // Store in history
        this.messageHistory.push({
            role: sender,
            content: content,
            timestamp: new Date().toISOString()
        });
    }
    
    formatMessage(content) {
        // Format message with basic markdown-like styling
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>')
            .replace(/\$(\d+\.?\d*)/g, '<span class="price">$$$1</span>')
            .replace(/(\+|\-)(\d+\.?\d*%)/g, '<span class="$1 === "+" ? "gain" : "loss">$1$2</span>');
    }
    
    createTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="chat-message-avatar">🤖</div>
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        return indicator;
    }
    
    showTypingIndicator() {
        this.isTyping = true;
        this.chatMessages.appendChild(this.typingIndicator);
        this.scrollToBottom();
    }
    
    hideTypingIndicator() {
        this.isTyping = false;
        if (this.typingIndicator.parentNode) {
            this.typingIndicator.parentNode.removeChild(this.typingIndicator);
        }
    }
    
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'chat-error';
        errorDiv.textContent = message;
        this.chatMessages.appendChild(errorDiv);
        this.scrollToBottom();
        
        // Remove error after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
    
    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'chat-success';
        successDiv.textContent = message;
        this.chatMessages.appendChild(successDiv);
        this.scrollToBottom();
        
        // Remove success after 3 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 3000);
    }
    
    setSendButtonState(disabled) {
        this.chatSendBtn.disabled = disabled;
        if (disabled) {
            this.chatSendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        } else {
            this.chatSendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }
    
    updateChatStatus(status) {
        // Update chat header with status
        const header = this.chatWidget.querySelector('.chat-header h3');
        const statusSpan = header.querySelector('.chat-status') || document.createElement('span');
        
        if (!header.querySelector('.chat-status')) {
            statusSpan.className = `chat-status ${status}`;
            statusSpan.innerHTML = `
                <span class="chat-status-dot"></span>
                ${status === 'online' ? 'Online' : 'Offline'}
            `;
            header.appendChild(statusSpan);
        } else {
            statusSpan.className = `chat-status ${status}`;
            statusSpan.innerHTML = `
                <span class="chat-status-dot"></span>
                ${status === 'online' ? 'Online' : 'Offline'}
            `;
        }
    }
    
    scrollToBottom() {
        setTimeout(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, 100);
    }
    
    // Public method to check if chat is available
    isAvailable() {
        return this.currentUser !== null;
    }
    
    // Public method to show chat notification
    showNotification(message) {
        if (this.isAvailable()) {
            this.showSuccess(message);
        }
    }
}

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for main app to initialize
    setTimeout(() => {
        window.stockChatbot = new StockChatbot();
    }, 1000);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StockChatbot;
}

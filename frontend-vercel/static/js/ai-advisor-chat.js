/**
 * AI Investment Advisor Chat - Integrated Section
 * Handles the AI chat functionality within the main app section
 */

class AIAdvisorChat {
    constructor() {
        this.currentUser = null;
        this.messageHistory = [];
        this.isTyping = false;
        this.rateLimitInfo = null;
        
        // DOM Elements
        this.chatMessages = null;
        this.chatInput = null;
        this.chatSendBtn = null;
        this.statusBadge = null;
        this.typingIndicator = null;
        
        // API Configuration
        this.apiBaseUrl = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://stock-watchlist-backend-8bea295dd646.herokuapp.com';
        
        this.init();
    }
    
    init() {
        this.waitForElements();
        this.setupEventListeners();
        this.checkAuthStatus();
    }
    
    waitForElements() {
        // Wait for DOM elements to be available
        const checkElements = () => {
            this.chatMessages = document.getElementById('aiChatMessages');
            this.chatInput = document.getElementById('aiChatInput');
            this.chatSendBtn = document.getElementById('aiChatSendBtn');
            this.statusBadge = document.getElementById('aiStatusBadge');
            
            if (this.chatMessages && this.chatInput && this.chatSendBtn && this.statusBadge) {
                this.setupChatFunctionality();
                this.loadChatHistory();
            } else {
                setTimeout(checkElements, 100);
            }
        };
        
        checkElements();
    }
    
    setupChatFunctionality() {
        // Create typing indicator
        this.typingIndicator = this.createTypingIndicator();
        
        // Auto-resize textarea
        this.chatInput.addEventListener('input', () => {
            this.autoResizeTextarea();
        });
        
        // Send on Enter (but allow Shift+Enter for new lines)
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }
    
    setupEventListeners() {
        // Send message button
        document.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'aiChatSendBtn') {
                this.sendMessage();
            }
        });
        
        // Quick suggestion buttons
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('suggestion-btn')) {
                const message = e.target.getAttribute('data-message');
                if (this.chatInput) {
                    this.chatInput.value = message;
                    this.sendMessage();
                }
            }
        });
    }
    
    checkAuthStatus() {
        // Monitor auth state changes
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged((user) => {
                this.currentUser = user;
                this.updateStatus(user ? 'online' : 'offline');
                
                if (user && this.chatMessages) {
                    this.loadChatHistory();
                }
            });
        }
    }
    
    updateStatus(status) {
        if (!this.statusBadge) return;
        
        const statusDot = this.statusBadge.querySelector('.status-dot');
        const statusText = this.statusBadge.querySelector('.status-text');
        
        if (status === 'online') {
            statusDot.classList.remove('offline');
            statusText.textContent = 'Online';
            this.statusBadge.style.opacity = '1';
        } else {
            statusDot.classList.add('offline');
            statusText.textContent = 'Offline';
            this.statusBadge.style.opacity = '0.7';
        }
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
        if (!this.currentUser || !this.chatMessages) return;
        
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
        // Hide welcome message
        const welcome = this.chatMessages.querySelector('.ai-welcome-message');
        if (welcome) {
            welcome.style.display = 'none';
        }
        
        // Add class to indicate we have messages
        this.chatMessages.classList.add('has-messages');
        
        // Add historical messages
        this.messageHistory.forEach(msg => {
            this.addMessage(msg.content, msg.role === 'user' ? 'user' : 'ai', false);
        });
        
        // Scroll to bottom
        this.scrollToBottom();
    }
    
    addMessage(content, sender, animate = true) {
        // Hide welcome message on first message
        if (this.messageHistory.length === 0 && sender === 'user') {
            const welcome = this.chatMessages.querySelector('.ai-welcome-message');
            if (welcome) {
                welcome.style.display = 'none';
            }
            this.chatMessages.classList.add('has-messages');
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-chat-message ${sender}`;
        
        const avatar = sender === 'user' ? 
            (this.currentUser?.email?.charAt(0).toUpperCase() || 'U') : 
            '🤖';
        
        messageDiv.innerHTML = `
            <div class="ai-chat-message-avatar">${avatar}</div>
            <div class="ai-chat-message-content">${this.formatMessage(content)}</div>
        `;
        
        // Add to chat
        this.chatMessages.appendChild(messageDiv);
        
        if (animate) {
            this.scrollToBottom();
            
            // Store in history
            this.messageHistory.push({
                role: sender,
                content: content,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    formatMessage(content) {
        // Format message with basic styling
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>')
            .replace(/\$(\d+\.?\d*)/g, '<span class="price">$$$1</span>')
            .replace(/(\+|\-)(\d+\.?\d*%)/g, '<span class="$1 === "+" ? "gain" : "loss">$1$2</span>');
    }
    
    createTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'ai-typing-indicator';
        indicator.innerHTML = `
            <div class="ai-chat-message-avatar">🤖</div>
            <div class="ai-typing-dots">
                <div class="ai-typing-dot"></div>
                <div class="ai-typing-dot"></div>
                <div class="ai-typing-dot"></div>
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
        errorDiv.className = 'ai-chat-error';
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
        successDiv.className = 'ai-chat-success';
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
    
    autoResizeTextarea() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 100) + 'px';
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
    
    // Public method to show notification
    showNotification(message) {
        if (this.isAvailable()) {
            this.showSuccess(message);
        }
    }
}

// Initialize AI Advisor Chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for main app to initialize
    setTimeout(() => {
        window.aiAdvisorChat = new AIAdvisorChat();
    }, 1000);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIAdvisorChat;
}

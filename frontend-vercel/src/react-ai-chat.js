// React AI Investment Advisor Chat Component
// Sophisticated chatbot with elegant design matching the app's aesthetic

const { useState, useEffect, useRef } = React;

const AIAdvisorChat = () => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [rateLimitInfo, setRateLimitInfo] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    
    const messagesEndRef = useRef(null);
    const chatInputRef = useRef(null);
    const messagesContainerRef = useRef(null);

    // Initialize component
    useEffect(() => {
        // AI Advisor Chat component mounted
        
        // Set up authentication listener
        const authUnsubscribe = window.firebaseAuth?.onAuthStateChanged((user) => {
            setCurrentUser(user);
            if (user) {
                // User authenticated for AI chat
            } else {
                // User not authenticated for AI chat
                setMessages([]);
            }
        });

        // Test API connection on mount
        testAPIConnection();

        return () => {
            if (authUnsubscribe) authUnsubscribe();
        };
    }, []);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    // Auto-resize textarea
    useEffect(() => {
        if (chatInputRef.current) {
            chatInputRef.current.style.height = 'auto';
            chatInputRef.current.style.height = Math.min(chatInputRef.current.scrollHeight, 100) + 'px';
        }
    }, [inputValue]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const testAPIConnection = async () => {
        try {
            const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';
            const response = await fetch(`${API_BASE_URL}/api/health`);
            setIsOnline(response.ok);
        } catch (error) {
            console.error('API connection test failed:', error);
            setIsOnline(false);
        }
    };

    const sendMessage = async () => {
        const message = inputValue.trim();
        if (!message || isTyping || !currentUser) return;

        // Check rate limit
        if (rateLimitInfo && !rateLimitInfo.can_send) {
            showError('Rate limit exceeded. Please wait before sending another message.');
            return;
        }

        // Clear input and add user message
        setInputValue('');
        const userMessage = {
            id: Date.now(),
            type: 'user',
            content: message,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);
        setIsTyping(true);

        try {
            // Get auth headers
            const token = await currentUser.getIdToken();
            const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';

            const response = await fetch(`${API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-User-ID': currentUser.uid,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();
            setIsTyping(false);

            if (data.success) {
                const aiMessage = {
                    id: Date.now() + 1,
                    type: 'ai',
                    content: data.response,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, aiMessage]);

                // Update rate limit info
                if (data.rate_limit) {
                    setRateLimitInfo(data.rate_limit);
                }

                // Check if response is about adding/removing stocks and refresh watchlist
                const responseText = data.response.toLowerCase();
                if (responseText.includes('successfully added') || 
                    responseText.includes('successfully removed') ||
                    responseText.includes('added') && responseText.includes('watchlist') ||
                    responseText.includes('removed') && responseText.includes('watchlist')) {
                    // Dispatch watchlist change event to trigger refresh
                    const event = new CustomEvent('watchlistChanged', {
                        detail: { action: 'add' }
                    });
                    window.dispatchEvent(event);
                    
                    // Also call the refresh function if available
                    if (window.refreshWatchlist) {
                        setTimeout(() => window.refreshWatchlist(), 500);
                    }
                }
            } else {
                showError(data.error || data.response || 'Failed to get response from AI');
            }
        } catch (error) {
            console.error('Chat API error:', error);
            setIsTyping(false);
            showError(`Failed to connect to AI service: ${error.message}`);
        }
    };

    const showError = (message) => {
        const errorMessage = {
            id: Date.now(),
            type: 'error',
            content: message,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
    };

    const handleSuggestionClick = (suggestion) => {
        setInputValue(suggestion);
        chatInputRef.current?.focus();
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const quickSuggestions = [
        { text: "Analyze my portfolio performance", message: "Analyze my watchlist performance and show me which stocks are doing best" },
        { text: "🔍 Find stocks under $100", message: "What are some good stocks under $100 that I should consider?" },
        { text: "Compare AAPL vs MSFT vs GOOGL", message: "Compare Apple, Microsoft, and Google - which is the best investment right now?" },
        { text: "Show me stocks with big moves today", message: "Which stocks in my watchlist had the biggest price changes today?" },
        { text: "Suggest stocks to diversify", message: "What stocks should I add to diversify my portfolio?" },
        { text: "Latest news on my stocks", message: "Show me the latest news about stocks in my watchlist" }
    ];

    const formatMessage = (content) => {
        // Simple markdown-like formatting
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    };

    return (
        <div className="ai-advisor-chat-react">
            {/* Header */}
            <div className="ai-chat-header">
                <div className="ai-chat-title">
                    <div className="ai-robot-icon">
                        <i className="fas fa-robot"></i>
                    </div>
                    <h2>AI Investment Advisor</h2>
                </div>
                <div className="ai-status-indicator">
                    <span className="status-text">{isOnline ? 'Online' : 'Offline'}</span>
                </div>
            </div>

            {/* Messages Container */}
            <div className="ai-chat-messages-container" ref={messagesContainerRef}>
                {messages.length === 0 && (
                    <div className="ai-welcome-message">
                        <div className="ai-avatar">
                            <i className="fas fa-robot"></i>
                        </div>
                        <div className="welcome-content">
                            <h4>Hi! I'm your AI Investment Advisor</h4>
                            <p>Ask me about stocks, your watchlist performance, or get personalized investment advice. I have access to real-time market data!</p>
                            <div className="quick-suggestions">
                                {quickSuggestions.map((suggestion, index) => (
                                    <button
                                        key={index}
                                        className="suggestion-btn"
                                        onClick={() => handleSuggestionClick(suggestion.message)}
                                    >
                                        {suggestion.text}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {messages.map((message) => (
                    <div key={message.id} className={`ai-message ${message.type}`}>
                        <div className="message-avatar">
                            {message.type === 'user' ? (
                                <i className="fas fa-user"></i>
                            ) : message.type === 'error' ? (
                                <i className="fas fa-exclamation-triangle"></i>
                            ) : (
                                <i className="fas fa-robot"></i>
                            )}
                        </div>
                        <div className={`message-content ${message.type}`}>
                            <div 
                                className="message-text"
                                dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                            />
                            <div className="message-time">
                                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="ai-message ai typing">
                        <div className="message-avatar">
                            <i className="fas fa-robot"></i>
                        </div>
                        <div className="message-content ai typing-indicator">
                            <div className="typing-dots">
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Container */}
            <div className="ai-chat-input-container">
                <div className="input-wrapper">
                    <textarea
                        ref={chatInputRef}
                        className="ai-chat-input"
                        placeholder="Ask me about stocks, your portfolio, or get investment advice..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={isTyping || !currentUser}
                        rows={1}
                    />
                    <button
                        className="ai-send-btn"
                        onClick={sendMessage}
                        disabled={!inputValue.trim() || isTyping || !currentUser}
                    >
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </div>
                <div className="ai-disclaimer">
                    <i className="fas fa-info-circle"></i>
                    <span>This is general information, not personalized financial advice. Please consult with a financial advisor before making investment decisions.</span>
                </div>
            </div>
        </div>
    );
};

// Render the component
const aiChatContainer = document.getElementById('ai-advisor-chat-root');
if (aiChatContainer) {
    const root = ReactDOM.createRoot(aiChatContainer);
    root.render(<AIAdvisorChat />);
}

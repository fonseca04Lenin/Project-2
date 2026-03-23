// React AI Investment Advisor Chat Component

const { useState, useEffect, useRef, useCallback } = React;

const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';

const AIAdvisorChat = () => {
    const { currentUser } = window.AppAuth.useAuth();
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [rateLimitInfo, setRateLimitInfo] = useState(null);
    const [usageInfo, setUsageInfo] = useState(null);

    // Thread state
    const [threads, setThreads] = useState([]);
    const [currentThreadId, setCurrentThreadId] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [renamingThreadId, setRenamingThreadId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [loadingHistory, setLoadingHistory] = useState(false);

    const messagesEndRef = useRef(null);
    const chatInputRef = useRef(null);
    const renameInputRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        if (currentUser) {
            testAPIConnection(currentUser);
            loadThreads(currentUser);
            return;
        }
        setMessages([]);
        setThreads([]);
        setCurrentThreadId(null);
    }, [currentUser]);

    // Auto-scroll on new messages
    useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

    // Auto-resize textarea
    useEffect(() => {
        if (chatInputRef.current) {
            chatInputRef.current.style.height = 'auto';
            chatInputRef.current.style.height = Math.min(chatInputRef.current.scrollHeight, 100) + 'px';
        }
    }, [inputValue]);

    // Focus rename input when editing
    useEffect(() => {
        if (renamingThreadId && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [renamingThreadId]);

    const getAuthHeaders = async (user) => {
        const activeUser = user || currentUser;
        if (!activeUser) return { 'Content-Type': 'application/json' };
        const token = await activeUser.getIdToken();
        return {
            'Authorization': `Bearer ${token}`,
            'X-User-ID': activeUser.uid,
            'Content-Type': 'application/json',
        };
    };

    const testAPIConnection = async (user) => {
        try {
            const headers = await getAuthHeaders(user);
            const res = await fetch(`${API_BASE_URL}/api/chat/status`, { headers });
            if (!res.ok) { setIsOnline(false); return; }
            const data = await res.json();
            const canSend = data?.rate_limit?.can_send !== false;
            setRateLimitInfo(data.rate_limit || null);
            setIsOnline(data.success && data.status === 'available' && canSend);
            if (data.rate_limit) {
                setUsageInfo({ used: data.rate_limit.used_today || 0, limit: data.rate_limit.daily_limit, tier: data.rate_limit.tier || 'free' });
            }
        } catch (e) {
            setIsOnline(false);
        }
    };

    // ---- Thread management ----

    const loadThreads = async (user) => {
        try {
            const headers = await getAuthHeaders(user);
            const res = await fetch(`${API_BASE_URL}/api/chat/threads`, { headers });
            const data = await res.json();
            if (data.success) {
                const list = data.threads || [];
                setThreads(list);
                if (list.length > 0) {
                    await switchThread(list[0].thread_id, user);
                } else {
                    // No threads yet — create default
                    await createThread(user);
                }
            }
        } catch (e) {
            console.error('Failed to load threads', e);
        }
    };

    const createThread = async (user) => {
        try {
            const headers = await getAuthHeaders(user);
            const res = await fetch(`${API_BASE_URL}/api/chat/threads`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ title: 'New Chat' }),
            });
            const data = await res.json();
            if (data.success) {
                const thread = data.thread;
                setThreads(prev => [thread, ...prev]);
                setCurrentThreadId(thread.thread_id);
                setMessages([]);
            }
        } catch (e) {
            console.error('Failed to create thread', e);
        }
    };

    const switchThread = async (threadId, user) => {
        if (threadId === currentThreadId && !user) return;
        setCurrentThreadId(threadId);
        setLoadingHistory(true);
        try {
            const headers = await getAuthHeaders(user);
            const res = await fetch(`${API_BASE_URL}/api/chat/threads/${threadId}/history`, { headers });
            const data = await res.json();
            if (data.success) {
                const msgs = (data.history || []).map((m, i) => ({
                    id: i,
                    type: m.role === 'user' ? 'user' : 'ai',
                    content: m.content,
                    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
                }));
                setMessages(msgs);
            }
        } catch (e) {
            console.error('Failed to load thread history', e);
        } finally {
            setLoadingHistory(false);
        }
    };

    const deleteThread = async (threadId, e) => {
        e.stopPropagation();
        try {
            const headers = await getAuthHeaders();
            await fetch(`${API_BASE_URL}/api/chat/threads/${threadId}`, { method: 'DELETE', headers });
            const newList = threads.filter(t => t.thread_id !== threadId);
            setThreads(newList);
            if (currentThreadId === threadId) {
                if (newList.length > 0) {
                    await switchThread(newList[0].thread_id);
                } else {
                    await createThread();
                }
            }
        } catch (e) {
            console.error('Failed to delete thread', e);
        }
    };

    const startRename = (threadId, currentTitle, e) => {
        e.stopPropagation();
        setRenamingThreadId(threadId);
        setRenameValue(currentTitle);
    };

    const commitRename = async (threadId) => {
        const title = renameValue.trim();
        setRenamingThreadId(null);
        if (!title) return;
        try {
            const headers = await getAuthHeaders();
            await fetch(`${API_BASE_URL}/api/chat/threads/${threadId}`, {
                method: 'PATCH', headers, body: JSON.stringify({ title }),
            });
            setThreads(prev => prev.map(t => t.thread_id === threadId ? { ...t, title } : t));
        } catch (e) {
            console.error('Failed to rename thread', e);
        }
    };

    // ---- Messaging ----

    const sendMessage = async () => {
        const message = inputValue.trim();
        if (!message || isTyping) return;

        if (!currentUser) {
            setMessages(prev => [...prev,
                { id: Date.now() - 1, type: 'user', content: message, timestamp: new Date() },
                { id: Date.now(), type: 'assistant', content: 'Sign in to use the AI chat advisor.', timestamp: new Date() }
            ]);
            setInputValue('');
            return;
        }

        if (rateLimitInfo && !rateLimitInfo.can_send) {
            const reason = `You've used all ${rateLimitInfo.daily_limit} free AI messages for today. Upgrade to Pro for 50 messages/day.`;
            if (window.showUpgradeModal) window.showUpgradeModal(reason);
            else showError(reason);
            return;
        }

        setInputValue('');
        const userMessage = { id: Date.now(), type: 'user', content: message, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setIsTyping(true);

        // If the thread title is still 'New Chat', update it after sending
        const isFirstMessage = messages.length === 0;

        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ message, thread_id: currentThreadId }),
            });

            const data = await response.json();
            setIsTyping(false);

            if (data.success) {
                const aiMessage = { id: Date.now() + 1, type: 'ai', content: data.response, timestamp: new Date() };
                setMessages(prev => [...prev, aiMessage]);

                // Auto-update thread title from first message
                if (isFirstMessage && currentThreadId) {
                    const autoTitle = message.length > 40 ? message.slice(0, 40) + '...' : message;
                    setThreads(prev => prev.map(t =>
                        t.thread_id === currentThreadId && t.title === 'New Chat'
                            ? { ...t, title: autoTitle, preview: message.slice(0, 80), last_updated: new Date().toISOString() }
                            : t
                    ));
                } else if (currentThreadId) {
                    setThreads(prev => prev.map(t =>
                        t.thread_id === currentThreadId
                            ? { ...t, preview: message.slice(0, 80), last_updated: new Date().toISOString() }
                            : t
                    ));
                }

                if (data.usage) {
                    setUsageInfo(data.usage);
                    const { used, limit, tier } = data.usage;
                    if (tier === 'free' && limit !== null && used === limit - 1) {
                        setRateLimitInfo(prev => ({ ...(prev || {}), can_send: true, used_today: used, daily_limit: limit }));
                    }
                    if (limit !== null && used >= limit) {
                        setRateLimitInfo(prev => ({ ...(prev || {}), can_send: false, used_today: used, daily_limit: limit, tier }));
                        setIsOnline(false);
                    }
                }
                if (data.rate_limit) {
                    setRateLimitInfo(data.rate_limit);
                    if (data.rate_limit.can_send === false) setIsOnline(false);
                }

                const responseText = data.response.toLowerCase();
                if (responseText.includes('successfully added') || responseText.includes('successfully removed') ||
                    (responseText.includes('added') && responseText.includes('watchlist')) ||
                    (responseText.includes('removed') && responseText.includes('watchlist'))) {
                    window.dispatchEvent(new CustomEvent('watchlistChanged', { detail: { action: 'add' } }));
                    if (window.refreshWatchlist) setTimeout(() => window.refreshWatchlist(), 500);
                }
            } else {
                if (data.error === 'daily_limit_reached' || response.status === 429) {
                    const reason = data.message || `You've used all your free AI messages for today. Upgrade for more.`;
                    if (data.usage) setUsageInfo(data.usage);
                    setRateLimitInfo(prev => ({ ...(prev || {}), can_send: false }));
                    setIsOnline(false);
                    if (window.showUpgradeModal) window.showUpgradeModal(reason);
                    else showError(reason);
                    return;
                }
                const errMsg = data.error || data.response || 'Failed to get response from AI';
                showError(errMsg);
                const lower = String(errMsg).toLowerCase();
                if (lower.includes('ai service unavailable') || lower.includes('quota') || lower.includes('usage limit')) setIsOnline(false);
            }
        } catch (error) {
            setIsTyping(false);
            showError(`Failed to connect to AI service: ${error.message}`);
        }
    };

    const showError = (message) => {
        setMessages(prev => [...prev, { id: Date.now(), type: 'error', content: message, timestamp: new Date() }]);
    };

    const handleSuggestionClick = (suggestion) => {
        setInputValue(suggestion);
        chatInputRef.current?.focus();
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    const quickSuggestions = [
        { text: "Analyze my portfolio", message: "Analyze my watchlist performance and show me which stocks are doing best" },
        { text: "Find stocks under $100", message: "What are some good stocks under $100 that I should consider?" },
        { text: "Compare AAPL vs MSFT vs GOOGL", message: "Compare Apple, Microsoft, and Google - which is the best investment right now?" },
        { text: "Biggest movers today", message: "Which stocks in my watchlist had the biggest price changes today?" },
        { text: "Diversification ideas", message: "What stocks should I add to diversify my portfolio?" },
        { text: "Latest news on my stocks", message: "Show me the latest news about stocks in my watchlist" }
    ];

    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    };

    const formatMessage = (content) => {
        const escaped = escapeHtml(content);
        return escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    };

    const formatThreadDate = (iso) => {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const now = new Date();
            const diffMs = now - d;
            const diffDays = Math.floor(diffMs / 86400000);
            if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        } catch { return ''; }
    };

    const currentThread = threads.find(t => t.thread_id === currentThreadId);

    return (
        <div className="ai-advisor-chat-react">
            {/* Thread Sidebar */}
            <div className={`chat-thread-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
                <div className="sidebar-header">
                    <button className="new-thread-btn" onClick={() => createThread()} title="New Chat">
                        <i className="fas fa-plus"></i>
                        {sidebarOpen && <span>New Chat</span>}
                    </button>
                    <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? 'Collapse' : 'Expand'}>
                        <i className={`fas fa-chevron-${sidebarOpen ? 'left' : 'right'}`}></i>
                    </button>
                </div>

                {sidebarOpen && (
                    <div className="thread-list">
                        {threads.length === 0 && (
                            <div className="thread-list-empty">No conversations yet</div>
                        )}
                        {threads.map(thread => (
                            <div
                                key={thread.thread_id}
                                className={`thread-item ${thread.thread_id === currentThreadId ? 'active' : ''}`}
                                onClick={() => switchThread(thread.thread_id)}
                            >
                                {renamingThreadId === thread.thread_id ? (
                                    <input
                                        ref={renameInputRef}
                                        className="thread-rename-input"
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onBlur={() => commitRename(thread.thread_id)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') commitRename(thread.thread_id);
                                            if (e.key === 'Escape') setRenamingThreadId(null);
                                        }}
                                        onClick={e => e.stopPropagation()}
                                    />
                                ) : (
                                    <>
                                        <div className="thread-item-body">
                                            <div className="thread-title">{thread.title || 'New Chat'}</div>
                                            {thread.preview && <div className="thread-preview">{thread.preview}</div>}
                                        </div>
                                        <div className="thread-meta">
                                            <span className="thread-date">{formatThreadDate(thread.last_updated)}</span>
                                            <div className="thread-actions">
                                                <button className="thread-action-btn" title="Rename"
                                                    onClick={e => startRename(thread.thread_id, thread.title || 'New Chat', e)}>
                                                    <i className="fas fa-pen"></i>
                                                </button>
                                                <button className="thread-action-btn delete" title="Delete"
                                                    onClick={e => deleteThread(thread.thread_id, e)}>
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Main Chat Area */}
            <div className="chat-main-area">
                {/* Header */}
                <div className="ai-chat-header">
                    <div className="ai-chat-title">
                        <div className="ai-robot-icon"><i className="fas fa-robot"></i></div>
                        <h2>{currentThread ? currentThread.title : 'AI Investment Advisor'}</h2>
                    </div>
                    <div className="ai-status-indicator">
                        <span className="status-text">{isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                </div>

                {/* Messages Container */}
                <div className="ai-chat-messages-container">
                    {loadingHistory && (
                        <div className="history-loading">
                            <i className="fas fa-circle-notch fa-spin"></i> Loading conversation...
                        </div>
                    )}

                    {!loadingHistory && messages.length === 0 && (
                        <div className="ai-welcome-message">
                            <div className="ai-avatar"><i className="fas fa-robot"></i></div>
                            <div className="welcome-content">
                                <h4>Hi! I'm your AI Investment Advisor</h4>
                                <p>Ask me about stocks, your watchlist performance, or get personalized investment advice. I have access to real-time market data!</p>
                                <div className="quick-suggestions">
                                    {quickSuggestions.map((suggestion, index) => (
                                        <button key={index} className="suggestion-btn"
                                            onClick={() => handleSuggestionClick(suggestion.message)}>
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
                                {message.type === 'user' ? <i className="fas fa-user"></i>
                                    : message.type === 'error' ? <i className="fas fa-exclamation-triangle"></i>
                                    : <i className="fas fa-robot"></i>}
                            </div>
                            <div className={`message-content ${message.type}`}>
                                <div className="message-text"
                                    dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }} />
                                <div className="message-time">
                                    {message.timestamp instanceof Date
                                        ? message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : ''}
                                </div>
                            </div>
                        </div>
                    ))}

                    {isTyping && (
                        <div className="ai-message ai typing">
                            <div className="message-avatar"><i className="fas fa-robot"></i></div>
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

                {/* Daily Usage Bar */}
                {usageInfo && usageInfo.limit !== null && usageInfo.tier === 'free' && (
                    <div className="ai-daily-usage-bar">
                        <div className="usage-bar-track">
                            <div className="usage-bar-fill"
                                style={{ width: `${Math.min((usageInfo.used / usageInfo.limit) * 100, 100)}%` }}></div>
                        </div>
                        <div className="usage-bar-label">
                            <span>{usageInfo.used}/{usageInfo.limit} free messages today</span>
                            {usageInfo.used >= usageInfo.limit ? (
                                <button className="usage-upgrade-btn"
                                    onClick={() => window.showUpgradeModal && window.showUpgradeModal('Upgrade to Pro for 50 messages/day.')}>
                                    Upgrade for more
                                </button>
                            ) : usageInfo.used >= usageInfo.limit - 1 ? (
                                <button className="usage-upgrade-btn warning"
                                    onClick={() => window.showUpgradeModal && window.showUpgradeModal('You have 1 message left today. Upgrade to Pro for 50 messages/day.')}>
                                    1 left — Upgrade
                                </button>
                            ) : null}
                        </div>
                    </div>
                )}

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
                        <button className="ai-send-btn" onClick={sendMessage}
                            disabled={!inputValue.trim() || isTyping || !currentUser}>
                            <i className="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    <div className="ai-disclaimer">
                        <i className="fas fa-info-circle"></i>
                        <span>General information only — not personalized financial advice.</span>
                    </div>
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

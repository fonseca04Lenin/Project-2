export {};

const { useState, useEffect, useRef, useCallback, useMemo } = React;

function routeTo(path: string, state?: Record<string, unknown>, replace?: boolean): void {
    window.dispatchEvent(new CustomEvent('app:navigate', {
        detail: { path, state: state || {}, replace: !!replace }
    }));
}
function getCurrentUser(): FirebaseUser | null {
    return window.AppAuth?.getCurrentUser ? window.AppAuth.getCurrentUser() : null;
}
function getAuthHeaders(user?: FirebaseUser | null): Promise<Record<string, string>> {
    return window.AppAuth?.getAuthHeaders ? window.AppAuth.getAuthHeaders(user) : Promise.resolve({});
}

interface Thread {
    thread_id: string;
    title?: string;
    preview?: string;
    last_updated?: string;
}
interface Message {
    id: number;
    type: 'user' | 'ai' | 'error';
    content: string;
    timestamp: Date;
}
interface RateLimitInfo {
    can_send: boolean;
}

const AI_ASSISTANT_WELCOME = `Here's what I can do for you:

• Get real-time stock prices and data
• Analyze your watchlist performance
• Add or remove stocks from your watchlist
• Compare stocks side by side
• Answer questions about companies, earnings, and market trends
• Search the web for the latest news and current events

Just type naturally — try "How is NVDA doing?" or "Add Apple to my watchlist" or "What's happening with oil prices today?"`;

const AIAssistantView = () => {
    const { currentUser } = window.AppAuth.useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
    const [showInfoModal, setShowInfoModal] = useState(false);

    const [threads, setThreads] = useState<Thread[]>([]);
    const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);

    const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    useEffect(() => {
        if (renamingThreadId && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [renamingThreadId]);

    useEffect(() => {
        const hasVisited = localStorage.getItem('ai_assistant_visited');
        if (!hasVisited) {
            setShowInfoModal(true);
            localStorage.setItem('ai_assistant_visited', '1');
        }
    }, []);

    useEffect(() => {
        if (currentUser) {
            loadThreads(currentUser);
            return;
        }
        setMessages([]);
        setThreads([]);
        setCurrentThreadId(null);
    }, [currentUser]);

    const getHeaders = async (user?: FirebaseUser | null): Promise<Record<string, string>> => {
        const u = user || currentUser;
        if (!u) return { 'Content-Type': 'application/json' };
        const token = await u.getIdToken();
        return { 'Authorization': `Bearer ${token}`, 'X-User-ID': u.uid, 'Content-Type': 'application/json' };
    };

    const loadThreads = async (user?: FirebaseUser | null) => {
        try {
            const headers = await getHeaders(user);
            const res = await fetch(`${API_BASE}/api/chat/threads`, { headers });
            const data = await res.json();
            if (data.success) {
                const list: Thread[] = data.threads || [];
                setThreads(list);
                if (list.length > 0) {
                    await switchThread(list[0].thread_id, user);
                } else {
                    await createThread(user);
                }
            }
        } catch (e) { console.error('loadThreads error', e); }
    };

    const createThread = async (user?: FirebaseUser | null) => {
        try {
            const headers = await getHeaders(user);
            const res = await fetch(`${API_BASE}/api/chat/threads`, {
                method: 'POST', headers, body: JSON.stringify({ title: 'New Chat' })
            });
            const data = await res.json();
            if (data.success) {
                setThreads(prev => [data.thread, ...prev]);
                setCurrentThreadId(data.thread.thread_id);
                setMessages([]);
            }
        } catch (e) { console.error('createThread error', e); }
    };

    const switchThread = async (threadId: string, user?: FirebaseUser | null) => {
        setCurrentThreadId(threadId);
        setLoadingHistory(true);
        try {
            const headers = await getHeaders(user);
            const res = await fetch(`${API_BASE}/api/chat/threads/${threadId}/history`, { headers });
            const data = await res.json();
            if (data.success) {
                const msgs: Message[] = (data.history || []).map((m: { role: string; content: string; timestamp?: string }, i: number) => ({
                    id: i,
                    type: m.role === 'user' ? 'user' : 'ai',
                    content: m.content,
                    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
                }));
                setMessages(msgs);
            }
        } catch (e) { console.error('switchThread error', e); }
        finally { setLoadingHistory(false); }
    };

    const deleteThread = async (threadId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const headers = await getHeaders();
            await fetch(`${API_BASE}/api/chat/threads/${threadId}`, { method: 'DELETE', headers });
            const newList = threads.filter(t => t.thread_id !== threadId);
            setThreads(newList);
            if (currentThreadId === threadId) {
                if (newList.length > 0) await switchThread(newList[0].thread_id);
                else await createThread();
            }
        } catch (e) { console.error('deleteThread error', e); }
    };

    const startRename = (threadId: string, currentTitle: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setRenamingThreadId(threadId);
        setRenameValue(currentTitle);
    };

    const commitRename = async (threadId: string) => {
        const title = renameValue.trim();
        setRenamingThreadId(null);
        if (!title) return;
        try {
            const headers = await getHeaders();
            await fetch(`${API_BASE}/api/chat/threads/${threadId}`, {
                method: 'PATCH', headers, body: JSON.stringify({ title })
            });
            setThreads(prev => prev.map(t => t.thread_id === threadId ? { ...t, title } : t));
        } catch (e) { console.error('renameThread error', e); }
    };

    const formatThreadDate = (iso?: string): string => {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const now = new Date();
            const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
            if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        } catch { return ''; }
    };

    const showError = (message: string) => {
        const errorMessage: Message = {
            id: Date.now(),
            type: 'error',
            content: message,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
    };

    const sendMessage = async () => {
        const message = inputValue.trim();
        if (!message || isTyping || !currentUser) return;

        if (rateLimitInfo && !rateLimitInfo.can_send) {
            showError('Rate limit exceeded. Please wait before sending another message.');
            return;
        }

        const isFirstMessage = messages.length === 0;
        setInputValue('');
        setMessages(prev => [...prev, { id: Date.now(), type: 'user', content: message, timestamp: new Date() }]);
        setIsTyping(true);

        try {
            const headers = await getHeaders();
            const response = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ message, thread_id: currentThreadId })
            });

            const data = await response.json();
            setIsTyping(false);

            if (data.success) {
                setMessages(prev => [...prev, { id: Date.now() + 1, type: 'ai', content: data.response, timestamp: new Date() }]);

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

                if (data.rate_limit) {
                    setRateLimitInfo(data.rate_limit);
                }

                const responseText = (data.response as string).toLowerCase();
                if (responseText.includes('successfully added') ||
                    responseText.includes('successfully removed') ||
                    responseText.includes('added') && responseText.includes('watchlist') ||
                    responseText.includes('removed') && responseText.includes('watchlist')) {
                    window.dispatchEvent(new CustomEvent('watchlistChanged', { detail: { action: 'add' } }));
                }
            } else {
                showError(data.error || data.response || 'Failed to get response from AI');
            }
        } catch (error) {
            setIsTyping(false);
            showError(`Failed to connect to AI service: ${(error as Error).message}`);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const quickPrompts = [
        { icon: "fa-chart-line", text: "Analyze my watchlist" },
        { icon: "fa-search-dollar", text: "What stocks should I buy?" },
        { icon: "fa-microchip", text: "Tech sector outlook" },
        { icon: "fa-balance-scale", text: "Compare AAPL vs MSFT" }
    ];

    const currentThread = threads.find(t => t.thread_id === currentThreadId);

    return (
        <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

            {/* ── Thread Sidebar ── */}
            <div style={{
                width: sidebarOpen ? '220px' : '48px',
                minWidth: sidebarOpen ? '220px' : '48px',
                background: 'rgba(14, 16, 22, 0.95)',
                borderRight: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                transition: 'width 0.2s ease, min-width 0.2s ease',
                overflow: 'hidden',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <button
                        onClick={() => createThread()}
                        title="New Chat"
                        style={{
                            flex: sidebarOpen ? 1 : 0,
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: 'rgba(0,217,36,0.12)', border: '1px solid rgba(0,217,36,0.25)',
                            borderRadius: '6px', color: '#00D924', fontSize: '12px', fontWeight: '600',
                            padding: sidebarOpen ? '6px 10px' : '6px', cursor: 'pointer',
                            whiteSpace: 'nowrap', overflow: 'hidden', justifyContent: 'center',
                        }}
                    >
                        <i className="fas fa-plus"></i>
                        {sidebarOpen && <span>New Chat</span>}
                    </button>
                    <button
                        onClick={() => setSidebarOpen(o => !o)}
                        title={sidebarOpen ? 'Collapse' : 'Expand'}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '6px', borderRadius: '4px', fontSize: '11px', flexShrink: 0 }}
                    >
                        <i className={`fas fa-chevron-${sidebarOpen ? 'left' : 'right'}`}></i>
                    </button>
                </div>

                {sidebarOpen && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                        {threads.length === 0 && (
                            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', textAlign: 'center', padding: '20px 12px', margin: 0 }}>
                                No conversations yet
                            </p>
                        )}
                        {threads.map(thread => (
                            <div
                                key={thread.thread_id}
                                onClick={() => thread.thread_id !== currentThreadId && switchThread(thread.thread_id)}
                                style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '6px',
                                    padding: '8px 10px', cursor: 'pointer', borderRadius: '6px',
                                    margin: '1px 6px', minHeight: '44px',
                                    background: thread.thread_id === currentThreadId
                                        ? 'rgba(0,217,36,0.08)'
                                        : hoveredThreadId === thread.thread_id ? 'rgba(255,255,255,0.04)' : 'transparent',
                                    borderLeft: thread.thread_id === currentThreadId ? '2px solid #00D924' : '2px solid transparent',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={() => setHoveredThreadId(thread.thread_id)}
                                onMouseLeave={() => setHoveredThreadId(null)}
                            >
                                {renamingThreadId === thread.thread_id ? (
                                    <input
                                        ref={renameInputRef}
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onBlur={() => commitRename(thread.thread_id)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') commitRename(thread.thread_id);
                                            if (e.key === 'Escape') setRenamingThreadId(null);
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            width: '100%', background: 'rgba(255,255,255,0.08)',
                                            border: '1px solid #00D924', borderRadius: '4px',
                                            color: '#fff', fontSize: '12px', padding: '3px 6px', outline: 'none'
                                        }}
                                    />
                                ) : (
                                    <>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '12px', fontWeight: '500', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.3' }}>
                                                {thread.title || 'New Chat'}
                                            </div>
                                            {thread.preview && (
                                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px', lineHeight: '1.3' }}>
                                                    {thread.preview}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap', display: (hoveredThreadId === thread.thread_id || currentThreadId === thread.thread_id) ? 'none' : 'block' }}>
                                                {formatThreadDate(thread.last_updated)}
                                            </span>
                                            <div style={{ display: (hoveredThreadId === thread.thread_id || currentThreadId === thread.thread_id) ? 'flex' : 'none', gap: '2px' }}>
                                                <button onClick={e => startRename(thread.thread_id, thread.title || 'New Chat', e)}
                                                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '2px 4px', borderRadius: '3px', fontSize: '10px' }}
                                                    onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                                                    title="Rename"><i className="fas fa-pen"></i></button>
                                                <button onClick={e => deleteThread(thread.thread_id, e)}
                                                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '2px 4px', borderRadius: '3px', fontSize: '10px' }}
                                                    onMouseEnter={e => e.currentTarget.style.color = '#ff6b6b'}
                                                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                                                    title="Delete"><i className="fas fa-trash"></i></button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Main chat area ── */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minWidth: 0,
                maxWidth: '860px',
                margin: '0 auto',
                padding: '2rem',
                overflow: 'hidden',
            }}>

            {showInfoModal && (
                <div
                    onClick={() => setShowInfoModal(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.6)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#1a1a2e', border: '1px solid rgba(0,217,36,0.25)',
                            borderRadius: '16px', padding: '2rem', maxWidth: '420px', width: '100%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                                background: 'linear-gradient(135deg, #00D924, #00a81c)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <i className="fas fa-robot" style={{ color: '#fff', fontSize: '1rem' }}></i>
                            </div>
                            <h3 style={{ color: '#fff', fontWeight: '700', fontSize: '1.1rem', margin: 0 }}>
                                AI Stock Assistant
                            </h3>
                        </div>
                        <p style={{
                            color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem',
                            lineHeight: '1.8', whiteSpace: 'pre-line', margin: '0 0 1.5rem'
                        }}>
                            {AI_ASSISTANT_WELCOME}
                        </p>
                        <button
                            onClick={() => setShowInfoModal(false)}
                            style={{
                                width: '100%', padding: '0.75rem',
                                background: 'linear-gradient(135deg, #00D924, #00a81c)',
                                border: 'none', borderRadius: '8px', color: '#fff',
                                fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer'
                            }}
                        >
                            Got it
                        </button>
                    </div>
                </div>
            )}

            <div style={{
                flex: 1,
                overflowY: 'auto',
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
            }}>
                <div style={{ textAlign: 'center', padding: '1rem 0 0.5rem', flexShrink: 0 }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #00D924, #00a81c)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 0.5rem',
                        boxShadow: '0 4px 12px rgba(0, 217, 36, 0.25)'
                    }}>
                        <i className="fas fa-robot" style={{ fontSize: '1rem', color: '#fff' }}></i>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#fff', margin: 0 }}>
                            {currentThread && currentThread.title !== 'New Chat' ? currentThread.title : 'AI Stock Assistant'}
                        </h2>
                        <button
                            onClick={() => setShowInfoModal(true)}
                            title="How it works"
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem',
                                padding: '0', lineHeight: 1, transition: 'color 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#00D924'}
                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
                        >
                            <i className="fas fa-info-circle"></i>
                        </button>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', margin: '0.25rem 0 0' }}>
                        Ask about markets, stocks, or your watchlist
                    </p>
                </div>

                {loadingHistory && (
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '13px', padding: '40px 0' }}>
                        <i className="fas fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i>Loading conversation...
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} style={{
                        display: 'flex',
                        justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start'
                    }}>
                        <div style={{
                            maxWidth: '80%',
                            padding: '1rem 1.25rem',
                            borderRadius: msg.type === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            background: msg.type === 'user'
                                ? 'linear-gradient(135deg, #00D924, #00a81c)'
                                : msg.type === 'error'
                                ? 'rgba(255, 107, 53, 0.15)'
                                : 'rgba(255, 255, 255, 0.08)',
                            color: msg.type === 'user' ? '#fff' : msg.type === 'error' ? '#FF6B35' : 'rgba(255, 255, 255, 0.9)',
                            fontSize: '0.9375rem',
                            lineHeight: '1.5',
                            boxShadow: msg.type === 'user' ? '0 4px 12px rgba(0, 217, 36, 0.2)' : 'none'
                        }}>
                            {msg.type === 'ai' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <i className="fas fa-robot" style={{ color: '#00D924', fontSize: '0.75rem' }}></i>
                                    <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)' }}>AI Assistant</span>
                                </div>
                            )}
                            {(() => {
                                if (msg.type !== 'ai') {
                                    return <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>;
                                }
                                const citations: Record<string, string> = {};
                                const citationRegex = /\[{1,2}(\d+)\]{1,2}\((https?:\/\/[^)]+)\)/g;
                                let m: RegExpExecArray | null;
                                while ((m = citationRegex.exec(msg.content)) !== null) {
                                    citations[m[1]] = m[2];
                                }
                                const cleanText = msg.content.replace(/\[{1,2}(\d+)\]{1,2}\((https?:\/\/[^)]+)\)/g, '').replace(/\s{2,}/g, ' ').trim();
                                const citationEntries = Object.entries(citations).sort((a, b) => Number(a[0]) - Number(b[0]));
                                return (
                                    <>
                                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{cleanText}</p>
                                        {citationEntries.length > 0 && (
                                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sources</span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                    {citationEntries.map(([num, url]) => (
                                                        <a key={num} href={url} target="_blank" rel="noopener noreferrer" style={{
                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            width: '16px', height: '16px', borderRadius: '50%',
                                                            background: 'rgba(0,217,36,0.07)', border: '1px solid rgba(0,217,36,0.18)',
                                                            color: 'rgba(0,217,36,0.6)', fontSize: '0.55rem', fontWeight: '600',
                                                            textDecoration: 'none', flexShrink: 0
                                                        }}>{num}</a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderRadius: '16px 16px 16px 4px',
                            background: 'rgba(255, 255, 255, 0.08)'
                        }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00D924', animation: 'pulse 1.4s infinite', animationDelay: '0s' }}></span>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00D924', animation: 'pulse 1.4s infinite', animationDelay: '0.2s' }}></span>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00D924', animation: 'pulse 1.4s infinite', animationDelay: '0.4s' }}></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {messages.length === 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '0.75rem',
                    marginBottom: '1.5rem'
                }}>
                    {quickPrompts.map((prompt, index) => (
                        <button
                            key={index}
                            onClick={() => setInputValue(prompt.text)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '1rem 1.25rem',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '12px',
                                color: 'rgba(255, 255, 255, 0.8)',
                                fontSize: '0.875rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                textAlign: 'left'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = 'rgba(0, 217, 36, 0.1)';
                                e.currentTarget.style.borderColor = 'rgba(0, 217, 36, 0.3)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                            }}
                        >
                            <i className={`fas ${prompt.icon}`} style={{ color: '#00D924', fontSize: '1rem' }}></i>
                            <span>{prompt.text}</span>
                        </button>
                    ))}
                </div>
            )}

            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '16px',
                transition: 'all 0.2s ease'
            }}>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask about stocks, markets, or your portfolio..."
                    disabled={!currentUser}
                    style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: '#fff',
                        fontSize: '0.9375rem',
                        padding: '0.5rem'
                    }}
                />
                <button
                    onClick={sendMessage}
                    disabled={!inputValue.trim() || isTyping || !currentUser}
                    style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        background: inputValue.trim() && !isTyping ? 'linear-gradient(135deg, #00D924, #00a81c)' : 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        color: inputValue.trim() && !isTyping ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                        cursor: inputValue.trim() && !isTyping ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <i className="fas fa-paper-plane" style={{ fontSize: '0.875rem' }}></i>
                </button>
            </div>

            {!currentUser && (
                <p style={{
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.4)',
                    fontSize: '0.8125rem',
                    marginTop: '1rem'
                }}>
                    <i className="fas fa-lock" style={{ marginRight: '0.5rem' }}></i>
                    Sign in to chat with the AI assistant
                </p>
            )}

            <style>{`
                @keyframes pulse {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
                    40% { transform: scale(1); opacity: 1; }
                }
            `}</style>
            </div>
        </div>
    );
};

window.AIAssistantView = AIAssistantView;

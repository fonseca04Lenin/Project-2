// Modern Financial Dashboard Redesign - Concept Prototype
const { useState, useEffect, useRef } = React;

const DashboardRedesign = () => {
    const [activeView, setActiveView] = useState('overview');
    const [watchlistData, setWatchlistData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadWatchlistData();
    }, []);

    const loadWatchlistData = async () => {
        try {
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            
            const response = await fetch(`${API_BASE}/api/watchlist?t=${Date.now()}`, {
                method: 'GET',
                headers: authHeaders,
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setWatchlistData(data || []);
            }
        } catch (error) {
            setWatchlistData([]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="dashboard-redesign">
            {/* Top Navigation Bar */}
            <header className="dashboard-header">
                <div className="header-left">
                    <h1 className="logo">
                        <i className="fas fa-chart-line"></i> Stock Watchlist Pro
                    </h1>
                    <nav className="nav-tabs">
                        <button 
                            className={`nav-tab ${activeView === 'overview' ? 'active' : ''}`}
                            onClick={() => setActiveView('overview')}
                        >
                            <i className="fas fa-chart-area"></i>
                            <span>Overview</span>
                        </button>
                        <button 
                            className={`nav-tab ${activeView === 'watchlist' ? 'active' : ''}`}
                            onClick={() => setActiveView('watchlist')}
                        >
                            <i className="fas fa-briefcase"></i>
                            <span>Watchlist</span>
                        </button>
                        <button 
                            className={`nav-tab ${activeView === 'news' ? 'active' : ''}`}
                            onClick={() => setActiveView('news')}
                        >
                            <i className="fas fa-bullhorn"></i>
                            <span>News</span>
                        </button>
                        <button 
                            className={`nav-tab ${activeView === 'intelligence' ? 'active' : ''}`}
                            onClick={() => setActiveView('intelligence')}
                        >
                            <i className="fas fa-chart-pie"></i>
                            <span>Intelligence</span>
                        </button>
                        <button 
                            className={`nav-tab ${activeView === 'assistant' ? 'active' : ''}`}
                            onClick={() => setActiveView('assistant')}
                        >
                            <i className="fas fa-comments"></i>
                            <span>Assistant</span>
                        </button>
                    </nav>
                </div>
                <div className="header-right">
                    <button className="user-menu-btn">
                        <i className="fas fa-user-circle"></i>
                        <span>Account</span>
                    </button>
                </div>
            </header>

            {/* Quick Search Bar - Always Visible */}
            <div className="quick-search-bar">
                <i className="fas fa-search"></i>
                <input 
                    type="text" 
                    placeholder="Search stocks, companies, or symbols..." 
                    className="search-input"
                />
                <button className="search-btn">
                    Search
                </button>
            </div>

            {/* Main Content Area */}
            <div className="dashboard-content">
                {activeView === 'overview' && <OverviewView watchlistData={watchlistData} />}
                {activeView === 'watchlist' && <WatchlistView watchlistData={watchlistData} />}
                {activeView === 'news' && <NewsView />}
                {activeView === 'intelligence' && <IntelligenceView />}
                {activeView === 'assistant' && <AIAssistantView />}
            </div>

            {/* Floating Assistant - Always Available */}
            <button className="floating-ai-btn">
                <i className="fas fa-comments"></i>
                <span className="tooltip">Open Assistant</span>
            </button>
        </div>
    );
};

// Overview Tab Component
const OverviewView = ({ watchlistData }) => {
    const totalValue = watchlistData.reduce((sum, stock) => sum + (stock.current_price * 100 || 0), 0);
    const totalChange = watchlistData.reduce((sum, stock) => sum + (stock.change_percent || 0), 0);
    const avgChange = watchlistData.length > 0 ? totalChange / watchlistData.length : 0;

    return (
        <div className="overview-view">
            {/* Top KPI Cards */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-icon portfolio">
                        <i className="fas fa-dollar-sign"></i>
                    </div>
                    <div className="kpi-content">
                        <p className="kpi-label">Total Value</p>
                        <h2 className="kpi-value">${(totalValue / 1000).toFixed(0)}K</h2>
                        <span className={`kpi-change ${avgChange >= 0 ? 'positive' : 'negative'}`}>
                            {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
                        </span>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon positions">
                        <i className="fas fa-cubes"></i>
                    </div>
                    <div className="kpi-content">
                        <p className="kpi-label">Positions</p>
                        <h2 className="kpi-value">{watchlistData.length}</h2>
                        <span className="kpi-change">Tracked</span>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon performance">
                        <i className="fas fa-arrow-trend-up"></i>
                    </div>
                    <div className="kpi-content">
                        <p className="kpi-label">Top Gainer</p>
                        <h2 className="kpi-value">
                            {watchlistData.length > 0 ? 
                                watchlistData.reduce((max, stock) => 
                                    (stock.change_percent || 0) > (max.change_percent || 0) ? stock : max, 
                                    watchlistData[0]
                                ).symbol : 'N/A'
                            }
                        </h2>
                        <span className="kpi-change">
                            {watchlistData.length > 0 ?
                                `${(watchlistData.reduce((max, stock) => 
                                    (stock.change_percent || 0) > (max.change_percent || 0) ? stock : max, 
                                    watchlistData[0]
                                ).change_percent || 0).toFixed(2)}%` : ''
                            }
                        </span>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon market">
                        <i className="fas fa-building"></i>
                    </div>
                    <div className="kpi-content">
                        <p className="kpi-label">Market Status</p>
                        <h2 className="kpi-value">Open</h2>
                        <span className="kpi-change">Live Data</span>
                    </div>
                </div>
            </div>

            {/* Two Column Layout */}
            <div className="main-grid">
                {/* Left Column - Portfolio Quick View */}
                <div className="main-card">
                    <div className="card-header">
                        <h3><i className="fas fa-table"></i> Watchlist</h3>
                        <button className="view-all-btn">See All <i className="fas fa-arrow-right"></i></button>
                    </div>
                    <div className="watchlist-quick">
                        {watchlistData.slice(0, 5).map((stock, index) => (
                            <div key={index} className="stock-row">
                                <div className="stock-info">
                                    <div className="stock-symbol">{stock.symbol}</div>
                                    <div className="stock-name">{stock.name}</div>
                                </div>
                                <div className="stock-price">
                                    ${stock.current_price?.toFixed(2) || '0.00'}
                                </div>
                                <div className={`stock-change ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                                    {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2) || '0.00'}%
                                </div>
                            </div>
                        ))}
                        {watchlistData.length === 0 && (
                            <div className="empty-state">
                                <i className="fas fa-database"></i>
                                <p>No stocks in your watchlist yet</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column - Market Intelligence Quick Look */}
                <div className="main-card">
                    <div className="card-header">
                        <h3><i className="fas fa-database"></i> Market Intelligence</h3>
                        <button className="view-all-btn">Explore <i className="fas fa-arrow-right"></i></button>
                    </div>
                    <div className="insights-list">
                        <div className="insight-item">
                            <div className="insight-icon">
                                <i className="fas fa-calendar"></i>
                            </div>
                            <div className="insight-content">
                                <h4>Earnings Calendar</h4>
                                <p>12 companies reporting this week</p>
                            </div>
                        </div>
                        <div className="insight-item">
                            <div className="insight-icon">
                                <i className="fas fa-chart-bar"></i>
                            </div>
                            <div className="insight-content">
                                <h4>Sector Performance</h4>
                                <p>Technology +2.3% today</p>
                            </div>
                        </div>
                        <div className="insight-item">
                            <div className="insight-icon">
                                <i className="fas fa-file-alt"></i>
                            </div>
                            <div className="insight-content">
                                <h4>Market News</h4>
                                <p>3 key developments today</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Watchlist View Component
const WatchlistView = ({ watchlistData }) => {
    return (
        <div className="watchlist-view">
            <div className="view-header">
                <h2>My Watchlist</h2>
                <div className="header-actions">
                    <button className="action-btn">
                        <i className="fas fa-plus"></i> Add Stock
                    </button>
                    <button className="action-btn">
                        <i className="fas fa-filter"></i> Filter
                    </button>
                </div>
            </div>
            <div className="watchlist-grid">
                {watchlistData.map((stock, index) => (
                    <div key={index} className="watchlist-card">
                        <div className="card-top">
                            <div className="stock-symbol">{stock.symbol}</div>
                            <button className="more-btn">
                                <i className="fas fa-ellipsis-v"></i>
                            </button>
                        </div>
                        <div className="stock-name">{stock.name}</div>
                        <div className="stock-price-large">${stock.current_price?.toFixed(2) || '0.00'}</div>
                        <div className={`stock-change-large ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                            {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2) || '0.00'}%
                        </div>
                        <div className="card-actions">
                            <button className="card-action-btn">
                                <i className="fas fa-info-circle"></i> Details
                            </button>
                            <button className="card-action-btn">
                                <i className="fas fa-trash"></i> Remove
                            </button>
                        </div>
                    </div>
                ))}
                {watchlistData.length === 0 && (
                    <div className="empty-watchlist">
                        <i className="fas fa-briefcase"></i>
                        <h3>Your watchlist is empty</h3>
                        <p>Add stocks to start tracking</p>
                        <button className="empty-action-btn">
                            Add Your First Stock
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// News View Component
const NewsView = () => {
    return (
        <div className="news-view">
            <div className="view-header">
                <h2>Market News</h2>
                <div className="news-filters">
                    <button className="filter-btn active">All</button>
                    <button className="filter-btn">Breaking</button>
                    <button className="filter-btn">Analysis</button>
                    <button className="filter-btn">Earnings</button>
                </div>
            </div>
            <div className="news-grid">
                <div className="news-card featured">
                    <div className="news-image-placeholder">
                        <i className="fas fa-chart-line"></i>
                    </div>
                    <div className="news-badge">Featured</div>
                    <div className="news-content">
                        <span className="news-category">Market Analysis</span>
                        <h3>Tech Stocks Rally on Strong Earnings</h3>
                        <p>Major technology companies report better-than-expected Q3 earnings, driving sector gains</p>
                        <div className="news-meta">
                            <span><i className="fas fa-clock"></i> 2 hours ago</span>
                            <button className="read-more">Read More <i className="fas fa-arrow-right"></i></button>
                        </div>
                    </div>
                </div>
                
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="news-card">
                        <div className="news-content">
                            <span className="news-category">Breaking News</span>
                            <h3>Sample News Article Title {i}</h3>
                            <p>This is a sample news article description</p>
                            <div className="news-meta">
                                <span><i className="fas fa-clock"></i> {i} hours ago</span>
                                <button className="read-more">Read More <i className="fas fa-arrow-right"></i></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Intelligence View Component
const IntelligenceView = () => {
    return (
        <div className="intelligence-view">
            <div className="view-header">
                <h2>Market Intelligence</h2>
                <div className="intel-tabs">
                    <button className="intel-tab active">Earnings</button>
                    <button className="intel-tab">Insider Trading</button>
                    <button className="intel-tab">Analyst Ratings</button>
                    <button className="intel-tab">Options</button>
                </div>
            </div>
            <div className="intel-content">
                <div className="intel-card">
                    <div className="intel-header">
                        <h3><i className="fas fa-calendar-check"></i> Upcoming Earnings</h3>
                        <span className="intel-count">12 events</span>
                    </div>
                    <div className="intel-list">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="intel-item">
                                <div className="intel-symbol">AAPL</div>
                                <div className="intel-details">
                                    <div className="intel-company">Apple Inc.</div>
                                    <div className="intel-date">Oct 28, 2025</div>
                                </div>
                                <div className="intel-estimate">
                                    Est: $1.20
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// AI Assistant View Component
const AIAssistantView = () => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        const message = inputValue.trim();
        if (!message || isTyping) return;

        setInputValue('');
        const userMessage = {
            id: Date.now(),
            type: 'user',
            content: message,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);
        setIsTyping(true);

        // Simulate AI response for demo
        setTimeout(() => {
            const aiMessage = {
                id: Date.now() + 1,
                type: 'ai',
                content: `I understand you're asking about "${message}". This is a prototype of the AI assistant integration.`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMessage]);
            setIsTyping(false);
        }, 1500);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const quickPrompts = [
        "Analyze my watchlist performance",
        "What stocks should I add?",
        "Market outlook for tech sector",
        "Compare AAPL and MSFT"
    ];

    return (
        <div className="assistant-view">
            <div className="assistant-header">
                <div>
                    <h2>AI Investment Assistant</h2>
                    <p>Get real-time insights and personalized investment advice</p>
                </div>
                <div className="assistant-status">
                    <span className="status-dot"></span>
                    <span>Online</span>
                </div>
            </div>

            <div className="assistant-chat">
                {messages.length === 0 && (
                    <div className="assistant-welcome">
                        <div className="assistant-avatar">
                            <i className="fas fa-user-tie"></i>
                        </div>
                        <h3>Investment Advisor</h3>
                        <p>Get portfolio analysis, stock research, and strategic insights.</p>
                        <div className="quick-prompts">
                            {quickPrompts.map((prompt, index) => (
                                <button 
                                    key={index}
                                    className="prompt-btn"
                                    onClick={() => setInputValue(prompt)}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="assistant-messages">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`assistant-msg ${msg.type}`}>
                            <div className="assistant-msg-content">
                                {msg.type === 'user' ? (
                                    <>
                                        <p>{msg.content}</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="ai-avatar"><i className="fas fa-user-tie"></i></div>
                                        <p>{msg.content}</p>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="assistant-msg ai">
                            <div className="assistant-msg-content">
                                <div className="ai-avatar"><i className="fas fa-user-tie"></i></div>
                                <div className="typing-indicator">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="assistant-input">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask me about stocks, your portfolio, or investment strategies..."
                        className="assistant-input-field"
                    />
                    <button 
                        className="send-btn"
                        onClick={sendMessage}
                        disabled={!inputValue || isTyping}
                    >
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Initialize the redesign (this won't replace the current dashboard, just for testing)
window.DashboardRedesign = DashboardRedesign;


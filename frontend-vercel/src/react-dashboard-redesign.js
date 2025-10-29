// Modern Financial Dashboard Redesign - Concept Prototype
const { useState, useEffect, useRef } = React;

const DashboardRedesign = () => {
    const [activeView, setActiveView] = useState('overview');
    const [watchlistData, setWatchlistData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [searching, setSearching] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const searchDebounceRef = useRef(null);
    const [filterText, setFilterText] = useState('');
    
    // User data state
    const [userData, setUserData] = useState({ name: 'Account', email: 'Loading...' });
    
    // Live pricing state
    const [lastUpdate, setLastUpdate] = useState(null);
    const [marketStatus, setMarketStatus] = useState({ isOpen: false, status: 'Closed' });
    const livePricingRef = useRef({ interval: null, isActive: false, priceCache: new Map() });
    const keepAliveRef = useRef(null);

    useEffect(() => {
        loadWatchlistData();
        loadUserData();
        
        // Listen for auth state changes
        if (window.firebaseAuth) {
            window.firebaseAuth.onAuthStateChanged((user) => {
                if (user) {
                    setUserData({
                        name: user.displayName || user.email.split('@')[0] || 'Account',
                        email: user.email || 'user@example.com'
                    });
                } else {
                    // Redirect if user is signed out
                    window.location.href = '/';
                }
            });
        }
        
        // Listen for watchlist changes from chatbot or other sources
        const handleWatchlistChange = () => {
            console.log('🔄 Watchlist changed, refreshing data...');
            loadWatchlistData();
        };
        
        window.addEventListener('watchlistChanged', handleWatchlistChange);
        
        return () => {
            window.removeEventListener('watchlistChanged', handleWatchlistChange);
        };
    }, []);
    
    // Load user data from Firebase
    const loadUserData = () => {
        if (window.firebaseAuth && window.firebaseAuth.currentUser) {
            const user = window.firebaseAuth.currentUser;
            setUserData({
                name: user.displayName || user.email.split('@')[0] || 'Account',
                email: user.email || 'user@example.com'
            });
        }
    };

    useEffect(() => {
        // Auto-refresh every 30 seconds
        const interval = setInterval(() => {
            loadWatchlistData();
        }, 30000);
        
        return () => clearInterval(interval);
    }, []);

    // Backend keep-alive mechanism
    useEffect(() => {
        const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
        
        const wakeUpBackend = async () => {
            try {
                await fetch(`${API_BASE}/api/health`, {
                    method: 'GET',
                    credentials: 'include',
                    signal: AbortSignal.timeout(5000)
                });
            } catch (e) {
                // Silently handle keep-alive errors
            }
        };
        
        // Wake up backend immediately
        wakeUpBackend();
        
        // Then ping every 5 minutes to keep Heroku awake
        keepAliveRef.current = setInterval(wakeUpBackend, 300000); // 5 minutes
        
        return () => {
            if (keepAliveRef.current) {
                clearInterval(keepAliveRef.current);
            }
        };
    }, []);

    // Market status updates
    useEffect(() => {
        const loadMarketStatus = async () => {
            try {
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const response = await fetch(`${API_BASE}/api/market-status`, {
                    credentials: 'include'
                });
                if (response.ok) {
                    const data = await response.json();
                    setMarketStatus({
                        isOpen: data.is_open || false,
                        status: data.is_open ? 'Open' : 'Closed'
                    });
                }
            } catch (e) {
                // Fallback to checking market hours locally
                const now = new Date();
                const hour = now.getUTCHours();
                const day = now.getUTCDay();
                const isWeekday = day >= 1 && day <= 5;
                const isDuringMarketHours = hour >= 13 && hour < 20; // 9:30 AM - 4:00 PM ET
                setMarketStatus({
                    isOpen: isWeekday && isDuringMarketHours,
                    status: isWeekday && isDuringMarketHours ? 'Open' : 'Closed'
                });
            }
        };
        
        loadMarketStatus();
        const marketInterval = setInterval(loadMarketStatus, 60000); // Every minute
        
        return () => clearInterval(marketInterval);
    }, []);

    // Live pricing updates
    useEffect(() => {
        if (!watchlistData.length || !marketStatus.isOpen) return;
        
        const updateLivePrices = async () => {
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            
            for (const stock of watchlistData.slice(0, 10)) { // Limit to 10 stocks for performance
                try {
                    const authHeaders = await window.getAuthHeaders();
                    const response = await fetch(`${API_BASE}/api/search`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...authHeaders
                        },
                        credentials: 'include',
                        body: JSON.stringify({ symbol: stock.symbol })
                    });
                    
                    if (response.ok) {
                        const stockData = await response.json();
                        const oldPrice = livePricingRef.current.priceCache.get(stock.symbol);
                        const newPrice = stockData.price;
                        
                        if (oldPrice && Math.abs(oldPrice - newPrice) > 0.01) {
                            // Trigger animation by updating watchlist data
                            setWatchlistData(prev => prev.map(s => 
                                s.symbol === stock.symbol 
                                    ? { ...s, current_price: newPrice, change_percent: stockData.priceChangePercent, _updated: true }
                                    : s
                            ));
                            
                            // Add visual flash animation
                            setTimeout(() => {
                                setWatchlistData(prev => prev.map(s => 
                                    s.symbol === stock.symbol ? { ...s, _updated: false } : s
                                ));
                            }, 2000);
                        }
                        
                        livePricingRef.current.priceCache.set(stock.symbol, newPrice);
                    }
                } catch (e) {
                    // Silently handle update errors
                }
            }
            
            setLastUpdate(new Date());
        };
        
        // Initial update
        updateLivePrices();
        
        // Update every 15 seconds during market hours
        livePricingRef.current.interval = setInterval(updateLivePrices, 15000);
        livePricingRef.current.isActive = true;
        
        return () => {
            if (livePricingRef.current.interval) {
                clearInterval(livePricingRef.current.interval);
            }
            livePricingRef.current.isActive = false;
        };
    }, [watchlistData, marketStatus.isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (userMenuOpen && !event.target.closest('.user-menu-wrapper')) {
                setUserMenuOpen(false);
            }
        };

        if (userMenuOpen) {
            document.addEventListener('click', handleClickOutside);
        }

        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [userMenuOpen]);

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
                let data = await response.json();
                console.log('📋 Raw watchlist data:', data);
                
                // Fetch current prices for each stock using same method as old UI
                if (Array.isArray(data) && data.length > 0) {
                    const stocksWithPrices = await Promise.all(data.map(async (stock) => {
                        const symbol = stock.symbol || stock.id;
                        
                        try {
                            // Use the same /api/search endpoint as old UI for consistent data
                            const priceResponse = await fetch(`${API_BASE}/api/search`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...authHeaders
                                },
                                credentials: 'include',
                                body: JSON.stringify({ symbol: symbol })
                            });
                            
                            if (priceResponse.ok) {
                                const stockData = await priceResponse.json();
                                console.log(`✅ Fetched price for ${symbol}:`, stockData);
                                
                                // Map the response to match expected fields
                                return {
                                    ...stock,
                                    symbol: stockData.symbol || symbol,
                                    name: stockData.name || stock.company_name || stock.name || symbol,
                                    current_price: stockData.price || 0,
                                    change_percent: stockData.priceChangePercent || 0,
                                    price_change: stockData.priceChange || 0
                                };
                            }
                        } catch (e) {
                            console.error(`Error fetching price for ${symbol}:`, e);
                        }
                        
                        // Return stock with fallback data if fetch failed
                        return {
                            ...stock,
                            symbol: symbol,
                            name: stock.name || stock.company_name || symbol,
                            current_price: stock.current_price || stock.price || 0,
                            change_percent: stock.change_percent || stock.priceChangePercent || 0,
                            price_change: stock.price_change || stock.priceChange || 0
                        };
                    }));
                    
                    console.log('📊 Processed stocks with prices:', stocksWithPrices);
                    setWatchlistData(stocksWithPrices);
                } else {
                    setWatchlistData([]);
                }
            } else {
                setWatchlistData([]);
            }
        } catch (error) {
            console.error('Error loading watchlist:', error);
            setWatchlistData([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        
        try {
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            
            const response = await fetch(`${API_BASE}/api/stock/${searchQuery.toUpperCase()}`, {
                method: 'GET',
                headers: authHeaders,
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setSearchResults([data]);
                setShowSearchResults(true);
                window.openStockDetailsModalReact && window.openStockDetailsModalReact(searchQuery.toUpperCase());
                setSuggestions([]);
                setHighlightedIndex(-1);
            } else {
                window.showNotification && window.showNotification('Stock not found', 'error');
            }
        } catch (error) {
            window.showNotification && window.showNotification('Search failed', 'error');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
            return;
        }
        if (e.key === 'Enter') {
            if (suggestions.length > 0 && highlightedIndex >= 0) {
                const choice = suggestions[highlightedIndex];
                if (choice?.symbol) {
                    window.openStockDetailsModalReact && window.openStockDetailsModalReact(choice.symbol);
                    setSuggestions([]);
                    setHighlightedIndex(-1);
                    return;
                }
            }
            handleSearch();
        }
    };

    const onSearchInputChange = (value) => {
        setSearchQuery(value);
        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }
        if (!value.trim()) {
            setSuggestions([]);
            setHighlightedIndex(-1);
            return;
        }
        searchDebounceRef.current = setTimeout(async () => {
            try {
                setSearching(true);
                const authHeaders = await window.getAuthHeaders();
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const resp = await fetch(`${API_BASE}/api/search/stocks?q=${encodeURIComponent(value.trim())}`, {
                    method: 'GET',
                    headers: authHeaders,
                    credentials: 'include'
                });
                if (resp.ok) {
                    const res = await resp.json();
                    // Expect an array of { symbol, name }
                    setSuggestions(Array.isArray(res) ? res.slice(0, 8) : []);
                    setHighlightedIndex(res && res.length > 0 ? 0 : -1);
                } else {
                    setSuggestions([]);
                    setHighlightedIndex(-1);
                }
            } catch (_) {
                setSuggestions([]);
                setHighlightedIndex(-1);
            } finally {
                setSearching(false);
            }
        }, 250);
    };

    const refreshData = () => {
        setIsLoading(true);
        loadWatchlistData();
    };

    const handleLogout = async () => {
        try {
            // Sign out from Firebase
            if (window.firebaseAuth) {
                await window.firebaseAuth.signOut();
            }
            
            // Sign out from backend
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            await fetch(`${API_BASE}/api/logout`, {
                method: 'POST',
                credentials: 'include'
            });
            
            // Redirect to home
            window.location.href = '/';
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = '/';
        }
    };

    const openDetails = (symbol) => {
        if (window.openStockDetailsModalReact) {
            window.openStockDetailsModalReact(symbol);
        }
    };

    // Expose chart viewing globally
    window.viewChart = async (symbol) => {
        if (window.openStockDetailsModalReact) {
            window.openStockDetailsModalReact(symbol);
            // Chart will be shown in the modal
        }
    };

    const removeFromWatchlist = async (symbol) => {
        try {
            const confirmed = window.confirm ? window.confirm(`Remove ${symbol} from your watchlist?`) : true;
            if (!confirmed) return;
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const response = await fetch(`${API_BASE}/api/watchlist/${encodeURIComponent(symbol)}`, {
                method: 'DELETE',
                headers: authHeaders,
                credentials: 'include'
            });
            if (response.ok) {
                // Optimistically update local state
                setWatchlistData((prev) => prev.filter((s) => (s.symbol || '').toUpperCase() !== symbol.toUpperCase()));
                // Notify other parts of the app
                try {
                    window.dispatchEvent && window.dispatchEvent(new CustomEvent('watchlistChanged'));
                } catch (_) {}
                if (typeof window.refreshWatchlist === 'function') {
                    window.refreshWatchlist();
                }
                window.showNotification && window.showNotification(`${symbol} removed from watchlist`, 'success');
            } else {
                window.showNotification && window.showNotification(`Failed to remove ${symbol}`, 'error');
            }
        } catch (error) {
            window.showNotification && window.showNotification('Network error removing symbol', 'error');
        }
    };

    const addToWatchlist = async () => {
        try {
            const input = window.prompt ? window.prompt('Enter stock symbol (e.g., AAPL):') : '';
            const symbol = (input || '').trim().toUpperCase();
            if (!symbol) return;
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const response = await fetch(`${API_BASE}/api/watchlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                credentials: 'include',
                body: JSON.stringify({ symbol })
            });
            if (response.ok) {
                const added = await response.json().catch(() => null);
                window.showNotification && window.showNotification(`${symbol} added to watchlist`, 'success');
                // Refresh list
                await loadWatchlistData();
                try { window.dispatchEvent(new CustomEvent('watchlistChanged')); } catch (_) {}
                if (typeof window.refreshWatchlist === 'function') window.refreshWatchlist();
            } else {
                window.showNotification && window.showNotification(`Failed to add ${symbol}`, 'error');
            }
        } catch (err) {
            window.showNotification && window.showNotification('Network error adding symbol', 'error');
        }
    };

    const openFilterPrompt = () => {
        const value = window.prompt ? window.prompt('Filter symbols or names (leave blank to clear):', filterText) : '';
        setFilterText((value || '').trim());
    };

    if (isLoading) {
        return (
            <div className="dashboard-redesign">
                <div className="loading-container">
                    <div className="loading-spinner">
                        <div className="spinner"></div>
                    </div>
                    <h3>Loading Dashboard...</h3>
                </div>
            </div>
        );
    }

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
                    {/* Market Status Indicator */}
                    <div className="market-status-indicator">
                        <div className={`market-status-dot ${marketStatus.isOpen ? 'open' : 'closed'}`}></div>
                        <span className="market-status-text">{marketStatus.status}</span>
                    </div>
                    
                    {/* Last Update Indicator */}
                    {lastUpdate && (
                        <div className="last-update-indicator">
                            <i className="fas fa-clock"></i>
                            <span className="update-time">
                                Updated {formatTimeAgo(lastUpdate)}
                            </span>
                        </div>
                    )}
                    
                    <button className="refresh-btn" onClick={refreshData}>
                        <i className="fas fa-sync-alt"></i>
                    </button>
                    <div className="user-menu-wrapper">
                        <button 
                            className="user-menu-btn"
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                        >
                            <i className="fas fa-user-circle"></i>
                            <span>Account</span>
                            <i className={`fas fa-chevron-down ${userMenuOpen ? 'open' : ''}`}></i>
                        </button>
                        {userMenuOpen && (
                            <div className="user-dropdown">
                                <div className="user-dropdown-header">
                                    <div className="user-info">
                                        <div className="user-avatar">
                                            <i className="fas fa-user"></i>
                                        </div>
                                        <div>
                                            <div className="user-name">{userData.name}</div>
                                            <div className="user-email">{userData.email}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="dropdown-divider"></div>
                                <div className="dropdown-item">
                                    <i className="fas fa-user"></i>
                                    <span>Profile Settings</span>
                                </div>
                                <div className="dropdown-item">
                                    <i className="fas fa-cog"></i>
                                    <span>Preferences</span>
                                </div>
                                <div className="dropdown-item">
                                    <i className="fas fa-shield-alt"></i>
                                    <span>Security</span>
                                </div>
                                <div className="dropdown-item">
                                    <i className="fas fa-bell"></i>
                                    <span>Notifications</span>
                                </div>
                                <div className="dropdown-divider"></div>
                                <div className="dropdown-item">
                                    <i className="fas fa-file-alt"></i>
                                    <span>Terms of Service</span>
                                </div>
                                <div className="dropdown-item">
                                    <i className="fas fa-lock"></i>
                                    <span>Privacy Policy</span>
                                </div>
                                <div className="dropdown-item">
                                    <i className="fas fa-question-circle"></i>
                                    <span>Help & Support</span>
                                </div>
                                <div className="dropdown-divider"></div>
                                <div className="dropdown-item logout" onClick={handleLogout}>
                                    <i className="fas fa-sign-out-alt"></i>
                                    <span>Log Out</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Quick Search Bar - Always Visible */}
            <div className="quick-search-bar">
                <i className="fas fa-search"></i>
                <input 
                    type="text" 
                    placeholder="Search stocks, companies, or symbols..." 
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => onSearchInputChange(e.target.value)}
                    onKeyDown={handleKeyPress}
                    aria-autocomplete="list"
                    aria-expanded={suggestions.length > 0}
                />
                <button className="search-btn" onClick={handleSearch} disabled={searching}>
                    {searching ? 'Searching…' : 'Search'}
                </button>
                {suggestions.length > 0 && (
                    <div className="search-suggestions" role="listbox">
                        {suggestions.map((s, idx) => (
                            <div 
                                key={`${s.symbol}-${idx}`}
                                role="option"
                                className={`suggestion-item ${idx === highlightedIndex ? 'active' : ''}`}
                                onMouseEnter={() => setHighlightedIndex(idx)}
                                onClick={() => {
                                    window.openStockDetailsModalReact && window.openStockDetailsModalReact(s.symbol);
                                    setSuggestions([]);
                                    setHighlightedIndex(-1);
                                }}
                            >
                                <span className="s-symbol">{s.symbol}</span>
                                <span className="s-name">{s.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="dashboard-content">
                {activeView === 'overview' && <OverviewView watchlistData={watchlistData} marketStatus={marketStatus} onNavigate={setActiveView} />}
                {activeView === 'watchlist' && (
                    <WatchlistView 
                        watchlistData={watchlistData.filter((s) => {
                            if (!filterText) return true;
                            const q = filterText.toLowerCase();
                            return (s.symbol || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q);
                        })}
                        onOpenDetails={openDetails}
                        onRemove={removeFromWatchlist}
                        onAdd={addToWatchlist}
                        onFilter={openFilterPrompt}
                        isFiltered={!!filterText}
                    />
                )}
                {activeView === 'news' && <NewsView />}
                {activeView === 'intelligence' && <IntelligenceView />}
                {activeView === 'assistant' && <AIAssistantView />}
            </div>

            {/* Floating Assistant - Always Available */}
            <button className="floating-ai-btn" onClick={() => setActiveView('assistant')}>
                <i className="fas fa-comments"></i>
                <span className="tooltip">Open Assistant</span>
            </button>
        </div>
    );
};

// Overview Tab Component
const OverviewView = ({ watchlistData, marketStatus, onNavigate }) => {
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

                <MarketStatusCard marketStatus={marketStatus} />
            </div>

            {/* Two Column Layout */}
            <div className="main-grid">
                {/* Left Column - Portfolio Quick View */}
                <div className="main-card">
                    <div className="card-header">
                        <h3><i className="fas fa-table"></i> Watchlist</h3>
                        <button className="view-all-btn" onClick={() => onNavigate('watchlist')}>
                            See All <i className="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <div className="watchlist-quick">
                        {watchlistData.slice(0, 5).map((stock, index) => (
                            <div 
                                key={index} 
                                className="stock-row"
                                role="button"
                                tabIndex={0}
                                onClick={() => window.openStockDetailsModalReact && window.openStockDetailsModalReact(stock.symbol)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        window.openStockDetailsModalReact && window.openStockDetailsModalReact(stock.symbol);
                                    }
                                }}
                            >
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
                        <button className="view-all-btn" onClick={() => onNavigate('intelligence')}>
                            Explore <i className="fas fa-arrow-right"></i>
                        </button>
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
const WatchlistView = ({ watchlistData, onOpenDetails, onRemove, onAdd, onFilter, isFiltered }) => {
    return (
        <div className="watchlist-view">
            <div className="view-header">
                <h2>My Watchlist</h2>
                <div className="header-actions">
                    <button className="action-btn" onClick={() => onAdd && onAdd()}>
                        <i className="fas fa-plus"></i> Add Stock
                    </button>
                    <button className="action-btn" onClick={() => onFilter && onFilter()}>
                        <i className="fas fa-filter"></i> {isFiltered ? 'Filter (On)' : 'Filter'}
                    </button>
                </div>
            </div>
            <div className="watchlist-grid">
                {watchlistData.map((stock, index) => (
                    <div key={index} className="watchlist-card" role="group" aria-label={`${stock.symbol} card`}>
                        <div className="card-top">
                            <div className="stock-symbol">{stock.symbol}</div>
                            <button className="more-btn">
                                <i className="fas fa-ellipsis-v"></i>
                            </button>
                        </div>
                        <div className="stock-name">{stock.name}</div>
                        <div className={`stock-price-large ${stock._updated ? 'price-updated' : ''}`}>
                            ${stock.current_price?.toFixed(2) || '0.00'}
                        </div>
                        <div className={`stock-change-large ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                            {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2) || '0.00'}%
                        </div>
                        <div className="card-actions">
                            <button className="card-action-btn" onClick={() => onOpenDetails && onOpenDetails(stock.symbol)}>
                                <i className="fas fa-info-circle"></i> Details
                            </button>
                            <button className="card-action-btn" onClick={() => window.viewChart && window.viewChart(stock.symbol)}>
                                <i className="fas fa-chart-line"></i> Chart
                            </button>
                            <button className="card-action-btn" onClick={() => onRemove && onRemove(stock.symbol)}>
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [articles, setArticles] = useState([]);
    const [query, setQuery] = useState('markets');

    useEffect(() => { loadNews(); }, []);

    const loadNews = async () => {
        try {
            setLoading(true); setError('');
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const r = await fetch(`${API_BASE}/api/news/market?q=${encodeURIComponent(query)}`, { headers: authHeaders, credentials: 'include' });
            if (!r.ok) throw new Error('Failed to fetch news');
            const data = await r.json();
            setArticles(Array.isArray(data?.articles) ? data.articles : Array.isArray(data) ? data : []);
        } catch (e) {
            setError('Unable to load news right now');
            setArticles([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="news-view">
            <div className="view-header">
                <h2>Market News</h2>
                <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                    <input 
                        className="search-input" 
                        style={{ maxWidth:'240px' }} 
                        value={query}
                        onChange={(e)=>setQuery(e.target.value)}
                        placeholder="Search news" />
                    <button className="search-btn" onClick={loadNews} disabled={loading}>Refresh</button>
                    {error && <span style={{ color:'#FF6B35', fontSize:'0.9rem' }}>{error}</span>}
                </div>
            </div>
            <div className="news-grid">
                {(loading ? Array.from({length:1}) : articles.slice(0,1)).map((a, idx) => (
                    <div key={`feat-${idx}`} className="news-card featured">
                        <div className="news-image-placeholder">
                            <i className="fas fa-chart-line"></i>
                        </div>
                        <div className="news-badge">Featured</div>
                        <div className="news-content">
                            <span className="news-category">{loading ? 'Loading…' : (a.source || a.category || 'Top Story')}</span>
                            <h3>{loading ? 'Loading headline…' : (a.title || '—')}</h3>
                            <p>{loading ? '' : (a.description || '')}</p>
                            <div className="news-meta">
                                <span><i className="fas fa-clock"></i> {loading ? '' : (a.published_at || a.publishedAt || '')}</span>
                                {a?.url && <a className="read-more" href={a.url} target="_blank" rel="noopener noreferrer">Read More <i className="fas fa-arrow-right"></i></a>}
                            </div>
                        </div>
                    </div>
                ))}

                {(loading ? Array.from({length:6}) : articles.slice(1,7)).map((a, i) => (
                    <div key={`card-${i}`} className="news-card">
                        <div className="news-content">
                            <span className="news-category">{loading ? 'Loading…' : (a.source || 'News')}</span>
                            <h3>{loading ? 'Loading…' : (a.title || '—')}</h3>
                            <p>{loading ? '' : (a.description || '')}</p>
                            <div className="news-meta">
                                <span><i className="fas fa-clock"></i> {loading ? '' : (a.published_at || a.publishedAt || '')}</span>
                                {a?.url && <a className="read-more" href={a.url} target="_blank" rel="noopener noreferrer">Read More <i className="fas fa-arrow-right"></i></a>}
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
    const [activeTab, setActiveTab] = useState('earnings');
    const [symbol, setSymbol] = useState('AAPL');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [earnings, setEarnings] = useState([]);
    const [insider, setInsider] = useState([]);
    const [analyst, setAnalyst] = useState([]);
    const [optionsData, setOptionsData] = useState([]);

    useEffect(() => {
        loadCurrentTab();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Expose a safe setter so other sections can deep-link to a tab
    useEffect(() => {
        const setter = (tab) => setActiveTab(tab);
        window.__setIntelTab = setter;
        return () => {
            if (window.__setIntelTab === setter) delete window.__setIntelTab;
        };
    }, []);

    const withAuth = async () => {
        const authHeaders = await window.getAuthHeaders();
        const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
        return { authHeaders, API_BASE };
    };

    const loadCurrentTab = async () => {
        if (activeTab === 'earnings') return loadEarnings();
        if (activeTab === 'insider') return loadInsider();
        if (activeTab === 'analyst') return loadAnalyst();
        if (activeTab === 'options') return loadOptions();
    };

    const loadEarnings = async () => {
        try {
            setLoading(true); setError('');
            const { authHeaders, API_BASE } = await withAuth();
            const r = await fetch(`${API_BASE}/api/market/earnings`, { headers: authHeaders, credentials: 'include' });
            if (!r.ok) throw new Error('Failed to fetch earnings');
            const data = await r.json();
            setEarnings(Array.isArray(data) ? data : []);
        } catch (e) {
            setError('Unable to load earnings right now');
            setEarnings([]);
        } finally { setLoading(false); }
    };

    const loadInsider = async () => {
        try {
            setLoading(true); setError('');
            const { authHeaders, API_BASE } = await withAuth();
            const r = await fetch(`${API_BASE}/api/market/insider-trading/${encodeURIComponent(symbol)}`, { headers: authHeaders, credentials: 'include' });
            if (!r.ok) throw new Error('Failed to fetch insider trading');
            const data = await r.json();
            setInsider(Array.isArray(data?.transactions) ? data.transactions : Array.isArray(data) ? data : []);
        } catch (e) {
            setError('Unable to load insider trading');
            setInsider([]);
        } finally { setLoading(false); }
    };

    const loadAnalyst = async () => {
        try {
            setLoading(true); setError('');
            const { authHeaders, API_BASE } = await withAuth();
            const r = await fetch(`${API_BASE}/api/market/analyst-ratings/${encodeURIComponent(symbol)}`, { headers: authHeaders, credentials: 'include' });
            if (!r.ok) throw new Error('Failed to fetch analyst ratings');
            const data = await r.json();
            setAnalyst(Array.isArray(data?.analysts) ? data.analysts : Array.isArray(data) ? data : []);
        } catch (e) {
            setError('Unable to load analyst ratings');
            setAnalyst([]);
        } finally { setLoading(false); }
    };

    const loadOptions = async () => {
        try {
            setLoading(true); setError('');
            const { authHeaders, API_BASE } = await withAuth();
            const r = await fetch(`${API_BASE}/api/market/options/${encodeURIComponent(symbol)}`, { headers: authHeaders, credentials: 'include' });
            if (!r.ok) throw new Error('Failed to fetch options');
            const data = await r.json();
            setOptionsData(Array.isArray(data?.chains) ? data.chains : Array.isArray(data) ? data : []);
        } catch (e) {
            setError('Unable to load options');
            setOptionsData([]);
        } finally { setLoading(false); }
    };

    return (
        <div className="intelligence-view">
            <div className="view-header">
                <h2>Market Intelligence</h2>
                <div className="intel-tabs">
                    <button className={`intel-tab ${activeTab==='earnings'?'active':''}`} onClick={()=>setActiveTab('earnings')}>Earnings</button>
                    <button className={`intel-tab ${activeTab==='insider'?'active':''}`} onClick={()=>setActiveTab('insider')}>Insider Trading</button>
                    <button className={`intel-tab ${activeTab==='analyst'?'active':''}`} onClick={()=>setActiveTab('analyst')}>Analyst Ratings</button>
                    <button className={`intel-tab ${activeTab==='options'?'active':''}`} onClick={()=>setActiveTab('options')}>Options</button>
                </div>
            </div>

            <div className="intel-controls" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', margin: '0 0 1rem 0' }}>
                <input 
                    className="search-input"
                    style={{ maxWidth: '220px' }}
                    value={symbol}
                    onChange={(e)=>setSymbol(e.target.value.toUpperCase())}
                    placeholder="Symbol e.g., AAPL" />
                <button className="search-btn" onClick={loadCurrentTab} disabled={loading}>Refresh</button>
                {error && <span style={{ color: '#FF6B35', fontSize: '0.9rem' }}>{error}</span>}
            </div>

            {activeTab === 'earnings' && (
                <div className="intel-card">
                    <div className="intel-header">
                        <h3><i className="fas fa-calendar-check"></i> Upcoming Earnings</h3>
                        <span className="intel-count">{earnings.length} events</span>
                    </div>
                    <div className="intel-list">
                        {(loading ? Array.from({length:5}) : earnings).slice(0,5).map((item, i) => {
                            // Format date if available
                            let formattedDate = '—';
                            if (!loading && item.earnings_date) {
                                const date = new Date(item.earnings_date);
                                formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            }
                            
                            return (
                            <div key={i} className="intel-item">
                                <div className="intel-symbol">{loading ? '—' : (item.symbol || item.ticker || '—')}</div>
                                <div className="intel-details">
                                    <div className="intel-company">{loading ? 'Loading…' : (item.company_name || item.company || item.name || '—')}</div>
                                    <div className="intel-date">{loading ? '' : formattedDate}</div>
                                </div>
                                <div className="intel-estimate">{loading ? '' : (item.estimate ? `Est: ${item.estimate}` : '')}</div>
                            </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'insider' && (
                <div className="intel-card">
                    <div className="intel-header">
                        <h3><i className="fas fa-user-shield"></i> Insider Transactions</h3>
                        <span className="intel-count">{insider.length}</span>
                    </div>
                    <div className="intel-list">
                        {(loading ? Array.from({length:5}) : insider).slice(0,5).map((t, i) => {
                            // Format date if available
                            let formattedDate = '—';
                            let formattedTransaction = '—';
                            if (!loading && t.date) {
                                const date = new Date(t.date);
                                formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            }
                            if (!loading && t.transaction_type && t.shares && t.price) {
                                formattedTransaction = `${t.transaction_type} ${t.shares.toLocaleString()} @ $${t.price.toFixed(2)}`;
                            }
                            
                            return (
                            <div key={i} className="intel-item">
                                <div className="intel-symbol">{symbol}</div>
                                <div className="intel-details">
                                    <div className="intel-company">{loading ? 'Loading…' : (t.filer_name || t.insider || t.name || '—')}</div>
                                    <div className="intel-date">{loading ? '' : formattedDate}</div>
                                </div>
                                <div className="intel-estimate">{loading ? '' : formattedTransaction}</div>
                            </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'analyst' && (
                <div className="intel-card">
                    <div className="intel-header">
                        <h3><i className="fas fa-chart-line"></i> Analyst Ratings</h3>
                        <span className="intel-count">{analyst.length}</span>
                    </div>
                    <div className="intel-list">
                        {(loading ? Array.from({length:5}) : analyst).slice(0,5).map((r, i) => {
                            // Format date if available
                            let formattedDate = '—';
                            if (!loading && r.date) {
                                const date = new Date(r.date);
                                formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            }
 Andalusia
                            
                            return (
                            <div key={i} className="intel-item">
                                <div className="intel-symbol">{symbol}</div>
                                <div className="intel-details">
                                    <div className="intel-company">{loading ? 'Loading…' : (r.firm || r.analyst || '—')}</div>
                                    <div className="intel-date">{loading ? '' : formattedDate}</div>
                                </div>
                                <div className="intel-estimate">{loading ? '' : (r.rating && r.price_target ? `${r.rating} $${r.price_target}` : r.rating || r.action || '—')}</div>
                            </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'options' && (
                <div className="intel-card">
                    <div className="intel-header">
                        <h3><i className="fas fa-stream"></i> Options Flow</h3>
                        <span className="intel-count">{optionsData.length}</span>
                    </div>
                    <div className="intel-list">
                        {(loading ? Array.from({length:5}) : optionsData).slice(0,5).map((o, i) => (
                            <div key={i} className="intel-item">
                                <div className="intel-symbol">{symbol}</div>
                                <div className="intel-details">
                                    <div className="intel-company">{loading ? 'Loading…' : `${o.type || o.side || '—'} ${o.strike ? `@ ${o.strike}` : ''}`}</div>
                                    <div className="intel-date">{loading ? '' : (o.expiration || o.exp || '—')}</div>
                                </div>
                                <div className="intel-estimate">{loading ? '' : (o.premium ? `$${o.premium}` : '')}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// AI Assistant View Component
const AIAssistantView = () => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [rateLimitInfo, setRateLimitInfo] = useState(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    useEffect(() => {
        // Set up authentication listener
        if (window.firebaseAuth) {
            const unsubscribe = window.firebaseAuth.onAuthStateChanged((user) => {
                setCurrentUser(user);
                if (!user) {
                    setMessages([]);
                }
            });
            return () => unsubscribe();
        }
    }, []);

    const showError = (message) => {
        const errorMessage = {
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
            const API_BASE_URL = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

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
                    console.log('📡 Stock added/removed via chatbot, refreshing watchlist...');
                    const event = new CustomEvent('watchlistChanged', {
                        detail: { action: 'add' }
                    });
                    window.dispatchEvent(event);
                }
            } else {
                showError(data.error || data.response || 'Failed to get response from AI');
            }
        } catch (error) {
            console.error('❌ Chat API error:', error);
            setIsTyping(false);
            showError(`Failed to connect to AI service: ${error.message}`);
        }
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
        <div className="assistant-view simple">
            <div className="assistant-header" style={{justifyContent:'center', textAlign:'center'}}>
                <div>
                    <h2>Ask anything</h2>
                    <p>Simple, fast answers about markets and your watchlist</p>
                </div>
            </div>

            <div className="assistant-chat">
                {/* Messages on top */}
                <div className="assistant-messages minimal">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`assistant-msg ${msg.type}`}>
                            <div className="assistant-msg-content minimal">
                                <p>{msg.content}</p>
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="assistant-msg ai">
                            <div className="assistant-msg-content minimal">
                                <div className="typing-indicator">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Quick prompts when no messages */}
                {messages.length === 0 && (
                    <div className="quick-prompts" style={{justifyContent:'center'}}>
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
                )}

                {/* Input box at the bottom */}
                <div className="assistant-input searchlike">
                    <i className="fas fa-message"></i>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask anything…"
                        className="assistant-input-field"
                    />
                    <button 
                        className="send-btn"
                        onClick={sendMessage}
                        disabled={!inputValue || isTyping}
                        aria-label="Send"
                    >
                        <i className="fas fa-arrow-up"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper function for formatting time ago
function formatTimeAgo(date) {
    if (!date) return 'just now';
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

// Market Status Card Component
const MarketStatusCard = ({ marketStatus }) => {
    return (
        <div className="kpi-card">
            <div className="kpi-icon market">
                <i className="fas fa-building"></i>
            </div>
            <div className="kpi-content">
                <p className="kpi-label">Market Status</p>
                <h2 className="kpi-value">{marketStatus.status}</h2>
                <span className={`kpi-change ${marketStatus.isOpen ? 'live' : ''}`}>
                    {marketStatus.isOpen ? 'Live' : 'Closed'}
                </span>
            </div>
        </div>
    );
};

// Initialize the redesign (this won't replace the current dashboard, just for testing)
window.DashboardRedesign = DashboardRedesign;


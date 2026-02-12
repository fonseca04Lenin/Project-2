// Modern Financial Dashboard Redesign - Concept Prototype
const { useState, useEffect, useRef, useMemo } = React;

const DashboardRedesign = () => {
    const [activeView, setActiveView] = useState('overview');
    const [watchlistData, setWatchlistData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const userMenuBtnRef = useRef(null);
    const userDropdownRef = useRef(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
    const [preferencesOpen, setPreferencesOpen] = useState(false);
    const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
    const [securityOpen, setSecurityOpen] = useState(false);
    const [termsOpen, setTermsOpen] = useState(false);
    const [privacyOpen, setPrivacyOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [profilePicture, setProfilePicture] = useState(null);
    const [theme, setTheme] = useState('dark');
    const [alpacaStatus, setAlpacaStatus] = useState({ connected: false, loading: true });
    const [alpacaPositions, setAlpacaPositions] = useState([]);
    const [showAlpacaForm, setShowAlpacaForm] = useState(false);
    const [alpacaFormData, setAlpacaFormData] = useState({ api_key: '', secret_key: '', use_paper: true });
    const [syncingPositions, setSyncingPositions] = useState(false);
    
    // Preferences state
    const [preferences, setPreferences] = useState({
        theme: 'dark', // dark, light
        defaultTimeRange: '1D',
        autoRefresh: true,
        refreshInterval: 30, // seconds
        priceFormat: 'standard', // standard, compact
        showSparklines: true,
        defaultCategory: 'General',
        currency: 'USD',
        dateFormat: 'MM/DD/YYYY',
        compactNumbers: false,
        showPercentChange: true
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [searching, setSearching] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const searchDebounceRef = useRef(null);
    const searchInputRef = useRef(null);
    const [selectedCategory, setSelectedCategory] = useState('All');
    
    // User data state
    const [userData, setUserData] = useState({ name: 'Account', email: 'Loading...' });
    
    // Live pricing state
    const [lastUpdate, setLastUpdate] = useState(null);
    const [marketStatus, setMarketStatus] = useState({ isOpen: false, status: 'Closed' });
    const [socketConnected, setSocketConnected] = useState(false);
    const [updatingStocks, setUpdatingStocks] = useState(new Set());
    const [updateStats, setUpdateStats] = useState({ total: 0, lastMinute: 0, lastUpdateTime: null });
    const livePricingRef = useRef({ 
        interval: null, 
        isActive: false, 
        priceCache: new Map(),
        lastCallTime: 0,
        rateLimitCooldown: false,
        rateLimitUntil: 0,
        callCount: 0,
        callWindowStart: Date.now(),
        visibleStocks: new Set(),
        hoveredStocks: new Set(),
        stockRefs: new Map(),
        updateIndex: 0, // For rotating through stocks when updating all (watchlist <= 30)
        socketUpdateCount: 0,
        httpUpdateCount: 0,
        lastSocketUpdate: null
    });
    const keepAliveRef = useRef(null);
    const socketRef = useRef(null);
    const viewedStocksRef = useRef(new Set()); // Track stocks user is viewing
    const updateStatsRef = useRef({ updates: [], lastMinute: [] });
    const isLoadingRef = useRef(false); // Prevent duplicate watchlist requests

    // Load preferences from localStorage (merge with defaults so new keys are always present)
    const loadPreferences = () => {
        try {
            const saved = localStorage.getItem('userPreferences');
            if (saved) {
                setPreferences(prev => ({ ...prev, ...JSON.parse(saved) }));
            }
        } catch (e) {
            // Use defaults if loading fails
        }
    };

    // Save preferences to localStorage
    const savePreferences = (newPreferences) => {
        try {
            localStorage.setItem('userPreferences', JSON.stringify(newPreferences));
            setPreferences(newPreferences);
            if (window.showNotification) {
                window.showNotification('Preferences saved successfully', 'success');
            }
        } catch (e) {
            if (window.showNotification) {
                window.showNotification('Failed to save preferences', 'error');
            }
        }
    };

    // Load Alpaca connection status
    const loadAlpacaStatus = async () => {
        try {
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const response = await fetch(`${API_BASE}/api/alpaca/status`, {
                headers: authHeaders,
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const newStatus = { ...data, loading: false };
                setAlpacaStatus(newStatus);
                // If connected, load positions
                if (data.connected) {
                    await loadAlpacaPositions();
                }
                return newStatus;
            } else {
                setAlpacaStatus({ connected: false, loading: false });
                return { connected: false, loading: false };
            }
        } catch (e) {
            setAlpacaStatus({ connected: false, loading: false });
            return { connected: false, loading: false };
        }
    };

    // Connect Alpaca account
    const connectAlpaca = async () => {
        try {
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const response = await fetch(`${API_BASE}/api/alpaca/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                credentials: 'include',
                body: JSON.stringify(alpacaFormData)
            });
            
            if (response.ok) {
                const data = await response.json();
                if (window.showNotification) {
                    window.showNotification('Alpaca account connected successfully!', 'success');
                }
                setAlpacaStatus({ ...data, connected: true });
                setShowAlpacaForm(false);
                setAlpacaFormData({ api_key: '', secret_key: '', use_paper: true });
                await loadAlpacaStatus();
            } else {
                const error = await response.json();
                if (window.showNotification) {
                    window.showNotification(error.error || 'Failed to connect Alpaca account', 'error');
                }
            }
        } catch (e) {
            if (window.showNotification) {
                window.showNotification('Error connecting Alpaca account', 'error');
            }
        }
    };

    // Disconnect Alpaca account
    const disconnectAlpaca = async () => {
        if (!confirm('Are you sure you want to disconnect your Alpaca account?')) {
            return;
        }
        
        try {
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const response = await fetch(`${API_BASE}/api/alpaca/disconnect`, {
                method: 'POST',
                headers: authHeaders,
                credentials: 'include'
            });
            
            if (response.ok) {
                if (window.showNotification) {
                    window.showNotification('Alpaca account disconnected', 'success');
                }
                setAlpacaStatus({ connected: false });
                setAlpacaPositions([]);
            }
        } catch (e) {
            if (window.showNotification) {
                window.showNotification('Error disconnecting Alpaca account', 'error');
            }
        }
    };

    // Load Alpaca positions
    const loadAlpacaPositions = async () => {
        try {
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const response = await fetch(`${API_BASE}/api/alpaca/positions`, {
                headers: authHeaders,
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setAlpacaPositions(data.positions || []);
            }
        } catch (e) {
            // Error loading Alpaca positions
        }
    };

    // Sync positions to watchlist
    const syncPositionsToWatchlist = async () => {
        setSyncingPositions(true);
        try {
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const response = await fetch(`${API_BASE}/api/alpaca/sync-positions`, {
                method: 'POST',
                headers: authHeaders,
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (window.showNotification) {
                    window.showNotification(data.message || `Synced ${data.added} positions to watchlist`, 'success');
                }
                await loadWatchlistData();
            } else {
                const error = await response.json();
                if (window.showNotification) {
                    window.showNotification(error.error || 'Failed to sync positions', 'error');
                }
            }
        } catch (e) {
            if (window.showNotification) {
                window.showNotification('Error syncing positions', 'error');
            }
        } finally {
            setSyncingPositions(false);
        }
    };

    // Load Alpaca status when preferences modal opens
    useEffect(() => {
        if (preferencesOpen) {
            loadAlpacaStatus();
        }
    }, [preferencesOpen]);

    // Apply preferences when they change
    useEffect(() => {
        // Theme
        document.body.setAttribute('data-theme', preferences.theme || 'dark');

        // Store defaultTimeRange globally so chart components can read it
        window.__defaultTimeRange = preferences.defaultTimeRange || '1D';

        // Store preferences globally for child components
        window.__userPreferences = preferences;
    }, [preferences]);

    useEffect(() => {
        // Load critical data first (non-blocking)
        loadUserData();
        loadPreferences();

        // Load profile picture from localStorage
        const savedProfilePic = localStorage.getItem('profilePicture');
        if (savedProfilePic) {
            setProfilePicture(savedProfilePic);
        }

        // Defer Alpaca status check - only needed when Preferences opens
        // loadAlpacaStatus() removed from initial load

        // Load watchlist data (this is the main data we need)
        loadWatchlistData();
        
        // Listen for auth state changes
        if (window.firebaseAuth) {
            window.firebaseAuth.onAuthStateChanged((user) => {
                if (user) {
                    setUserData({
                        name: user.displayName || user.email.split('@')[0] || 'Account',
                        email: user.email || 'user@example.com'
                    });
                    // Reload watchlist when user is authenticated
                    // User authenticated, loading watchlist
                    loadWatchlistData();
                } else {
                    // Clear watchlist if user is signed out
                    clearWatchlistCache(); // Clear cached data for logged out user
                    setWatchlistData([]);
                    setIsLoading(false);
                    // Redirect if user is signed out
                    window.location.href = '/';
                }
            });
        }
        
        // Listen for watchlist changes from chatbot or other sources
        const handleWatchlistChange = () => {
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

    // REMOVED: Auto-refresh conflicted with WebSocket updates
    // WebSocket provides real-time updates every 30s from backend
    // Manual refresh available via refresh button if needed

    // Backend keep-alive mechanism (deferred to not block initial load)
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
        
        // Defer backend wake-up to not block initial load
        setTimeout(() => {
            wakeUpBackend();
        }, 2000); // Wait 2 seconds after initial load
        
        // Then ping every 5 minutes to keep backend awake
        keepAliveRef.current = setInterval(wakeUpBackend, 300000); // 5 minutes
        
        return () => {
            if (keepAliveRef.current) {
                clearInterval(keepAliveRef.current);
            }
        };
    }, []);

    // WebSocket connection for real-time updates
    useEffect(() => {
        const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
        
        // Initialize Socket.IO connection
        if (typeof io !== 'undefined') {
            socketRef.current = io(API_BASE, {
                transports: ['websocket', 'polling'],
                withCredentials: true
            });
            
            socketRef.current.on('connect', () => {
                // // console.log('WebSocket connected for real-time updates');
                // // console.log('📡 WebSocket will update ALL stocks in your watchlist automatically');
                setSocketConnected(true);
                
                // Join watchlist updates room when user is available
                const setupRooms = async () => {
                    try {
                        const authHeaders = await window.getAuthHeaders();
                        if (authHeaders['X-User-ID']) {
                            const userId = authHeaders['X-User-ID'];
                            socketRef.current.emit('join_watchlist_updates', { user_id: userId });
                            socketRef.current.emit('join_user_room', { user_id: userId });
                            // Joined WebSocket rooms for user
                        }
                    } catch (e) {
                        // Error setting up WebSocket rooms
                    }
                };
                
                setupRooms();
            });
            
            // Listen for real-time watchlist price updates
            let lastUpdateTime = Date.now();
            let updateCount = 0;
            
            socketRef.current.on('watchlist_updated', (data) => {
                updateCount++;
                const now = Date.now();
                const timeSinceLastUpdate = ((now - lastUpdateTime) / 1000).toFixed(1);
                const currentTime = new Date().toLocaleTimeString();
                
                // Real-time price update received - ALWAYS use fresh prices
                // // console.log(`\n${'='.repeat(60)}`);
                // // console.log(`📡 UPDATE #${updateCount} @ ${currentTime}`);
                // // console.log(`   Time since last update: ${timeSinceLastUpdate}s`);
                // // console.log(`   Stocks updated: ${data.prices?.length || 0}`);
                // // console.log(`   Backend cycle: #${data.cycle || '?'}`);
                
                if (data.prices && data.prices.length > 0) {
                    const symbols = data.prices.map(p => p.symbol).join(', ');
                    // // console.log(`   Symbols: ${symbols}`);
                    const sample = data.prices[0];
                    // // console.log(`   Sample: ${sample.symbol} = $${sample.price} (${sample.change_percent >= 0 ? '+' : ''}${sample.change_percent?.toFixed(2)}%)`);
                }
                // // console.log(`${'='.repeat(60)}\n`);
                
                lastUpdateTime = now;
                if (data.prices && Array.isArray(data.prices)) {
                    const now = Date.now();
                    const updatingSymbols = new Set();
                    
                    // Track update statistics
                    if (livePricingRef.current) {
                        livePricingRef.current.socketUpdateCount++;
                        livePricingRef.current.lastSocketUpdate = now;
                        
                        // Track updates per minute
                        const stats = updateStatsRef.current;
                        stats.updates.push(now);
                        stats.lastMinute = stats.updates.filter(t => now - t < 60000);
                        
                        setUpdateStats({
                            total: livePricingRef.current.socketUpdateCount,
                            lastMinute: stats.lastMinute.length,
                            lastUpdateTime: new Date()
                        });
                    }
                    
                    // Update watchlist data with FRESH prices from WebSocket
                    setWatchlistData(prevData => {
                        const updatedData = prevData.map(stock => {
                            const update = data.prices.find(p => p.symbol === stock.symbol);
                            if (update && update.price && update.price > 0) {
                                updatingSymbols.add(stock.symbol);
                                
                                // ALWAYS use fresh price from WebSocket, never cache
                                const freshPrice = update.price;
                                const oldPrice = stock.current_price || stock.price || 0;
                                const priceChange = update.price_change || update.priceChange || 0;
                                const priceChangePercent = update.price_change_percent || update.priceChangePercent || update.change_percent || 0;
                                
                                // Determine if price changed significantly for animation
                                const hasSignificantChange = oldPrice > 0 && Math.abs(oldPrice - freshPrice) > 0.01;
                                
                                // Update price cache with fresh price
                                if (livePricingRef.current) {
                                    livePricingRef.current.priceCache.set(stock.symbol, freshPrice);
                                }
                                
                                return {
                                    ...stock,
                                    // Update ALL price fields to ensure consistency
                                    price: freshPrice,
                                    current_price: freshPrice,  // Ensure current_price is updated
                                    price_change: priceChange,
                                    change: priceChange,
                                    change_percent: priceChangePercent,
                                    priceChangePercent: priceChangePercent,
                                    _updated: hasSignificantChange, // Flag for animation
                                    _fresh: true,   // Flag to indicate fresh data
                                    _last_updated: new Date().toISOString(),
                                    _updating: false // Clear updating flag
                                };
                            }
                            return stock;
                        });
                        
                        // Also add any new stocks that weren't in prevData
                        data.prices.forEach(update => {
                            if (update.price && update.price > 0) {
                                const exists = updatedData.find(s => s.symbol === update.symbol);
                                if (!exists) {
                                    updatingSymbols.add(update.symbol);
                                    updatedData.push({
                                        symbol: update.symbol,
                                        name: update.name || update.symbol,
                                        price: update.price,
                                        current_price: update.price,
                                        price_change: update.price_change || 0,
                                        change: update.price_change || 0,
                                        change_percent: update.price_change_percent || 0,
                                        priceChangePercent: update.price_change_percent || 0,
                                        _fresh: true,
                                        _last_updated: new Date().toISOString(),
                                        _updating: false
                                    });
                                }
                            }
                        });
                        
                        return updatedData;
                    });
                    
                    // Updating indicators removed for cleaner UI
                    
                    setLastUpdate(new Date());
                    
                    // Clear update flag after animation
                    setTimeout(() => {
                        setWatchlistData(prevData => 
                            prevData.map(stock => ({ ...stock, _updated: false }))
                        );
                    }, 2000);
                }
            });
            
            socketRef.current.on('disconnect', () => {
                // // console.log('WebSocket disconnected - falling back to HTTP polling');
                setSocketConnected(false);
            });
            
            socketRef.current.on('connect_error', (error) => {
                // // console.log('WebSocket connection error:', error);
                setSocketConnected(false);
            });
            
            socketRef.current.on('reconnect', (attemptNumber) => {
                // // console.log(`WebSocket reconnected after ${attemptNumber} attempts`);
                setSocketConnected(true);
            });
            
            socketRef.current.on('reconnect_attempt', () => {
                // // console.log('Attempting to reconnect WebSocket...');
            });
        }
        
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    // Track viewed stocks for priority updates (exposed globally)
    const trackStockView = (symbol) => {
        if (!socketRef.current || !socketRef.current.connected) return;
        
        const trackView = async () => {
            try {
                const authHeaders = await window.getAuthHeaders();
                const userId = authHeaders['X-User-ID'];
                if (userId && symbol) {
                    viewedStocksRef.current.add(symbol);
                    socketRef.current.emit('track_stock_view', {
                        user_id: userId,
                        symbol: symbol.toUpperCase()
                    });
                    // Tracking stock view
                }
            } catch (e) {
                // Error tracking stock view
            }
        };
        
        trackView();
    };
    
    const untrackStockView = (symbol) => {
        if (!socketRef.current || !socketRef.current.connected) return;
        
        const untrackView = async () => {
            try {
                const authHeaders = await window.getAuthHeaders();
                const userId = authHeaders['X-User-ID'];
                if (userId && symbol) {
                    viewedStocksRef.current.delete(symbol);
                    socketRef.current.emit('untrack_stock_view', {
                        user_id: userId,
                        symbol: symbol.toUpperCase()
                    });
                    // Untracking stock view
                }
            } catch (e) {
                console.error('Error untracking stock view:', e);
            }
        };
        
        untrackView();
    };
    
    // Expose tracking functions globally for modal access
    if (typeof window !== 'undefined') {
        window.DashboardRedesign = window.DashboardRedesign || {};
        window.DashboardRedesign.trackStockView = trackStockView;
        window.DashboardRedesign.untrackStockView = untrackStockView;
    }

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

    // Helper function to update a single stock's price
    const updateStockPrice = async (symbol, ref) => {
        const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
        
        try {
            const authHeaders = await window.getAuthHeaders();
            const response = await fetch(`${API_BASE}/api/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                credentials: 'include',
                body: JSON.stringify({ symbol: symbol })
            });
            
            // No rate limiting - just track last call time
            ref.lastCallTime = Date.now();
            
            if (response.ok) {
                const stockData = await response.json();
                const oldPrice = ref.priceCache.get(symbol);
                const newPrice = stockData.price;
                
                // Use priceChangePercent from API, or calculate daily change if available
                let newChangePercent = stockData.priceChangePercent || 0;
                let priceChange = stockData.priceChange || 0;
                
                // If we have previous price, calculate daily change for better accuracy
                // This helps when API returns 30-day change but we want daily change
                if (oldPrice && oldPrice > 0 && newPrice > 0) {
                    const dailyChange = newPrice - oldPrice;
                    const dailyChangePercent = (dailyChange / oldPrice) * 100;
                    // Use daily change if it's more recent/relevant than API's 30-day change
                    if (Math.abs(dailyChangePercent) > 0.001) {
                        priceChange = dailyChange;
                        newChangePercent = dailyChangePercent;
                    }
                }
                
                const hasSignificantChange = oldPrice && Math.abs(oldPrice - newPrice) > 0.01;
                
                // Update watchlist data with new price and change
                setWatchlistData(prev => prev.map(s => 
                    s.symbol === symbol 
                        ? { 
                            ...s, 
                            current_price: newPrice, 
                            change_percent: newChangePercent,
                            price_change: priceChange,
                            _updated: hasSignificantChange
                        }
                        : s
                ));
                
                if (hasSignificantChange) {
                    setTimeout(() => {
                        setWatchlistData(prev => prev.map(s => 
                            s.symbol === symbol ? { ...s, _updated: false } : s
                        ));
                    }, 2000);
                }
                
                ref.priceCache.set(symbol, newPrice);
                return true;
            }
        } catch (e) {
            // Silently handle update errors
        }
        return false;
    };

    // Live pricing updates with smart visibility detection and rate limiting
    // Strategy:
    // - Watchlist <= 30 stocks: Update ALL stocks live (every 2 seconds)
    // - Watchlist > 30 stocks: Only update visible stocks (to respect API limits)
    // - Stocks continue updating while visible
    // - Always respects API rate limits (30 calls/minute)
    useEffect(() => {
        if (!watchlistData.length || !marketStatus.isOpen) return;
        
        const ref = livePricingRef.current;
        
        // Set up Intersection Observer to track visible stocks
        // This is used when watchlist exceeds 30 stocks to optimize API usage
        const observer = new IntersectionObserver((entries) => {
            const newlyVisible = [];
            entries.forEach(entry => {
                const symbol = entry.target.getAttribute('data-stock-symbol');
                if (!symbol) return;
                
                if (entry.isIntersecting) {
                    const wasVisible = ref.visibleStocks.has(symbol);
                    ref.visibleStocks.add(symbol);
                    // If stock just became visible, add to queue for immediate update
                    if (!wasVisible) {
                        newlyVisible.push(symbol);
                    }
                } else {
                    ref.visibleStocks.delete(symbol);
                }
            });
            
            // Immediately update prices for newly visible stocks
            if (newlyVisible.length > 0) {
                newlyVisible.forEach(symbol => {
                    // Small delay to batch multiple stocks coming into view
                    setTimeout(() => {
                        const stock = watchlistData.find(s => s.symbol === symbol);
                        if (stock && ref.visibleStocks.has(symbol)) {
                            updateStockPrice(symbol, ref);
                        }
                    }, 100);
                });
            }
        }, {
            root: null,
            rootMargin: '100px', // Start loading earlier (increased from 50px)
            threshold: 0.01 // Lower threshold for faster detection
        });
        
        // Observe all stock elements
        const observeStocks = () => {
            watchlistData.forEach(stock => {
                const elements = document.querySelectorAll(`[data-stock-symbol="${stock.symbol}"]`);
                elements.forEach(el => {
                    // Only observe if not already observed
                    if (!el.hasAttribute('data-observed')) {
                        observer.observe(el);
                        el.setAttribute('data-observed', 'true');
                    }
                });
            });
        };
        
        // Initial observation with minimal delay to ensure DOM is ready
        const observeTimeout = setTimeout(observeStocks, 100);

        // REMOVED: HTTP polling mechanism - WebSocket now handles ALL updates
        // Backend sends updates every 30s via WebSocket
        // This eliminates race conditions and respects rate limits

        // // console.log(`WebSocket-only mode active for ${watchlistData.length} stocks`);
        // // console.log(`   Updates via WebSocket every 30s from backend`);

        return () => {
            clearTimeout(observeTimeout);
            observer.disconnect();
            ref.isActive = false;
        };
    }, [watchlistData, marketStatus.isOpen]);
    
    // Function to handle hover updates for off-screen stocks
    const handleStockHover = async (symbol) => {
        const ref = livePricingRef.current;
        
        // Only update if not visible and not recently updated
        if (ref.visibleStocks.has(symbol)) return;
        
        ref.hoveredStocks.add(symbol);
        
        // Small delay to avoid rapid hover updates
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await updateStockPrice(symbol, ref);
        
        // Remove from hovered after a delay
        setTimeout(() => {
            ref.hoveredStocks.delete(symbol);
        }, 5000);
    };

    // Calculate dropdown position when it opens
    useEffect(() => {
        if (userMenuOpen && userMenuBtnRef.current) {
            const buttonRect = userMenuBtnRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: buttonRect.bottom + 8,
                right: window.innerWidth - buttonRect.right
            });
        }
    }, [userMenuOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Don't close if clicking on a dropdown item (let it handle its own click)
            if (event.target.closest('.dropdown-item')) {
                return;
            }
            
            if (userMenuOpen && 
                !event.target.closest('.user-menu-wrapper') && 
                !event.target.closest('.user-dropdown') &&
                !event.target.closest('.preferences-modal')) {
                setUserMenuOpen(false);
            }
        };

        const handleResize = () => {
            if (userMenuOpen && userMenuBtnRef.current) {
                const buttonRect = userMenuBtnRef.current.getBoundingClientRect();
                setDropdownPosition({
                    top: buttonRect.bottom + 8,
                    right: window.innerWidth - buttonRect.right
                });
            }
        };

        if (userMenuOpen) {
            document.addEventListener('click', handleClickOutside);
            window.addEventListener('resize', handleResize);
        }

        return () => {
            document.removeEventListener('click', handleClickOutside);
            window.removeEventListener('resize', handleResize);
        };
    }, [userMenuOpen]);

    // Periodic watchlist refresh to keep cache updated (controlled by autoRefresh preference)
    useEffect(() => {
        if (!preferences.autoRefresh) return;

        const refreshWatchlist = () => {
            // Only refresh if user is authenticated and we have data
            if (window.firebaseAuth?.currentUser && watchlistData.length > 0) {
                const timeSinceLastLoad = Date.now() - lastSuccessfulLoadRef.current;
                if (timeSinceLastLoad > WATCHLIST_REFRESH_INTERVAL) {
                    loadWatchlistData();
                }
            }
        };

        // Check every 2 minutes if we need to refresh
        const refreshInterval = setInterval(refreshWatchlist, 2 * 60 * 1000);

        return () => clearInterval(refreshInterval);
    }, [watchlistData.length, preferences.autoRefresh]);

    // Watchlist localStorage cache helpers
    const WATCHLIST_CACHE_KEY = 'watchlist_cache';
    const WATCHLIST_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const WATCHLIST_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

    // Track last successful load for refresh logic
    const lastSuccessfulLoadRef = useRef(0);

    const saveWatchlistToCache = (watchlistData) => {
        try {
            const cacheData = {
                data: watchlistData,
                timestamp: Date.now(),
                userId: window.firebaseAuth?.currentUser?.uid
            };
            localStorage.setItem(WATCHLIST_CACHE_KEY, JSON.stringify(cacheData));
            // // console.log('Saved watchlist to localStorage cache');
        } catch (error) {
            // // console.warn('Failed to save watchlist to cache:', error);
        }
    };

    const loadWatchlistFromCache = () => {
        try {
            const cachedData = localStorage.getItem(WATCHLIST_CACHE_KEY);
            if (!cachedData) {
                // // console.log('📭 No watchlist cache found');
                return null;
            }

            const cache = JSON.parse(cachedData);
            const now = Date.now();
            const cacheAge = now - cache.timestamp;

            // Check if cache is for current user
            const currentUserId = window.firebaseAuth?.currentUser?.uid;
            if (cache.userId !== currentUserId) {
                // // console.log('👤 Cache is for different user, ignoring');
                localStorage.removeItem(WATCHLIST_CACHE_KEY);
                return null;
            }

            // Check if cache is expired
            if (cacheAge > WATCHLIST_CACHE_EXPIRY) {
                // // console.log('Watchlist cache expired, removing');
                localStorage.removeItem(WATCHLIST_CACHE_KEY);
                return null;
            }

            // // console.log(`📖 Loaded watchlist from cache (${Math.round(cacheAge / 1000 / 60)} minutes old)`);
            return cache.data;
        } catch (error) {
            // // console.warn('Failed to load watchlist from cache:', error);
            return null;
        }
    };

    const clearWatchlistCache = () => {
        try {
            localStorage.removeItem(WATCHLIST_CACHE_KEY);
            // // console.log('🗑️ Cleared watchlist cache');
        } catch (error) {
            // // console.warn('Failed to clear watchlist cache:', error);
        }
    };

    const loadWatchlistData = async () => {
        // Prevent multiple simultaneous requests
        if (isLoadingRef.current) {
            // // console.log('Watchlist request already in progress, skipping duplicate request');
            return;
        }

        try {
            isLoadingRef.current = true;
            // // console.log('\n' + '='.repeat(80));
            // // console.log('LOADING WATCHLIST DATA');
            // // console.log('='.repeat(80));

            // Check if user is authenticated before making request
            if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
                // // console.log('User not authenticated');
                // User not authenticated, cannot load watchlist
                clearWatchlistCache(); // Clear cache for logged out user
                setWatchlistData([]);
                setIsLoading(false);
                return;
            }

            // // console.log('User authenticated:', window.firebaseAuth.currentUser.uid);

            // Try to load from cache first for immediate display
            const cachedWatchlist = loadWatchlistFromCache();
            if (cachedWatchlist && cachedWatchlist.length > 0) {
                // // console.log(`Displaying ${cachedWatchlist.length} cached watchlist items immediately`);
                // Mark cached items to show they need refresh
                const cachedWithFlag = cachedWatchlist.map(item => ({
                    ...item,
                    _isCached: true
                }));
                setWatchlistData(cachedWithFlag);

                // Show notification that cached data is being displayed
                if (window.showNotification) {
                    window.showNotification('Loading watchlist from cache...', 'info');
                }
            }
            
            const authHeaders = await window.getAuthHeaders();
            
            // Verify we have auth headers
            if (!authHeaders || !authHeaders['Authorization']) {
                console.error('Failed to get authentication headers');
                setWatchlistData([]);
                setIsLoading(false);
                return;
            }
            
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            
            const fetchOptions = {
                method: 'GET',
                headers: authHeaders,
                credentials: 'include',
                mode: 'cors'
            };
            
            // Add timeout to prevent hanging indefinitely
            const timeoutMs = 30000; // 30 seconds timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            
            let response;
            try {
                fetchOptions.signal = controller.signal;
                response = await fetch(`${API_BASE}/api/watchlist?t=${Date.now()}`, fetchOptions);
                clearTimeout(timeoutId);
                // Watchlist response received
            } catch (fetchError) {
                clearTimeout(timeoutId);
                // Check if it was a timeout
                if (fetchError.name === 'AbortError' || fetchError.message.includes('aborted')) {
                    console.error('Watchlist request timed out after 30 seconds');
                    throw new Error('Request timed out. Please try again.');
                }
                // Other fetch errors
                console.error('Fetch error:', fetchError);
                throw fetchError;
            }
            
            if (response.ok) {
                let data = await response.json();
                
                // // console.log('📦 RECEIVED FROM API:', data.length, 'stocks');
                
                // Log all symbols received
                if (Array.isArray(data) && data.length > 0) {
                    const symbols = data.map(s => s.symbol || s.id || 'NO_SYMBOL');
                    // // console.log('STOCKS RECEIVED FROM BACKEND:');
                    // symbols.forEach((sym, i) => // console.log(`   ${i + 1}. ${sym}`));
                }
                
                // Backend already provides prices, so we don't need to fetch individually
                // This was causing N API calls on initial load (very slow!)
                if (Array.isArray(data) && data.length > 0) {
                    // Map the data to match expected fields
                    const formattedData = data.map((stock) => {
                        const symbol = stock.symbol || stock.id;
                        // Use original_price as fallback if current_price is 0 or missing
                        const currentPrice = (stock.current_price && stock.current_price > 0) 
                            ? stock.current_price 
                            : (stock.price && stock.price > 0) 
                                ? stock.price 
                                : (stock.original_price && stock.original_price > 0)
                                    ? stock.original_price
                                    : 0;
                        const changePercent = stock.change_percent || stock.priceChangePercent || 0;
                        const priceChange = stock.price_change || stock.priceChange || 0;
                        // Mark if we need to fetch the price (current_price is 0 and we're using original_price)
                        const needsPriceFetch = (stock.current_price === 0 || !stock.current_price) && 
                                               (stock.price === 0 || !stock.price) && 
                                               (stock.original_price && stock.original_price > 0);
                        
                        // Normalize category to match filter options (capitalize first letter, handle variations)
                        let normalizedCategory = (stock.category || 'General').toString().trim();
                        // Map common variations to standard categories
                        const categoryMap = {
                            'tech': 'Technology',
                            'tech stocks': 'Technology',
                            'technology stocks': 'Technology',
                            'technology': 'Technology',
                            'agri': 'Agriculture',
                            'agriculture stocks': 'Agriculture',
                            'agriculture': 'Agriculture',
                            'farming': 'Agriculture',
                            'health': 'Healthcare',
                            'healthcare stocks': 'Healthcare',
                            'healthcare': 'Healthcare',
                            'medical': 'Healthcare',
                            'financial': 'Finance',
                            'finance stocks': 'Finance',
                            'finance': 'Finance',
                            'banking': 'Finance',
                            'energy stocks': 'Energy',
                            'energy': 'Energy',
                            'oil': 'Energy',
                            'consumer goods': 'Consumer',
                            'consumer stocks': 'Consumer',
                            'consumer': 'Consumer',
                            'industrial stocks': 'Industrial',
                            'industrial': 'Industrial',
                            'defense': 'Military',
                            'military stocks': 'Military',
                            'military': 'Military',
                            'general stocks': 'General',
                            'general': 'General'
                        };
                        
                        // Normalize to title case and check map
                        const lowerCategory = normalizedCategory.toLowerCase();
                        normalizedCategory = categoryMap[lowerCategory] || 
                                            (normalizedCategory.charAt(0).toUpperCase() + normalizedCategory.slice(1).toLowerCase());
                        
                        // Ensure it matches one of our valid categories, otherwise default to General
                        const validCategories = ['All', 'Technology', 'General', 'Military', 'Agriculture', 'Healthcare', 'Finance', 'Energy', 'Consumer', 'Industrial'];
                        if (!validCategories.includes(normalizedCategory)) {
                            // Invalid category, defaulting to General
                            normalizedCategory = 'General';
                        }
                        
                        return {
                            ...stock,
                            symbol: symbol,
                            name: stock.name || stock.company_name || symbol,
                            company_name: stock.company_name || stock.name || symbol,
                            current_price: currentPrice,
                            change_percent: changePercent,
                            price_change: priceChange,
                            category: normalizedCategory,
                            _priceLoading: needsPriceFetch
                        };
                    });
                    
                    // // console.log('SET WATCHLIST DATA:', formattedData.length, 'stocks');
                    // // console.log('   Sample stock:', formattedData[0]);
                    // // console.log('='.repeat(80) + '\n');

                    // Remove cached flags since we now have fresh data
                    const freshData = formattedData.map(item => ({
                        ...item,
                        _isCached: false
                    }));

                    // Formatted watchlist data
                    setWatchlistData(freshData);

                    // Cache the successful data for offline/fallback use
                    saveWatchlistToCache(formattedData);
                    lastSuccessfulLoadRef.current = Date.now();

                    // Show success notification if we were previously showing cached data
                    const wasCached = watchlistData.some(item => item._isCached);
                    if (wasCached && window.showNotification) {
                        window.showNotification('Watchlist updated with latest data', 'success');
                    }
                    
                    // Immediately fetch prices for stocks that need price updates
                    // Prioritize visible stocks (first 10 stocks) to show prices instantly
                    const stocksNeedingPrices = formattedData.filter(s => s._priceLoading);
                    
                    if (stocksNeedingPrices.length > 0) {
                        // Fetching prices for stocks
                        
                        // Helper function to fetch a single stock price
                        const fetchStockPrice = async (symbol) => {
                            try {
                                const authHeaders = await window.getAuthHeaders();
                                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                                const response = await fetch(`${API_BASE}/api/search`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        ...authHeaders
                                    },
                                    credentials: 'include',
                                    body: JSON.stringify({ symbol: symbol })
                                });
                                
                                if (response.ok) {
                                    const stockData = await response.json();
                                    // Update watchlist data with new price
                                    setWatchlistData(prev => prev.map(s => {
                                        if (s.symbol === symbol) {
                                            const newPrice = stockData.price && stockData.price > 0 ? stockData.price : s.current_price;
                                            return {
                                                ...s,
                                                current_price: newPrice,
                                                change_percent: stockData.priceChangePercent || s.change_percent || 0,
                                                price_change: stockData.priceChange || s.price_change || 0,
                                                _priceLoading: false
                                            };
                                        }
                                        return s;
                                    }));
                                    return true;
                                }
                            } catch (e) {
                                // // console.warn(`Failed to fetch price for ${symbol}:`, e);
                            }
                            return false;
                        };
                        
                        // Fetch prices for all stocks in parallel (up to 10 at a time)
                        const stocksToFetch = stocksNeedingPrices.slice(0, 10);
                        Promise.all(stocksToFetch.map(stock => fetchStockPrice(stock.symbol)))
                            .then(() => {
                                // Initial price fetch completed
                            });
                    }
                } else {
                    // // console.warn('Watchlist data is empty or not an array');
                    // Don't clear watchlist if we have cached data
                    const cachedData = loadWatchlistFromCache();
                    if (cachedData && cachedData.length > 0) {
                        // // console.log('Using cached watchlist data instead of clearing');
                        setWatchlistData(cachedData);
                    } else {
                        setWatchlistData([]);
                    }
                }
            } else {
                const errorText = await response.text();
                // Watchlist API error
                
                // If 401, user might need to re-authenticate
                if (response.status === 401) {
                    // Authentication failed - user may need to log in again
                    // Try to refresh the token
                    if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                        try {
                            await window.firebaseAuth.currentUser.getIdToken(true); // Force refresh
                            // Token refreshed, retrying
                            // Retry once after token refresh
                            setTimeout(() => loadWatchlistData(), 1000);
                            return;
                        } catch (refreshError) {
                            // Failed to refresh token
                        }
                    }
                }
                
                // Don't clear watchlist if we have cached data
                const cachedData = loadWatchlistFromCache();
                if (cachedData && cachedData.length > 0) {
                    // // console.log('Keeping cached watchlist data due to API error');
                    setWatchlistData(cachedData);
                    // Show a warning but don't clear the data
                    if (window.showNotification) {
                        window.showNotification('Using cached watchlist data. Some information may be outdated.', 'warning');
                    }
                } else {
                    setWatchlistData([]);
                }
            }
        } catch (error) {
            // Error loading watchlist
            console.error('Error loading watchlist:', error);
            console.error('Error details:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });

            // Don't clear watchlist if we have cached data
            const cachedData = loadWatchlistFromCache();
            if (cachedData && cachedData.length > 0) {
                // // console.log('Using cached watchlist data due to error');
                setWatchlistData(cachedData);
                // Show a warning but don't clear the data
                if (window.showNotification) {
                    window.showNotification('Using cached watchlist data due to connection issues.', 'warning');
                }
            } else {
                setWatchlistData([]);
                // Show user-friendly error message only if no cache available
                if (window.showNotification) {
                    const errorMsg = error.message || 'Failed to load watchlist. Please refresh the page.';
                    window.showNotification(errorMsg, 'error');
                }
            }
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false; // Reset loading flag
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
                
                // Track searched stock for priority real-time updates
                const symbol = searchQuery.toUpperCase();
                trackStockView(symbol);
                
                // Track search results for priority updates
                if (socketRef.current && socketRef.current.connected) {
                    const trackSearch = async () => {
                        try {
                            const authHeaders = await window.getAuthHeaders();
                            const userId = authHeaders['X-User-ID'];
                            if (userId) {
                                socketRef.current.emit('track_search_stock', {
                                    user_id: userId,
                                    symbols: [symbol]
                                });
                            }
                        } catch (e) {
                            // Error tracking search stock
                        }
                    };
                    trackSearch();
                }
                
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

    const handleAddFirstStock = () => {
        // Scroll to search bar smoothly
        const searchBar = document.querySelector('.quick-search-bar');
        if (searchBar) {
            searchBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // Focus the search input after a short delay to ensure scroll completes
        setTimeout(() => {
            if (searchInputRef.current) {
                searchInputRef.current.focus();
                searchInputRef.current.click();
            }
        }, 300);
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
                    const data = await resp.json();
                    // Extract results array from response (handles both {results: [...]} and direct array)
                    const res = data.results || data;
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
        }, 200); // Faster debounce for real-time feel
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
            window.location.href = '/';
        }
    };

    const openDetails = (symbol) => {
        if (window.openStockDetailsModalReact) {
            window.openStockDetailsModalReact(symbol);
        }
    };

    // Expose chart viewing globally - opens chart-only modal
    window.viewChart = async (symbol) => {
        if (!symbol) return;
        
        // Create chart-only modal
        const chartModalContainer = document.createElement('div');
        chartModalContainer.id = 'chart-only-modal-container';
        chartModalContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        `;
        
        // Add fadeIn animation if not exists
        if (!document.getElementById('chart-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'chart-modal-styles';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        const chartContent = document.createElement('div');
        chartContent.style.cssText = `
            background: linear-gradient(135deg, #10121b 0%, #1a1d2e 100%);
            border-radius: 6px;
            padding: 0;
            max-width: 1000px;
            width: 100%;
            max-height: 90vh;
            position: relative;
            overflow: visible;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(204, 85, 0, 0.2);
        `;
        
        // Close button - positioned outside the chart box
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: -15px;
            right: -15px;
            background: rgba(239, 68, 68, 0.9);
            color: #ffffff;
            border: 2px solid rgba(239, 68, 68, 1);
            padding: 0.5rem 0.75rem;
            border-radius: 50%;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            z-index: 10001;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        `;
        closeBtn.onmouseover = () => {
            closeBtn.style.background = 'rgba(239, 68, 68, 1)';
            closeBtn.style.transform = 'scale(1.1)';
        };
        closeBtn.onmouseout = () => {
            closeBtn.style.background = 'rgba(239, 68, 68, 0.9)';
            closeBtn.style.transform = 'scale(1)';
        };
        
        const closeModal = () => {
            chartModalContainer.remove();
            document.body.style.overflow = '';
        };
        closeBtn.onclick = closeModal;
        
        // Chart container wrapper with padding
        const chartWrapper = document.createElement('div');
        chartWrapper.style.cssText = 'padding: 2rem; width: 100%; box-sizing: border-box;';
        
        // Chart container
        const chartContainer = document.createElement('div');
        chartContainer.id = 'chartOnlyContainer';
        chartContainer.style.cssText = 'width: 100%; min-height: 500px;';
        
        chartWrapper.appendChild(chartContainer);
        chartContent.appendChild(closeBtn);
        chartContent.appendChild(chartWrapper);
        chartModalContainer.appendChild(chartContent);
        document.body.appendChild(chartModalContainer);
        document.body.style.overflow = 'hidden';
        
        // Fetch chart data and render
        try {
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const response = await fetch(`${API_BASE}/api/chart/${symbol}?range=30d`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const chartData = await response.json();
                
                // Wait for StockChart to be available
                const maxRetries = 10;
                let retries = 0;
                const renderChart = () => {
                    if (window.StockChart && chartContainer) {
                        const chartRoot = ReactDOM.createRoot(chartContainer);
                        chartRoot.render(React.createElement(window.StockChart, {
                            symbol: symbol,
                            data: chartData,
                            isModal: true,
                            onClose: closeModal
                        }));
                    } else if (retries < maxRetries) {
                        retries++;
                        setTimeout(renderChart, 200);
                    } else {
                        chartContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ef4444;"><i class="fas fa-exclamation-circle"></i><p>Chart component not available</p></div>';
                    }
                };
                renderChart();
            } else {
                chartContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ef4444;"><i class="fas fa-exclamation-circle"></i><p>Failed to load chart data</p></div>';
            }
        } catch (error) {
            chartContainer.innerHTML = `<div style="padding: 2rem; text-align: center; color: #ef4444;"><i class="fas fa-exclamation-circle"></i><p>Error: ${error.message}</p></div>`;
        }
        
        // Close on escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    };

    const removeFromWatchlist = async (symbol) => {
        try {
            const confirmed = window.confirm ? window.confirm(`Remove ${symbol} from your watchlist?`) : true;
            if (!confirmed) return;
            
            // Optimistically remove from UI immediately
            const symbolUpper = symbol.toUpperCase();
            setWatchlistData((prev) => {
                const filtered = prev.filter((s) => {
                    const stockSymbol = (s.symbol || s.id || '').toUpperCase();
                    return stockSymbol !== symbolUpper;
                });
                return filtered;
            });
            
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const response = await fetch(`${API_BASE}/api/watchlist/${encodeURIComponent(symbol)}`, {
                method: 'DELETE',
                headers: authHeaders,
                credentials: 'include'
            });
            
            if (response.ok) {
                // Reload watchlist data to ensure consistency with backend
                await loadWatchlistData();
                
                // Notify other parts of the app
                try {
                    window.dispatchEvent && window.dispatchEvent(new CustomEvent('watchlistChanged'));
                } catch (_) {}
                if (typeof window.refreshWatchlist === 'function') {
                    window.refreshWatchlist();
                }
                window.showNotification && window.showNotification(`${symbol} removed from watchlist`, 'success');
            } else {
                // If deletion failed, reload to restore the stock
                await loadWatchlistData();
                const errorData = await response.json().catch(() => ({ error: 'Failed to remove stock' }));
                window.showNotification && window.showNotification(errorData.error || `Failed to remove ${symbol}`, 'error');
            }
        } catch (error) {
            // On error, reload to restore state
            await loadWatchlistData();
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

    // Category filter options
    const categories = ['All', 'Technology', 'General', 'Military', 'Agriculture', 'Healthcare', 'Finance', 'Energy', 'Consumer', 'Industrial'];

    if (isLoading) {
        return (
            <div className="dashboard-redesign">
                <div className="loading-container">
                    <div style={{
                        width: '50px',
                        height: '50px',
                        border: '3px solid rgba(0, 217, 36, 0.2)',
                        borderTop: '3px solid #00D924',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        marginBottom: '2rem'
                    }}></div>
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
                        <i className="fas fa-chart-line"></i> AI Stock Sage
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
                            className={`nav-tab ${activeView === 'whatswhat' ? 'active' : ''}`}
                            onClick={() => setActiveView('whatswhat')}
                        >
                            <i className="fas fa-fire"></i>
                            <span>What's Hot</span>
                        </button>
                        <button
                            className={`nav-tab ${activeView === 'intelligence' ? 'active' : ''}`}
                            onClick={() => setActiveView('intelligence')}
                        >
                            <i className="fas fa-chart-pie"></i>
                            <span>Intelligence</span>
                        </button>
                        <button 
                            className={`nav-tab ${activeView === 'trading' ? 'active' : ''}`}
                            onClick={() => setActiveView('trading')}
                        >
                            <i className="fas fa-exchange-alt"></i>
                            <span>Trading</span>
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
                            ref={userMenuBtnRef}
                            className="user-menu-btn"
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                        >
                            <i className="fas fa-user-circle"></i>
                            <span>Account</span>
                            <i className={`fas fa-chevron-down ${userMenuOpen ? 'open' : ''}`}></i>
                        </button>
                        {userMenuOpen && ReactDOM.createPortal(
                            <div 
                                ref={userDropdownRef}
                                className="user-dropdown"
                                style={{
                                    top: `${dropdownPosition.top}px`,
                                    right: `${dropdownPosition.right}px`
                                }}
                            >
                                <div className="user-dropdown-header">
                                    <div className="user-info">
                                        <div className="user-avatar">
                                            {profilePicture ? (
                                                <img src={profilePicture} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                            ) : (
                                                <i className="fas fa-user"></i>
                                            )}
                                        </div>
                                        <div>
                                            <div className="user-name">{userData.name}</div>
                                            <div className="user-email">{userData.email}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="dropdown-divider"></div>
                                <div
                                    className="dropdown-item"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setProfileSettingsOpen(true);
                                        setUserMenuOpen(false);
                                    }}
                                >
                                    <i className="fas fa-user"></i>
                                    <span>Profile Settings</span>
                                </div>
                                <div
                                    className="dropdown-item"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setPreferencesOpen(true);
                                        setUserMenuOpen(false);
                                    }}
                                >
                                    <i className="fas fa-cog"></i>
                                    <span>Preferences</span>
                                </div>
                                <div
                                    className="dropdown-item"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSecurityOpen(true);
                                        setUserMenuOpen(false);
                                    }}
                                >
                                    <i className="fas fa-shield-alt"></i>
                                    <span>Security</span>
                                </div>
                                <div className="dropdown-divider"></div>
                                <div
                                    className="dropdown-item"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setTermsOpen(true);
                                        setUserMenuOpen(false);
                                    }}
                                >
                                    <i className="fas fa-file-alt"></i>
                                    <span>Terms of Service</span>
                                </div>
                                <div
                                    className="dropdown-item"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setPrivacyOpen(true);
                                        setUserMenuOpen(false);
                                    }}
                                >
                                    <i className="fas fa-lock"></i>
                                    <span>Privacy Policy</span>
                                </div>
                                <div
                                    className="dropdown-item"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setHelpOpen(true);
                                        setUserMenuOpen(false);
                                    }}
                                >
                                    <i className="fas fa-question-circle"></i>
                                    <span>Help & Support</span>
                                </div>
                                <div className="dropdown-divider"></div>
                                <div className="dropdown-item logout" onClick={handleLogout}>
                                    <i className="fas fa-sign-out-alt"></i>
                                    <span>Log Out</span>
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>
                </div>
            </header>

            {/* Quick Search Bar - Always Visible */}
            <div className="quick-search-bar">
                <i className="fas fa-search"></i>
                <div className="search-input-wrapper" style={{ position: 'relative', flex: 1 }}>
                    <input 
                        ref={searchInputRef}
                        type="text" 
                        placeholder="Search stocks, companies, or symbols..." 
                        className="search-input"
                        value={searchQuery}
                        onChange={(e) => onSearchInputChange(e.target.value)}
                        onKeyDown={handleKeyPress}
                        aria-autocomplete="list"
                        aria-expanded={suggestions.length > 0}
                    />
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
                <button className="search-btn" onClick={handleSearch} disabled={searching}>
                    {searching ? 'Searching…' : 'Search'}
                </button>
            </div>

            {/* Main Content Area */}
            <div className="dashboard-content">
                {activeView === 'overview' && <OverviewView watchlistData={watchlistData} marketStatus={marketStatus} onNavigate={setActiveView} onStockHover={handleStockHover} preferences={preferences} />}
                {activeView === 'watchlist' && (
                    <WatchlistView
                        watchlistData={watchlistData}
                        onOpenDetails={openDetails}
                        onRemove={removeFromWatchlist}
                        onAddFirstStock={handleAddFirstStock}
                        onAdd={addToWatchlist}
                        selectedCategory={selectedCategory}
                        onCategoryChange={setSelectedCategory}
                        categories={categories}
                        onStockHover={handleStockHover}
                        updatingStocks={updatingStocks}
                        preferences={preferences}
                    />
                )}
                {activeView === 'news' && <NewsView />}
                {activeView === 'whatswhat' && <WhatsWhatView />}
                {activeView === 'intelligence' && <IntelligenceView watchlistData={watchlistData} />}
                {activeView === 'trading' && <TradingView />}
                {activeView === 'assistant' && <AIAssistantView />}
            </div>

            {/* Floating Assistant - Hidden when already in assistant view */}
            {activeView !== 'assistant' && (
                <button className="floating-ai-btn" onClick={() => setActiveView('assistant')}>
                    <i className="fas fa-comments"></i>
                    <span className="tooltip">Open Assistant</span>
                </button>
            )}

            {/* Profile Settings Modal */}
            {profileSettingsOpen && ReactDOM.createPortal(
                <div className="modal-overlay" onClick={() => setProfileSettingsOpen(false)}>
                    <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><i className="fas fa-user"></i> Profile Settings</h2>
                            <button className="modal-close" onClick={() => setProfileSettingsOpen(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="profile-picture-section">
                                <div className="profile-picture-preview">
                                    {profilePicture ? (
                                        <img src={profilePicture} alt="Profile" />
                                    ) : (
                                        <div className="profile-picture-placeholder">
                                            <i className="fas fa-user"></i>
                                        </div>
                                    )}
                                </div>
                                <div className="profile-picture-actions">
                                    <label className="upload-btn">
                                        <i className="fas fa-camera"></i> Change Photo
                                        <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={(e) => {
                                                const file = e.target.files[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setProfilePicture(reader.result);
                                                        localStorage.setItem('profilePicture', reader.result);
                                                        if (window.showNotification) {
                                                            window.showNotification('Profile picture updated!', 'success');
                                                        }
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </label>
                                    {profilePicture && (
                                        <button
                                            className="remove-photo-btn"
                                            onClick={() => {
                                                setProfilePicture(null);
                                                localStorage.removeItem('profilePicture');
                                                if (window.showNotification) {
                                                    window.showNotification('Profile picture removed', 'success');
                                                }
                                            }}
                                        >
                                            <i className="fas fa-trash"></i> Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="settings-section">
                                <h3>Account Information</h3>
                                <div className="settings-item">
                                    <label>Display Name</label>
                                    <input type="text" defaultValue={userData.name} placeholder="Your name" />
                                </div>
                                <div className="settings-item">
                                    <label>Email</label>
                                    <input type="email" value={userData.email} disabled />
                                    <span className="input-hint">Email cannot be changed</span>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setProfileSettingsOpen(false)}>Cancel</button>
                            <button className="btn-primary" onClick={() => {
                                if (window.showNotification) {
                                    window.showNotification('Profile settings saved!', 'success');
                                }
                                setProfileSettingsOpen(false);
                            }}>Save Changes</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Preferences Modal */}
            {preferencesOpen && ReactDOM.createPortal(
                <div className="modal-overlay" onClick={() => setPreferencesOpen(false)}>
                    <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><i className="fas fa-cog"></i> Preferences</h2>
                            <button className="modal-close" onClick={() => setPreferencesOpen(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="settings-section">
                                <h3>Appearance</h3>
                                <div className="settings-item toggle-item">
                                    <div>
                                        <label>Theme</label>
                                        <span className="setting-description">Choose your preferred color scheme</span>
                                    </div>
                                    <div className="theme-toggle">
                                        <button
                                            className={`theme-btn ${preferences.theme === 'dark' ? 'active' : ''}`}
                                            onClick={() => savePreferences({ ...preferences, theme: 'dark' })}
                                        >
                                            <i className="fas fa-moon"></i> Dark
                                        </button>
                                        <button
                                            className={`theme-btn ${preferences.theme === 'light' ? 'active' : ''}`}
                                            onClick={() => savePreferences({ ...preferences, theme: 'light' })}
                                        >
                                            <i className="fas fa-sun"></i> Light
                                        </button>
                                    </div>
                                </div>
                                <div className="settings-item toggle-item">
                                    <div>
                                        <label>Compact Numbers</label>
                                        <span className="setting-description">Show 1.5M instead of 1,500,000</span>
                                    </div>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={preferences.compactNumbers}
                                            onChange={(e) => savePreferences({ ...preferences, compactNumbers: e.target.checked })}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div className="settings-section">
                                <h3>Display</h3>
                                <div className="settings-item toggle-item">
                                    <div>
                                        <label>Show Sparklines</label>
                                        <span className="setting-description">Mini charts on stock cards</span>
                                    </div>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={preferences.showSparklines}
                                            onChange={(e) => savePreferences({ ...preferences, showSparklines: e.target.checked })}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>
                                <div className="settings-item toggle-item">
                                    <div>
                                        <label>Show Percent Change</label>
                                        <span className="setting-description">Display percentage change on stocks</span>
                                    </div>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={preferences.showPercentChange}
                                            onChange={(e) => savePreferences({ ...preferences, showPercentChange: e.target.checked })}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>
                                <div className="settings-item toggle-item">
                                    <div>
                                        <label>Auto Refresh Prices</label>
                                        <span className="setting-description">Automatically update stock prices</span>
                                    </div>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={preferences.autoRefresh}
                                            onChange={(e) => savePreferences({ ...preferences, autoRefresh: e.target.checked })}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div className="settings-section">
                                <h3>Default Settings</h3>
                                <div className="settings-item">
                                    <label>Default Chart Time Range</label>
                                    <select
                                        value={preferences.defaultTimeRange}
                                        onChange={(e) => savePreferences({ ...preferences, defaultTimeRange: e.target.value })}
                                    >
                                        <option value="1D">1 Day</option>
                                        <option value="1W">1 Week</option>
                                        <option value="1M">1 Month</option>
                                        <option value="3M">3 Months</option>
                                        <option value="1Y">1 Year</option>
                                        <option value="5Y">5 Years</option>
                                    </select>
                                </div>
                                <div className="settings-item">
                                    <label>Currency</label>
                                    <select
                                        value={preferences.currency}
                                        onChange={(e) => savePreferences({ ...preferences, currency: e.target.value })}
                                    >
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (€)</option>
                                        <option value="GBP">GBP (£)</option>
                                        <option value="JPY">JPY (¥)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setPreferencesOpen(false)}>Close</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Security Modal */}
            {securityOpen && ReactDOM.createPortal(
                <div className="modal-overlay" onClick={() => setSecurityOpen(false)}>
                    <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><i className="fas fa-shield-alt"></i> Security</h2>
                            <button className="modal-close" onClick={() => setSecurityOpen(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="settings-section">
                                <h3>Password</h3>
                                <div className="settings-item">
                                    <label>Current Password</label>
                                    <input type="password" placeholder="Enter current password" />
                                </div>
                                <div className="settings-item">
                                    <label>New Password</label>
                                    <input type="password" placeholder="Enter new password" />
                                </div>
                                <div className="settings-item">
                                    <label>Confirm New Password</label>
                                    <input type="password" placeholder="Confirm new password" />
                                </div>
                                <button className="btn-primary" style={{ marginTop: '1rem' }}>Update Password</button>
                            </div>
                            <div className="settings-section">
                                <h3>Two-Factor Authentication</h3>
                                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
                                    Add an extra layer of security to your account
                                </p>
                                <button className="btn-secondary">
                                    <i className="fas fa-lock"></i> Enable 2FA
                                </button>
                            </div>
                            <div className="settings-section">
                                <h3>Active Sessions</h3>
                                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
                                    You're currently logged in on this device
                                </p>
                                <button className="btn-danger">
                                    <i className="fas fa-sign-out-alt"></i> Sign Out All Other Devices
                                </button>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setSecurityOpen(false)}>Close</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Terms of Service Modal */}
            {termsOpen && ReactDOM.createPortal(
                <div className="modal-overlay" onClick={() => setTermsOpen(false)}>
                    <div className="modal-content legal-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><i className="fas fa-file-alt"></i> Terms of Service</h2>
                            <button className="modal-close" onClick={() => setTermsOpen(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body legal-content">
                            <p className="legal-updated">Last Updated: January 2026</p>

                            <h3>1. Acceptance of Terms</h3>
                            <p>By accessing and using AI Stock Sage ("the Service"), you accept and agree to be bound by the terms and conditions of this agreement. If you do not agree to these terms, please do not use our Service.</p>

                            <h3>2. Description of Service</h3>
                            <p>AI Stock Sage is a stock watchlist and portfolio tracking application that provides:</p>
                            <ul>
                                <li>Real-time and delayed stock price information</li>
                                <li>AI-powered market analysis and insights</li>
                                <li>Portfolio tracking and watchlist management</li>
                                <li>Market news aggregation</li>
                                <li>Social sentiment analysis from public sources</li>
                            </ul>

                            <h3>3. Financial Disclaimer</h3>
                            <p><strong>IMPORTANT:</strong> AI Stock Sage is NOT a registered investment advisor, broker-dealer, or financial planner. The information provided through our Service is for informational and educational purposes only and should not be construed as investment advice.</p>
                            <ul>
                                <li>We do not provide personalized investment recommendations</li>
                                <li>Past performance does not guarantee future results</li>
                                <li>You should consult with a qualified financial advisor before making investment decisions</li>
                                <li>All investment decisions are made at your own risk</li>
                            </ul>

                            <h3>4. Data Accuracy</h3>
                            <p>While we strive to provide accurate and timely information, we cannot guarantee the accuracy, completeness, or timeliness of the data displayed. Stock prices may be delayed and should not be used for trading decisions without verification from official sources.</p>

                            <h3>5. User Responsibilities</h3>
                            <p>You agree to:</p>
                            <ul>
                                <li>Provide accurate account information</li>
                                <li>Maintain the security of your account credentials</li>
                                <li>Use the Service only for lawful purposes</li>
                                <li>Not attempt to reverse engineer or compromise the Service</li>
                            </ul>

                            <h3>6. Limitation of Liability</h3>
                            <p>AI Stock Sage and its affiliates shall not be liable for any direct, indirect, incidental, special, or consequential damages resulting from your use of the Service or any investment decisions made based on information provided through the Service.</p>

                            <h3>7. Changes to Terms</h3>
                            <p>We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>

                            <h3>8. Contact</h3>
                            <p>For questions about these Terms of Service, please contact us at destinyheroev@gmail.com</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-primary" onClick={() => setTermsOpen(false)}>I Understand</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Privacy Policy Modal */}
            {privacyOpen && ReactDOM.createPortal(
                <div className="modal-overlay" onClick={() => setPrivacyOpen(false)}>
                    <div className="modal-content legal-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><i className="fas fa-lock"></i> Privacy Policy</h2>
                            <button className="modal-close" onClick={() => setPrivacyOpen(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body legal-content">
                            <p className="legal-updated">Last Updated: January 2026</p>

                            <h3>1. Information We Collect</h3>
                            <p>We collect information you provide directly to us, including:</p>
                            <ul>
                                <li><strong>Account Information:</strong> Email address, display name, and profile picture</li>
                                <li><strong>Watchlist Data:</strong> Stocks you add to your watchlist and portfolio</li>
                                <li><strong>Usage Data:</strong> How you interact with our Service</li>
                                <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers</li>
                            </ul>

                            <h3>2. How We Use Your Information</h3>
                            <p>We use the information we collect to:</p>
                            <ul>
                                <li>Provide, maintain, and improve our Service</li>
                                <li>Personalize your experience and deliver relevant content</li>
                                <li>Send you technical notices and support messages</li>
                                <li>Respond to your comments and questions</li>
                                <li>Protect against fraudulent or illegal activity</li>
                            </ul>

                            <h3>3. Information Sharing</h3>
                            <p>We do not sell, trade, or otherwise transfer your personal information to third parties except:</p>
                            <ul>
                                <li>With your consent</li>
                                <li>To comply with legal obligations</li>
                                <li>To protect our rights and safety</li>
                                <li>With service providers who assist in operating our Service (under strict confidentiality agreements)</li>
                            </ul>

                            <h3>4. Data Security</h3>
                            <p>We implement industry-standard security measures to protect your personal information, including:</p>
                            <ul>
                                <li>Encryption of data in transit and at rest</li>
                                <li>Secure authentication through Firebase</li>
                                <li>Regular security audits and updates</li>
                            </ul>

                            <h3>5. Data Retention</h3>
                            <p>We retain your personal information for as long as your account is active or as needed to provide you services. You may request deletion of your account and associated data at any time.</p>

                            <h3>6. Your Rights</h3>
                            <p>You have the right to:</p>
                            <ul>
                                <li>Access your personal information</li>
                                <li>Correct inaccurate data</li>
                                <li>Request deletion of your data</li>
                                <li>Export your data in a portable format</li>
                                <li>Opt out of marketing communications</li>
                            </ul>

                            <h3>7. Cookies and Tracking</h3>
                            <p>We use cookies and similar technologies to enhance your experience, analyze usage, and personalize content. You can control cookies through your browser settings.</p>

                            <h3>8. Third-Party Services</h3>
                            <p>Our Service integrates with third-party services (Yahoo Finance, Stocktwits, etc.) which have their own privacy policies. We encourage you to review their policies.</p>

                            <h3>9. Children's Privacy</h3>
                            <p>Our Service is not intended for children under 13. We do not knowingly collect personal information from children under 13.</p>

                            <h3>10. Contact Us</h3>
                            <p>For privacy-related questions or concerns, please contact us at destinyheroev@gmail.com</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-primary" onClick={() => setPrivacyOpen(false)}>I Understand</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Help & Support Modal */}
            {helpOpen && ReactDOM.createPortal(
                <div className="modal-overlay" onClick={() => setHelpOpen(false)}>
                    <div className="modal-content help-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><i className="fas fa-question-circle"></i> Help & Support</h2>
                            <button className="modal-close" onClick={() => setHelpOpen(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="help-section">
                                <div className="help-icon">
                                    <i className="fas fa-envelope"></i>
                                </div>
                                <div className="help-content">
                                    <h3>Contact Us</h3>
                                    <p>In case of questions or feedback, email:</p>
                                    <a href="mailto:destinyheroev@gmail.com" className="help-email">
                                        destinyheroev@gmail.com
                                    </a>
                                </div>
                            </div>
                            <div className="help-section">
                                <div className="help-icon">
                                    <i className="fas fa-clock"></i>
                                </div>
                                <div className="help-content">
                                    <h3>Response Time</h3>
                                    <p>We typically respond within 24-48 hours during business days.</p>
                                </div>
                            </div>
                            <div className="help-section">
                                <div className="help-icon">
                                    <i className="fas fa-book"></i>
                                </div>
                                <div className="help-content">
                                    <h3>Quick Tips</h3>
                                    <ul>
                                        <li>Use the search bar to find any stock by symbol or company name</li>
                                        <li>Click on any stock to see detailed information and charts</li>
                                        <li>Use the AI Assistant for market insights and questions</li>
                                        <li>Set up price alerts to stay informed of market movements</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-primary" onClick={() => setHelpOpen(false)}>Got It</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

// Sparkline Component for Mini Charts
const SparklineChart = ({ symbol, data, isPositive, width = 100, height = 40 }) => {
    const canvasRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [chartData, setChartData] = useState(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!symbol) return;

        // Fetch 30-day chart data for sparkline (more data points = smoother line)
        const fetchSparklineData = async () => {
            try {
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const response = await fetch(`${API_BASE}/api/chart/${symbol}?range=1M`, {
                    credentials: 'include'
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data && Array.isArray(data) && data.length > 0) {
                        // Handle both old format (price) and new format (close)
                        const prices = data.map(d => parseFloat(d.close || d.price)).filter(p => !isNaN(p));
                        if (prices.length > 0) {
                            setChartData(prices);
                            setHasError(false);
                        } else {
                            setHasError(true);
                        }
                    } else {
                        setHasError(true);
                    }
                } else {
                    setHasError(true);
                }
            } catch (error) {
                console.log(`[Sparkline] Error fetching data for ${symbol}:`, error);
                setHasError(true);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSparklineData();
    }, [symbol]);

    useEffect(() => {
        if (!chartData || !canvasRef.current || chartData.length < 2) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Get device pixel ratio for high-DPI displays
        const dpr = window.devicePixelRatio || 1;

        // Display size (CSS pixels)
        const displayWidth = width;
        const displayHeight = height;

        // Set actual canvas size in memory (scaled for high-DPI)
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;

        // Scale the canvas context to match device pixel ratio
        ctx.scale(dpr, dpr);

        // Enable high-quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Set CSS size to display size
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';

        // Clear canvas
        ctx.clearRect(0, 0, displayWidth, displayHeight);

        // Calculate points with padding
        const paddingX = 4;
        const paddingY = 6;
        const min = Math.min(...chartData);
        const max = Math.max(...chartData);
        const range = max - min || 1;
        const stepX = (displayWidth - paddingX * 2) / (chartData.length - 1);
        const effectiveHeight = displayHeight - paddingY * 2;

        // Determine color based on price trend
        const startPrice = chartData[0];
        const endPrice = chartData[chartData.length - 1];
        const trendPositive = endPrice >= startPrice;
        const lineColor = trendPositive ? '#00c805' : '#ff5000';
        const fillColorStart = trendPositive ? 'rgba(0, 200, 5, 0.25)' : 'rgba(255, 80, 0, 0.25)';
        const fillColorEnd = trendPositive ? 'rgba(0, 200, 5, 0.02)' : 'rgba(255, 80, 0, 0.02)';

        // Calculate all points
        const points = chartData.map((price, index) => ({
            x: paddingX + index * stepX,
            y: paddingY + effectiveHeight - ((price - min) / range) * effectiveHeight
        }));

        // Helper function for smooth curve through points
        const drawSmoothLine = (ctx, points, tension = 0.3) => {
            if (points.length < 2) return;

            ctx.moveTo(points[0].x, points[0].y);

            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i === 0 ? i : i - 1];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[i + 2 >= points.length ? i + 1 : i + 2];

                const cp1x = p1.x + (p2.x - p0.x) * tension;
                const cp1y = p1.y + (p2.y - p0.y) * tension;
                const cp2x = p2.x - (p3.x - p1.x) * tension;
                const cp2y = p2.y - (p3.y - p1.y) * tension;

                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
        };

        // Draw gradient fill first
        ctx.beginPath();
        drawSmoothLine(ctx, points, 0.25);

        // Complete the fill path
        ctx.lineTo(points[points.length - 1].x, displayHeight);
        ctx.lineTo(points[0].x, displayHeight);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, displayHeight);
        gradient.addColorStop(0, fillColorStart);
        gradient.addColorStop(1, fillColorEnd);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw the smooth line on top
        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawSmoothLine(ctx, points, 0.25);
        ctx.stroke();

        // Draw end point dot with glow
        const lastPoint = points[points.length - 1];

        // Glow effect
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = trendPositive ? 'rgba(0, 200, 5, 0.3)' : 'rgba(255, 80, 0, 0.3)';
        ctx.fill();

        // Main dot
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();

        // Inner highlight
        ctx.beginPath();
        ctx.arc(lastPoint.x - 0.5, lastPoint.y - 0.5, 1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fill();

    }, [chartData, isPositive, width, height]);

    if (isLoading) {
        return (
            <div
                className="sparkline-loading"
                style={{
                    width: `${width}px`,
                    height: `${height}px`,
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite',
                    borderRadius: '4px'
                }}
            />
        );
    }

    if (hasError || !chartData || chartData.length < 2) {
        return (
            <div
                className="sparkline-error"
                style={{
                    width: `${width}px`,
                    height: `${height}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.2)',
                    fontSize: '10px'
                }}
            >
                <i className="fas fa-chart-line" style={{ opacity: 0.3 }}></i>
            </div>
        );
    }

    return <canvas ref={canvasRef} className="sparkline-chart" style={{ width: `${width}px`, height: `${height}px` }} />;
};

// Sector Allocation Pie Chart Component
const SectorAllocationChart = ({ watchlistData }) => {
    const canvasRef = useRef(null);
    const [sectorData, setSectorData] = useState(null);
    const [sectorAllocation, setSectorAllocation] = useState(null);
    
    // Fetch sector information for all stocks
    useEffect(() => {
        if (!watchlistData || watchlistData.length === 0) {
            setSectorData(null);
            setSectorAllocation(null);
            return;
        }
        
        const fetchSectors = async () => {
            try {
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const authHeaders = await window.getAuthHeaders();
                
                const symbols = watchlistData.map(stock => stock.symbol).filter(Boolean);
                if (symbols.length === 0) return;
                
                const response = await fetch(`${API_BASE}/api/sectors/batch`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...authHeaders
                    },
                    credentials: 'include',
                    body: JSON.stringify({ symbols })
                });
                
                if (response.ok) {
                    const sectors = await response.json();
                    setSectorData(sectors);
                    
                    // Calculate allocation by portfolio value
                    const allocation = {};
                    let totalValue = 0;
                    
                    watchlistData.forEach(stock => {
                        const symbol = stock.symbol;
                        const price = stock.current_price || stock.price || 0;
                        const shares = stock.shares || 1; // Default to 1 share if not specified
                        const value = price * shares;
                        const sector = sectors[symbol] || 'Other';
                        
                        if (!allocation[sector]) {
                            allocation[sector] = { value: 0, count: 0 };
                        }
                        allocation[sector].value += value;
                        allocation[sector].count += 1;
                        totalValue += value;
                    });
                    
                    // Convert to percentages
                    const allocationPercent = {};
                    Object.keys(allocation).forEach(sector => {
                        allocationPercent[sector] = {
                            percentage: totalValue > 0 ? (allocation[sector].value / totalValue) * 100 : 0,
                            value: allocation[sector].value,
                            count: allocation[sector].count
                        };
                    });
                    
                    setSectorAllocation(allocationPercent);
                }
            } catch (error) {
                // Silently handle sector fetch errors
            }
        };
        
        fetchSectors();
    }, [watchlistData]);
    
    // Draw pie chart
    useEffect(() => {
        if (!sectorAllocation || !canvasRef.current) return;
        
        const sectors = Object.keys(sectorAllocation).sort((a, b) => 
            sectorAllocation[b].percentage - sectorAllocation[a].percentage
        );
        
        if (sectors.length === 0) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const size = Math.min(canvas.width, canvas.height);
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = size / 2 - 10;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Colors for sectors - muted, natural palette
        const colors = [
            '#8B9DC3', '#6B7FA8', '#5A6B8F', '#4A5A7A',
            '#5DB896', '#4A9B7F', '#3A7A68', '#2A5A4A',
            '#9B8BA8', '#7A6B8F', '#6A5A7A', '#5A4A6A'
        ];
        
        let currentAngle = -Math.PI / 2;
        
        sectors.forEach((sector, index) => {
            const percentage = sectorAllocation[sector].percentage;
            const sliceAngle = (percentage / 100) * 2 * Math.PI;
            
            // Draw slice
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            currentAngle += sliceAngle;
        });
    }, [sectorAllocation]);
    
    if (!watchlistData || watchlistData.length === 0) {
    return (
            <div className="sector-chart-empty">
                <i className="fas fa-chart-pie"></i>
                <p>Add stocks to see sector allocation</p>
                    </div>
        );
    }
    
    return (
        <>
            <canvas ref={canvasRef} className="sector-chart" width="200" height="200" />
            {sectorAllocation && (
                <div className="sector-legend">
                    {Object.keys(sectorAllocation)
                        .sort((a, b) => sectorAllocation[b].percentage - sectorAllocation[a].percentage)
                        .map((sector, index) => {
                            const data = sectorAllocation[sector];
                            const colors = [
                                '#8B9DC3', '#6B7FA8', '#5A6B8F', '#4A5A7A',
                                '#5DB896', '#4A9B7F', '#3A7A68', '#2A5A4A',
                                '#9B8BA8', '#7A6B8F', '#6A5A7A', '#5A4A6A'
                            ];
                            return (
                                <div key={sector} className="legend-item">
                                    <span 
                                        className="legend-dot" 
                                        style={{ backgroundColor: colors[index % colors.length] }}
                                    ></span>
                                    <span className="legend-label">{sector}</span>
                                    <span className="legend-percentage">{data.percentage.toFixed(1)}%</span>
                    </div>
                            );
                        })}
                </div>
            )}
        </>
    );
};

// Market Overview Component - Shows major indices
const MarketOverview = ({ marketStatus }) => {
    const [indices, setIndices] = useState([
        { symbol: '^GSPC', name: 'S&P 500', shortName: 'S&P', price: null, change: null, changePercent: null },
        { symbol: '^IXIC', name: 'NASDAQ', shortName: 'NASDAQ', price: null, change: null, changePercent: null },
        { symbol: '^DJI', name: 'Dow Jones', shortName: 'DOW', price: null, change: null, changePercent: null }
    ]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);

    useEffect(() => {
        const fetchIndices = async () => {
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

            const fetchIndex = async (symbol, fallbackSymbol) => {
                try {
                    // Try the index symbol first, then fallback to ETF
                    let response = await fetch(`${API_BASE}/api/company/${encodeURIComponent(symbol)}`, {
                        credentials: 'include'
                    });

                    if (!response.ok && fallbackSymbol) {
                        response = await fetch(`${API_BASE}/api/company/${fallbackSymbol}`, {
                            credentials: 'include'
                        });
                    }

                    if (response.ok) {
                        const data = await response.json();
                        return {
                            price: data.price || data.currentPrice || data.regularMarketPrice,
                            change: data.change || data.priceChange || 0,
                            changePercent: data.changePercent || data.priceChangePercent || data.percentageChange || 0
                        };
                    }
                } catch (e) {
                    console.log(`Failed to fetch ${symbol}:`, e);
                }
                return null;
            };

            const [sp500, nasdaq, dow] = await Promise.all([
                fetchIndex('^GSPC', 'SPY'),
                fetchIndex('^IXIC', 'QQQ'),
                fetchIndex('^DJI', 'DIA')
            ]);

            setIndices(prev => [
                { ...prev[0], ...(sp500 || {}) },
                { ...prev[1], ...(nasdaq || {}) },
                { ...prev[2], ...(dow || {}) }
            ]);
            setLastUpdate(new Date());
            setLoading(false);
        };

        fetchIndices();
        const interval = setInterval(fetchIndices, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, []);

    const formatPrice = (price) => {
        if (!price) return '—';
        return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatChange = (change, percent) => {
        if (change === null || percent === null) return { text: '—', isPositive: true };
        const isPositive = percent >= 0;
        const sign = isPositive ? '+' : '';
        return {
            text: `${sign}${percent.toFixed(2)}%`,
            isPositive
        };
    };

    return (
        <div className="market-overview-card">
            <div className="market-overview-header">
                <div className="market-title">
                    <span className="market-label">Markets</span>
                    <span className={`market-status-dot ${marketStatus?.isOpen ? 'open' : 'closed'}`}></span>
                </div>
                {lastUpdate && (
                    <span className="market-update-time">
                        {lastUpdate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                )}
            </div>

            <div className="market-indices">
                {indices.map((index, i) => {
                    const { text: changeText, isPositive } = formatChange(index.change, index.changePercent);
                    return (
                        <div
                            key={index.symbol}
                            className="market-index-item clickable"
                            onClick={() => {
                                if (window.navigateToStockPage) {
                                    window.navigateToStockPage(index.symbol, false);
                                }
                            }}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="index-name">{index.shortName}</div>
                            <div className="index-data">
                                {loading ? (
                                    <div className="index-skeleton"></div>
                                ) : (
                                    <>
                                        <span className="index-price">{formatPrice(index.price)}</span>
                                        <span className={`index-change ${isPositive ? 'up' : 'down'}`}>
                                            {changeText}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// Market Intelligence Quick Look Widget
const MarketIntelligenceWidget = ({ onNavigate }) => {
    const [earningsCount, setEarningsCount] = useState(null);
    const [newsData, setNewsData] = useState(null);
    const [topSector, setTopSector] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchIntelData = async () => {
            try {
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const authHeaders = await window.getAuthHeaders();
                const opts = { headers: authHeaders, credentials: 'include' };

                const [earningsRes, newsRes] = await Promise.allSettled([
                    fetch(`${API_BASE}/api/market/earnings`, opts),
                    fetch(`${API_BASE}/api/news/market?limit=5`, opts)
                ]);

                if (earningsRes.status === 'fulfilled' && earningsRes.value.ok) {
                    const data = await earningsRes.value.json();
                    const arr = Array.isArray(data) ? data : [];
                    setEarningsCount(arr.length);
                }

                if (newsRes.status === 'fulfilled' && newsRes.value.ok) {
                    const data = await newsRes.value.json();
                    const articles = Array.isArray(data) ? data : (data.articles || []);
                    setNewsData({ count: articles.length, headline: articles[0]?.title || articles[0]?.headline || null });
                }

                // Derive top sector from watchlist market data
                try {
                    const sectorRes = await fetch(`${API_BASE}/api/sectors/batch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        credentials: 'include',
                        body: JSON.stringify({ symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'JNJ', 'XOM'] })
                    });
                    if (sectorRes.ok) {
                        const sectors = await sectorRes.json();
                        const counts = {};
                        Object.values(sectors).forEach(s => { counts[s] = (counts[s] || 0) + 1; });
                        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                        if (top) setTopSector(top[0]);
                    }
                } catch (_) {}
            } catch (_) {}
            setLoading(false);
        };
        fetchIntelData();
    }, []);

    const handleClick = (tab) => {
        onNavigate('intelligence');
        setTimeout(() => {
            if (window.__setIntelTab) window.__setIntelTab(tab);
        }, 100);
    };

    const items = [
        {
            icon: 'fa-calendar',
            title: 'Earnings Calendar',
            subtitle: loading ? 'Loading...' : (earningsCount !== null ? `${earningsCount} companies reporting soon` : 'View upcoming earnings'),
            tab: 'earnings'
        },
        {
            icon: 'fa-chart-bar',
            title: 'Sector Performance',
            subtitle: loading ? 'Loading...' : (topSector ? `${topSector} leading today` : 'View sector trends'),
            tab: null // navigates to intelligence overview
        },
        {
            icon: 'fa-file-alt',
            title: 'Market News',
            subtitle: loading ? 'Loading...' : (newsData?.headline ? newsData.headline.substring(0, 50) + (newsData.headline.length > 50 ? '...' : '') : 'Latest market updates'),
            tab: null // navigates to news
        }
    ];

    return (
        <div className="insights-list">
            {items.map((item, i) => (
                <div
                    key={i}
                    className="insight-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => item.tab ? handleClick(item.tab) : onNavigate(item.title === 'Market News' ? 'news' : 'intelligence')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.tab ? handleClick(item.tab) : onNavigate(item.title === 'Market News' ? 'news' : 'intelligence'); }}}
                    style={{ cursor: 'pointer', transition: 'background 0.2s, transform 0.15s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                    <div className="insight-icon">
                        <i className={`fas ${item.icon}`}></i>
                    </div>
                    <div className="insight-content">
                        <h4>{item.title}</h4>
                        <p>{item.subtitle}</p>
                    </div>
                    <i className="fas fa-chevron-right" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginLeft: 'auto' }}></i>
                </div>
            ))}
        </div>
    );
};

// Overview Tab Component
const OverviewView = ({ watchlistData, marketStatus, onNavigate, onStockHover, preferences = {} }) => {
    const [sparklineData, setSparklineData] = useState({});
    const showSparklines = preferences.showSparklines !== false;
    const showPercentChange = preferences.showPercentChange !== false;
    const compactNumbers = preferences.compactNumbers || false;
    const currencySymbol = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5' }[preferences.currency] || '$';

    const formatStockPrice = (price) => {
        if (!price) return `${currencySymbol}0.00`;
        if (compactNumbers && price >= 1000) {
            if (price >= 1e9) return `${currencySymbol}${(price / 1e9).toFixed(2)}B`;
            if (price >= 1e6) return `${currencySymbol}${(price / 1e6).toFixed(2)}M`;
            if (price >= 1e3) return `${currencySymbol}${(price / 1e3).toFixed(2)}K`;
        }
        return `${currencySymbol}${price.toFixed(2)}`;
    };

    return (
        <div className="overview-view">
            {/* Market Overview */}
            <MarketOverview marketStatus={marketStatus} />

            {/* Three Column Layout */}
            <div className="main-grid-enhanced">
                {/* Left Column - Watchlist with Sparklines */}
                <div className="main-card enhanced">
                    <div className="card-header">
                        <h3><i className="fas fa-table"></i> Watchlist</h3>
                        <button className="view-all-btn" onClick={() => onNavigate('watchlist')}>
                            See All <i className="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <div className="watchlist-quick-enhanced">
                        {watchlistData.slice(0, 6).map((stock, index) => (
                            <div 
                                key={index} 
                                className="stock-row-enhanced"
                                data-stock-symbol={stock.symbol}
                                role="button"
                                tabIndex={0}
                                onMouseEnter={() => onStockHover && onStockHover(stock.symbol)}
                                onClick={() => window.openStockDetailsModalReact && window.openStockDetailsModalReact(stock.symbol)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        window.openStockDetailsModalReact && window.openStockDetailsModalReact(stock.symbol);
                                    }
                                }}
                            >
                                <div className="stock-info-enhanced">
                                    <div className="stock-symbol-enhanced">{stock.symbol}</div>
                                    <div className="stock-name-enhanced">{stock.company_name || stock.name || stock.symbol}</div>
                                </div>
                                {showSparklines && (
                                <div className="stock-sparkline">
                                    <SparklineChart
                                        symbol={stock.symbol}
                                        isPositive={(stock.change_percent || 0) >= 0}
                                        width={120}
                                        height={45}
                                    />
                                </div>
                                )}
                                <div className="stock-price-group">
                                    <div className={`stock-price-enhanced ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                                    {formatStockPrice(stock.current_price || stock.price || 0)}
                                </div>
                                    {showPercentChange && (
                                    <div className={`stock-change-enhanced ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                                    {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2) || '0.00'}%
                                    </div>
                                    )}
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

                {/* Middle Column - Sector Allocation */}
                <div className="main-card enhanced">
                    <div className="card-header">
                        <h3><i className="fas fa-chart-pie"></i> Sector Allocation</h3>
                    </div>
                    <div className="sector-allocation-container">
                        <SectorAllocationChart watchlistData={watchlistData} />
                        <div className="sector-legend">
                            {watchlistData.length > 0 && (
                                <div className="legend-item">
                                    <span className="legend-dot"></span>
                                    <span>Technology</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column - Market Intelligence Quick Look */}
                <div className="main-card enhanced">
                    <div className="card-header">
                        <h3><i className="fas fa-database"></i> Market Intelligence</h3>
                        <button className="view-all-btn" onClick={() => onNavigate('intelligence')}>
                            Explore <i className="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <MarketIntelligenceWidget onNavigate={onNavigate} />
                </div>
            </div>
        </div>
    );
};

// Watchlist View Component
const WatchlistView = ({ watchlistData, onOpenDetails, onRemove, onAdd, selectedCategory, onCategoryChange, categories, onAddFirstStock, onStockHover, updatingStocks = new Set(), preferences = {} }) => {
    const showPercentChange = preferences.showPercentChange !== false;
    const compactNumbers = preferences.compactNumbers || false;
    const currencySymbol = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5' }[preferences.currency] || '$';

    const formatStockPrice = (price) => {
        if (!price) return `${currencySymbol}0.00`;
        if (compactNumbers && price >= 1000) {
            if (price >= 1e9) return `${currencySymbol}${(price / 1e9).toFixed(2)}B`;
            if (price >= 1e6) return `${currencySymbol}${(price / 1e6).toFixed(2)}M`;
            if (price >= 1e3) return `${currencySymbol}${(price / 1e3).toFixed(2)}K`;
        }
        return `${currencySymbol}${price.toFixed(2)}`;
    };
    // Count stocks per category from unfiltered data
    const categoryCounts = {};
    watchlistData.forEach(stock => {
        const cat = stock.category || 'General';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    
    // Filter watchlist based on selected category
    const filteredWatchlist = watchlistData.filter((s) => {
        if (selectedCategory === 'All') return true;
        // Normalize category comparison (case-insensitive, trim whitespace)
        const stockCategory = (s.category || 'General').toString().trim();
        const selectedCat = selectedCategory.toString().trim();
        return stockCategory.toLowerCase() === selectedCat.toLowerCase();
    });
    
    // Log category distribution for debugging
    // Category filtering applied
    
    return (
        <div className="watchlist-view">
            <div className="view-header">
                <h2>My Watchlist</h2>
                {filteredWatchlist.length > 0 && (
                    <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.875rem', marginLeft: '1rem' }}>
                        {filteredWatchlist.length} {filteredWatchlist.length === 1 ? 'stock' : 'stocks'}
                        {selectedCategory !== 'All' && ` in ${selectedCategory}`}
                    </span>
                )}
            </div>
            
            {/* Category Filter Buttons */}
            <div className="category-filters" style={{
                display: 'flex',
                gap: '0.5rem',
                padding: '1.5rem 2rem',
                flexWrap: 'wrap',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
                {categories.map(category => {
                    const count = category === 'All' 
                        ? watchlistData.length 
                        : (categoryCounts[category] || 0);
                    
                    return (
                    <button
                        key={category}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                                // Category filter clicked
                                if (onCategoryChange) {
                                    onCategoryChange(category);
                                }
                            } catch (error) {
                                // Error changing category
                            }
                        }}
                        className={`filter-btn ${selectedCategory === category ? 'active' : ''}`}
                        style={{
                            padding: '0.625rem 1.25rem',
                            background: selectedCategory === category 
                                ? 'linear-gradient(135deg, #00D924, #00B01F)' 
                                : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${selectedCategory === category ? 'transparent' : 'rgba(255, 255, 255, 0.1)'}`,
                            borderRadius: '4px',
                            color: selectedCategory === category ? '#000000' : 'rgba(255, 255, 255, 0.7)',
                            fontWeight: selectedCategory === category ? '600' : '500',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            fontSize: '0.875rem'
                        }}
                        onMouseOver={(e) => {
                            if (selectedCategory !== category) {
                                e.target.style.background = 'rgba(255, 255, 255, 0.08)';
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                            }
                        }}
                        onMouseOut={(e) => {
                            if (selectedCategory !== category) {
                                e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                            }
                        }}
                    >
                        {category}
                        {count > 0 && (
                            <span style={{
                                marginLeft: '0.5rem',
                                opacity: selectedCategory === category ? 1 : 0.6,
                                fontSize: '0.75rem'
                            }}>
                                ({count})
                            </span>
                        )}
                    </button>
                    );
                })}
            </div>
            
            {/* Show message if no stocks match filter */}
            {filteredWatchlist.length === 0 && selectedCategory !== 'All' && (
                <div style={{
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.5)'
                }}>
                    <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                        No stocks found in <strong>{selectedCategory}</strong> category
                    </p>
                    <p style={{ fontSize: '0.875rem' }}>
                        Try selecting a different category or add stocks to this category
                    </p>
                </div>
            )}
            
            <div className="watchlist-grid">
                {filteredWatchlist.map((stock, index) => (
                    <div 
                        key={index} 
                        className="watchlist-card" 
                        data-stock-symbol={stock.symbol}
                        role="group" 
                        aria-label={`${stock.symbol} card`}
                        onMouseEnter={() => onStockHover && onStockHover(stock.symbol)}
                    >
                        <div className="card-top">
                            <div className="stock-symbol">{stock.symbol}</div>
                            <button className="more-btn">
                                <i className="fas fa-ellipsis-v"></i>
                            </button>
                        </div>
                        <div className="stock-name">{stock.name}</div>
                        <div className={`stock-price-large ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                            {formatStockPrice(stock.current_price || stock.price || 0)}
                        </div>
                        {showPercentChange && (
                        <div className={`stock-change-large ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                            <i
                                className={stock.change_percent >= 0 ? 'fas fa-arrow-trend-up' : 'fas fa-arrow-trend-down'}
                                style={{
                                    marginRight: '8px',
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    color: stock.change_percent >= 0 ? '#00D924' : '#ef4444',
                                    textShadow: stock.change_percent >= 0
                                        ? '0 0 10px rgba(0, 217, 36, 0.7), 0 0 15px rgba(0, 217, 36, 0.5)'
                                        : '0 0 10px rgba(239, 68, 68, 0.7), 0 0 15px rgba(239, 68, 68, 0.5)',
                                    display: 'inline-block',
                                    lineHeight: '1'
                                }}
                            />
                            {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2) || '0.00'}%
                        </div>
                        )}
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
                        <button className="empty-action-btn" onClick={onAddFirstStock}>
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
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [articles, setArticles] = useState([]);
    const [allArticles, setAllArticles] = useState([]);
    const [displayCount, setDisplayCount] = useState(7); // Show 1 featured + 6 regular initially
    const [query, setQuery] = useState('');

    useEffect(() => { loadNews(); }, []);

    const loadNews = async (isLoadMore = false) => {
        try {
            if (isLoadMore) {
                setLoadingMore(true);
            } else {
                setLoading(true);
                setDisplayCount(7); // Reset display count on new search
            }
            setError('');
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            // Fetch more articles when loading more (increase limit)
            const limit = isLoadMore ? allArticles.length + 10 : 20; // Fetch 20 initially, then add 10 more each time
            const url = query.trim() 
                ? `${API_BASE}/api/news/market?q=${encodeURIComponent(query.trim())}&limit=${limit}`
                : `${API_BASE}/api/news/market?limit=${limit}`;
            const r = await fetch(url, { headers: authHeaders, credentials: 'include' });
            if (!r.ok) throw new Error('Failed to fetch news');
            const data = await r.json();
            const fetchedArticles = Array.isArray(data?.articles) ? data.articles : Array.isArray(data) ? data : [];
            if (isLoadMore) {
                setAllArticles(fetchedArticles);
                // Update displayed articles if we have more to show
                if (displayCount < fetchedArticles.length) {
                    setArticles(fetchedArticles.slice(0, displayCount));
                }
            } else {
                setAllArticles(fetchedArticles);
                setArticles(fetchedArticles.slice(0, displayCount));
            }
        } catch (e) {
            setError('Unable to load news right now');
            if (!isLoadMore) {
            setArticles([]);
                setAllArticles([]);
            }
        } finally {
            if (isLoadMore) {
                setLoadingMore(false);
            } else {
            setLoading(false);
            }
        }
    };

    const handleLoadMore = () => {
        const newCount = displayCount + 6; // Load 6 more articles
        setDisplayCount(newCount);
        
        // Show more articles from existing list
        if (newCount <= allArticles.length) {
            setArticles(allArticles.slice(0, newCount));
        } else {
            // If we need more articles, fetch from API
            loadNews(true);
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
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                loadNews();
                            }
                        }}
                        placeholder="Search news" />
                    <button 
                        className="search-btn" 
                        onClick={loadNews} 
                        disabled={loading || loadingMore}
                    >
                        {query.trim() ? 'Search' : 'Refresh'}
                    </button>
                    {error && <span style={{ color:'#FF6B35', fontSize:'0.9rem' }}>{error}</span>}
                </div>
            </div>
            <div className="news-grid">
                {(loading ? Array.from({length:1}) : articles.slice(0,1)).map((a, idx) => {
                    // Generate fallback image URL using Unsplash Source API (generic financial/stock market image)
                    const getImageUrl = () => {
                        if (a?.image_url && a.image_url !== 'null' && a.image_url.trim() !== '') {
                            return a.image_url;
                        }
                        // Fallback: Use Unsplash Source API for generic financial images
                        // Using a 16:9 aspect ratio (1920x1080) which matches typical news image ratios
                        const seed = a?.title ? encodeURIComponent(a.title.substring(0, 20)) : 'stock-market';
                        return `https://source.unsplash.com/1920x1080/?finance,stock-market,business,${seed}`;
                    };
                    
                    const articleUrl = a?.url || a?.link;
                    const handleCardClick = (e) => {
                        // Don't navigate if clicking on the "Read More" link
                        if (e.target.closest('.read-more')) {
                            return;
                        }
                        if (articleUrl) {
                            window.open(articleUrl, '_blank', 'noopener,noreferrer');
                        }
                    };
                    
                    return (
                        <div 
                            key={`feat-${idx}`} 
                            className="news-card featured"
                            onClick={handleCardClick}
                            style={{ cursor: articleUrl ? 'pointer' : 'default' }}
                        >
                            <div className="news-image-container">
                                {loading ? (
                        <div className="news-image-placeholder">
                            <i className="fas fa-chart-line"></i>
                                    </div>
                                ) : (
                                    <>
                                        <img 
                                            src={getImageUrl()} 
                                            alt={a?.title || 'News image'}
                                            className="news-image"
                                            onError={(e) => {
                                                // If image fails to load, hide image and show placeholder
                                                e.target.style.display = 'none';
                                                const placeholder = e.target.parentElement.querySelector('.news-image-placeholder');
                                                if (placeholder) {
                                                    placeholder.style.display = 'flex';
                                                }
                                            }}
                                        />
                                        <div className="news-image-placeholder" style={{ display: 'none' }}>
                                            <i className="fas fa-chart-line"></i>
                                        </div>
                                    </>
                                )}
                        </div>
                        <div className="news-badge">Featured</div>
                        <div className="news-content">
                            <span className="news-category">{loading ? 'Loading…' : (a.source || a.category || 'Top Story')}</span>
                            <h3>{loading ? 'Loading headline…' : (a.title || '—')}</h3>
                                <p>{loading ? '' : (a.description || a.summary || '')}</p>
                            <div className="news-meta">
                                <span><i className="fas fa-clock"></i> {loading ? '' : (a.published_at || a.publishedAt || '')}</span>
                                    {(a?.url || a?.link) && <a className="read-more" href={a.url || a.link} target="_blank" rel="noopener noreferrer">Read More <i className="fas fa-arrow-right"></i></a>}
                            </div>
                        </div>
                    </div>
                    );
                })}

                {(loading ? Array.from({length:6}) : articles.slice(1, displayCount)).map((a, i) => {
                    // Generate fallback image URL using Unsplash Source API
                    const getImageUrl = () => {
                        if (a?.image_url && a.image_url !== 'null' && a.image_url.trim() !== '') {
                            return a.image_url;
                        }
                        // Fallback: Use Unsplash Source API for generic financial images
                        const seed = a?.title ? encodeURIComponent(a.title.substring(0, 20)) : 'stock-market';
                        return `https://source.unsplash.com/1920x1080/?finance,stock-market,business,${seed}`;
                    };

                    const articleUrl = a?.url || a?.link;
                    const handleCardClick = (e) => {
                        // Don't navigate if clicking on the "Read More" link
                        if (e.target.closest('.read-more')) {
                            return;
                        }
                        if (articleUrl) {
                            window.open(articleUrl, '_blank', 'noopener,noreferrer');
                        }
                    };

                    return (
                        <div
                            key={`card-${i}`}
                            className="news-card"
                            onClick={handleCardClick}
                            style={{ cursor: articleUrl ? 'pointer' : 'default' }}
                        >
                            <div className="news-image-container">
                                {loading ? (
                                    <div className="news-image-placeholder">
                                        <i className="fas fa-chart-line"></i>
                                    </div>
                                ) : (
                                    <>
                                        <img
                                            src={getImageUrl()}
                                            alt={a?.title || 'News image'}
                                            className="news-image"
                                            onError={(e) => {
                                                // If image fails to load, hide image and show placeholder
                                                e.target.style.display = 'none';
                                                const placeholder = e.target.parentElement.querySelector('.news-image-placeholder');
                                                if (placeholder) {
                                                    placeholder.style.display = 'flex';
                                                }
                                            }}
                                        />
                                        <div className="news-image-placeholder" style={{ display: 'none' }}>
                                            <i className="fas fa-chart-line"></i>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="news-content">
                                <span className="news-category">{loading ? 'Loading…' : (a.source || 'News')}</span>
                                <h3>{loading ? 'Loading…' : (a.title || '—')}</h3>
                                <p>{loading ? '' : (a.description || '')}</p>
                                <div className="news-meta">
                                    <span><i className="fas fa-clock"></i> {loading ? '' : (a.published_at || a.publishedAt || '')}</span>
                                    {(a?.url || a?.link) && <a className="read-more" href={a.url || a.link} target="_blank" rel="noopener noreferrer">Read More <i className="fas fa-arrow-right"></i></a>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Load More Button */}
            {!loading && articles.length > 0 && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '2rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                    <button
                        onClick={handleLoadMore}
                        disabled={loadingMore || displayCount >= allArticles.length}
                        className="load-more-btn"
                        style={{
                            padding: '0.875rem 2rem',
                            background: loadingMore || displayCount >= allArticles.length
                                ? 'rgba(255, 255, 255, 0.1)'
                                : 'linear-gradient(135deg, #00D924, #FF6B35)',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#ffffff',
                            fontWeight: '600',
                            fontSize: '0.9375rem',
                            cursor: loadingMore || displayCount >= allArticles.length ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            opacity: loadingMore || displayCount >= allArticles.length ? 0.5 : 1
                        }}
                        onMouseOver={(e) => {
                            if (!loadingMore && displayCount < allArticles.length) {
                                e.target.style.transform = 'translateY(-2px)';
                                e.target.style.boxShadow = '0 8px 20px rgba(0, 217, 36, 0.3)';
                            }
                        }}
                        onMouseOut={(e) => {
                            e.target.style.transform = 'translateY(0)';
                            e.target.style.boxShadow = 'none';
                        }}
                    >
                        {loadingMore ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                Loading...
                            </>
                        ) : displayCount >= allArticles.length ? (
                            <>
                                <i className="fas fa-check"></i>
                                All News Loaded
                            </>
                        ) : (
                            <>
                                <i className="fas fa-arrow-down"></i>
                                Load More ({allArticles.length - displayCount} remaining)
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};

// What's Hot View Component - Market Analysis & Trends
const WhatsWhatView = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [analysis, setAnalysis] = useState('');
    const [displayedText, setDisplayedText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [typingComplete, setTypingComplete] = useState(false);
    const [marketData, setMarketData] = useState(null);
    const typingRef = useRef(null);

    useEffect(() => {
        loadMarketAnalysis();
    }, []);

    const loadMarketAnalysis = async () => {
        try {
            setLoading(true);
            setError('');
            const authHeaders = await window.getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const r = await fetch(`${API_BASE}/api/market/analysis`, {
                headers: authHeaders,
                credentials: 'include'
            });
            if (!r.ok) throw new Error('Failed to fetch market analysis');
            const data = await r.json();
            setAnalysis(data.analysis || '');
            setMarketData(data.data || null);
            setLoading(false);
            // Start typing animation
            setTimeout(() => startTypingAnimation(data.analysis || ''), 100);
        } catch (e) {
            console.error('Error loading market analysis:', e);
            setError('Unable to load market analysis');
            setLoading(false);
        }
    };

    const startTypingAnimation = (text) => {
        setIsTyping(true);
        setDisplayedText('');
        const words = text.split(' ');
        let currentIndex = 0;

        const typeNextWord = () => {
            if (currentIndex < words.length) {
                setDisplayedText(prev => prev + (currentIndex > 0 ? ' ' : '') + words[currentIndex]);
                currentIndex++;
                typingRef.current = setTimeout(typeNextWord, 50); // 50ms per word
            } else {
                setIsTyping(false);
                setTypingComplete(true);
            }
        };

        typeNextWord();
    };

    useEffect(() => {
        return () => {
            if (typingRef.current) {
                clearTimeout(typingRef.current);
            }
        };
    }, []);

    const skipTyping = () => {
        if (typingRef.current) {
            clearTimeout(typingRef.current);
        }
        setDisplayedText(analysis);
        setIsTyping(false);
        setTypingComplete(true);
    };

    return (
        <div className="whatswhat-view" style={{
            padding: '2rem',
            maxWidth: '1400px',
            margin: '0 auto'
        }}>
            <div className="view-header" style={{
                marginBottom: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div>
                    <h2 style={{
                        fontSize: '2rem',
                        fontWeight: '700',
                        background: 'linear-gradient(135deg, #00D924, #FF6B35)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        marginBottom: '0.5rem'
                    }}>
                        <i className="fas fa-fire" style={{ marginRight: '0.75rem' }}></i>
                        What's Hot in the Market
                    </h2>
                    <p style={{
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontSize: '0.9375rem'
                    }}>
                        AI-powered market insights, trends, and geopolitical analysis
                    </p>
                </div>
                <button
                    onClick={loadMarketAnalysis}
                    disabled={loading}
                    style={{
                        padding: '0.75rem 1.5rem',
                        background: 'rgba(0, 217, 36, 0.1)',
                        border: '1px solid rgba(0, 217, 36, 0.3)',
                        borderRadius: '6px',
                        color: '#00D924',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.3s ease'
                    }}
                >
                    <i className={`fas fa-${loading ? 'spinner fa-spin' : 'sync-alt'}`} style={{ marginRight: '0.5rem' }}></i>
                    Refresh Analysis
                </button>
            </div>

            {/* Main AI Analysis Card */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(0, 217, 36, 0.05), rgba(255, 107, 53, 0.05))',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '2.5rem',
                marginBottom: '2rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Animated gradient overlay */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #00D924, #FF6B35, #00D924)',
                    backgroundSize: '200% 100%',
                    animation: isTyping ? 'gradientMove 2s linear infinite' : 'none'
                }}></div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '1.5rem'
                }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #00D924, #FF6B35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: '1rem'
                    }}>
                        <i className="fas fa-brain" style={{ color: '#fff' }}></i>
                    </div>
                    <div>
                        <h3 style={{
                            fontSize: '1.25rem',
                            fontWeight: '600',
                            color: '#fff',
                            marginBottom: '0.25rem'
                        }}>
                            This Week's Market Landscape
                        </h3>
                        <p style={{
                            fontSize: '0.875rem',
                            color: 'rgba(255, 255, 255, 0.5)',
                            margin: 0
                        }}>
                            Generated {new Date().toLocaleDateString()} • AI-Powered Analysis
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#00D924', marginBottom: '1rem' }}></i>
                        <p style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Analyzing current market conditions...</p>
                    </div>
                ) : error ? (
                    <div style={{
                        padding: '2rem',
                        background: 'rgba(255, 107, 53, 0.1)',
                        border: '1px solid rgba(255, 107, 53, 0.3)',
                        borderRadius: '8px',
                        textAlign: 'center'
                    }}>
                        <i className="fas fa-exclamation-circle" style={{ fontSize: '2rem', color: '#FF6B35', marginBottom: '1rem' }}></i>
                        <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{error}</p>
                    </div>
                ) : (
                    <>
                        <div style={{
                            fontSize: '1.125rem',
                            lineHeight: '1.8',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '1.5rem',
                            minHeight: '200px'
                        }}>
                            {displayedText}
                            {isTyping && <span className="typing-cursor" style={{
                                display: 'inline-block',
                                width: '2px',
                                height: '1.2em',
                                background: '#00D924',
                                marginLeft: '4px',
                                animation: 'blink 1s infinite'
                            }}></span>}
                        </div>
                        {isTyping && (
                            <button
                                onClick={skipTyping}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    color: 'rgba(255, 255, 255, 0.6)',
                                    fontSize: '0.875rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <i className="fas fa-forward" style={{ marginRight: '0.5rem' }}></i>
                                Skip Animation
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Supporting Content Grid */}
            {typingComplete && marketData && (
                <div className="supporting-content" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '1.5rem',
                    marginBottom: '2rem'
                }}>
                    {/* What's Hot - Top Market Movers */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(0, 217, 36, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)',
                        border: '1px solid rgba(0, 217, 36, 0.2)',
                        borderRadius: '16px',
                        padding: '2rem',
                        minHeight: '450px',
                        gridColumn: 'span 1'
                    }}>
                        <h4 style={{
                            fontSize: '1.5rem',
                            fontWeight: '700',
                            color: '#fff',
                            marginBottom: '1.5rem',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <i className="fas fa-fire" style={{ color: '#FF6B35', marginRight: '0.75rem', fontSize: '1.25rem' }}></i>
                            What's Hot
                            <span style={{
                                marginLeft: 'auto',
                                fontSize: '0.75rem',
                                color: 'rgba(255, 255, 255, 0.5)',
                                fontWeight: '400'
                            }}>Top 5 Movers</span>
                        </h4>
                        <div style={{ fontSize: '0.9375rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                            {marketData.topMovers && marketData.topMovers.length > 0 ? (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {marketData.topMovers.slice(0, 5).map((stock, idx) => (
                                        <li key={idx} style={{
                                            padding: '1.25rem',
                                            marginBottom: idx < 4 ? '0.75rem' : 0,
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(255, 255, 255, 0.05)',
                                            transition: 'transform 0.2s, background 0.2s',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => window.openStockDetailsModalReact && window.openStockDetailsModalReact(stock.symbol)}
                                        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                                        onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'; e.currentTarget.style.transform = 'translateX(0)'; }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        color: 'rgba(255, 255, 255, 0.4)',
                                                        fontWeight: '600',
                                                        width: '20px'
                                                    }}>#{idx + 1}</span>
                                                    <div>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>{stock.symbol}</div>
                                                        {stock.sector && (
                                                            <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.25rem' }}>
                                                                {stock.sector}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{
                                                        color: stock.change >= 0 ? '#00D924' : '#FF6B35',
                                                        fontWeight: '700',
                                                        fontSize: '1.25rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}>
                                                        <i className={stock.change >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down'} style={{ fontSize: '0.875rem' }}></i>
                                                        {stock.change >= 0 ? '+' : ''}{stock.change}%
                                                    </div>
                                                    {stock.price && (
                                                        <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.25rem' }}>
                                                            ${stock.price.toLocaleString()}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {stock.ai_reason && (
                                                <div style={{
                                                    marginTop: '0.75rem',
                                                    padding: '0.75rem',
                                                    background: 'rgba(0, 217, 36, 0.08)',
                                                    borderRadius: '8px',
                                                    borderLeft: `3px solid ${stock.change >= 0 ? '#00D924' : '#FF6B35'}`
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                        <i className="fas fa-robot" style={{ fontSize: '0.75rem', color: '#00D924' }}></i>
                                                        <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)', fontWeight: '600', textTransform: 'uppercase' }}>AI Insight</span>
                                                    </div>
                                                    <p style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.8)', margin: 0, lineHeight: '1.4' }}>
                                                        {stock.ai_reason}
                                                    </p>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>
                                    <i className="fas fa-chart-line" style={{ fontSize: '2rem', color: 'rgba(255, 255, 255, 0.3)', marginBottom: '1rem', display: 'block' }}></i>
                                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>No movers data available</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Key Economic Events */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '1.5rem'
                    }}>
                        <h4 style={{
                            fontSize: '1.125rem',
                            fontWeight: '600',
                            color: '#fff',
                            marginBottom: '1rem',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <i className="fas fa-calendar-alt" style={{ color: '#FF6B35', marginRight: '0.75rem' }}></i>
                            Upcoming Events
                        </h4>
                        <div style={{ fontSize: '0.9375rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                            {marketData.upcomingEvents ? (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {marketData.upcomingEvents.slice(0, 5).map((event, idx) => (
                                        <li key={idx} style={{
                                            padding: '0.75rem 0',
                                            borderBottom: idx < 4 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none'
                                        }}>
                                            <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{event.title}</div>
                                            <div style={{ fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.5)' }}>{event.date}</div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>Loading upcoming events...</p>
                            )}
                        </div>
                    </div>

                    {/* Sector Performance */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(0, 149, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)',
                        border: '1px solid rgba(0, 149, 255, 0.2)',
                        borderRadius: '16px',
                        padding: '2rem',
                        minHeight: '450px'
                    }}>
                        <h4 style={{
                            fontSize: '1.5rem',
                            fontWeight: '700',
                            color: '#fff',
                            marginBottom: '1.5rem',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <i className="fas fa-chart-pie" style={{ color: '#0095FF', marginRight: '0.75rem', fontSize: '1.25rem' }}></i>
                            Sector Performance
                            <span style={{
                                marginLeft: 'auto',
                                fontSize: '0.75rem',
                                color: 'rgba(255, 255, 255, 0.5)',
                                fontWeight: '400'
                            }}>Weekly Change</span>
                        </h4>
                        <div style={{ fontSize: '0.9375rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                            {marketData.sectorPerformance && marketData.sectorPerformance.length > 0 ? (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {marketData.sectorPerformance.slice(0, 6).map((sector, idx) => (
                                        <li key={idx} style={{
                                            padding: '1rem',
                                            marginBottom: idx < 5 ? '0.5rem' : 0,
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    background: sector.change >= 0 ? '#00D924' : '#FF6B35'
                                                }}></div>
                                                <span style={{ fontWeight: '500' }}>{sector.name}</span>
                                            </div>
                                            <span style={{
                                                color: sector.change >= 0 ? '#00D924' : '#FF6B35',
                                                fontWeight: '700',
                                                fontSize: '1rem'
                                            }}>
                                                {sector.change >= 0 ? '+' : ''}{sector.change}%
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>
                                    <i className="fas fa-chart-pie" style={{ fontSize: '2rem', color: 'rgba(255, 255, 255, 0.3)', marginBottom: '1rem', display: 'block' }}></i>
                                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>No sector data available</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Geopolitical Insights */}
            {typingComplete && (
                <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '2rem',
                    marginBottom: '2rem'
                }}>
                    <h3 style={{
                        fontSize: '1.5rem',
                        fontWeight: '600',
                        color: '#fff',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <i className="fas fa-globe" style={{ color: '#FF6B35', marginRight: '0.75rem' }}></i>
                        Geopolitical Factors
                    </h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '1rem'
                    }}>
                        <div style={{ padding: '1rem', background: 'rgba(0, 217, 36, 0.05)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.5rem' }}>Federal Reserve</div>
                            <div style={{ fontSize: '1rem', color: '#fff', fontWeight: '600' }}>Interest Rate Decision Pending</div>
                        </div>
                        <div style={{ padding: '1rem', background: 'rgba(255, 107, 53, 0.05)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.5rem' }}>Global Trade</div>
                            <div style={{ fontSize: '1rem', color: '#fff', fontWeight: '600' }}>Supply Chain Developments</div>
                        </div>
                        <div style={{ padding: '1rem', background: 'rgba(0, 217, 36, 0.05)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.5rem' }}>Energy Markets</div>
                            <div style={{ fontSize: '1rem', color: '#fff', fontWeight: '600' }}>Oil Prices Fluctuating</div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes gradientMove {
                    0% { background-position: 0% 50%; }
                    100% { background-position: 200% 50%; }
                }
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
};

// Intelligence View Component
const IntelligenceView = ({ watchlistData }) => {
    const [activeTab, setActiveTab] = useState('earnings');
    const [symbol, setSymbol] = useState('AAPL');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [earnings, setEarnings] = useState([]);
    const [insider, setInsider] = useState([]);
    const [analyst, setAnalyst] = useState([]);

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

    // Data source label component
    const DataSourceLabel = ({ source }) => (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(0, 217, 36, 0.1)',
            borderRadius: '4px',
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.6)',
            marginTop: '1rem'
        }}>
            <i className="fas fa-database" style={{ color: '#00D924' }}></i>
            <span>Data provided by <strong style={{ color: '#fff' }}>{source}</strong></span>
        </div>
    );

    return (
        <div className="intelligence-view">
            <div className="view-header">
                <h2>Market Intelligence</h2>
                <div className="intel-tabs">
                    <button className={`intel-tab ${activeTab==='earnings'?'active':''}`} onClick={()=>setActiveTab('earnings')}>Earnings</button>
                    <button className={`intel-tab ${activeTab==='insider'?'active':''}`} onClick={()=>setActiveTab('insider')}>Insider Trading</button>
                    <button className={`intel-tab ${activeTab==='analyst'?'active':''}`} onClick={()=>setActiveTab('analyst')}>Analyst Ratings</button>
                    <button className={`intel-tab ${activeTab==='correlation'?'active':''}`} onClick={()=>setActiveTab('correlation')}>Correlation</button>
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
                                <div className="intel-estimate">{loading ? '' : (item.estimate ? `Est: $${item.estimate}` : '')}</div>
                            </div>
                            );
                        })}
                    </div>
                    <DataSourceLabel source="Finnhub - Earnings Calendar API" />
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
                            if (!loading && t.transaction_type && t.shares) {
                                const priceStr = t.price ? ` @ $${t.price.toFixed(2)}` : '';
                                formattedTransaction = `${t.transaction_type} ${t.shares.toLocaleString()}${priceStr}`;
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
                    <DataSourceLabel source="Finnhub - SEC Insider Transactions" />
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
                    <DataSourceLabel source="Finnhub - Wall Street Analyst Recommendations" />
                </div>
            )}

            {activeTab === 'correlation' && (
                <CorrelationHeatmap watchlistData={watchlistData} />
            )}
        </div>
    );
};

// Correlation Heatmap Component
const CorrelationHeatmap = ({ watchlistData }) => {
    const canvasRef = useRef(null);
    const [correlationData, setCorrelationData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tooltip, setTooltip] = useState(null);

    const symbols = useMemo(() => {
        if (!watchlistData || watchlistData.length === 0) return [];
        return watchlistData.map(s => s.symbol).filter(Boolean);
    }, [watchlistData]);

    useEffect(() => {
        if (symbols.length < 3) return;
        const fetchCorrelation = async () => {
            try {
                setLoading(true);
                setError('');
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const authHeaders = await window.getAuthHeaders();
                const r = await fetch(`${API_BASE}/api/stocks/correlation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders },
                    credentials: 'include',
                    body: JSON.stringify({ symbols })
                });
                if (!r.ok) throw new Error('Failed to fetch correlation data');
                const data = await r.json();
                setCorrelationData(data);
            } catch (e) {
                setError('Unable to load correlation data');
            } finally {
                setLoading(false);
            }
        };
        fetchCorrelation();
    }, [symbols]);

    // Draw heatmap on canvas
    useEffect(() => {
        if (!correlationData || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { symbols: syms, matrix } = correlationData;
        const n = syms.length;

        const labelWidth = 80;
        const cellSize = Math.min(50, Math.floor((canvas.width - labelWidth) / n));
        const totalGrid = cellSize * n;

        canvas.width = labelWidth + totalGrid + 20;
        canvas.height = labelWidth + totalGrid + 20;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Color interpolation: blue (-1) -> white (0) -> red (+1)
        const getColor = (val) => {
            if (val >= 0) {
                const t = Math.min(val, 1);
                const r = 255;
                const g = Math.round(255 * (1 - t));
                const b = Math.round(255 * (1 - t));
                return `rgb(${r},${g},${b})`;
            } else {
                const t = Math.min(Math.abs(val), 1);
                const r = Math.round(255 * (1 - t));
                const g = Math.round(255 * (1 - t));
                const b = 255;
                return `rgb(${r},${g},${b})`;
            }
        };

        // Draw cells
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const x = labelWidth + j * cellSize;
                const y = labelWidth + i * cellSize;
                ctx.fillStyle = getColor(matrix[i][j]);
                ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
            }
        }

        // Draw labels
        ctx.fillStyle = '#fff';
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < n; i++) {
            ctx.fillText(syms[i], labelWidth - 5, labelWidth + i * cellSize + cellSize / 2);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let j = 0; j < n; j++) {
            ctx.save();
            ctx.translate(labelWidth + j * cellSize + cellSize / 2, labelWidth - 5);
            ctx.rotate(-Math.PI / 4);
            ctx.fillText(syms[j], 0, 0);
            ctx.restore();
        }
    }, [correlationData]);

    const handleMouseMove = (e) => {
        if (!correlationData || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const { symbols: syms, matrix } = correlationData;
        const n = syms.length;
        const labelWidth = 80;
        const cellSize = Math.min(50, Math.floor((canvasRef.current.width - labelWidth) / n));

        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const col = Math.floor((mx - labelWidth) / cellSize);
        const row = Math.floor((my - labelWidth) / cellSize);

        if (row >= 0 && row < n && col >= 0 && col < n) {
            setTooltip({
                x: e.clientX,
                y: e.clientY,
                text: `${syms[row]} / ${syms[col]}: ${matrix[row][col].toFixed(3)}`
            });
        } else {
            setTooltip(null);
        }
    };

    if (symbols.length < 3) {
        return (
            <div className="intel-card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <i className="fas fa-th" style={{ fontSize: '2.5rem', color: 'rgba(255,255,255,0.2)', marginBottom: '1rem' }}></i>
                <h3 style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem' }}>Add More Stocks</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                    Add at least 3 stocks to your watchlist to see the correlation heatmap.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="intel-card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                <p style={{ color: 'rgba(255,255,255,0.5)' }}>Calculating correlations...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="intel-card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <p style={{ color: '#FF6B35' }}>{error}</p>
            </div>
        );
    }

    return (
        <div className="intel-card">
            <div className="intel-header">
                <h3><i className="fas fa-th"></i> Portfolio Correlation (90 days)</h3>
                <span className="intel-count">{correlationData ? correlationData.symbols.length : 0} stocks</span>
            </div>
            <div style={{ position: 'relative', overflowX: 'auto', padding: '1rem 0' }}>
                <canvas
                    ref={canvasRef}
                    width={600}
                    height={600}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setTooltip(null)}
                    style={{ display: 'block', margin: '0 auto' }}
                />
                {tooltip && (
                    <div style={{
                        position: 'fixed',
                        left: tooltip.x + 12,
                        top: tooltip.y - 30,
                        background: 'rgba(0,0,0,0.9)',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        pointerEvents: 'none',
                        zIndex: 1000,
                        whiteSpace: 'nowrap',
                        border: '1px solid rgba(255,255,255,0.2)'
                    }}>
                        {tooltip.text}
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.5rem' }}>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgb(100,100,255)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }}></span>Inverse (-1)</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgb(255,255,255)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }}></span>None (0)</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgb(255,100,100)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }}></span>High (+1)</span>
            </div>
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', lineHeight: '1.5' }}>
                <strong style={{ color: 'rgba(255,255,255,0.6)' }}>What does this mean?</strong> This chart shows how your stocks move in relation to each other over the last 90 days. Red means two stocks tend to move in the same direction — when one goes up, the other usually does too. Blue means they tend to move in opposite directions. White means there's little connection between them. A well-diversified portfolio typically has a mix of colors, not all red.
            </div>
        </div>
    );
};

// Trading View Component
const TradingView = () => {
    return (
        <div className="trading-coming-soon">
            <div className="trading-hero">
                <div className="trading-icon-wrapper">
                    <i className="fas fa-exchange-alt"></i>
                </div>
                <h1>Trading</h1>
                <p className="trading-subtitle">
                    Coming soon: Trade directly from your watchlist
                </p>
            </div>

            <div className="trading-content">
                <div className="trading-section">
                    <h2>What's Coming</h2>
                    <div className="trading-features">
                        <div className="trading-feature-card">
                            <div className="trading-feature-icon">
                                <i className="fas fa-link"></i>
                            </div>
                            <h3>Alpaca Integration</h3>
                            <p>Link your Alpaca account to import positions and execute trades. Your API keys stay encrypted and secure.</p>
                        </div>

                        <div className="trading-feature-card">
                            <div className="trading-feature-icon">
                                <i className="fas fa-chart-line"></i>
                            </div>
                            <h3>Trade from Watchlist</h3>
                            <p>Buy and sell stocks directly from your watchlist without leaving the app.</p>
                        </div>

                        <div className="trading-feature-card">
                            <div className="trading-feature-icon">
                                <i className="fas fa-sync-alt"></i>
                            </div>
                            <h3>Position Syncing</h3>
                            <p>Your Alpaca positions automatically appear in your watchlist for easy tracking.</p>
                        </div>
                    </div>
                </div>

                <div className="trading-section">
                    <h2>Why Trade Here</h2>
                    <div className="trading-benefits-list">
                        <div className="trading-benefit-item">
                            <i className="fas fa-check"></i>
                            <div>
                                <strong>Everything in One Place</strong>
                                <p>Research, analyze, and trade without switching apps.</p>
                            </div>
                        </div>
                        <div className="trading-benefit-item">
                            <i className="fas fa-check"></i>
                            <div>
                                <strong>Live Market Data</strong>
                                <p>Real-time prices and instant updates for better decisions.</p>
                            </div>
                        </div>
                        <div className="trading-benefit-item">
                            <i className="fas fa-check"></i>
                            <div>
                                <strong>Market Intelligence</strong>
                                <p>Insider trades, analyst ratings, and options flow at your fingertips.</p>
                            </div>
                        </div>
                        <div className="trading-benefit-item">
                            <i className="fas fa-check"></i>
                            <div>
                                <strong>AI Trading Assistant</strong>
                                <p>Get personalized recommendations and market insights.</p>
                            </div>
                        </div>
                        <div className="trading-benefit-item">
                            <i className="fas fa-check"></i>
                            <div>
                                <strong>Portfolio Overview</strong>
                                <p>Track positions and watchlist stocks together in one view.</p>
                            </div>
                        </div>
                        <div className="trading-benefit-item">
                            <i className="fas fa-check"></i>
                            <div>
                                <strong>Bank-Level Security</strong>
                                <p>Your credentials are encrypted. We never see your API keys.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

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
                    const event = new CustomEvent('watchlistChanged', {
                        detail: { action: 'add' }
                    });
                    window.dispatchEvent(event);
                }
            } else {
                showError(data.error || data.response || 'Failed to get response from AI');
            }
        } catch (error) {
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
        { icon: "fa-chart-line", text: "Analyze my watchlist" },
        { icon: "fa-search-dollar", text: "What stocks should I buy?" },
        { icon: "fa-microchip", text: "Tech sector outlook" },
        { icon: "fa-balance-scale", text: "Compare AAPL vs MSFT" }
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            maxWidth: '900px',
            margin: '0 auto',
            padding: '2rem'
        }}>
            {/* Header */}
            <div style={{
                textAlign: 'center',
                marginBottom: '2rem'
            }}>
                <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, #00D924, #00a81c)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem',
                    boxShadow: '0 8px 24px rgba(0, 217, 36, 0.3)'
                }}>
                    <i className="fas fa-robot" style={{ fontSize: '1.75rem', color: '#fff' }}></i>
                </div>
                <h2 style={{
                    fontSize: '1.75rem',
                    fontWeight: '700',
                    color: '#fff',
                    marginBottom: '0.5rem'
                }}>AI Stock Assistant</h2>
                <p style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '0.9375rem'
                }}>Ask about markets, stocks, or your watchlist</p>
            </div>

            {/* Messages Area */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
            }}>
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
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
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

            {/* Quick Prompts - Only show when no messages */}
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

            {/* Input Area */}
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

            {/* Login prompt if not authenticated */}
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


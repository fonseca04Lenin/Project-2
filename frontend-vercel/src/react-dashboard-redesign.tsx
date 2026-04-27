export {};
const { useState, useEffect, useRef, useCallback, useMemo } = React;

function routeTo(path: string, state: Record<string, unknown> = {}, replace = false): void {
    window.dispatchEvent(new CustomEvent('app:navigate', {
        detail: { path, state, replace }
    }));
}

function getAuthClient(): FirebaseAuth | null {
    return window.AppAuth?.getClient ? window.AppAuth.getClient() : null;
}

function getCurrentUser(): FirebaseUser | null {
    return window.AppAuth?.getCurrentUser ? window.AppAuth.getCurrentUser() : null;
}

function getAuthHeaders(user: FirebaseUser | null = null): Promise<Record<string, string>> {
    return window.AppAuth?.getAuthHeaders ? window.AppAuth.getAuthHeaders(user) : Promise.resolve({});
}


// View components extracted to separate files for maintainability.
// Loaded via <script defer> tags before this file in index.html.
const OverviewView       = window.OverviewView;
const WatchlistView      = window.WatchlistView;
const ScreenerView       = window.ScreenerView;
const NewsView           = window.NewsView;
const WhatsWhatView      = window.WhatsWhatView;
const MapView            = window.MapView;
const IntelligenceView   = window.IntelligenceView;
const AIAssistantView    = window.AIAssistantView;
const AISuiteView        = window.AISuiteView;

const DashboardRedesign = ({ routeView = 'overview', onRouteChange = null }: { routeView?: string; onRouteChange?: ((view: string) => void) | null }) => {
    const { currentUser: authCurrentUser } = window.AppAuth.useAuth();
    const [activeView, setActiveView] = useState(routeView);
    const [watchlistData, setWatchlistData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
    const userMenuBtnRef = useRef<HTMLElement | null>(null);
    const userDropdownRef = useRef<HTMLElement | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
    const [preferencesOpen, setPreferencesOpen] = useState<boolean>(false);
    const [profileSettingsOpen, setProfileSettingsOpen] = useState<boolean>(false);
    const [securityOpen, setSecurityOpen] = useState<boolean>(false);
    const [termsOpen, setTermsOpen] = useState<boolean>(false);
    const [privacyOpen, setPrivacyOpen] = useState<boolean>(false);
    const [helpOpen, setHelpOpen] = useState<boolean>(false);
    const [profilePicture, setProfilePicture] = useState<string | null>(null);
    const [theme, setTheme] = useState('dark');
    // Preferences state
    const [preferences, setPreferences] = useState<Record<string, any>>({
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
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
    const [searching, setSearching] = useState<boolean>(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [searchNoResults, setSearchNoResults] = useState<boolean>(false);
    const [searchFocused, setSearchFocused] = useState<boolean>(false);
    const [activeScreener, setActiveScreener] = useState<string | null>(null);
    const [ceoModalOpen, setCeoModalOpen] = useState<boolean>(false);
    const [selectedCEO, setSelectedCEO] = useState({ name: '', company: '', symbol: '' });
    const [toolsOpen, setToolsOpen] = useState<boolean>(false);
    const [marketsOpen, setMarketsOpen] = useState<boolean>(false);
    const searchDebounceRef = useRef<any>(null);
    const searchInputRef = useRef<HTMLElement | null>(null);
    const [selectedCategory, setSelectedCategory] = useState('All');

    // User data state
    const [userData, setUserData] = useState({ name: 'Account', email: 'Loading...' });
    const [isGuest, setIsGuest] = useState<boolean>(false);

    // Subscription state
    const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);

    // Live pricing state
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [marketStatus, setMarketStatus] = useState({ isOpen: false, status: 'Closed' });
    const [socketConnected, setSocketConnected] = useState<boolean>(false);
    const [updatingStocks, setUpdatingStocks] = useState(new Set<string>());
    const [updateStats, setUpdateStats] = useState({ total: 0, lastMinute: 0, lastUpdateTime: null as Date | null });
    const livePricingRef = useRef<any>({
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
    const keepAliveRef = useRef<any>(null);
    const socketRef = useRef<SocketIOClient | null>(null);
    const viewedStocksRef = useRef(new Set()); // Track stocks user is viewing
    const updateStatsRef = useRef({ updates: [] as number[], lastMinute: [] as number[] });
    const isLoadingRef = useRef<boolean>(false); // Prevent duplicate watchlist requests

    const handleNavigate = useCallback((view: string) => {
        setActiveView(view);
        if (onRouteChange) {
            onRouteChange(view);
        }
    }, [onRouteChange]);

    // Load preferences from localStorage (merge with defaults so new keys are always present)
    const loadPreferences = () => {
        try {
            const saved = localStorage.getItem('userPreferences');
            if (saved) {
                setPreferences(prev => ({ ...prev, ...JSON.parse(saved) }));
            }
        } catch (e: any) {
            // Use defaults if loading fails
        }
    };

    // Save preferences to localStorage
    const savePreferences = (newPreferences: Record<string, any>) => {
        try {
            localStorage.setItem('userPreferences', JSON.stringify(newPreferences));
            setPreferences(newPreferences);
            if (window.showNotification) {
                window.showNotification('Preferences saved successfully', 'success');
            }
        } catch (e: any) {
            if (window.showNotification) {
                window.showNotification('Failed to save preferences', 'error');
            }
        }
    };

    // Apply preferences when they change
    useEffect(() => {
        // Theme
        document.body.setAttribute('data-theme', preferences.theme || 'dark');

        // Store defaultTimeRange globally so chart components (react-chart.js) can read it
        (window as any).__defaultTimeRange = preferences.defaultTimeRange || '1D';
    }, [preferences]);

    useEffect(() => {
        if (routeView && routeView !== activeView) {
            setActiveView(routeView);
        }
    }, [routeView, activeView]);

    useEffect(() => {
        // Handle guest mode on mount
        if ((window as any).__guestMode && !authCurrentUser) {
            setIsGuest(true);
            setUserData({ name: 'Guest', email: '' });
            setIsLoading(false);
        }

        // Load critical data first (non-blocking)
        loadUserData();
        loadPreferences();
        loadSubscriptionInfo();

        // Load profile picture from Firestore
        if (authCurrentUser?.uid) {
            (async () => {
                try {
                    const authHeaders = await getAuthHeaders(authCurrentUser);
                    const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                    const res = await fetch(`${API_BASE}/api/user/profile-picture`, { headers: authHeaders, credentials: 'include' });
                    if (res.ok) {
                        const data = await res.json();
                        setProfilePicture(data.profile_picture || null);
                    }
                } catch (_) {}
            })();
        } else {
            setProfilePicture(null);
        }

        // Defer Alpaca status check - only needed when Preferences opens
        // loadAlpacaStatus() removed from initial load

        // Load watchlist data (this is the main data we need)
        loadWatchlistData();

        // Listen for watchlist changes from chatbot or other sources
        const handleWatchlistChange = () => {
            loadWatchlistData();
        };

        window.addEventListener('watchlistChanged', handleWatchlistChange);

        return () => {
            window.removeEventListener('watchlistChanged', handleWatchlistChange);
        };
    }, []);

    useEffect(() => {
        if (authCurrentUser) {
            setUserData({
                name: authCurrentUser.displayName || (authCurrentUser.email || '').split('@')[0] || 'Account',
                email: authCurrentUser.email || 'user@example.com'
            });
            loadWatchlistData();
            loadSubscriptionInfo();
            return;
        }

        clearWatchlistCache();
        setWatchlistData([]);
        setIsLoading(false);
        if ((window as any).__guestMode) {
            setIsGuest(true);
            setUserData({ name: 'Guest', email: '' });
        } else {
            routeTo('/', {}, true);
        }
    }, [authCurrentUser]);

    // Load user data from Firebase
    const loadUserData = () => {
        const user = authCurrentUser;
        if (user) {
            setUserData({
                name: user.displayName || (user.email || '').split('@')[0] || 'Account',
                email: user.email || 'user@example.com'
            });
        }
    };

    const loadSubscriptionInfo = async () => {
        const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
        try {
            const user = authCurrentUser;
            if (!user) return;
            const token = await user.getIdToken();
            const res = await fetch(`${API_BASE}/api/billing/subscription`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSubscriptionInfo(data);
            }
        } catch (e: any) {
            // Non-critical — silently ignore
        }
    };

    // Expose globally so index.html checkout=success flow can trigger a reload
    useEffect(() => {
        (window as any).__reloadSubscriptionInfo = loadSubscriptionInfo;
        return () => { delete (window as any).__reloadSubscriptionInfo; };
    }, []);

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
                    signal: (AbortSignal as any).timeout(5000)
                });
            } catch (e: any) {
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
                setSocketConnected(true);

                // Join watchlist updates room when user is available
                const setupRooms = async () => {
                    try {
                        const authHeaders = await getAuthHeaders();
                        if (authHeaders['X-User-ID']) {
                            const userId = authHeaders['X-User-ID'];
                            socketRef.current!.emit('join_watchlist_updates', { user_id: userId });
                            socketRef.current!.emit('join_user_room', { user_id: userId });
                            // Joined WebSocket rooms for user
                        }
                    } catch (e: any) {
                        // Error setting up WebSocket rooms
                    }
                };

                setupRooms();
            });

            // Listen for real-time watchlist price updates
            let lastUpdateTime = Date.now();
            let updateCount = 0;

            socketRef.current.on('watchlist_updated', (data: any) => {
                updateCount++;
                const now = Date.now();
                const timeSinceLastUpdate = ((now - lastUpdateTime) / 1000).toFixed(1);
                const currentTime = new Date().toLocaleTimeString();

                // Real-time price update received - ALWAYS use fresh prices

                if (data.prices && data.prices.length > 0) {
                    const symbols = data.prices.map((p: any) => p.symbol).join(', ');
                    const sample = data.prices[0];
                }

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
                        stats.lastMinute = stats.updates.filter((t: number) => now - t < 60000);

                        setUpdateStats({
                            total: livePricingRef.current.socketUpdateCount,
                            lastMinute: stats.lastMinute.length,
                            lastUpdateTime: new Date()
                        });
                    }

                    // Update watchlist data with FRESH prices from WebSocket
                    setWatchlistData(prevData => {
                        const updatedData = prevData.map((stock: any) => {
                            const update = data.prices.find((p: any) => p.symbol === stock.symbol);
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
                        data.prices.forEach((update: any) => {
                            if (update.price && update.price > 0) {
                                const exists = updatedData.find((s: any) => s.symbol === update.symbol);
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
                            prevData.map((stock: any) => ({ ...stock, _updated: false }))
                        );
                    }, 2000);
                }
            });

            socketRef.current.on('disconnect', () => {
                setSocketConnected(false);
            });

            socketRef.current.on('connect_error', (error: any) => {
                setSocketConnected(false);
            });

            socketRef.current.on('reconnect', (attemptNumber: any) => {
                setSocketConnected(true);
            });

            socketRef.current.on('reconnect_attempt', () => {
            });
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    // Track viewed stocks for priority updates (exposed globally)
    const trackStockView = (symbol: string) => {
        if (!socketRef.current || !socketRef.current.connected) return;

        const trackView = async () => {
            try {
                const authHeaders = await getAuthHeaders();
                const userId = authHeaders['X-User-ID'];
                if (userId && symbol) {
                    viewedStocksRef.current.add(symbol);
                    socketRef.current!.emit('track_stock_view', {
                        user_id: userId,
                        symbol: symbol.toUpperCase()
                    });
                    // Tracking stock view
                }
            } catch (e: any) {
                // Error tracking stock view
            }
        };

        trackView();
    };

    const untrackStockView = (symbol: string) => {
        if (!socketRef.current || !socketRef.current.connected) return;

        const untrackView = async () => {
            try {
                const authHeaders = await getAuthHeaders();
                const userId = authHeaders['X-User-ID'];
                if (userId && symbol) {
                    viewedStocksRef.current.delete(symbol);
                    socketRef.current!.emit('untrack_stock_view', {
                        user_id: userId,
                        symbol: symbol.toUpperCase()
                    });
                    // Untracking stock view
                }
            } catch (e: any) {
                console.error('Error untracking stock view:', e);
            }
        };

        untrackView();
    };

    // Expose tracking functions globally for modal access
    if (typeof window !== 'undefined') {
        (window as any).DashboardRedesign = (window as any).DashboardRedesign || {};
        (window as any).DashboardRedesign.trackStockView = trackStockView;
        (window as any).DashboardRedesign.untrackStockView = untrackStockView;
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
            } catch (e: any) {
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
    const updateStockPrice = async (symbol: string, ref: any) => {
        const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

        try {
            const authHeaders = await getAuthHeaders();
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
                setWatchlistData(prev => prev.map((s: any) =>
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
                        setWatchlistData(prev => prev.map((s: any) =>
                            s.symbol === symbol ? { ...s, _updated: false } : s
                        ));
                    }, 2000);
                }

                ref.priceCache.set(symbol, newPrice);
                return true;
            }
        } catch (e: any) {
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
            const newlyVisible: string[] = [];
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
                        const stock = watchlistData.find((s: any) => s.symbol === symbol);
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
            watchlistData.forEach((stock: any) => {
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


        return () => {
            clearTimeout(observeTimeout);
            observer.disconnect();
            ref.isActive = false;
        };
    }, [watchlistData, marketStatus.isOpen]);

    // Function to handle hover updates for off-screen stocks
    const handleStockHover = async (symbol: string) => {
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
        const handleClickOutside = (event: MouseEvent) => {
            // Don't close if clicking on a dropdown item (let it handle its own click)
            if ((event.target as Element).closest('.dropdown-item')) {
                return;
            }

            if (userMenuOpen &&
                !(event.target as Element).closest('.user-menu-wrapper') &&
                !(event.target as Element).closest('.user-dropdown') &&
                !(event.target as Element).closest('.preferences-modal')) {
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

    // Close nav dropdowns when clicking outside
    useEffect(() => {
        if (!toolsOpen && !marketsOpen) return;
        const handle = (e: MouseEvent) => {
            if (!(e.target as Element).closest('.hn-dropdown-wrapper')) {
                setToolsOpen(false);
                setMarketsOpen(false);
            }
        };
        document.addEventListener('click', handle);
        return () => document.removeEventListener('click', handle);
    }, [toolsOpen, marketsOpen]);

    // Periodic watchlist refresh to keep cache updated (controlled by autoRefresh preference)
    useEffect(() => {
        if (!preferences.autoRefresh) return;

        const refreshWatchlist = () => {
            // Only refresh if user is authenticated and we have data
            if (getCurrentUser() && watchlistData.length > 0) {
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

    const saveWatchlistToCache = (watchlistData: any[]) => {
        try {
            const cacheData = {
                data: watchlistData,
                timestamp: Date.now(),
                userId: getCurrentUser()?.uid
            };
            localStorage.setItem(WATCHLIST_CACHE_KEY, JSON.stringify(cacheData));
        } catch (error) {
        }
    };

    const loadWatchlistFromCache = () => {
        try {
            const cachedData = localStorage.getItem(WATCHLIST_CACHE_KEY);
            if (!cachedData) {
                return null;
            }

            const cache = JSON.parse(cachedData);
            const now = Date.now();
            const cacheAge = now - cache.timestamp;

            // Check if cache is for current user
            const currentUserId = getCurrentUser()?.uid;
            if (cache.userId !== currentUserId) {
                localStorage.removeItem(WATCHLIST_CACHE_KEY);
                return null;
            }

            // Check if cache is expired
            if (cacheAge > WATCHLIST_CACHE_EXPIRY) {
                localStorage.removeItem(WATCHLIST_CACHE_KEY);
                return null;
            }

            return cache.data;
        } catch (error) {
            return null;
        }
    };

    const clearWatchlistCache = () => {
        try {
            localStorage.removeItem(WATCHLIST_CACHE_KEY);
        } catch (error) {
        }
    };

    const loadWatchlistData = async () => {
        // Prevent multiple simultaneous requests
        if (isLoadingRef.current) {
            return;
        }

        try {
            isLoadingRef.current = true;

            // Check if user is authenticated before making request
            if (!getCurrentUser()) {
                // User not authenticated, cannot load watchlist
                clearWatchlistCache(); // Clear cache for logged out user
                setWatchlistData([]);
                setIsLoading(false);
                return;
            }


            // Try to load from cache first for immediate display
            const cachedWatchlist = loadWatchlistFromCache();
            if (cachedWatchlist && cachedWatchlist.length > 0) {
                // Mark cached items to show they need refresh
                const cachedWithFlag = cachedWatchlist.map((item: any) => ({
                    ...item,
                    _isCached: true
                }));
                setWatchlistData(cachedWithFlag);


            }

            const authHeaders = await getAuthHeaders();

            // Verify we have auth headers
            if (!authHeaders || !authHeaders['Authorization']) {
                console.error('Failed to get authentication headers');
                setWatchlistData([]);
                setIsLoading(false);
                return;
            }

            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

            const fetchOptions: any = {
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
            } catch (fetchError: any) {
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


                // Log all symbols received
                if (Array.isArray(data) && data.length > 0) {
                    const symbols = data.map((s: any) => s.symbol || s.id || 'NO_SYMBOL');
                    // symbols.forEach((sym, i) => // console.log(`   ${i + 1}. ${sym}`));
                }

                // Backend already provides prices, so we don't need to fetch individually
                // This was causing N API calls on initial load (very slow!)
                if (Array.isArray(data) && data.length > 0) {
                    // Map the data to match expected fields
                    const formattedData = data.map((stock: any) => {
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
                        const categoryMap: Record<string, string> = {
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


                    // Remove cached flags since we now have fresh data
                    const freshData = formattedData.map((item: any) => ({
                        ...item,
                        _isCached: false
                    }));

                    // Formatted watchlist data
                    setWatchlistData(freshData);

                    // Cache the successful data for offline/fallback use
                    saveWatchlistToCache(formattedData);
                    lastSuccessfulLoadRef.current = Date.now();

                    // Show success notification if we were previously showing cached data
                    const wasCached = watchlistData.some((item: any) => item._isCached);
                    if (wasCached && window.showNotification) {
                        window.showNotification('Watchlist updated with latest data', 'success');
                    }

                    // Immediately fetch prices for stocks that need price updates
                    // Prioritize visible stocks (first 10 stocks) to show prices instantly
                    const stocksNeedingPrices = formattedData.filter((s: any) => s._priceLoading);

                    if (stocksNeedingPrices.length > 0) {
                        // Fetching prices for stocks

                        // Helper function to fetch a single stock price
                        const fetchStockPrice = async (symbol: string) => {
                            try {
                                const authHeaders = await getAuthHeaders();
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
                                    setWatchlistData(prev => prev.map((s: any) => {
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
                            } catch (e: any) {
                            }
                            // Clear loading state on failure so price shows as $0.00
                            setWatchlistData(prev => prev.map((s: any) =>
                                s.symbol === symbol ? { ...s, _priceLoading: false } : s
                            ));
                            return false;
                        };

                        // Fetch prices for all stocks in parallel
                        const stocksToFetch = stocksNeedingPrices;
                        Promise.all(stocksToFetch.map((stock: any) => fetchStockPrice(stock.symbol)))
                            .then(() => {
                                // Initial price fetch completed
                            });
                    }
                } else {
                    // Don't clear watchlist if we have cached data
                    const cachedData = loadWatchlistFromCache();
                    if (cachedData && cachedData.length > 0) {
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
                    if (getCurrentUser()) {
                        try {
                            await getCurrentUser()!.getIdToken(true); // Force refresh
                            // Token refreshed, retrying
                            // Retry once after token refresh
                            setTimeout(() => loadWatchlistData(), 1000);
                            return;
                        } catch (refreshError: any) {
                            // Failed to refresh token
                        }
                    }
                }

                // Don't clear watchlist if we have cached data
                const cachedData = loadWatchlistFromCache();
                if (cachedData && cachedData.length > 0) {
                    setWatchlistData(cachedData);
                } else {
                    setWatchlistData([]);
                }
            }
        } catch (error: any) {
            // Error loading watchlist
            console.error('Error loading watchlist:', error);

            // Don't clear watchlist if we have cached data
            const cachedData = loadWatchlistFromCache();
            if (cachedData && cachedData.length > 0) {
                setWatchlistData(cachedData);
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
        const rawQuery = searchQuery.trim();
        if (!rawQuery) return;

        try {
            setSearching(true);
            const authHeaders = await getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

            const upperQuery = rawQuery.toUpperCase();
            const looksLikeSymbol = /^[A-Z0-9.]{1,10}$/.test(upperQuery);
            let resolvedSymbol = upperQuery;

            try {
                const searchResp = await fetch(`${API_BASE}/api/search/stocks?q=${encodeURIComponent(rawQuery)}`, {
                    method: 'GET',
                    headers: authHeaders,
                    credentials: 'include'
                });

                if (searchResp.ok) {
                    const searchData = await searchResp.json();
                    const searchResults = Array.isArray(searchData?.results) ? searchData.results : [];

                    if (searchResults.length > 0) {
                        const normalize = (value: any) => String(value || '').toUpperCase().trim();
                        const exactSymbolMatch = searchResults.find((r: any) => normalize(r?.symbol) === upperQuery);
                        const prefixSymbolMatch = searchResults.find((r: any) => normalize(r?.symbol).startsWith(upperQuery));
                        const exactNameMatch = searchResults.find((r: any) => normalize(r?.name) === upperQuery);
                        const containsNameMatch = searchResults.find((r: any) => normalize(r?.name).includes(upperQuery));
                        const selected = exactSymbolMatch || prefixSymbolMatch || exactNameMatch || containsNameMatch || searchResults[0];

                        if (selected?.symbol) {
                            resolvedSymbol = normalize(selected.symbol);
                            setSearchQuery(resolvedSymbol);
                        }
                    }
                }
            } catch (_) {
                // Symbol resolution failure should not block direct symbol searches.
            }

            let response = await fetch(`${API_BASE}/api/stock/${resolvedSymbol}`, {
                method: 'GET',
                headers: authHeaders,
                credentials: 'include'
            });

            if (!response.ok && looksLikeSymbol && resolvedSymbol !== upperQuery) {
                response = await fetch(`${API_BASE}/api/stock/${upperQuery}`, {
                    method: 'GET',
                    headers: authHeaders,
                    credentials: 'include'
                });
                if (response.ok) {
                    resolvedSymbol = upperQuery;
                }
            }

            if (response.ok) {
                const data = await response.json();
                setSearchResults([data]);
                setShowSearchResults(true);

                // Track searched stock for priority real-time updates
                const symbol = resolvedSymbol;
                trackStockView(symbol);

                // Track search results for priority updates
                if (socketRef.current && socketRef.current.connected) {
                    const trackSearch = async () => {
                        try {
                            const authHeaders = await getAuthHeaders();
                            const userId = authHeaders['X-User-ID'];
                            if (userId) {
                                socketRef.current!.emit('track_search_stock', {
                                    user_id: userId,
                                    symbols: [symbol]
                                });
                            }
                        } catch (e: any) {
                            // Error tracking search stock
                        }
                    };
                    trackSearch();
                }

                (window as any).openStockDetailsModalReact && (window as any).openStockDetailsModalReact(symbol);
                setSuggestions([]);
                setHighlightedIndex(-1);
            } else {
                window.showNotification && window.showNotification('Stock not found', 'error');
            }
        } catch (error: any) {
            window.showNotification && window.showNotification('Search failed', 'error');
        } finally {
            setSearching(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        if (e.key === 'Escape') {
            setSuggestions([]);
            setHighlightedIndex(-1);
            setSearchNoResults(false);
            return;
        }
        if (e.key === 'Enter' && suggestions.length > 0) {
            const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
            const choice = suggestions[idx];
            if (choice?.type === 'ceo') {
                setSelectedCEO({ name: choice.ceoName, company: choice.companyName, symbol: choice.symbol });
                setCeoModalOpen(true);
            } else if (choice?.symbol) {
                (window as any).openStockDetailsModalReact && (window as any).openStockDetailsModalReact(choice.symbol);
            }
            setSuggestions([]);
            setHighlightedIndex(-1);
            setSearchQuery('');
            setSearchNoResults(false);
        }
    };

    const handleAddFirstStock = () => {
        if (searchInputRef.current) {
            (searchInputRef.current as HTMLInputElement).focus();
        }
    };

    const onSearchInputChange = (value: string) => {
        setSearchQuery(value);
        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }
        if (!value.trim()) {
            setSuggestions([]);
            setHighlightedIndex(-1);
            setSearchNoResults(false);
            return;
        }
        searchDebounceRef.current = setTimeout(async () => {
            try {
                setSearching(true);
                const authHeaders = await getAuthHeaders();
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

                // Fire stock search and CEO search in parallel
                const [stockResp, ceoResp] = await Promise.allSettled([
                    fetch(`${API_BASE}/api/search/stocks?q=${encodeURIComponent(value.trim())}`, { method: 'GET', headers: authHeaders, credentials: 'include' }),
                    fetch(`${API_BASE}/api/search/ceo?q=${encodeURIComponent(value.trim())}`, { method: 'GET', headers: authHeaders, credentials: 'include' })
                ]);

                let stockResults: any[] = [];
                if (stockResp.status === 'fulfilled' && stockResp.value.ok) {
                    const data = await stockResp.value.json();
                    const res = data.results || data;
                    stockResults = (Array.isArray(res) ? res : []).slice(0, 5).map((s: any) => ({ ...s, type: 'stock' }));
                }

                let ceoResults: any[] = [];
                if (ceoResp.status === 'fulfilled' && ceoResp.value.ok) {
                    const data = await ceoResp.value.json();
                    const res = data.results || data;
                    ceoResults = (Array.isArray(res) ? res : []).slice(0, 3).map((c: any) => ({
                        type: 'ceo',
                        ceoName: c.ceo_name || c.ceoName || c.name || '',
                        companyName: c.company_name || c.companyName || '',
                        symbol: c.symbol || ''
                    })).filter((c: any) => c.ceoName);
                }

                const combined = [...stockResults, ...ceoResults];
                setSuggestions(combined);
                setHighlightedIndex(combined.length > 0 ? 0 : -1);
                setSearchNoResults(combined.length === 0);
            } catch (_) {
                setSuggestions([]);
                setHighlightedIndex(-1);
                setSearchNoResults(false);
            } finally {
                setSearching(false);
            }
        }, 200);
    };

    const refreshData = () => {
        setIsLoading(true);
        loadWatchlistData();
    };

    const handleLogout = async () => {
        try {
            // Sign out from Firebase
            if (getAuthClient()) {
                await window.AppAuth.signOut();
            }

            // Sign out from backend
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            await fetch(`${API_BASE}/api/logout`, {
                method: 'POST',
                credentials: 'include'
            });

            // Redirect to home
            window.location.href = '/';
        } catch (error: any) {
            window.location.href = '/';
        }
    };

    const openDetails = (symbol: string) => {
        if ((window as any).openStockDetailsModalReact) {
            (window as any).openStockDetailsModalReact(symbol);
        }
    };

    // Expose chart viewing globally - opens chart-only modal
    (window as any).viewChart = async (symbol: string) => {
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
        chartModalContainer.onclick = (e: MouseEvent) => {
            if (e.target === chartModalContainer) {
                chartModalContainer.remove();
                document.body.style.overflow = '';
            }
        };

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
            max-width: 1100px;
            width: 100%;
            max-height: 90vh;
            position: relative;
            overflow: visible;
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

        // Chart container - direct child, no extra padding wrapper
        const chartContainer = document.createElement('div');
        chartContainer.id = 'chartOnlyContainer';
        chartContainer.style.cssText = 'width: 100%; min-height: 500px; max-height: 90vh; overflow: hidden;';

        chartContent.appendChild(closeBtn);
        chartContent.appendChild(chartContainer);
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
                    if ((window as any).StockChart && chartContainer) {
                        const chartRoot = ReactDOM.createRoot(chartContainer);
                        chartRoot.render(React.createElement((window as any).StockChart, {
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
        } catch (error: any) {
            const errorText = document.createTextNode(error.message);
            const errorP = document.createElement('p');
            errorP.appendChild(errorText);
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'padding: 2rem; text-align: center; color: #ef4444;';
            errorDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
            errorDiv.appendChild(errorP);
            chartContainer.innerHTML = '';
            chartContainer.appendChild(errorDiv);
        }

        // Close on escape key
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    };

    const removeFromWatchlist = async (symbol: string) => {
        try {
            const confirmed = window.confirm ? window.confirm(`Remove ${symbol} from your watchlist?`) : true;
            if (!confirmed) return;

            // Optimistically remove from UI immediately
            const symbolUpper = symbol.toUpperCase();
            setWatchlistData((prev) => {
                const filtered = prev.filter((s: any) => {
                    const stockSymbol = (s.symbol || s.id || '').toUpperCase();
                    return stockSymbol !== symbolUpper;
                });
                return filtered;
            });

            const authHeaders = await getAuthHeaders();
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
                if (typeof (window as any).refreshWatchlist === 'function') {
                    (window as any).refreshWatchlist();
                }
                window.showNotification && window.showNotification(`${symbol} removed from watchlist`, 'success');
            } else {
                // If deletion failed, reload to restore the stock
                await loadWatchlistData();
                const errorData = await response.json().catch(() => ({ error: 'Failed to remove stock' }));
                window.showNotification && window.showNotification(errorData.error || `Failed to remove ${symbol}`, 'error');
            }
        } catch (error: any) {
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
            const authHeaders = await getAuthHeaders();
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
                // Optimistic UI: immediately show placeholder card
                setWatchlistData(prev => [...prev, { symbol, name: symbol, current_price: null, change_percent: 0, category: 'General', _priceLoading: true }]);
                // Refresh list with full data in background
                loadWatchlistData();
                try { window.dispatchEvent(new CustomEvent('watchlistChanged')); } catch (_) {}
                if (typeof (window as any).refreshWatchlist === 'function') (window as any).refreshWatchlist();
            } else {
                window.showNotification && window.showNotification(`Failed to add ${symbol}`, 'error');
            }
        } catch (err: any) {
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
            {/* Guest Banner */}
            {isGuest && (
                <div className="guest-banner">
                    <span>
                        <i className="fas fa-eye"></i> You're browsing as a guest. Sign in to save your watchlist, keep research notes, and use AI research tools.
                    </span>
                    <button
                        className="guest-banner-btn"
                        onClick={() => {
                            (window as any).__guestMode = false;
                            routeTo('/');
                        }}
                    >
                        Sign In
                    </button>
                </div>
            )}
            {/* Top Navigation Bar */}
            <header className="dashboard-header">
                {/* Logo + Search */}
                <div className="header-brand">
                    <div className="header-logo" onClick={() => handleNavigate('overview')} style={{ cursor: 'pointer' }}>
                        <i className="fas fa-chart-line logo-icon"></i>
                        <span className="logo-name">AI Stock Sage</span>
                    </div>
                    <div className={`header-search-wrap${searchFocused && !searchQuery.trim() ? ' search-screener-open' : ''}`}>
                        <div className="hs-input-row">
                            <i className={`fas ${searching ? 'fa-spinner fa-spin' : 'fa-search'} hs-icon`}></i>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input
                                    ref={searchInputRef as React.RefObject<HTMLInputElement>}
                                    type="text"
                                    placeholder="Search stocks, ETFs, and companies..."
                                    className="hs-input"
                                    value={searchQuery}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchInputChange(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    onBlur={() => setTimeout(() => {
                                        setSuggestions([]);
                                        setHighlightedIndex(-1);
                                        setSearchNoResults(false);
                                        setSearchFocused(false);
                                    }, 200)}
                                    onFocus={() => {
                                        setSearchFocused(true);
                                        if (searchQuery.trim()) onSearchInputChange(searchQuery);
                                    }}
                                    aria-autocomplete="list"
                                    aria-expanded={suggestions.length > 0 || searchNoResults}
                                    autoComplete="off"
                                />
                                {searchQuery.trim() && (suggestions.length > 0 || searchNoResults) && (
                                    <div className="search-suggestions" role="listbox">
                                        {suggestions.length > 0 ? (() => {
                                            const q = searchQuery.trim().toUpperCase();
                                            const highlightText = (text: string, query: string) => {
                                                if (!text) return React.createElement('span', null, '');
                                                const i = text.toUpperCase().indexOf(query);
                                                if (i === -1) return React.createElement('span', null, text);
                                                return React.createElement(React.Fragment, null,
                                                    text.slice(0, i),
                                                    React.createElement('span', { className: 'match-highlight' }, text.slice(i, i + query.length)),
                                                    text.slice(i + query.length)
                                                );
                                            };
                                            const firstCeoIdx = suggestions.findIndex((s: any) => s.type === 'ceo');
                                            return suggestions.map((s: any, idx: number) => {
                                                const showCeoDivider = idx === firstCeoIdx && idx > 0;
                                                if (s.type === 'ceo') {
                                                    return React.createElement(React.Fragment, { key: `ceo-${s.symbol}-${idx}` },
                                                        showCeoDivider && React.createElement('div', { className: 'suggestions-divider' }, 'CEOs'),
                                                        React.createElement('div',
                                                            {
                                                                role: 'option',
                                                                className: `suggestion-item ceo-item ${idx === highlightedIndex ? 'active' : ''}`,
                                                                onMouseEnter: () => setHighlightedIndex(idx),
                                                                onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
                                                                onClick: () => {
                                                                    setSelectedCEO({ name: s.ceoName, company: s.companyName, symbol: s.symbol });
                                                                    setCeoModalOpen(true);
                                                                    setSuggestions([]);
                                                                    setHighlightedIndex(-1);
                                                                    setSearchQuery('');
                                                                    setSearchNoResults(false);
                                                                    setSearchFocused(false);
                                                                }
                                                            },
                                                            React.createElement('span', { className: 's-symbol' },
                                                                React.createElement('i', { className: 'fas fa-user-tie' }),
                                                                highlightText(s.ceoName, q)
                                                            ),
                                                            React.createElement('span', { className: 's-name' },
                                                                s.companyName + (s.symbol ? ` · ${s.symbol}` : '')
                                                            )
                                                        )
                                                    );
                                                }
                                                const sym = s.symbol || '';
                                                const nm = s.name || '';
                                                return React.createElement('div',
                                                    {
                                                        key: `${sym}-${idx}`,
                                                        role: 'option',
                                                        className: `suggestion-item ${idx === highlightedIndex ? 'active' : ''}`,
                                                        onMouseEnter: () => setHighlightedIndex(idx),
                                                        onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
                                                        onClick: () => {
                                                            (window as any).openStockDetailsModalReact && (window as any).openStockDetailsModalReact(sym);
                                                            setSuggestions([]);
                                                            setHighlightedIndex(-1);
                                                            setSearchQuery('');
                                                            setSearchNoResults(false);
                                                            setSearchFocused(false);
                                                        }
                                                    },
                                                    React.createElement('span', { className: 's-symbol' }, highlightText(sym, q)),
                                                    React.createElement('span', { className: 's-name' }, highlightText(nm, q))
                                                );
                                            });
                                        })() : React.createElement('div', { className: 'search-no-results' },
                                            React.createElement('i', { className: 'fas fa-search' }),
                                            React.createElement('span', null, `No results for "${searchQuery.trim()}"`)
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        {searchFocused && !searchQuery.trim() && (
                            <div className="search-screener-dropdown">
                                <div className="ssd-section-label">Stock screeners</div>
                                <div className="ssd-grid">
                                    {[
                                        { id: 'daily-price-jumps', label: 'Daily price jumps', fa: 'fas fa-chart-line', color: '#22c55e' },
                                        { id: 'daily-price-dips', label: 'Daily price dips', fa: 'fas fa-arrow-down', color: '#ef4444' },
                                        { id: 'upcoming-earnings', label: 'Upcoming earnings', fa: 'fas fa-calendar-alt', color: '#f59e0b' },
                                        { id: 'analyst-picks', label: 'Analyst picks', fa: 'fas fa-medal', color: '#8b5cf6' },
                                        { id: 'highest-implied-volatility', label: 'Highest implied volatility', fa: 'fas fa-bolt', color: '#06b6d4' },
                                    ].map((sc) => React.createElement('button', {
                                        key: sc.id,
                                        className: 'ssd-item',
                                        onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
                                        onClick: () => {
                                            setActiveScreener(sc.id);
                                            handleNavigate('screener');
                                            setSearchFocused(false);
                                            setSearchQuery('');
                                        }
                                    },
                                        React.createElement('span', { className: 'ssd-item-icon', style: { background: sc.color + '22', color: sc.color } },
                                            React.createElement('i', { className: sc.fa })
                                        ),
                                        React.createElement('span', { className: 'ssd-item-label' }, sc.label)
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/* Center Nav */}
                <nav className="header-nav">
                    <button
                        className={`hn-item ${activeView === 'watchlist' ? 'active' : ''}`}
                        onClick={() => handleNavigate('watchlist')}
                    >Watchlist</button>
                    <button
                        className={`hn-item ${activeView === 'intelligence' ? 'active' : ''}`}
                        onClick={() => handleNavigate('intelligence')}
                    >Research</button>
                    <button
                        className={`hn-item ${activeView === 'overview' ? 'active' : ''}`}
                        onClick={() => handleNavigate('overview')}
                    >Overview</button>
                    <div className="hn-dropdown-wrapper">
                        <button
                            className={`hn-item hn-dropdown-btn ${['news', 'whatswhat', 'map'].includes(activeView) ? 'active' : ''}`}
                            onClick={() => { setMarketsOpen(v => !v); setToolsOpen(false); }}
                        >
                            Market Context <i className={`fas fa-chevron-down hn-chevron ${marketsOpen ? 'hn-chevron-open' : ''}`}></i>
                        </button>
                        {marketsOpen && (
                            <div className="hn-dropdown">
                                <button className="hn-dropdown-item" onClick={() => { handleNavigate('news'); setMarketsOpen(false); }}>
                                    <i className="fas fa-newspaper"></i> News
                                </button>
                                <button className="hn-dropdown-item" onClick={() => { handleNavigate('whatswhat'); setMarketsOpen(false); }}>
                                    <i className="fas fa-fire"></i> What's Hot
                                </button>
                                <button className="hn-dropdown-item" onClick={() => { handleNavigate('map'); setMarketsOpen(false); }}>
                                    <i className="fas fa-map"></i> Map
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="hn-dropdown-wrapper">
                        <button
                            className={`hn-item hn-dropdown-btn ${['aisuite', 'paper'].includes(activeView) ? 'active' : ''}`}
                            onClick={() => { setToolsOpen(v => !v); setMarketsOpen(false); }}
                        >
                            More Tools <i className={`fas fa-chevron-down hn-chevron ${toolsOpen ? 'hn-chevron-open' : ''}`}></i>
                        </button>
                        {toolsOpen && (
                            <div className="hn-dropdown">
                                <button className="hn-dropdown-item" onClick={() => { handleNavigate('aisuite'); setToolsOpen(false); }}>
                                    <i className="fas fa-brain"></i> Research Tools
                                </button>
                                <button className="hn-dropdown-item" onClick={() => { handleNavigate('paper'); setToolsOpen(false); }}>
                                    <i className="fas fa-flask"></i> Paper Trading
                                </button>
                            </div>
                        )}
                    </div>
                </nav>
                {/* Right Actions */}
                <div className="header-actions">
                    <button className="assistant-cta-btn" onClick={() => handleNavigate('assistant')}>
                        <i className="fas fa-robot"></i>
                        <span>Ask AI</span>
                    </button>
                    <div className="user-menu-wrapper">
                        <button
                            ref={userMenuBtnRef as React.RefObject<HTMLButtonElement>}
                            className="user-menu-btn"
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                        >
                            <i className="fas fa-user-circle"></i>
                            <i className={`fas fa-chevron-down ${userMenuOpen ? 'open' : ''}`}></i>
                        </button>
                        {userMenuOpen && ReactDOM.createPortal(
                            <div
                                ref={userDropdownRef as React.RefObject<HTMLDivElement>}
                                className="user-dropdown"
                                style={{
                                    top: `${dropdownPosition.top}px`,
                                    right: `${dropdownPosition.right}px`
                                }}
                            >
                                <div className="user-dropdown-header">
                                    <div className="user-info">
                                        <div className="user-avatar">
                                            {(profilePicture || authCurrentUser?.photoURL) ? (
                                                <img src={profilePicture || (authCurrentUser?.photoURL ?? undefined)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                            ) : (
                                                <span className="user-avatar-initials">
                                                    {userData.name ? userData.name.split(' ').map((w: string) => w[0]).slice(0,2).join('').toUpperCase() : '?'}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <div className="user-name">{userData.name}</div>
                                            <div className="user-email">{userData.email}</div>
                                        </div>
                                    </div>
                                    {subscriptionInfo && (
                                        <div className="user-plan-badge" style={{
                                            marginTop: '10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                        }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                background: subscriptionInfo.tier === 'elite'
                                                    ? 'rgba(255,184,0,0.15)'
                                                    : subscriptionInfo.tier === 'pro'
                                                        ? 'rgba(0,212,170,0.15)'
                                                        : 'rgba(255,255,255,0.08)',
                                                border: `1px solid ${subscriptionInfo.tier === 'elite' ? 'rgba(255,184,0,0.4)' : subscriptionInfo.tier === 'pro' ? 'rgba(0,212,170,0.4)' : 'rgba(255,255,255,0.12)'}`,
                                                color: subscriptionInfo.tier === 'elite'
                                                    ? '#FFB800'
                                                    : subscriptionInfo.tier === 'pro'
                                                        ? '#00D4AA'
                                                        : 'rgba(255,255,255,0.5)',
                                                borderRadius: '20px',
                                                padding: '3px 10px',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                            }}>
                                                <i className={`fas ${subscriptionInfo.tier === 'elite' ? 'fa-crown' : subscriptionInfo.tier === 'pro' ? 'fa-bolt' : 'fa-user'}`}></i>
                                                {subscriptionInfo.label || subscriptionInfo.tier.charAt(0).toUpperCase() + subscriptionInfo.tier.slice(1)} Plan
                                            </span>
                                            {subscriptionInfo.status === 'trialing' && (
                                                <span style={{ fontSize: '11px', color: '#FFB800' }}>Trial active</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="dropdown-divider"></div>
                                <div
                                    className="dropdown-item"
                                    onClick={(e: React.MouseEvent) => {
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
                                    onClick={(e: React.MouseEvent) => {
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
                                    onClick={(e: React.MouseEvent) => {
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
                                    onClick={async (e: React.MouseEvent) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setUserMenuOpen(false);
                                        if (!subscriptionInfo || subscriptionInfo.tier === 'free') {
                                            window.showUpgradeModal && window.showUpgradeModal('Upgrade to manage your subscription.');
                                            return;
                                        }
                                        const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                                        try {
                                            const user = getCurrentUser();
                                            if (!user) return;
                                            const token = await user.getIdToken();
                                            const res = await fetch(`${API_BASE}/api/billing/portal`, {
                                                method: 'POST',
                                                headers: { 'Authorization': `Bearer ${token}` },
                                            });
                                            const data = await res.json();
                                            if (data.portal_url) {
                                                window.location.href = data.portal_url;
                                            } else if (window.showNotification) {
                                                window.showNotification('Could not open billing portal. Please try again.', 'error');
                                            }
                                        } catch (err: any) {
                                            if (window.showNotification) window.showNotification('Could not open billing portal.', 'error');
                                        }
                                    }}
                                >
                                    <i className="fas fa-credit-card"></i>
                                    <span>Manage Billing</span>
                                </div>
                                <div className="dropdown-divider"></div>
                                <div
                                    className="dropdown-item"
                                    onClick={(e: React.MouseEvent) => {
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
                                    onClick={(e: React.MouseEvent) => {
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
                                    onClick={(e: React.MouseEvent) => {
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


            {/* Main Content Area */}
            <div className="dashboard-content">
                {activeView === 'overview' && <OverviewView watchlistData={watchlistData} marketStatus={marketStatus} onNavigate={handleNavigate} onStockHover={handleStockHover} preferences={preferences} />}
                {activeView === 'screener' && <ScreenerView screenerType={activeScreener} onNavigate={handleNavigate} onChangeScreener={(t: any) => setActiveScreener(t)} />}
                {activeView === 'watchlist' && isGuest && (
                    <div className="guest-locked-view">
                        <i className="fas fa-lock"></i>
                        <h3>Sign in to use your Watchlist</h3>
                        <p>Create a free account to save stocks, track performance, set price alerts, and get AI-powered insights.</p>
                        <button className="guest-signin-btn" onClick={() => {
                            (window as any).__guestMode = false;
                            routeTo('/');
                        }}>
                            <i className="fas fa-user"></i> Sign In / Create Account
                        </button>
                    </div>
                )}
                {activeView === 'watchlist' && !isGuest && (
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
                {activeView === 'map' && <MapView />}
                {activeView === 'intelligence' && <IntelligenceView watchlistData={watchlistData} />}
                {activeView === 'assistant' && <AIAssistantView />}
                {activeView === 'aisuite' && !isGuest && <AISuiteView watchlistData={watchlistData} />}
                {activeView === 'aisuite' && isGuest && (
                    <div className="guest-locked-view">
                        <i className="fas fa-lock"></i>
                        <h3>Sign in to access AI Suite</h3>
                        <p>Get AI-powered portfolio analysis, stock comparisons, and personalized insights.</p>
                        <button className="guest-signin-btn" onClick={() => { (window as any).__guestMode = false; routeTo('/'); }}>
                            <i className="fas fa-user"></i> Sign In / Create Account
                        </button>
                    </div>
                )}
                {activeView === 'paper' && !isGuest && (window as any).PaperTradingView && React.createElement((window as any).PaperTradingView, {})}
                {activeView === 'paper' && !isGuest && !(window as any).PaperTradingView && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'rgba(255,255,255,0.3)', flexDirection: 'column', gap: '1rem' }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem' }}></i>
                        <span>Loading Paper Trading…</span>
                    </div>
                )}
                {activeView === 'paper' && isGuest && (
                    <div className="guest-locked-view">
                        <i className="fas fa-lock"></i>
                        <h3>Sign in to use Paper Trading</h3>
                        <p>Practice trading with virtual money, test strategies risk-free, and track your simulated portfolio.</p>
                        <button className="guest-signin-btn" onClick={() => { (window as any).__guestMode = false; routeTo('/'); }}>
                            <i className="fas fa-user"></i> Sign In / Create Account
                        </button>
                    </div>
                )}
            </div>

            {/* CEO Details Modal */}
            {ceoModalOpen && (window as any).CEODetailsModal && React.createElement((window as any).CEODetailsModal, {
                isOpen: ceoModalOpen,
                onClose: () => setCeoModalOpen(false),
                ceoName: selectedCEO.name,
                companyName: selectedCEO.company,
                companySymbol: selectedCEO.symbol
            })}

            {/* Floating Assistant - Hidden when already in assistant view */}
            {activeView !== 'assistant' && (
                    <button className="floating-ai-btn" onClick={() => handleNavigate('assistant')}>
                    <i className="fas fa-comments"></i>
                    <span className="tooltip">Open Assistant</span>
                </button>
            )}

            {/* Profile Settings Modal */}
            {profileSettingsOpen && ReactDOM.createPortal(
                <div className="modal-overlay" onClick={() => setProfileSettingsOpen(false)}>
                    <div className="modal-content settings-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setProfilePicture(reader.result as string);
                                                        (async () => {
                                                            try {
                                                                const authHeaders = await getAuthHeaders(authCurrentUser);
                                                                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                                                                const res = await fetch(`${API_BASE}/api/user/profile-picture`, {
                                                                    method: 'POST',
                                                                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                                                                    credentials: 'include',
                                                                    body: JSON.stringify({ profile_picture: reader.result }),
                                                                });
                                                                if (!res.ok) {
                                                                    const err = await res.json();
                                                                    if (window.showNotification) window.showNotification(err.error || 'Failed to save picture', 'error');
                                                                    setProfilePicture(null);
                                                                    return;
                                                                }
                                                            } catch (_) {
                                                                if (window.showNotification) window.showNotification('Failed to save picture', 'error');
                                                                setProfilePicture(null);
                                                                return;
                                                            }
                                                        })();
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
                                                (async () => {
                                                    try {
                                                        const authHeaders = await getAuthHeaders(authCurrentUser);
                                                        const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                                                        await fetch(`${API_BASE}/api/user/profile-picture`, {
                                                            method: 'DELETE',
                                                            headers: authHeaders,
                                                            credentials: 'include',
                                                        });
                                                    } catch (_) {}
                                                })();
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
                    <div className="modal-content settings-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => savePreferences({ ...preferences, compactNumbers: e.target.checked })}
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
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => savePreferences({ ...preferences, showSparklines: e.target.checked })}
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
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => savePreferences({ ...preferences, showPercentChange: e.target.checked })}
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
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => savePreferences({ ...preferences, autoRefresh: e.target.checked })}
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
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => savePreferences({ ...preferences, defaultTimeRange: e.target.value })}
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
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => savePreferences({ ...preferences, currency: e.target.value })}
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
                    <div className="modal-content settings-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
                    <div className="modal-content legal-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
                    <div className="modal-content legal-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
                    <div className="modal-content help-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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

(window as any).DashboardRedesign = DashboardRedesign;

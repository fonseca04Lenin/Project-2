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
    const searchInputRef = useRef(null);
    const [selectedCategory, setSelectedCategory] = useState('All');
    
    // User data state
    const [userData, setUserData] = useState({ name: 'Account', email: 'Loading...' });
    
    // Live pricing state
    const [lastUpdate, setLastUpdate] = useState(null);
    const [marketStatus, setMarketStatus] = useState({ isOpen: false, status: 'Closed' });
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
        stockRefs: new Map()
    });
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
            
            ref.callCount++;
            ref.lastCallTime = Date.now();
            
            // Handle rate limit response (429 Too Many Requests)
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const cooldownSeconds = retryAfter ? parseInt(retryAfter) : 60;
                ref.rateLimitCooldown = true;
                ref.rateLimitUntil = Date.now() + (cooldownSeconds * 1000);
                console.warn(`⚠️ Rate limit hit. Cooldown for ${cooldownSeconds} seconds.`);
                return false;
            }
            
            if (response.ok) {
                const stockData = await response.json();
                const oldPrice = ref.priceCache.get(symbol);
                const newPrice = stockData.price;
                const newChangePercent = stockData.priceChangePercent || 0;
                
                const hasSignificantChange = oldPrice && Math.abs(oldPrice - newPrice) > 0.01;
                
                // Update watchlist data with new price and change
                setWatchlistData(prev => prev.map(s => 
                    s.symbol === symbol 
                        ? { 
                            ...s, 
                            current_price: newPrice, 
                            change_percent: newChangePercent,
                            price_change: stockData.priceChange || 0,
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
            console.error(`Error updating price for ${symbol}:`, e);
        }
        return false;
    };

    // Live pricing updates with visibility detection and rate limiting
    useEffect(() => {
        if (!watchlistData.length || !marketStatus.isOpen) return;
        
        const ref = livePricingRef.current;
        
        // Set up Intersection Observer to track visible stocks
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const symbol = entry.target.getAttribute('data-stock-symbol');
                if (!symbol) return;
                
                if (entry.isIntersecting) {
                    ref.visibleStocks.add(symbol);
                } else {
                    ref.visibleStocks.delete(symbol);
                }
            });
        }, {
            root: null,
            rootMargin: '50px', // Start loading slightly before visible
            threshold: 0.1
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
        
        // Initial observation with delay to ensure DOM is ready
        const observeTimeout = setTimeout(observeStocks, 500);
        
        // Re-observe when watchlist changes
        const reobserveInterval = setInterval(observeStocks, 2000);
        
        const updateLivePrices = async () => {
            const now = Date.now();
            
            // Check if we're in rate limit cooldown
            if (ref.rateLimitCooldown && now < ref.rateLimitUntil) {
                const remainingSeconds = Math.ceil((ref.rateLimitUntil - now) / 1000);
                return;
            }
            
            // Reset cooldown if time has passed
            if (ref.rateLimitCooldown && now >= ref.rateLimitUntil) {
                ref.rateLimitCooldown = false;
                ref.callCount = 0;
                ref.callWindowStart = now;
            }
            
            // Reset call count if window has passed (1 minute window)
            if (now - ref.callWindowStart > 60000) {
                ref.callCount = 0;
                ref.callWindowStart = now;
            }
            
            // Get stocks that are visible or hovered
            const stocksToUpdate = watchlistData.filter(stock => 
                ref.visibleStocks.has(stock.symbol) || ref.hoveredStocks.has(stock.symbol)
            );
            
            if (stocksToUpdate.length === 0) return;
            
            // Rate limit: max 30 calls per minute (increased since we're only updating visible stocks)
            const MAX_CALLS_PER_MINUTE = 30;
            const availableCalls = MAX_CALLS_PER_MINUTE - ref.callCount;
            const stocksToProcess = stocksToUpdate.slice(0, availableCalls);
            
            if (stocksToProcess.length === 0) return;
            
            // Process stocks with delay between calls
            for (let i = 0; i < stocksToProcess.length; i++) {
                const stock = stocksToProcess[i];
                
                // Add delay between calls (300ms = ~3 calls per second max)
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                if (ref.callCount >= MAX_CALLS_PER_MINUTE) {
                    break;
                }
                
                await updateStockPrice(stock.symbol, ref);
            }
            
            setLastUpdate(new Date());
        };
        
        // Initial update with delay
        setTimeout(updateLivePrices, 1000);
        
        // Update every 5 seconds during market hours
        ref.interval = setInterval(updateLivePrices, 5000);
        ref.isActive = true;
        
        return () => {
            if (ref.interval) {
                clearInterval(ref.interval);
            }
            clearTimeout(observeTimeout);
            clearInterval(reobserveInterval);
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
        
        // Check rate limits
        const now = Date.now();
        if (ref.rateLimitCooldown && now < ref.rateLimitUntil) return;
        if (ref.callCount >= 30) return;
        
        // Small delay to avoid rapid hover updates
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await updateStockPrice(symbol, ref);
        
        // Remove from hovered after a delay
        setTimeout(() => {
            ref.hoveredStocks.delete(symbol);
        }, 5000);
    };

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
                                    price_change: stockData.priceChange || 0,
                                    category: stock.category || stockData.category || 'General'
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
                            price_change: stock.price_change || stock.priceChange || 0,
                            category: stock.category || 'General'
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
            console.error('Logout error:', error);
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
                {activeView === 'overview' && <OverviewView watchlistData={watchlistData} marketStatus={marketStatus} onNavigate={setActiveView} onStockHover={handleStockHover} />}
                {activeView === 'watchlist' && (
                    <WatchlistView 
                        watchlistData={watchlistData.filter((s) => {
                            if (selectedCategory === 'All') return true;
                            return (s.category || 'General') === selectedCategory;
                        })}
                        onOpenDetails={openDetails}
                        onRemove={removeFromWatchlist}
                        onAddFirstStock={handleAddFirstStock}
                        onAdd={addToWatchlist}
                        selectedCategory={selectedCategory}
                        onCategoryChange={setSelectedCategory}
                        categories={categories}
                        onStockHover={handleStockHover}
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

// Sparkline Component for Mini Charts
const SparklineChart = ({ symbol, data, isPositive }) => {
    const canvasRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [chartData, setChartData] = useState(null);

    useEffect(() => {
        if (!symbol) return;
        
        // Fetch 7-day chart data for sparkline
        const fetchSparklineData = async () => {
            try {
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const response = await fetch(`${API_BASE}/api/chart/${symbol}?range=7d`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        setChartData(data.map(d => d.price));
                        setIsLoading(false);
                    }
                }
            } catch (error) {
                console.error(`Error fetching sparkline for ${symbol}:`, error);
                setIsLoading(false);
            }
        };

        fetchSparklineData();
    }, [symbol]);

    useEffect(() => {
        if (!chartData || !canvasRef.current || chartData.length === 0) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width = 80;
        const height = canvas.height = 30;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Calculate points
        const min = Math.min(...chartData);
        const max = Math.max(...chartData);
        const range = max - min || 1;
        const stepX = width / (chartData.length - 1);
        
        // Draw line
        ctx.beginPath();
        ctx.strokeStyle = isPositive ? '#00D924' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        chartData.forEach((price, index) => {
            const x = index * stepX;
            const y = height - ((price - min) / range) * height;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Add gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, isPositive ? 'rgba(0, 217, 36, 0.2)' : 'rgba(239, 68, 68, 0.2)');
        gradient.addColorStop(1, isPositive ? 'rgba(0, 217, 36, 0)' : 'rgba(239, 68, 68, 0)');
        
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
    }, [chartData, isPositive]);

    if (isLoading) {
        return <div className="sparkline-loading" style={{ width: '80px', height: '30px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}></div>;
    }

    return <canvas ref={canvasRef} className="sparkline-chart" style={{ width: '80px', height: '30px' }} />;
};

// Sector Allocation Pie Chart Component
const SectorAllocationChart = ({ watchlistData }) => {
    const canvasRef = useRef(null);
    
    // Simple sector mapping (can be enhanced with actual API data)
    const sectorMap = {
        'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'META': 'Technology',
        'AMZN': 'Consumer Cyclical', 'TSLA': 'Consumer Cyclical', 'NFLX': 'Communication',
        'NVDA': 'Technology', 'AMD': 'Technology', 'INTC': 'Technology',
        'JPM': 'Financial', 'BAC': 'Financial', 'GS': 'Financial',
        'JNJ': 'Healthcare', 'PFE': 'Healthcare', 'UNH': 'Healthcare',
        'WMT': 'Consumer Defensive', 'KO': 'Consumer Defensive', 'PG': 'Consumer Defensive',
        'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy'
    };
    
    useEffect(() => {
        if (!watchlistData || watchlistData.length === 0 || !canvasRef.current) return;
        
        // Calculate sector allocation
        const sectorCounts = {};
        watchlistData.forEach(stock => {
            const sector = sectorMap[stock.symbol] || 'Other';
            sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
        });
        
        const sectors = Object.keys(sectorCounts);
        if (sectors.length === 0) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const size = Math.min(canvas.width, canvas.height);
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = size / 2 - 10;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Colors for sectors
        const colors = [
            '#00D924', '#00B01F', '#008F1A', '#006E15',
            '#4CAF50', '#66BB6A', '#81C784', '#A5D6A7'
        ];
        
        let currentAngle = -Math.PI / 2;
        const total = Object.values(sectorCounts).reduce((sum, count) => sum + count, 0);
        
        sectors.forEach((sector, index) => {
            const count = sectorCounts[sector];
            const sliceAngle = (count / total) * 2 * Math.PI;
            
            // Draw slice
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            currentAngle += sliceAngle;
        });
    }, [watchlistData]);
    
    if (!watchlistData || watchlistData.length === 0) {
        return (
            <div className="sector-chart-empty">
                <i className="fas fa-chart-pie"></i>
                <p>Add stocks to see sector allocation</p>
            </div>
        );
    }
    
    return <canvas ref={canvasRef} className="sector-chart" width="200" height="200" />;
};

// Performance Timeline Component
const PerformanceTimeline = ({ watchlistData, selectedRange, onRangeChange }) => {
    const [performanceData, setPerformanceData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        if (!watchlistData || watchlistData.length === 0) return;
        
        const fetchPerformanceData = async () => {
            setIsLoading(true);
            try {
                // Calculate portfolio performance for selected range
                // For now, we'll use current change_percent as approximation
                // In production, you'd fetch historical data for each stock
                const totalChange = watchlistData.reduce((sum, stock) => {
                    return sum + (stock.change_percent || 0);
                }, 0);
                const avgChange = totalChange / watchlistData.length;
                
                setPerformanceData({
                    change: avgChange,
                    value: watchlistData.reduce((sum, stock) => {
                        const price = stock.current_price || stock.price || 0;
                        const shares = 100; // Assuming 100 shares per stock
                        return sum + (price * shares);
                    }, 0)
                });
            } catch (error) {
                console.error('Error fetching performance data:', error);
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchPerformanceData();
    }, [watchlistData, selectedRange]);
    
    const ranges = ['1D', '1W', '1M', '3M', '1Y'];
    
    return (
        <div className="performance-timeline">
            <div className="timeline-header">
                <h4>Portfolio Performance</h4>
                <div className="range-selector">
                    {ranges.map(range => (
                        <button
                            key={range}
                            className={`range-btn ${selectedRange === range ? 'active' : ''}`}
                            onClick={() => onRangeChange && onRangeChange(range)}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </div>
            {isLoading ? (
                <div className="performance-loading">Loading...</div>
            ) : performanceData ? (
                <div className="performance-display">
                    <div className="performance-value">
                        <span className="value-label">Total Value</span>
                        <span className="value-amount">${(performanceData.value / 1000).toFixed(1)}K</span>
                    </div>
                    <div className={`performance-change ${performanceData.change >= 0 ? 'positive' : 'negative'}`}>
                        <i className={`fas fa-arrow-${performanceData.change >= 0 ? 'trend-up' : 'trend-down'}`}></i>
                        <span>{performanceData.change >= 0 ? '+' : ''}{performanceData.change.toFixed(2)}%</span>
                    </div>
                </div>
            ) : (
                <div className="performance-empty">No data available</div>
            )}
        </div>
    );
};

// Overview Tab Component
const OverviewView = ({ watchlistData, marketStatus, onNavigate, onStockHover }) => {
    const [selectedRange, setSelectedRange] = useState('1M');
    const [sparklineData, setSparklineData] = useState({});
    
    // Enhanced portfolio calculations
    const calculatePortfolioMetrics = () => {
        if (watchlistData.length === 0) {
            return {
                totalValue: 0,
                dayChange: 0,
                dayChangePercent: 0,
                bestPerformer: null,
                worstPerformer: null,
                totalPositions: 0
            };
        }
        
        // Calculate total value (assuming 100 shares per stock for demo)
        const sharesPerStock = 100;
        const totalValue = watchlistData.reduce((sum, stock) => {
            const price = stock.current_price || stock.price || 0;
            return sum + (price * sharesPerStock);
        }, 0);
        
        // Calculate day change
        const dayChange = watchlistData.reduce((sum, stock) => {
            const price = stock.current_price || stock.price || 0;
            const changePercent = stock.change_percent || 0;
            return sum + (price * sharesPerStock * changePercent / 100);
        }, 0);
        
        const dayChangePercent = totalValue > 0 ? (dayChange / totalValue) * 100 : 0;
        
        // Find best and worst performers
        const bestPerformer = watchlistData.reduce((best, stock) => {
            const change = stock.change_percent || 0;
            return (change > (best.change_percent || 0)) ? stock : best;
        }, watchlistData[0]);
        
        const worstPerformer = watchlistData.reduce((worst, stock) => {
            const change = stock.change_percent || 0;
            return (change < (worst.change_percent || 0)) ? stock : worst;
        }, watchlistData[0]);
        
        return {
            totalValue,
            dayChange,
            dayChangePercent,
            bestPerformer,
            worstPerformer,
            totalPositions: watchlistData.length
        };
    };
    
    const metrics = calculatePortfolioMetrics();

    return (
        <div className="overview-view">
            {/* Enhanced Portfolio Summary Card */}
            <div className="portfolio-summary-card">
                <div className="summary-header">
                    <h2><i className="fas fa-chart-line"></i> Portfolio Performance</h2>
                    <PerformanceTimeline 
                        watchlistData={watchlistData} 
                        selectedRange={selectedRange}
                        onRangeChange={setSelectedRange}
                    />
                </div>
                
                <div className="summary-metrics">
                    <div className="metric-group">
                        <div className="metric-item primary">
                            <span className="metric-label">Total Value</span>
                            <span className="metric-value">${(metrics.totalValue / 1000).toFixed(2)}K</span>
                        </div>
                        <div className={`metric-item ${metrics.dayChangePercent >= 0 ? 'positive' : 'negative'}`}>
                            <span className="metric-label">Day Change</span>
                            <span className="metric-value">
                                {metrics.dayChangePercent >= 0 ? '+' : ''}{metrics.dayChangePercent.toFixed(2)}%
                            </span>
                            <span className="metric-amount">
                                {metrics.dayChange >= 0 ? '+' : ''}${Math.abs(metrics.dayChange).toFixed(2)}
                            </span>
                        </div>
                    </div>
                    
                    <div className="metric-group">
                        <div className="metric-item">
                            <span className="metric-label">Best Performer</span>
                            <div className="performer-info">
                                <span className="performer-symbol">{metrics.bestPerformer?.symbol || 'N/A'}</span>
                                <span className={`performer-change positive`}>
                                    +{metrics.bestPerformer?.change_percent?.toFixed(2) || '0.00'}%
                                </span>
                            </div>
                        </div>
                        <div className="metric-item">
                            <span className="metric-label">Worst Performer</span>
                            <div className="performer-info">
                                <span className="performer-symbol">{metrics.worstPerformer?.symbol || 'N/A'}</span>
                                <span className={`performer-change negative`}>
                                    {metrics.worstPerformer?.change_percent?.toFixed(2) || '0.00'}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
                                    <div className="stock-name-enhanced">{stock.name}</div>
                                </div>
                                <div className="stock-sparkline">
                                    <SparklineChart 
                                        symbol={stock.symbol} 
                                        isPositive={(stock.change_percent || 0) >= 0}
                                    />
                                </div>
                                <div className="stock-price-group">
                                    <div className={`stock-price-enhanced ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                                        ${(stock.current_price || stock.price || 0).toFixed(2)}
                                    </div>
                                    <div className={`stock-change-enhanced ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                                        {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2) || '0.00'}%
                                    </div>
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
const WatchlistView = ({ watchlistData, onOpenDetails, onRemove, onAdd, selectedCategory, onCategoryChange, categories, onAddFirstStock, onStockHover }) => {
    return (
        <div className="watchlist-view">
            <div className="view-header">
                <h2>My Watchlist</h2>
            </div>
            
            {/* Category Filter Buttons */}
            <div className="category-filters" style={{
                display: 'flex',
                gap: '0.5rem',
                padding: '1.5rem 2rem',
                flexWrap: 'wrap',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
                {categories.map(category => (
                    <button
                        key={category}
                        onClick={() => onCategoryChange && onCategoryChange(category)}
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
                    </button>
                ))}
            </div>
            <div className="watchlist-grid">
                {watchlistData.map((stock, index) => (
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
                        <div className={`stock-price-large ${stock._updated ? 'price-updated' : ''} ${stock.change_percent >= 0 ? 'positive' : 'negative'}`}>
                            ${(stock.current_price || stock.price || 0).toFixed(2)}
                        </div>
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


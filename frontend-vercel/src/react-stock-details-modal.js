// React Stock Details Modal Component
const { useState, useEffect, useCallback, useRef } = React;

// Avoid duplicate declaration of API_BASE_URL
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';
}

// Use window.API_BASE_URL to avoid const redeclaration errors  
const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

// Watchlist Notes Section Component
const WatchlistNotesSection = ({ symbol, initialNotes = '' }) => {
    const [notes, setNotes] = useState(initialNotes);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Update notes when initialNotes changes
    useEffect(() => {
        setNotes(initialNotes || '');
        setHasChanges(false);
    }, [initialNotes]);

    const handleChange = (e) => {
        setNotes(e.target.value);
        setHasChanges(true);
    };

    const saveNotes = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const authHeaders = await window.getAuthHeaders();
            const response = await fetch(`${API_BASE}/api/watchlist/${symbol}/notes`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                credentials: 'include',
                body: JSON.stringify({ notes })
            });
            
            if (response.ok) {
                setHasChanges(false);
                setIsEditing(false);
                // Show success notification
                if (window.showNotification) {
                    window.showNotification('Notes saved successfully', 'success');
                }
            } else {
                throw new Error('Failed to save notes');
            }
        } catch (err) {
            if (window.showNotification) {
                window.showNotification('Failed to save notes', 'error');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleBlur = () => {
        if (hasChanges && !isSaving) {
            saveNotes();
        } else {
            setIsEditing(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            saveNotes();
        } else if (e.key === 'Escape') {
            setNotes(initialNotes || '');
            setHasChanges(false);
            setIsEditing(false);
        }
    };

    if (!isEditing && !initialNotes && !notes) {
        return (
            <div className="watchlist-notes-section">
                <div className="watchlist-notes-header">
                    <h4>
                        <i className="fas fa-sticky-note"></i>
                        Notes
                    </h4>
                </div>
                <div 
                    className="watchlist-notes-empty"
                    onClick={() => setIsEditing(true)}
                    style={{ cursor: 'pointer' }}
                >
                    <span>Click here to add notes about this stock</span>
                </div>
            </div>
        );
    }

    if (!isEditing) {
        return (
            <div className="watchlist-notes-section">
                <div className="watchlist-notes-header">
                    <h4>
                        <i className="fas fa-sticky-note"></i>
                        Notes
                    </h4>
                </div>
                <div 
                    className="watchlist-notes-content"
                    onClick={() => setIsEditing(true)}
                    style={{ cursor: 'pointer' }}
                >
                    <p>{notes}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="watchlist-notes-section watchlist-notes-editing">
            <div className="watchlist-notes-header">
                <h4>
                    <i className="fas fa-sticky-note"></i>
                    Notes
                </h4>
            </div>
            <textarea
                className="watchlist-notes-textarea"
                value={notes}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Add your notes here..."
                autoFocus
                rows="5"
            />
            <div className="watchlist-notes-actions">
                <button 
                    className="btn-secondary"
                    onClick={() => {
                        setNotes(initialNotes || '');
                        setHasChanges(false);
                        setIsEditing(false);
                    }}
                    disabled={isSaving}
                    style={{ marginRight: '0.5rem' }}
                >
                    Cancel
                </button>
                <button 
                    className="btn-primary"
                    onClick={saveNotes}
                    disabled={isSaving || !hasChanges}
                >
                    <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                    {isSaving ? ' Saving...' : ' Save Notes'}
                </button>
            </div>
        </div>
    );
};

// CEO Details Modal Component
const CEODetailsModal = ({ isOpen, onClose, ceoName, companyName, companySymbol }) => {
    const [ceoData, setCeoData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !ceoName || ceoName === '-') return;

        const fetchCEOData = async () => {
            setLoading(true);

            try {
                const searchQuery = encodeURIComponent(`${ceoName} CEO ${companyName}`);
                const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${searchQuery}&format=json&origin=*&srlimit=1`;

                const searchResponse = await fetch(wikiSearchUrl);
                const searchData = await searchResponse.json();

                if (searchData.query.search.length > 0) {
                    const pageId = searchData.query.search[0].pageid;
                    const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=original&pageids=${pageId}&format=json&origin=*`;
                    const contentResponse = await fetch(contentUrl);
                    const contentData = await contentResponse.json();
                    const page = contentData.query.pages[pageId];

                    setCeoData({
                        name: page.title || ceoName,
                        biography: page.extract || 'No biography available.',
                        imageUrl: page.original?.source || null,
                        wikipediaUrl: `https://en.wikipedia.org/?curid=${pageId}`,
                        found: true
                    });
                } else {
                    setCeoData({
                        name: ceoName,
                        biography: `${ceoName} is the Chief Executive Officer of ${companyName} (${companySymbol}). For more information, visit the company's official website.`,
                        imageUrl: null,
                        wikipediaUrl: null,
                        found: false
                    });
                }
            } catch (err) {
                setCeoData({
                    name: ceoName,
                    biography: `${ceoName} is the Chief Executive Officer of ${companyName} (${companySymbol}).`,
                    imageUrl: null,
                    wikipediaUrl: null,
                    found: false
                });
            } finally {
                setLoading(false);
            }
        };

        fetchCEOData();
    }, [isOpen, ceoName, companyName, companySymbol]);

    if (!isOpen) return null;

    return React.createElement('div', {
        className: 'modal-overlay ceo-modal-overlay',
        onClick: onClose,
        style: {
            zIndex: 10002,
            background: 'rgba(0, 0, 0, 0.95)'
        }
    },
        React.createElement('div', {
            className: 'modal-content ceo-modal',
            onClick: (e) => e.stopPropagation(),
            style: {
                background: '#1a1f2e',
                border: '1px solid #2d3748',
                maxWidth: '900px',
                width: '90%'
            }
        },
            React.createElement('div', {
                className: 'modal-header',
                style: {
                    background: '#1a1f2e',
                    borderBottom: '1px solid #2d3748',
                    padding: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }
            },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '1rem' } },
                    React.createElement('button', {
                        onClick: onClose,
                        style: {
                            background: 'transparent',
                            border: 'none',
                            color: '#00ff88',
                            cursor: 'pointer',
                            fontSize: '1.5rem',
                            padding: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'transform 0.2s'
                        },
                        onMouseOver: (e) => e.currentTarget.style.transform = 'translateX(-5px)',
                        onMouseOut: (e) => e.currentTarget.style.transform = 'translateX(0)',
                        title: 'Back to stock details'
                    },
                        React.createElement('i', { className: 'fas fa-arrow-left' })
                    ),
                    React.createElement('h2', {
                        style: {
                            margin: 0,
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }
                    },
                        React.createElement('i', { className: 'fas fa-user-tie', style: { color: '#00ff88' } }),
                        'CEO Profile'
                    )
                ),
                React.createElement('button', {
                    className: 'modal-close',
                    onClick: onClose,
                    style: {
                        background: 'rgba(255, 0, 0, 0.1)',
                        border: '1px solid rgba(255, 0, 0, 0.3)',
                        color: '#ff4444',
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                    },
                    onMouseOver: (e) => {
                        e.currentTarget.style.background = 'rgba(255, 0, 0, 0.2)';
                        e.currentTarget.style.transform = 'scale(1.1)';
                    },
                    onMouseOut: (e) => {
                        e.currentTarget.style.background = 'rgba(255, 0, 0, 0.1)';
                        e.currentTarget.style.transform = 'scale(1)';
                    }
                },
                    React.createElement('i', { className: 'fas fa-times' })
                )
            ),
            React.createElement('div', {
                className: 'modal-body',
                style: {
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    padding: '2rem',
                    background: '#1a1f2e'
                }
            },
                loading && React.createElement('div', { style: { textAlign: 'center', padding: '2rem' } },
                    React.createElement('i', { className: 'fas fa-spinner fa-spin', style: { fontSize: '2rem', color: '#00ff88' } }),
                    React.createElement('p', { style: { marginTop: '1rem', color: '#9ca3af' } }, 'Loading CEO information...')
                ),
                !loading && ceoData && React.createElement('div', { className: 'ceo-details' },
                    React.createElement('div', {
                        className: 'ceo-header',
                        style: {
                            display: 'flex',
                            gap: '2rem',
                            marginBottom: '2rem',
                            padding: '2rem',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            borderRadius: '12px',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }
                    },
                        ceoData.imageUrl && React.createElement('img', {
                            src: ceoData.imageUrl,
                            alt: ceoData.name,
                            style: {
                                width: '120px',
                                height: '120px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '4px solid white',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                            }
                        }),
                        React.createElement('div', { style: { flex: 1 } },
                            React.createElement('h3', { style: { margin: '0 0 0.5rem 0', fontSize: '1.8rem', color: 'white' } }, ceoData.name),
                            React.createElement('p', { style: { margin: '0', fontSize: '1.1rem', opacity: 0.9 } }, 'Chief Executive Officer'),
                            React.createElement('p', { style: { margin: '0.5rem 0 0 0', fontSize: '1rem', opacity: 0.9 } }, `${companyName} (${companySymbol})`)
                        )
                    ),
                    React.createElement('div', {
                        className: 'ceo-biography',
                        style: {
                            padding: '1.5rem',
                            background: '#232936',
                            borderRadius: '12px',
                            marginBottom: '1.5rem',
                            border: '1px solid #2d3748'
                        }
                    },
                        React.createElement('h4', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                marginBottom: '1rem',
                                color: '#00ff88',
                                fontSize: '1.1rem',
                                fontWeight: '600'
                            }
                        },
                            React.createElement('i', { className: 'fas fa-book-open', style: { color: '#00ff88' } }),
                            'Biography'
                        ),
                        React.createElement('p', {
                            style: {
                                lineHeight: '1.8',
                                color: '#d1d5db',
                                fontSize: '1rem',
                                whiteSpace: 'pre-wrap',
                                margin: 0
                            }
                        }, ceoData.biography)
                    ),
                    ceoData.wikipediaUrl && React.createElement('div', { style: { textAlign: 'center', marginTop: '1.5rem' } },
                        React.createElement('a', {
                            href: ceoData.wikipediaUrl,
                            target: '_blank',
                            rel: 'noopener noreferrer',
                            style: {
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'rgba(0, 255, 136, 0.1)',
                                border: '1px solid #00ff88',
                                color: '#00ff88',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                            },
                            onMouseOver: (e) => {
                                e.currentTarget.style.background = 'rgba(0, 255, 136, 0.2)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            },
                            onMouseOut: (e) => {
                                e.currentTarget.style.background = 'rgba(0, 255, 136, 0.1)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }
                        },
                            React.createElement('i', { className: 'fab fa-wikipedia-w' }),
                            'Read More on Wikipedia',
                            React.createElement('i', { className: 'fas fa-external-link-alt', style: { fontSize: '0.8rem' } })
                        )
                    ),
                    !ceoData.found && React.createElement('div', {
                        style: {
                            padding: '1rem',
                            background: 'rgba(255, 193, 7, 0.1)',
                            border: '1px solid rgba(255, 193, 7, 0.3)',
                            borderRadius: '8px',
                            marginTop: '1rem',
                            color: '#ffc107'
                        }
                    },
                        React.createElement('i', { className: 'fas fa-info-circle', style: { marginRight: '0.5rem' } }),
                        React.createElement('span', null, 'Limited information available.')
                    )
                )
            )
        )
    );
};

const StockDetailsModal = ({ isOpen, onClose, symbol, isFromWatchlist = false }) => {
    const [stockData, setStockData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [news, setNews] = useState([]);
    const [newsLoading, setNewsLoading] = useState(false);
    const chartRootRef = useRef(null);

    // CEO Modal State
    const [ceoModalOpen, setCeoModalOpen] = useState(false);
    const [selectedCEO, setSelectedCEO] = useState({ name: '', company: '', symbol: '' });

    // Update global modalState when stockData changes
    useEffect(() => {
        if (stockData) {
            modalState.stockData = stockData;
        }
    }, [stockData]);

    // Track stock view for priority real-time updates
    useEffect(() => {
        if (!isOpen || !symbol) return;
        
        // Track stock view for priority updates
        if (typeof window.trackStockView === 'function') {
            window.trackStockView(symbol);
        }
        
        return () => {
            // Untrack when modal closes
            if (typeof window.untrackStockView === 'function') {
                window.untrackStockView(symbol);
            }
        };
    }, [isOpen, symbol]);

    // Fetch stock details
    useEffect(() => {
        if (!isOpen || !symbol) return;

        const fetchData = async () => {
            console.time(`StockDetailsModal-${symbol}-total`);
            console.log(`[StockDetailsModal] Starting to load data for ${symbol}`);

            setLoading(true);
            setError(null);
            setStockData(null);
            setChartData(null);
            setNews([]);

            try {
                // Auth headers timing
                console.time(`StockDetailsModal-${symbol}-auth-headers`);
                const authHeaders = await window.getAuthHeaders();
                console.timeEnd(`StockDetailsModal-${symbol}-auth-headers`);
                console.log(`[StockDetailsModal] Auth headers fetched for ${symbol}`);

                const useWatchlistEndpoint = isFromWatchlist;

                // Details API call
                console.time(`StockDetailsModal-${symbol}-details-api`);
                const detailPromise = (async () => {
                    const url = useWatchlistEndpoint
                        ? `${API_BASE}/api/watchlist/${symbol}/details`
                        : `${API_BASE}/api/company/${symbol}`;
                    const opts = useWatchlistEndpoint
                        ? { method: 'GET', headers: authHeaders, credentials: 'include' }
                        : { credentials: 'include' };
                    console.log(`[StockDetailsModal] Fetching details from: ${url}`);
                    const response = await fetch(url, opts);
                    if (!response.ok) {
                        throw new Error(`Failed to load stock data: HTTP ${response.status}`);
                    }
                    const data = await response.json();
                    console.log(`[StockDetailsModal] Details data received for ${symbol}`);
                    if (useWatchlistEndpoint) {
                        return {
                            ...data,
                            isInWatchlist: true,
                            dateAdded: data.date_added || data.dateAdded,
                            originalPrice: data.original_price || data.originalPrice,
                            priceChange: data.price_change !== null && data.price_change !== undefined ? data.price_change : data.priceChange,
                            percentageChange: data.percentage_change !== null && data.percentage_change !== undefined ? data.percentage_change : data.percentageChange,
                            category: data.category,
                            notes: data.notes
                        };
                    }
                    return { ...data, isInWatchlist: false };
                })();

                // Chart API call
                console.time(`StockDetailsModal-${symbol}-chart-api`);
                const chartPromise = (async () => {
                    try {
                        console.log(`[StockDetailsModal] Fetching chart data for ${symbol}`);
                        const chartResp = await fetch(`${API_BASE}/api/chart/${symbol}`, {
                            credentials: 'include'
                        });
                        if (chartResp.ok) {
                            const chartData = await chartResp.json();
                            console.log(`[StockDetailsModal] Chart data received for ${symbol} (${chartData.length} points)`);
                            return chartData;
                        }
                        console.log(`[StockDetailsModal] Chart API failed for ${symbol}, status: ${chartResp.status}`);
                    } catch (error) {
                        console.log(`[StockDetailsModal] Chart API error for ${symbol}:`, error);
                    }
                    return null;
                })();

                // News API call
                console.time(`StockDetailsModal-${symbol}-news-api`);
                const newsPromise = (async () => {
                    try {
                        console.log(`[StockDetailsModal] Fetching news for ${symbol}`);
                        const newsResp = await fetch(`${API_BASE}/api/news/company/${symbol}`, {
                            credentials: 'include'
                        });
                        if (newsResp.ok) {
                            const newsRespData = await newsResp.json();
                            const newsData = newsRespData.slice(0, 5);
                            console.log(`[StockDetailsModal] News data received for ${symbol} (${newsData.length} articles)`);
                            return newsData;
                        }
                        console.log(`[StockDetailsModal] News API failed for ${symbol}, status: ${newsResp.status}`);
                    } catch (error) {
                        console.log(`[StockDetailsModal] News API error for ${symbol}:`, error);
                    }
                    return [];
                })();

                // Load details and chart first (critical for modal display)
                console.log(`[StockDetailsModal] Loading core data for ${symbol}`);
                const [details, chartDataResp] = await Promise.all([detailPromise, chartPromise]);

                console.timeEnd(`StockDetailsModal-${symbol}-details-api`);
                console.timeEnd(`StockDetailsModal-${symbol}-chart-api`);

                console.log(`[StockDetailsModal] Core data loaded for ${symbol}, displaying modal`);

                setStockData(details);
                if (chartDataResp) setChartData(chartDataResp);

                // Load news in background after modal is displayed
                setNewsLoading(true);
                (async () => {
                    try {
                        console.log(`[StockDetailsModal] Fetching news for ${symbol} in background`);
                        const newsResp = await fetch(`${API_BASE}/api/news/company/${symbol}`, {
                            credentials: 'include'
                        });
                        if (newsResp.ok) {
                            const newsRespData = await newsResp.json();
                            const newsData = newsRespData.slice(0, 5);
                            console.log(`[StockDetailsModal] News data received for ${symbol} (${newsData.length} articles)`);
                            setNews(newsData);
                        } else {
                            console.log(`[StockDetailsModal] News API failed for ${symbol}, status: ${newsResp.status}`);
                        }
                    } catch (error) {
                        console.log(`[StockDetailsModal] News API error for ${symbol}:`, error);
                    } finally {
                        setNewsLoading(false);
                        console.timeEnd(`StockDetailsModal-${symbol}-news-api`);
                    }
                })();

                console.log(`[StockDetailsModal] State updated for ${symbol}`);
            } catch (err) {
                console.error(`[StockDetailsModal] Error loading data for ${symbol}:`, err);
                setError(err.message || 'Failed to load stock details');
            } finally {
                setLoading(false);
                console.timeEnd(`StockDetailsModal-${symbol}-total`);
                console.log(`[StockDetailsModal] Loading completed for ${symbol}`);
            }
        };

        fetchData();
    }, [isOpen, symbol, isFromWatchlist]);

    // Real-time price updates when modal is open with rate limiting
    const priceUpdateRef = useRef({
        lastCallTime: 0,
        rateLimitCooldown: false,
        rateLimitUntil: 0,
        isUpdating: false
    });

    useEffect(() => {
        if (!isOpen || !symbol) return;

        console.log(`[StockDetailsModal] Setting up real-time price updates for ${symbol}`);

        const updatePrice = async () => {
            const now = Date.now();
            const ref = priceUpdateRef.current;

            // Prevent concurrent updates
            if (ref.isUpdating) {
                console.log(`[StockDetailsModal] Skipping price update for ${symbol} - already updating`);
                return;
            }

            // Check if we're in rate limit cooldown
            if (ref.rateLimitCooldown && now < ref.rateLimitUntil) {
                console.log(`[StockDetailsModal] Skipping price update for ${symbol} - in rate limit cooldown`);
                return; // Skip this update
            }

            // Reset cooldown if time has passed
            if (ref.rateLimitCooldown && now >= ref.rateLimitUntil) {
                console.log(`[StockDetailsModal] Rate limit cooldown ended for ${symbol}`);
                ref.rateLimitCooldown = false;
            }

            // Throttle: minimum 5 seconds between calls
            const minDelay = 5000;
            if (now - ref.lastCallTime < minDelay) {
                console.log(`[StockDetailsModal] Skipping price update for ${symbol} - throttled (${now - ref.lastCallTime}ms since last call)`);
                return; // Skip if too soon
            }

            ref.isUpdating = true;
            const startTime = performance.now();
            console.log(`[StockDetailsModal] Starting backend price update for ${symbol}`);

            try {
                // Use backend API for price updates (handles CORS and Alpaca/Yahoo fallback)
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const authStart = performance.now();
                const authHeaders = await window.getAuthHeaders();
                const authTime = performance.now() - authStart;
                console.log(`[StockDetailsModal] Auth headers fetched for ${symbol}: ${authTime.toFixed(2)}ms`);

                console.log(`[StockDetailsModal] Fetching price data for ${symbol}`);
                const response = await fetch(`${API_BASE}/api/search`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...authHeaders
                    },
                    credentials: 'include',
                    body: JSON.stringify({ symbol: symbol })
                });

                ref.lastCallTime = Date.now();

                // Handle rate limit response
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const cooldownSeconds = retryAfter ? parseInt(retryAfter) : 60;
                    ref.rateLimitCooldown = true;
                    ref.rateLimitUntil = Date.now() + (cooldownSeconds * 1000);
                    console.log(`[StockDetailsModal] Rate limit hit for ${symbol}, cooling down for ${cooldownSeconds}s`);
                    return;
                }

                if (response.ok) {
                    const stockData = await response.json();
                    console.log(`[StockDetailsModal] Price data received for ${symbol}: $${stockData.price}`);
                    setStockData(prev => prev ? {
                        ...prev,
                        price: stockData.price,
                        priceChange: stockData.priceChange || 0,
                        percentageChange: stockData.priceChangePercent || 0,
                        priceChangePercent: stockData.priceChangePercent || 0
                    } : prev);
                    console.log(`[StockDetailsModal] Price state updated for ${symbol}`);
                } else {
                    console.log(`[StockDetailsModal] Price API failed for ${symbol}, status: ${response.status}`);
                }
            } catch (e) {
                console.error(`[StockDetailsModal] Error updating price for ${symbol}:`, e);
            } finally {
                ref.isUpdating = false;
                const totalTime = performance.now() - startTime;
                console.log(`[StockDetailsModal] Price update completed for ${symbol}: ${totalTime.toFixed(2)}ms`);
            }
        };

        // REMOVED: Modal price updates - rely on WebSocket updates instead
        // Backend WebSocket pushes updates every 30s to all connected clients
        // Modal will display most recent data from WebSocket
        console.log(`[StockDetailsModal] Price updates via WebSocket only for ${symbol}`);
        console.log(`   Backend updates every 30s - no separate modal polling needed`);

        return () => {
            // No cleanup needed - WebSocket handles updates
        };
    }, [isOpen, symbol]);

    // Render chart when chartData is available
    useEffect(() => {
        if (!chartData || !symbol) return;

        console.time(`StockDetailsModal-${symbol}-chart-render`);
        console.log(`[StockDetailsModal] Starting chart render for ${symbol}`);

        // Try to find container with retry logic
        let retryCount = 0;
        const maxRetries = 10;

        const findAndRenderChart = () => {
            const chartContainer = document.getElementById('modalChartContainer');
            if (!chartContainer) {
                retryCount++;
                if (retryCount < maxRetries) {
                    console.log(`[StockDetailsModal] Chart container not found for ${symbol}, retry ${retryCount}/${maxRetries}`);
                    setTimeout(findAndRenderChart, 100);
                } else {
                    console.log(`[StockDetailsModal] Chart container not found after ${maxRetries} retries for ${symbol}`);
                }
                return;
            }

            console.log(`[StockDetailsModal] Chart container found for ${symbol}, clearing and rendering`);

            // Clear container
            chartContainer.innerHTML = '';

            // Check if Chart.js and StockChart are available
            if (!window.StockChart) {
                console.log(`[StockDetailsModal] StockChart component not available for ${symbol}`);
                chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>Chart component not loaded. Please refresh the page.</p></div>';
                console.timeEnd(`StockDetailsModal-${symbol}-chart-render`);
                return;
            }

            if (!window.Chart && typeof Chart === 'undefined') {
                console.log(`[StockDetailsModal] Chart.js library not available for ${symbol}`);
                chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>Chart.js library not loaded. Please refresh the page.</p></div>';
                console.timeEnd(`StockDetailsModal-${symbol}-chart-render`);
                return;
            }

            if (chartData.length === 0) {
                console.log(`[StockDetailsModal] No chart data available for ${symbol}`);
                chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>No chart data available</p></div>';
                console.timeEnd(`StockDetailsModal-${symbol}-chart-render`);
                return;
            }

            // Render chart using ReactDOM.createRoot
            try {
                console.log(`[StockDetailsModal] Creating React root and rendering chart for ${symbol}`);
                // Create or reuse the root
                if (!chartRootRef.current) {
                    chartRootRef.current = ReactDOM.createRoot(chartContainer);
                }

                chartRootRef.current.render(React.createElement(window.StockChart, {
                    symbol: symbol,
                    data: chartData,
                    isModal: true,
                    onClose: null
                }));

                console.log(`[StockDetailsModal] Chart render completed for ${symbol}`);
                console.timeEnd(`StockDetailsModal-${symbol}-chart-render`);
            } catch (error) {
                console.error(`[StockDetailsModal] Chart render error for ${symbol}:`, error);
                chartContainer.innerHTML = `<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>Error rendering chart: ${error.message}</p></div>`;
                console.timeEnd(`StockDetailsModal-${symbol}-chart-render`);
            }
        };

        // Start the retry process
        findAndRenderChart();

        return () => {
            if (chartRootRef.current) {
                console.log(`[StockDetailsModal] Cleaning up chart root for ${symbol}`);
                chartRootRef.current.render(null);
            }
        };
    }, [chartData, symbol]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const formatMarketCap = (value) => {
        if (!value || value === '-') return '-';
        if (typeof value === 'number') {
            if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
            if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
            if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
            return `$${value.toFixed(2)}`;
        }
        return value.toString();
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    };

    return (
        <div className="stock-details-modal-overlay" onClick={onClose}>
            <div className="stock-details-modal-content" onClick={(e) => e.stopPropagation()}>
                {/* Close Button */}
                <button 
                    className="close-modal-btn" 
                    onClick={onClose}
                    aria-label="Close modal"
                >
                    <i className="fas fa-times"></i>
                </button>

                {loading && (
                    <div className="modal-loading">
                        <div className="spinner-large"></div>
                        <p>Loading stock details...</p>
                    </div>
                )}

                {error && (
                    <div className="modal-error">
                        <i className="fas fa-exclamation-triangle"></i>
                        <p>{error}</p>
                    </div>
                )}

                {stockData && !loading && (
                    <>
                        {/* Header */}
                        <div className="modal-header">
                            <div className="modal-header-content">
                            <h2>{stockData.name || symbol}</h2>
                            <span className="stock-symbol-badge">{symbol}</span>
                            </div>
                        </div>

                        {/* Watchlist Info */}
                        {stockData.isInWatchlist && (
                            <div className="watchlist-info-banner">
                                <div className="watchlist-info-grid">
                                    {stockData.dateAdded && (
                                        <div className="info-item">
                                            <span className="info-label">
                                                <i className="fas fa-calendar-plus"></i>
                                                Date Added
                                            </span>
                                            <span className="info-value">{formatDate(stockData.dateAdded)}</span>
                                        </div>
                                    )}
                                    {stockData.category && (
                                        <div className="info-item">
                                            <span className="info-label">
                                                <i className="fas fa-tag"></i>
                                                Category
                                            </span>
                                            <span className="info-value">{stockData.category}</span>
                                        </div>
                                    )}
                                    {stockData.priceChange !== undefined && (
                                        <div className="info-item">
                                            <span className="info-label">
                                                <i className="fas fa-chart-line"></i>
                                                Change Since Added
                                            </span>
                                            <span className={`info-value ${stockData.priceChange >= 0 ? 'positive' : 'negative'}`}>
                                                <i 
                                                    className={stockData.priceChange >= 0 ? 'fas fa-arrow-trend-up' : 'fas fa-arrow-trend-down'}
                                                    style={{ 
                                                        marginRight: '6px', 
                                                        fontSize: '16px',
                                                        fontWeight: '700',
                                                        color: stockData.priceChange >= 0 ? '#00D924' : '#ef4444',
                                                        textShadow: stockData.priceChange >= 0 
                                                            ? '0 0 8px rgba(0, 217, 36, 0.6), 0 0 12px rgba(0, 217, 36, 0.4)' 
                                                            : '0 0 8px rgba(239, 68, 68, 0.6), 0 0 12px rgba(239, 68, 68, 0.4)',
                                                        display: 'inline-block',
                                                        lineHeight: '1'
                                                    }}
                                                />
                                                {stockData.priceChange >= 0 ? '+' : ''}{stockData.priceChange?.toFixed(2)}
                                                {' '}({stockData.percentageChange?.toFixed(2)}%)
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Stock Info - Vanilla Style */}
                        <div className="stock-details-meta">
                            <div>
                                <strong data-icon="ceo">CEO:</strong> <span
                                    onClick={() => {
                                        if (stockData.ceo && stockData.ceo !== '-') {
                                            setSelectedCEO({
                                                name: stockData.ceo,
                                                company: stockData.name || symbol,
                                                symbol: symbol
                                            });
                                            setCeoModalOpen(true);
                                        }
                                    }}
                                    style={{
                                        cursor: stockData.ceo && stockData.ceo !== '-' ? 'pointer' : 'default',
                                        color: stockData.ceo && stockData.ceo !== '-' ? '#0066cc' : 'inherit',
                                        textDecoration: stockData.ceo && stockData.ceo !== '-' ? 'underline' : 'none',
                                        fontWeight: stockData.ceo && stockData.ceo !== '-' ? '600' : 'normal'
                                    }}
                                    title={stockData.ceo && stockData.ceo !== '-' ? 'Click to view CEO profile' : ''}
                                >{stockData.ceo || '-'}</span>
                            </div>
                            <div className="stock-description">
                                <strong data-icon="desc">Description:</strong> 
                                <span>{stockData.description || '-'}</span>
                            </div>
                            <div>
                                <strong data-icon="price">Price:</strong> <span className={stockData.percentageChange !== null && stockData.percentageChange !== undefined ? (stockData.percentageChange >= 0 ? 'positive' : 'negative') : ''} style={stockData.percentageChange !== null && stockData.percentageChange !== undefined ? { color: stockData.percentageChange >= 0 ? '#00D924' : '#ef4444', fontWeight: '600' } : {}}>${stockData.price || '-'}</span>
                            </div>
                            <div>
                                <strong data-icon="marketcap">Market Cap:</strong> <span>{formatMarketCap(stockData.marketCap)}</span>
                            </div>
                            <div>
                                <strong data-icon="pe">P/E Ratio:</strong> <span>{stockData.peRatio || '-'}</span>
                            </div>
                            <div>
                                <strong data-icon="dividend">Dividend Yield:</strong> <span>
                                    {stockData.dividendYield && stockData.dividendYield !== '-' 
                                        ? (typeof stockData.dividendYield === 'number' ? (stockData.dividendYield * 100).toFixed(2) + '%' : stockData.dividendYield)
                                        : '-'
                                    }
                                </span>
                            </div>
                            <div>
                                <strong data-icon="website">Website:</strong> <span>
                                    {stockData.website && stockData.website !== '-' ? (
                                        <a href={stockData.website} target="_blank" rel="noopener noreferrer">
                                            {stockData.website.replace(/^https?:\/\//, '')}
                                        </a>
                                    ) : '-'}
                                </span>
                            </div>
                            <div>
                                <strong data-icon="hq">Headquarters:</strong> <span>{stockData.headquarters || '-'}</span>
                            </div>
                        </div>

                        {/* Watchlist Details Section */}
                        {stockData.isInWatchlist && stockData.dateAdded && (
                            <div className="watchlist-details">
                                <h3>Watchlist Information</h3>
                                <div className="stock-details-meta">
                                    <div>
                                        <strong data-icon="calendar">Date Added:</strong> <span>{stockData.dateAdded || '-'}</span>
                                    </div>
                                    <div>
                                        <strong data-icon="dollar">Original Price:</strong> <span>
                                            {stockData.originalPrice !== null && stockData.originalPrice !== undefined 
                                                ? `$${typeof stockData.originalPrice === 'number' ? stockData.originalPrice.toFixed(2) : stockData.originalPrice}`
                                                : '-'
                                            }
                                        </span>
                                    </div>
                                    <div>
                                        <strong data-icon="trend">Price Change:</strong> <span className={`${stockData.priceChange !== null && stockData.priceChange !== undefined && stockData.priceChange >= 0 ? 'positive' : 'negative'}`}>
                                            {stockData.priceChange !== null && stockData.priceChange !== undefined ? 
                                                <span>
                                                    <i 
                                                        className={stockData.priceChange >= 0 ? 'fas fa-arrow-trend-up' : 'fas fa-arrow-trend-down'}
                                                        style={{ 
                                                            marginRight: '6px',
                                                            fontSize: '14px',
                                                            fontWeight: '700',
                                                            color: stockData.priceChange >= 0 ? '#00D924' : '#ef4444',
                                                            textShadow: stockData.priceChange >= 0 
                                                                ? '0 0 8px rgba(0, 217, 36, 0.6), 0 0 12px rgba(0, 217, 36, 0.4)' 
                                                                : '0 0 8px rgba(239, 68, 68, 0.6), 0 0 12px rgba(239, 68, 68, 0.4)',
                                                            display: 'inline-block',
                                                            lineHeight: '1'
                                                        }}
                                                    />
                                                    {stockData.priceChange >= 0 ? '+' : ''}${stockData.priceChange.toFixed(2)}
                                                </span>
                                                : '-'
                                            }
                                        </span>
                                    </div>
                                    <div>
                                        <strong data-icon="percent">Percentage Change:</strong> <span className={`${stockData.percentageChange !== null && stockData.percentageChange !== undefined && stockData.percentageChange >= 0 ? 'positive' : 'negative'}`}>
                                            {stockData.percentageChange !== null && stockData.percentageChange !== undefined ? 
                                                <span>
                                                    <i 
                                                        className={stockData.percentageChange >= 0 ? 'fas fa-arrow-trend-up' : 'fas fa-arrow-trend-down'}
                                                        style={{ 
                                                            marginRight: '6px',
                                                            fontSize: '14px',
                                                            fontWeight: '700',
                                                            color: stockData.percentageChange >= 0 ? '#00D924' : '#ef4444',
                                                            textShadow: stockData.percentageChange >= 0 
                                                                ? '0 0 8px rgba(0, 217, 36, 0.6), 0 0 12px rgba(0, 217, 36, 0.4)' 
                                                                : '0 0 8px rgba(239, 68, 68, 0.6), 0 0 12px rgba(239, 68, 68, 0.4)',
                                                            display: 'inline-block',
                                                            lineHeight: '1'
                                                        }}
                                                    />
                                                    {stockData.percentageChange >= 0 ? '+' : ''}{stockData.percentageChange.toFixed(2)}%
                                                </span>
                                                : '-'
                                            }
                                        </span>
                                    </div>
                                    <div>
                                        <strong data-icon="category">Category:</strong> <span>{stockData.category || '-'}</span>
                                    </div>
                            </div>
                            </div>
                        )}

                        {/* Notes Section (only for watchlist items) */}
                        {stockData.isInWatchlist && (
                            <WatchlistNotesSection symbol={symbol} initialNotes={stockData.notes || ''} />
                        )}

                        {/* Chart */}
                        <div className="modal-chart">
                            <h3>
                                <i className="fas fa-chart-area"></i>
                                Price History
                            </h3>
                            <div id="modalChartContainer">
                                {!chartData && (
                                    <div className="loading-state">
                                        <i className="fas fa-spinner fa-spin"></i>
                                        <p>Loading chart...</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* News */}
                        {(news.length > 0 || newsLoading) && (
                            <div className="modal-news">
                                <h3>
                                    <i className="fas fa-newspaper"></i>
                                    Recent News
                                </h3>
                                {newsLoading ? (
                                    <div className="news-loading">
                                        <i className="fas fa-spinner fa-spin"></i>
                                        <span>Loading news...</span>
                                    </div>
                                ) : news.length > 0 ? (
                                    <div className="news-list">
                                        {news.map((article, index) => (
                                            <a
                                                key={index}
                                                href={article.link || article.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="news-item"
                                            >
                                                <h4>{article.title}</h4>
                                                <p>{article.summary || article.description}</p>
                                                <span className="news-date">{formatDate(article.published_at || article.publishedAt)}</span>
                                            </a>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </>
                )}
            </div>
            {ceoModalOpen && React.createElement(CEODetailsModal, {
                isOpen: ceoModalOpen,
                onClose: () => setCeoModalOpen(false),
                ceoName: selectedCEO.name,
                companyName: selectedCEO.company,
                companySymbol: selectedCEO.symbol
            })}
        </div>
    );
};

// Global modal state
let modalState = {
    isOpen: false,
    symbol: null,
    isFromWatchlist: false,
    stockData: null
};

let modalContainer = null;
let modalRoot = null;

// Initialize modal container
const initModal = () => {
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'react-stock-details-modal-container';
        document.body.appendChild(modalContainer);
        modalRoot = ReactDOM.createRoot(modalContainer);
    }
};

// Open modal function
window.openStockDetailsModalReact = (symbol, isFromWatchlist = false) => {
    console.time(`StockDetailsModal-${symbol}-modal-open`);
    console.log(`[StockDetailsModal] Opening modal for ${symbol} (fromWatchlist: ${isFromWatchlist})`);

    initModal();
    modalState = { isOpen: true, symbol, isFromWatchlist };
    modalRoot.render(React.createElement(StockDetailsModal, {
        ...modalState,
        onClose: () => {
            console.timeEnd(`StockDetailsModal-${symbol}-modal-open`);
            console.log(`[StockDetailsModal] Modal closed for ${symbol}`);
            modalState.isOpen = false;
            if (modalRoot) {
                modalRoot.render(null);
            }
            if (modalContainer) {
                modalContainer.remove();
                modalContainer = null;
                modalRoot = null;
            }
        }
    }));

    // Hide search bar
    const searchSection = document.querySelector('.search-section');
    if (searchSection) searchSection.style.display = 'none';
};

// Close modal function
window.closeStockDetailsModalReact = () => {
    if (modalRoot) {
        modalRoot.render(null);
    }
    if (modalContainer) {
        modalContainer.remove();
        modalContainer = null;
        modalRoot = null;
    }
    modalState.isOpen = false;

    // Show search bar again
    const searchSection = document.querySelector('.search-section');
    if (searchSection) searchSection.style.display = 'block';
};

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

const StockDetailsModal = ({ isOpen, onClose, symbol, isFromWatchlist = false }) => {
    const [stockData, setStockData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [news, setNews] = useState([]);
    const chartRootRef = useRef(null);

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
            setLoading(true);
            setError(null);
            setStockData(null);
            setChartData(null);
            setNews([]);

            try {
                // First check if stock is in watchlist if not explicitly from watchlist
                let isInWatchlist = isFromWatchlist;
                let authHeaders = null;

                if (!isFromWatchlist) {
                    try {
                        authHeaders = await window.getAuthHeaders();
                        const watchlistCheck = await fetch(`${API_BASE}/api/watchlist/${symbol}/details`, {
                            method: 'GET',
                            headers: authHeaders,
                            credentials: 'include'
                        });
                        isInWatchlist = watchlistCheck.ok;
                    } catch (err) {
                        // Ignore errors
                    }
                }

                // Fetch stock details
                let response, data;
                if (isInWatchlist || isFromWatchlist) {
                    authHeaders = authHeaders || await window.getAuthHeaders();
                    response = await fetch(`${API_BASE}/api/watchlist/${symbol}/details`, {
                        method: 'GET',
                        headers: authHeaders,
                        credentials: 'include'
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed to load stock data: HTTP ${response.status}`);
                    }
                    
                    data = await response.json();
                        setStockData({
                            ...data,
                            isInWatchlist: true,
                        // Map snake_case to camelCase
                        dateAdded: data.date_added || data.dateAdded,
                        originalPrice: data.original_price || data.originalPrice,
                        priceChange: data.price_change !== null && data.price_change !== undefined ? data.price_change : data.priceChange,
                        percentageChange: data.percentage_change !== null && data.percentage_change !== undefined ? data.percentage_change : data.percentageChange,
                            category: data.category,
                            notes: data.notes
                        });
                } else {
                    response = await fetch(`${API_BASE}/api/company/${symbol}`, {
                        credentials: 'include'
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed to load stock data: HTTP ${response.status}`);
                }

                    data = await response.json();
                    setStockData({ ...data, isInWatchlist: false });
                }

                // Fetch chart data
                try {
                    const chartResp = await fetch(`${API_BASE}/api/chart/${symbol}`, {
                    credentials: 'include'
                });
                    if (chartResp.ok) {
                const chartRespData = await chartResp.json();
                    setChartData(chartRespData);
                    }
                } catch (err) {
                    // Silently fail for chart/news
                }

                // Fetch news
                try {
                    const newsResp = await fetch(`${API_BASE}/api/news/${symbol}`, {
                    credentials: 'include'
                });
                    if (newsResp.ok) {
                const newsRespData = await newsResp.json();
                    setNews(newsRespData.slice(0, 5)); // Limit to 5 articles
                    }
                } catch (err) {
                    // Silently fail
                }

            } catch (err) {
                setError(err.message || 'Failed to load stock details');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isOpen, symbol, isFromWatchlist]);

    // Real-time price updates when modal is open with rate limiting
    const priceUpdateRef = useRef({ 
        lastCallTime: 0,
        rateLimitCooldown: false,
        rateLimitUntil: 0
    });
    
    useEffect(() => {
        if (!isOpen || !symbol) return;
        
        const updatePrice = async () => {
            const now = Date.now();
            const ref = priceUpdateRef.current;
            
            // Check if we're in rate limit cooldown
            if (ref.rateLimitCooldown && now < ref.rateLimitUntil) {
                return; // Skip this update
            }
            
            // Reset cooldown if time has passed
            if (ref.rateLimitCooldown && now >= ref.rateLimitUntil) {
                ref.rateLimitCooldown = false;
            }
            
            // Throttle: minimum 2 seconds between calls
            const minDelay = 2000;
            if (now - ref.lastCallTime < minDelay) {
                return; // Skip if too soon
            }
            
            try {
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
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
                
                ref.lastCallTime = Date.now();
                
                // Handle rate limit response
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const cooldownSeconds = retryAfter ? parseInt(retryAfter) : 60;
                    ref.rateLimitCooldown = true;
                    ref.rateLimitUntil = Date.now() + (cooldownSeconds * 1000);
                    // Rate limit hit in modal
                    return;
                }
                
                if (response.ok) {
                    const stockData = await response.json();
                    setStockData(prev => prev ? {
                        ...prev,
                        price: stockData.price,
                        priceChange: stockData.priceChange || 0,
                        percentageChange: stockData.priceChangePercent || 0,
                        priceChangePercent: stockData.priceChangePercent || 0
                    } : prev);
                }
            } catch (e) {
                // Silently handle update errors
                // Error updating price in modal
            }
        };
        
        // Initial update with delay
        setTimeout(updatePrice, 1000);
        
        // Update every 30 seconds when modal is open (increased from 15s)
        const priceInterval = setInterval(updatePrice, 30000);
        
        return () => clearInterval(priceInterval);
    }, [isOpen, symbol]);

    // Render chart when chartData is available
    useEffect(() => {
        if (!chartData || !symbol) return;

        // Try to find container with retry logic
        let retryCount = 0;
        const maxRetries = 10;
        
        const findAndRenderChart = () => {
            const chartContainer = document.getElementById('modalChartContainer');
            if (!chartContainer) {
                retryCount++;
                if (retryCount < maxRetries) {
                    setTimeout(findAndRenderChart, 100);
                }
                return;
            }
            
            // Clear container
            chartContainer.innerHTML = '';
            
            // Check if Chart.js and StockChart are available
            if (!window.StockChart) {
                chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>Chart component not loaded. Please refresh the page.</p></div>';
                return;
            }

            if (!window.Chart && typeof Chart === 'undefined') {
                chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>Chart.js library not loaded. Please refresh the page.</p></div>';
                return;
            }

            if (chartData.length === 0) {
                chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>No chart data available</p></div>';
                return;
            }
            
            // Render chart using ReactDOM.createRoot
            try {
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
            } catch (error) {
                chartContainer.innerHTML = `<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>Error rendering chart: ${error.message}</p></div>`;
            }
        };
        
        // Start the retry process
        findAndRenderChart();

        return () => {
            if (chartRootRef.current) {
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
                                <strong data-icon="ceo">CEO:</strong> <span>{stockData.ceo || '-'}</span>
                                </div>
                            <div>
                                <strong data-icon="desc">Description:</strong> <span>{stockData.description || '-'}</span>
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
                        {news.length > 0 && (
                            <div className="modal-news">
                                <h3>
                                    <i className="fas fa-newspaper"></i>
                                    Recent News
                                </h3>
                                <div className="news-list">
                                    {news.map((article, index) => (
                                        <a 
                                            key={index} 
                                            href={article.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="news-item"
                                        >
                                            <h4>{article.title}</h4>
                                            <p>{article.description}</p>
                                            <span className="news-date">{formatDate(article.publishedAt)}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
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
    initModal();
    modalState = { isOpen: true, symbol, isFromWatchlist };
    modalRoot.render(React.createElement(StockDetailsModal, {
        ...modalState,
        onClose: () => {
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

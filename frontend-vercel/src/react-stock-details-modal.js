// React Stock Details Modal Component
const { useState, useEffect, useCallback } = React;

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
            console.error('Error saving notes:', err);
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

    // Update global modalState when stockData changes
    useEffect(() => {
        if (stockData) {
            modalState.stockData = stockData;
        }
    }, [stockData]);

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
                    console.error('Error loading chart:', err);
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
                    console.error('Error loading news:', err);
                }

            } catch (err) {
                console.error('Error loading stock details:', err);
                setError(err.message || 'Failed to load stock details');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isOpen, symbol, isFromWatchlist]);

    // Render chart when chartData is available
    useEffect(() => {
        if (!chartData || !symbol) {
            console.log('⚠️ Chart not rendering:', { chartData, symbol });
            return;
        }

        const chartContainer = document.getElementById('modalChartContainer');
        if (!chartContainer) {
            console.log('⚠️ Chart container not found');
            return;
        }

        console.log('📊 Rendering chart with data:', chartData.length, 'points');
        
        // Clear container
        chartContainer.innerHTML = '';
        
        // Render chart
        if (window.StockChart) {
            if (chartData.length > 0) {
                const chartRoot = ReactDOM.createRoot(chartContainer);
                chartRoot.render(React.createElement(window.StockChart, {
                    symbol: symbol,
                    data: chartData,
                    isModal: true,
                    onClose: null
                }));
                console.log('✅ Chart rendered successfully');
            } else {
                console.log('⚠️ No chart data points to render');
                chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>No chart data available</p></div>';
            }
        } else {
            console.error('❌ window.StockChart is not defined');
            chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>Chart component not loaded</p></div>';
        }

        return () => {
            // Cleanup
            if (chartContainer) {
                chartContainer.innerHTML = '';
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
                                <strong data-icon="price">Price:</strong> ${stockData.price || '-'}
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
                                                `${stockData.priceChange >= 0 ? '+' : ''}$${stockData.priceChange.toFixed(2)}` 
                                                : '-'
                                            }
                                        </span>
                                    </div>
                                    <div>
                                        <strong data-icon="percent">Percentage Change:</strong> <span className={`${stockData.percentageChange !== null && stockData.percentageChange !== undefined && stockData.percentageChange >= 0 ? 'positive' : 'negative'}`}>
                                            {stockData.percentageChange !== null && stockData.percentageChange !== undefined ? 
                                                `${stockData.percentageChange >= 0 ? '+' : ''}${stockData.percentageChange.toFixed(2)}%` 
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
                            <div id="modalChartContainer" style={{ minHeight: '300px' }}>
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

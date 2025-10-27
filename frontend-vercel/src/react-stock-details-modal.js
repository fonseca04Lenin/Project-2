// React Stock Details Modal Component
const { useState, useEffect } = React;

// Avoid duplicate declaration of API_BASE_URL
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';
}

// Use window.API_BASE_URL to avoid const redeclaration errors  
const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

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
        if (!chartData || !symbol) return;

        const chartContainer = document.getElementById('modalChartContainer');
        if (!chartContainer) return;

        // Clear container
        chartContainer.innerHTML = '';
        
        // Render chart
        if (window.StockChart && chartData.length > 0) {
            const chartRoot = ReactDOM.createRoot(chartContainer);
            chartRoot.render(React.createElement(window.StockChart, {
                symbol: symbol,
                data: chartData,
                isModal: true,
                onClose: null
            }));
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
                            <h2>{stockData.name || symbol}</h2>
                            <span className="stock-symbol-badge">{symbol}</span>
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

                        {/* Stock Info Grid */}
                        <div className="modal-info-grid">
                            <div className="info-card">
                                <span className="info-icon"><i className="fas fa-user-tie"></i></span>
                                <div>
                                    <span className="info-label">CEO</span>
                                    <span className="info-value">{stockData.ceo || '-'}</span>
                                </div>
                            </div>
                            <div className="info-card">
                                <span className="info-icon"><i className="fas fa-dollar-sign"></i></span>
                                <div>
                                    <span className="info-label">Price</span>
                                    <span className="info-value">${stockData.price || '-'}</span>
                                </div>
                            </div>
                            <div className="info-card">
                                <span className="info-icon"><i className="fas fa-building"></i></span>
                                <div>
                                    <span className="info-label">Market Cap</span>
                                    <span className="info-value">{formatMarketCap(stockData.marketCap)}</span>
                                </div>
                            </div>
                            <div className="info-card">
                                <span className="info-icon"><i className="fas fa-percentage"></i></span>
                                <div>
                                    <span className="info-label">P/E Ratio</span>
                                    <span className="info-value">{stockData.peRatio || '-'}</span>
                                </div>
                            </div>
                            <div className="info-card">
                                <span className="info-icon"><i className="fas fa-chart-pie"></i></span>
                                <div>
                                    <span className="info-label">Dividend Yield</span>
                                    <span className="info-value">{stockData.dividendYield || '-'}</span>
                                </div>
                            </div>
                            <div className="info-card">
                                <span className="info-icon"><i className="fas fa-globe"></i></span>
                                <div>
                                    <span className="info-label">Website</span>
                                    <span className="info-value">
                                        {stockData.website ? (
                                            <a href={stockData.website} target="_blank" rel="noopener noreferrer">
                                                {stockData.website}
                                            </a>
                                        ) : '-'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Watchlist Details Section */}
                        {stockData.isInWatchlist && stockData.dateAdded && (
                            <div className="modal-watchlist-section">
                                <h3>
                                    <i className="fas fa-bookmark"></i>
                                    Watchlist Information
                                </h3>
                                <div className="modal-info-grid">
                                    <div className="info-card">
                                        <span className="info-icon"><i className="fas fa-calendar"></i></span>
                                        <div>
                                            <span className="info-label">Date Added</span>
                                            <span className="info-value">{stockData.dateAdded || '-'}</span>
                                        </div>
                                    </div>
                                    <div className="info-card">
                                        <span className="info-icon"><i className="fas fa-dollar-sign"></i></span>
                                        <div>
                                            <span className="info-label">Original Price</span>
                                            <span className="info-value">
                                                {stockData.originalPrice !== null && stockData.originalPrice !== undefined 
                                                    ? `$${typeof stockData.originalPrice === 'number' ? stockData.originalPrice.toFixed(2) : stockData.originalPrice}`
                                                    : '-'
                                                }
                                            </span>
                                        </div>
                                    </div>
                                    <div className="info-card">
                                        <span className="info-icon"><i className="fas fa-arrow-up"></i></span>
                                        <div>
                                            <span className="info-label">Price Change</span>
                                            <span className={`info-value ${stockData.priceChange !== null && stockData.priceChange !== undefined && stockData.priceChange >= 0 ? 'positive' : 'negative'}`}>
                                                {stockData.priceChange !== null && stockData.priceChange !== undefined ? 
                                                    `${stockData.priceChange >= 0 ? '+' : ''}$${stockData.priceChange.toFixed(2)}` 
                                                    : '-'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="info-card">
                                        <span className="info-icon"><i className="fas fa-percentage"></i></span>
                                        <div>
                                            <span className="info-label">Change %</span>
                                            <span className={`info-value ${stockData.percentageChange !== null && stockData.percentageChange !== undefined && stockData.percentageChange >= 0 ? 'positive' : 'negative'}`}>
                                                {stockData.percentageChange !== null && stockData.percentageChange !== undefined ? 
                                                    `${stockData.percentageChange >= 0 ? '+' : ''}${stockData.percentageChange.toFixed(2)}%` 
                                                    : '-'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="info-card">
                                        <span className="info-icon"><i className="fas fa-tags"></i></span>
                                        <div>
                                            <span className="info-label">Category</span>
                                            <span className="info-value">{stockData.category || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Description */}
                        {stockData.description && (
                            <div className="modal-description">
                                <h3>
                                    <i className="fas fa-align-left"></i>
                                    About
                                </h3>
                                <p>{stockData.description}</p>
                            </div>
                        )}

                        {/* Headquarters */}
                        {stockData.headquarters && (
                            <div className="modal-headquarters">
                                <i className="fas fa-map-marker-alt"></i>
                                <span>{stockData.headquarters}</span>
                            </div>
                        )}

                        {/* Notes Section (only for watchlist items) */}
                        {stockData.isInWatchlist && (
                            <div id="watchlistNotesEditor"></div>
                        )}

                        {/* Chart */}
                        {chartData && chartData.length > 0 && (
                            <div className="modal-chart">
                                <h3>
                                    <i className="fas fa-chart-area"></i>
                                    Price History
                                </h3>
                                <div id="modalChartContainer" style={{ minHeight: '300px' }}></div>
                            </div>
                        )}

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
            if (window.unmountWatchlistNotes) {
                window.unmountWatchlistNotes();
            }
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

    // Render notes editor after modal is rendered
    setTimeout(() => {
        const renderNotesEditor = () => {
            if (modalState.isFromWatchlist && modalState.stockData && modalState.stockData.notes !== undefined) {
                if (window.renderWatchlistNotes && modalState.symbol) {
                    try {
                        window.renderWatchlistNotes(modalState.symbol, modalState.stockData.notes || '');
                    } catch (err) {
                        console.error('Error rendering notes editor:', err);
                    }
                }
            }
        };

        // Render notes editor
        renderNotesEditor();
    }, 800);

    // Hide search bar
    const searchSection = document.querySelector('.search-section');
    if (searchSection) searchSection.style.display = 'none';
};

// Close modal function
window.closeStockDetailsModalReact = () => {
    if (window.unmountWatchlistNotes) {
        window.unmountWatchlistNotes();
    }
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

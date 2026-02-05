// Stock Details Page
const { useState, useEffect, useCallback, useRef } = React;

const API_BASE_PAGE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

const StockDetailsPage = ({ symbol, isFromWatchlist = false, onNavigateBack }) => {
    const [stockData, setStockData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [news, setNews] = useState([]);
    const [newsLoading, setNewsLoading] = useState(false);
    const [newsPage, setNewsPage] = useState(1);
    const [newsHasMore, setNewsHasMore] = useState(true);
    const [newsLoadingMore, setNewsLoadingMore] = useState(false);
    const newsContainerRef = useRef(null);
    const [stocktwits, setStocktwits] = useState([]);
    const [stocktwitsLoading, setStocktwitsLoading] = useState(false);
    const [stocktwitsLoadingMore, setStocktwitsLoadingMore] = useState(false);
    const [stocktwitsCursor, setStocktwitsCursor] = useState(null);
    const [stocktwitsHasMore, setStocktwitsHasMore] = useState(true);
    const sentimentContainerRef = useRef(null);
    const [aiInsight, setAiInsight] = useState(null);
    const [aiInsightLoading, setAiInsightLoading] = useState(false);
    const chartRootRef = useRef(null);
    const [addingToWatchlist, setAddingToWatchlist] = useState(false);
    const [isInWatchlist, setIsInWatchlist] = useState(false);
    const isIndex = symbol && symbol.startsWith('^');

    // CEO modal
    const [ceoModalOpen, setCeoModalOpen] = useState(false);
    const [selectedCEO, setSelectedCEO] = useState({ name: '', company: '', symbol: '' });

    // Strip titles from CEO names
    const cleanCEOName = (name) => {
        if (!name || name === '-') return name;
        let cleaned = name.replace(/^(Mr\.?|Ms\.?|Mrs\.?|Miss\.?|Dr\.?|Prof\.?|Professor\.?)\s+/gi, '').trim();
        const parts = cleaned.split(/\s+/).filter(part => part.length > 0);
        if (parts.length > 2) {
            return `${parts[0]} ${parts[parts.length - 1]}`;
        }
        return cleaned;
    };

    // Track which stock user is viewing
    useEffect(() => {
        if (!symbol) return;

        if (typeof window.trackStockView === 'function') {
            window.trackStockView(symbol);
        }

        return () => {
            if (typeof window.untrackStockView === 'function') {
                window.untrackStockView(symbol);
            }
        };
    }, [symbol]);

    // Load stock data
    useEffect(() => {
        if (!symbol) return;

        const fetchData = async () => {
            console.log(`[StockDetailsPage] Loading data for ${symbol}`);
            setLoading(true);
            setError(null);
            setStockData(null);
            setChartData(null);
            setNews([]);

            try {
                const authHeaders = await window.getAuthHeaders();
                const useWatchlistEndpoint = isFromWatchlist;

                // Details API call
                const detailPromise = (async () => {
                    const url = useWatchlistEndpoint
                        ? `${API_BASE_PAGE}/api/watchlist/${symbol}/details`
                        : `${API_BASE_PAGE}/api/company/${symbol}`;
                    const opts = useWatchlistEndpoint
                        ? { method: 'GET', headers: authHeaders, credentials: 'include' }
                        : { credentials: 'include' };
                    const response = await fetch(url, opts);
                    if (!response.ok) {
                        throw new Error(`Failed to load stock data: HTTP ${response.status}`);
                    }
                    const data = await response.json();
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
                const chartPromise = (async () => {
                    try {
                        const chartResp = await fetch(`${API_BASE_PAGE}/api/chart/${symbol}`, {
                            credentials: 'include'
                        });
                        if (chartResp.ok) {
                            return await chartResp.json();
                        }
                    } catch (error) {
                        console.log(`[StockDetailsPage] Chart API error:`, error);
                    }
                    return null;
                })();

                const [details, chartDataResp] = await Promise.all([detailPromise, chartPromise]);

                setStockData(details);

                // If not from watchlist, check if stock is in watchlist
                if (!useWatchlistEndpoint) {
                    try {
                        const watchlistResp = await fetch(`${API_BASE_PAGE}/api/watchlist`, {
                            method: 'GET',
                            headers: authHeaders,
                            credentials: 'include'
                        });
                        if (watchlistResp.ok) {
                            const watchlistData = await watchlistResp.json();
                            const inWatchlist = Array.isArray(watchlistData) && watchlistData.some(item => item.symbol === symbol);
                            setIsInWatchlist(inWatchlist);
                        } else {
                            setIsInWatchlist(false);
                        }
                    } catch (watchlistErr) {
                        console.log('[StockDetailsPage] Could not check watchlist status:', watchlistErr);
                        setIsInWatchlist(false);
                    }
                } else {
                    setIsInWatchlist(details.isInWatchlist || false);
                }

                if (chartDataResp) setChartData(chartDataResp);

                // Load news in background
                setNewsLoading(true);
                setNewsPage(1);
                setNewsHasMore(true);
                setNews([]);
                (async () => {
                    try {
                        const newsResp = await fetch(`${API_BASE_PAGE}/api/news/company/${symbol}?page=1&limit=5`, {
                            credentials: 'include'
                        });
                        if (newsResp.ok) {
                            const newsRespData = await newsResp.json();
                            const newsData = newsRespData.articles || [];
                            setNews(newsData);
                            setNewsHasMore(newsRespData.hasMore);
                        }
                    } catch (error) {
                        console.log(`[StockDetailsPage] News API error:`, error);
                    } finally {
                        setNewsLoading(false);
                    }
                })();

                // Load Stocktwits (skip for indices, they don't have Stocktwits feeds)
                if (!symbol.startsWith('^')) {
                    setStocktwitsLoading(true);
                    setStocktwits([]);
                    setStocktwitsCursor(null);
                    setStocktwitsHasMore(true);
                    (async () => {
                        try {
                            const stocktwitsResp = await fetch(`${API_BASE_PAGE}/api/stocktwits/${symbol}?limit=15`, {
                                credentials: 'include'
                            });
                            if (stocktwitsResp.ok) {
                                const stocktwitsData = await stocktwitsResp.json();
                                setStocktwits(stocktwitsData.messages || []);
                                setStocktwitsCursor(stocktwitsData.cursor || null);
                                setStocktwitsHasMore(stocktwitsData.has_more !== false);
                            }
                        } catch (error) {
                            console.log(`[StockDetailsPage] Stocktwits API error:`, error);
                        } finally {
                            setStocktwitsLoading(false);
                        }
                    })();
                }

                // Load AI insight
                setAiInsightLoading(true);
                setAiInsight(null);
                (async () => {
                    try {
                        const insightResp = await fetch(`${API_BASE_PAGE}/api/stock/${symbol}/ai-insight`, {
                            credentials: 'include'
                        });
                        if (insightResp.ok) {
                            const insightData = await insightResp.json();
                            setAiInsight(insightData);
                        }
                    } catch (error) {
                        console.log(`[StockDetailsPage] AI insight API error:`, error);
                    } finally {
                        setAiInsightLoading(false);
                    }
                })();

            } catch (err) {
                console.error(`[StockDetailsPage] Error:`, err);
                setError(err.message || 'Failed to load stock details');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [symbol, isFromWatchlist]);

    // Chart rendering
    useEffect(() => {
        if (!chartData || !symbol) return;

        let retryCount = 0;
        const maxRetries = 10;

        const findAndRenderChart = () => {
            const chartContainer = document.getElementById('pageChartContainer');
            if (!chartContainer) {
                retryCount++;
                if (retryCount < maxRetries) {
                    setTimeout(findAndRenderChart, 100);
                }
                return;
            }

            chartContainer.innerHTML = '';

            if (!window.StockChart) {
                chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>Chart component not loaded.</p></div>';
                return;
            }

            if (chartData.length === 0) {
                chartContainer.innerHTML = '<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>No chart data available</p></div>';
                return;
            }

            try {
                if (!chartRootRef.current) {
                    chartRootRef.current = ReactDOM.createRoot(chartContainer);
                }

                chartRootRef.current.render(React.createElement(window.StockChart, {
                    symbol: symbol,
                    data: chartData,
                    isModal: false,
                    onClose: null
                }));
            } catch (error) {
                console.error(`[StockDetailsPage] Chart render error:`, error);
                chartContainer.innerHTML = `<div class="loading-state"><i class="fas fa-exclamation-circle"></i><p>Error rendering chart</p></div>`;
            }
        };

        findAndRenderChart();

        return () => {
            if (chartRootRef.current) {
                chartRootRef.current.render(null);
            }
        };
    }, [chartData, symbol]);

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

    const formatTimeAgo = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const loadMoreNews = async () => {
        if (newsLoadingMore || !newsHasMore || !symbol) return;
        setNewsLoadingMore(true);
        const nextPage = newsPage + 1;

        try {
            const newsResp = await fetch(`${API_BASE_PAGE}/api/news/company/${symbol}?page=${nextPage}&limit=5`, {
                credentials: 'include'
            });
            if (newsResp.ok) {
                const newsRespData = await newsResp.json();
                const newArticles = newsRespData.articles || [];
                if (newArticles.length > 0) {
                    setNews(prev => [...prev, ...newArticles]);
                    setNewsPage(nextPage);
                }
                setNewsHasMore(newsRespData.hasMore && newArticles.length > 0);
            }
        } catch (error) {
            console.log(`[StockDetailsPage] Error loading more news:`, error);
        } finally {
            setNewsLoadingMore(false);
        }
    };

    // Load more Stocktwits messages
    const loadMoreStocktwits = async () => {
        if (stocktwitsLoadingMore || !stocktwitsHasMore || !symbol) return;
        setStocktwitsLoadingMore(true);

        try {
            let url = `${API_BASE_PAGE}/api/stocktwits/${symbol}?limit=15`;
            if (stocktwitsCursor) {
                url += `&max=${stocktwitsCursor}`;
            }

            const stocktwitsResp = await fetch(url, { credentials: 'include' });
            if (stocktwitsResp.ok) {
                const stocktwitsData = await stocktwitsResp.json();
                const newMessages = stocktwitsData.messages || [];
                if (newMessages.length > 0) {
                    setStocktwits(prev => [...prev, ...newMessages]);
                    setStocktwitsCursor(stocktwitsData.cursor || null);
                }
                setStocktwitsHasMore(stocktwitsData.has_more !== false && newMessages.length > 0);
            }
        } catch (error) {
            console.log(`[StockDetailsPage] Error loading more stocktwits:`, error);
        } finally {
            setStocktwitsLoadingMore(false);
        }
    };

    // Handle scroll for infinite loading in sentiment section
    const handleSentimentScroll = useCallback((e) => {
        const container = e.target;
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (scrollBottom < 100 && stocktwitsHasMore && !stocktwitsLoadingMore) {
            loadMoreStocktwits();
        }
    }, [stocktwitsHasMore, stocktwitsLoadingMore, symbol, stocktwitsCursor]);

    const handleBack = () => {
        if (onNavigateBack) {
            onNavigateBack();
        } else {
            window.history.back();
        }
    };

    const handleAddToWatchlist = async () => {
        console.log('[StockDetailsPage] Add to watchlist clicked for:', symbol);
        console.log('[StockDetailsPage] Current state - isInWatchlist:', isInWatchlist, 'addingToWatchlist:', addingToWatchlist);

        if (isInWatchlist || addingToWatchlist) {
            console.log('[StockDetailsPage] Returning early - already in watchlist or adding');
            return;
        }

        setAddingToWatchlist(true);
        try {
            const authHeaders = await window.getAuthHeaders();
            console.log('[StockDetailsPage] Auth headers obtained:', !!authHeaders);

            const response = await fetch(`${API_BASE_PAGE}/api/watchlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                credentials: 'include',
                body: JSON.stringify({ symbol })
            });

            console.log('[StockDetailsPage] Watchlist API response status:', response.status);

            if (response.ok) {
                setIsInWatchlist(true);
                console.log('[StockDetailsPage] Successfully added to watchlist');
                if (window.showNotification) {
                    window.showNotification(`${symbol} added to watchlist`, 'success');
                }
                // Notify other components
                try {
                    window.dispatchEvent(new CustomEvent('watchlistChanged'));
                } catch (_) {}
                if (typeof window.refreshWatchlist === 'function') {
                    window.refreshWatchlist();
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                if (window.showNotification) {
                    window.showNotification(errorData.error || `Failed to add ${symbol}`, 'error');
                }
            }
        } catch (err) {
            console.error('[StockDetailsPage] Error adding to watchlist:', err);
            if (window.showNotification) {
                window.showNotification('Network error adding to watchlist', 'error');
            }
        } finally {
            setAddingToWatchlist(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="stock-page-container">
                <div className="stock-page-loading">
                    <div className="spinner-large"></div>
                    <p>Loading {symbol}...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="stock-page-container">
                <div className="stock-page-header">
                    <button className="back-button" onClick={handleBack}>
                        <i className="fas fa-arrow-left"></i>
                        <span>Back</span>
                    </button>
                </div>
                <div className="stock-page-error">
                    <i className="fas fa-exclamation-triangle"></i>
                    <h2>Error Loading Stock</h2>
                    <p>{error}</p>
                    <button className="retry-button" onClick={() => window.location.reload()}>
                        <i className="fas fa-redo"></i> Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (!stockData) return null;

    const priceChangePercent = stockData.percentageChange || stockData.priceChangePercent || 0;
    const isPositive = priceChangePercent >= 0;

    // Debug logging for price change
    console.log('[StockDetailsPage] Stock data received:', {
        symbol: stockData.symbol,
        price: stockData.price,
        percentageChange: stockData.percentageChange,
        priceChangePercent: stockData.priceChangePercent,
        calculatedPercent: priceChangePercent
    });

    return (
        <div className="stock-page-container">
            {/* Nav */}
            <nav className="stock-page-nav">
                <button className="back-button" onClick={handleBack}>
                    <i className="fas fa-arrow-left"></i>
                    <span>Back to Dashboard</span>
                </button>

                <div className="nav-stock-info">
                    <span className="nav-name">{stockData.name || symbol}</span>
                    <span className="nav-price">${stockData.price?.toFixed(2) || '-'}</span>
                    <span className={`nav-change ${isPositive ? 'positive' : 'negative'}`}>
                        <i className={`fas fa-caret-${isPositive ? 'up' : 'down'}`}></i>
                        {isPositive ? '+' : ''}{priceChangePercent?.toFixed(2)}%
                    </span>
                </div>

                <div className="nav-actions">
                    <button
                        className={`watchlist-btn ${isInWatchlist ? 'in-watchlist' : ''}`}
                        onClick={handleAddToWatchlist}
                        disabled={isInWatchlist || addingToWatchlist}
                    >
                        {addingToWatchlist ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                <span>Adding...</span>
                            </>
                        ) : isInWatchlist ? (
                            <>
                                <i className="fas fa-check"></i>
                                <span>Already in Watchlist</span>
                            </>
                        ) : (
                            <>
                                <i className="fas fa-plus"></i>
                                <span>Add to Watchlist</span>
                            </>
                        )}
                    </button>
                </div>
            </nav>

            <main className={`stock-page-main ${isIndex ? 'index-view' : ''}`}>
                <div className={`stock-page-primary ${isIndex ? 'full-width' : ''}`}
                    {/* AI Insight */}
                    <section className="ai-insight-card">
                        <div className="card-header">
                            <i className="fas fa-robot"></i>
                            <h3>AI Market Insight</h3>
                            {aiInsightLoading && <i className="fas fa-spinner fa-spin loading-indicator"></i>}
                        </div>
                        <div className="card-content">
                            {aiInsightLoading ? (
                                <p className="loading-text">Analyzing market conditions...</p>
                            ) : aiInsight?.ai_insight ? (
                                <div>
                                    {aiInsight.change_percent !== undefined && (
                                        <div className={`insight-badge ${aiInsight.change_percent >= 0 ? 'positive' : 'negative'}`}>
                                            <i className={`fas fa-arrow-${aiInsight.change_percent >= 0 ? 'up' : 'down'}`}></i>
                                            <span>{aiInsight.change_percent >= 0 ? '+' : ''}{aiInsight.change_percent}% (5 days)</span>
                                        </div>
                                    )}
                                    <p className="insight-text">{aiInsight.ai_insight}</p>
                                </div>
                            ) : (
                                <p className="no-data-text">AI insight unavailable at this time.</p>
                            )}
                        </div>
                    </section>

                    {/* Chart */}
                    <section className="chart-section">
                        <div className="section-header">
                            <h3><i className="fas fa-chart-area"></i> Price Chart</h3>
                        </div>
                        <div id="pageChartContainer" className="chart-container">
                            {!chartData && (
                                <div className="loading-state">
                                    <i className="fas fa-spinner fa-spin"></i>
                                    <p>Loading chart...</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* News */}
                    <section className="news-section">
                        <div className="section-header">
                            <h3><i className="fas fa-newspaper"></i> Latest News</h3>
                            {news.length > 0 && <span className="count-badge">{news.length}</span>}
                        </div>
                        <div className="news-content">
                            {newsLoading ? (
                                <div className="loading-state">
                                    <i className="fas fa-spinner fa-spin"></i>
                                    <span>Loading news...</span>
                                </div>
                            ) : news.length > 0 ? (
                                <div className="news-list" ref={newsContainerRef}>
                                    {news.map((article, index) => (
                                        <a
                                            key={`${article.link}-${index}`}
                                            href={article.link || article.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="news-item-redesign"
                                        >
                                            <div className="news-item-content">
                                                <h4 className="news-item-title">{article.title}</h4>
                                                <div className="news-item-meta">
                                                    <span className="news-source">{article.source}</span>
                                                    <span className="news-meta-separator">•</span>
                                                    <span className="news-time">{formatTimeAgo(article.published_at || article.publishedAt)}</span>
                                                </div>
                                            </div>
                                            {(article.image_url || article.urlToImage) && (
                                                <div className="news-item-thumbnail">
                                                    <img
                                                        src={article.image_url || article.urlToImage}
                                                        alt=""
                                                        onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                                                    />
                                                </div>
                                            )}
                                        </a>
                                    ))}
                                    {newsHasMore && (
                                        <button
                                            className="load-more-btn"
                                            onClick={loadMoreNews}
                                            disabled={newsLoadingMore}
                                        >
                                            {newsLoadingMore ? (
                                                <><i className="fas fa-spinner fa-spin"></i> Loading...</>
                                            ) : (
                                                <><i className="fas fa-plus"></i> Load More News</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <i className="fas fa-newspaper"></i>
                                    <p>No recent news for {symbol}</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Stats */}
                    <section className="stats-section">
                        <div className="section-header">
                            <h3><i className="fas fa-chart-bar"></i> Key Statistics</h3>
                        </div>
                        <div className="stats-grid">
                            <div className="stat-item">
                                <span className="stat-label">Market Cap</span>
                                <span className="stat-value">{formatMarketCap(stockData.marketCap)}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">P/E Ratio</span>
                                <span className="stat-value">{stockData.peRatio || '-'}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Dividend Yield</span>
                                <span className="stat-value">
                                    {stockData.dividendYield && stockData.dividendYield !== '-'
                                        ? (typeof stockData.dividendYield === 'number' ? (stockData.dividendYield * 100).toFixed(2) + '%' : stockData.dividendYield)
                                        : '-'
                                    }
                                </span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">52 Week High</span>
                                <span className="stat-value">{stockData.high52Week ? `$${stockData.high52Week.toFixed(2)}` : '-'}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">52 Week Low</span>
                                <span className="stat-value">{stockData.low52Week ? `$${stockData.low52Week.toFixed(2)}` : '-'}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Volume</span>
                                <span className="stat-value">{stockData.volume ? stockData.volume.toLocaleString() : '-'}</span>
                            </div>
                        </div>
                    </section>

                    {/* About */}
                    <section className="about-section">
                        <div className="section-header">
                            <h3><i className={isIndex ? "fas fa-chart-line" : "fas fa-building"}></i> About {stockData.name || symbol}</h3>
                        </div>
                        <div className="about-content">
                            <p className="description">{stockData.description || (isIndex ? 'Market index tracking major equities.' : 'No description available.')}</p>
                            {!isIndex && (
                                <div className="company-details">
                                    <div className="detail-item">
                                        <span className="detail-label">CEO</span>
                                        <span
                                            className={`detail-value ${stockData.ceo && stockData.ceo !== '-' ? 'clickable' : ''}`}
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
                                        >
                                            {cleanCEOName(stockData.ceo) || '-'}
                                            {stockData.ceo && stockData.ceo !== '-' && <i className="fas fa-external-link-alt"></i>}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Headquarters</span>
                                        <span className="detail-value">{stockData.headquarters || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Website</span>
                                        <span className="detail-value">
                                            {stockData.website && stockData.website !== '-' ? (
                                                <a href={stockData.website} target="_blank" rel="noopener noreferrer">
                                                    {stockData.website.replace(/^https?:\/\//, '')}
                                                    <i className="fas fa-external-link-alt"></i>
                                                </a>
                                            ) : '-'}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Sector</span>
                                        <span className="detail-value">{stockData.sector || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Industry</span>
                                        <span className="detail-value">{stockData.industry || '-'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Watchlist info */}
                    {stockData.isInWatchlist && (
                        <section className="watchlist-section">
                            <div className="section-header">
                                <h3><i className="fas fa-star"></i> Watchlist Tracking</h3>
                            </div>
                            <div className="watchlist-info-grid">
                                <div className="watchlist-stat">
                                    <span className="stat-label">Added</span>
                                    <span className="stat-value">{formatDate(stockData.dateAdded)}</span>
                                </div>
                                <div className="watchlist-stat">
                                    <span className="stat-label">Entry Price</span>
                                    <span className="stat-value">${stockData.originalPrice?.toFixed(2) || '-'}</span>
                                </div>
                                <div className="watchlist-stat">
                                    <span className="stat-label">Change Since Added</span>
                                    <span className={`stat-value ${stockData.priceChange >= 0 ? 'positive' : 'negative'}`}>
                                        <i className={`fas fa-arrow-${stockData.priceChange >= 0 ? 'up' : 'down'}`}></i>
                                        {stockData.priceChange >= 0 ? '+' : ''}${stockData.priceChange?.toFixed(2)} ({stockData.percentageChange?.toFixed(2)}%)
                                    </span>
                                </div>
                                {stockData.category && (
                                    <div className="watchlist-stat">
                                        <span className="stat-label">Category</span>
                                        <span className="stat-value tag">{stockData.category}</span>
                                    </div>
                                )}
                            </div>
                            {/* Notes */}
                            {window.WatchlistNotesSection && React.createElement(window.WatchlistNotesSection, {
                                symbol: symbol,
                                initialNotes: stockData.notes || ''
                            })}
                        </section>
                    )}
                </div>

                {!isIndex && (
                    <div className="stock-page-secondary">
                        {/* Sentiment - only shown for individual stocks, not indices */}
                        <section className="sentiment-section">
                            <div className="section-header">
                                <h3><i className="fas fa-comments"></i> Social Sentiment</h3>
                                <span className="source-badge">Stocktwits</span>
                            </div>
                            <div
                                className="sentiment-content"
                                ref={sentimentContainerRef}
                                onScroll={handleSentimentScroll}
                                style={{ maxHeight: '600px', overflowY: 'auto' }}
                            >
                                {stocktwitsLoading ? (
                                    <div className="loading-state">
                                        <i className="fas fa-spinner fa-spin"></i>
                                        <span>Loading sentiment...</span>
                                    </div>
                                ) : stocktwits.length > 0 ? (
                                    <div className="stocktwits-list">
                                        {stocktwits.map((message, index) => (
                                            <a
                                                key={message.id || index}
                                                href={`https://stocktwits.com/${message.user?.username || 'symbol'}/${message.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`tweet-item clickable ${message.sentiment?.toLowerCase() || 'neutral'}`}
                                                style={{ textDecoration: 'none', color: 'inherit', display: 'block', cursor: 'pointer' }}
                                            >
                                                <div className="tweet-header">
                                                    {message.user?.avatar_url ? (
                                                        <img
                                                            src={message.user.avatar_url.replace('http://', 'https://')}
                                                            alt=""
                                                            className="avatar"
                                                            onError={(e) => { e.target.style.display = 'none'; }}
                                                        />
                                                    ) : (
                                                        <div className="avatar-placeholder">
                                                            <i className="fas fa-user"></i>
                                                        </div>
                                                    )}
                                                    <span className="username">
                                                        @{message.user?.username || 'Anonymous'}
                                                        {message.user?.official && <i className="fas fa-check-circle verified"></i>}
                                                    </span>
                                                    <span className="time">{message.time_ago}</span>
                                                    {message.sentiment && message.sentiment !== 'Neutral' && (
                                                        <span className={`sentiment-badge ${message.sentiment.toLowerCase()}`}>
                                                            {message.sentiment === 'Bullish' ? 'Bullish' : 'Bearish'}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="tweet-body">{message.body}</p>
                                                <div className="tweet-footer">
                                                    {(message.likes_count > 0 || message.replies_count > 0) && (
                                                        <div className="tweet-stats">
                                                            {message.likes_count > 0 && (
                                                                <span><i className="fas fa-heart"></i> {message.likes_count}</span>
                                                            )}
                                                            {message.replies_count > 0 && (
                                                                <span><i className="fas fa-reply"></i> {message.replies_count}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <span className="external-link">
                                                        <i className="fas fa-external-link-alt"></i>
                                                    </span>
                                                </div>
                                            </a>
                                        ))}
                                        {stocktwitsHasMore && (
                                            <button
                                                className="load-more-btn"
                                                onClick={loadMoreStocktwits}
                                                disabled={stocktwitsLoadingMore}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px',
                                                    marginTop: '12px',
                                                    background: 'rgba(34, 197, 94, 0.1)',
                                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                                    borderRadius: '8px',
                                                    color: '#22c55e',
                                                    cursor: stocktwitsLoadingMore ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    fontWeight: '500'
                                                }}
                                            >
                                                {stocktwitsLoadingMore ? (
                                                    <><i className="fas fa-spinner fa-spin"></i> Loading...</>
                                                ) : (
                                                    <><i className="fas fa-plus"></i> Load More Comments</>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="empty-state">
                                        <i className="fas fa-comment-slash"></i>
                                        <p>No recent posts for {symbol}</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}
            </main>

            {ceoModalOpen && window.CEODetailsModal && React.createElement(window.CEODetailsModal, {
                isOpen: ceoModalOpen,
                onClose: () => setCeoModalOpen(false),
                ceoName: selectedCEO.name,
                companyName: selectedCEO.company,
                companySymbol: selectedCEO.symbol
            })}
        </div>
    );
};

// Page state
let pageState = {
    isActive: false,
    symbol: null,
    isFromWatchlist: false
};

let pageContainer = null;
let pageRoot = null;

const initPage = () => {
    if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.id = 'react-stock-details-page-container';
        document.body.appendChild(pageContainer);
        pageRoot = ReactDOM.createRoot(pageContainer);
    }
};

window.navigateToStockPage = (symbol, isFromWatchlist = false) => {
    console.log(`[StockDetailsPage] Navigating to ${symbol}`);
    initPage();

    const newUrl = `/stock/${symbol}`;
    // Use replaceState if already on the same URL (e.g., page reload)
    if (window.location.pathname === newUrl) {
        window.history.replaceState({ symbol, isFromWatchlist, page: 'stock' }, '', newUrl);
    } else {
        window.history.pushState({ symbol, isFromWatchlist, page: 'stock' }, '', newUrl);
    }

    const dashboardContent = document.querySelector('#dashboard-redesign-root');
    if (dashboardContent) {
        dashboardContent.style.display = 'none';
    }

    // Show the page container
    if (pageContainer) {
        pageContainer.style.display = 'block';
    }

    pageState = { isActive: true, symbol, isFromWatchlist };
    pageRoot.render(React.createElement(StockDetailsPage, {
        symbol,
        isFromWatchlist,
        onNavigateBack: () => {
            window.navigateBackToDashboard();
        }
    }));

    window.scrollTo(0, 0);
};

window.navigateBackToDashboard = () => {
    console.log('[StockDetailsPage] Navigating back to dashboard');
    window.history.pushState({ page: 'dashboard' }, '', '/');

    if (pageRoot) {
        pageRoot.render(null);
    }

    // Hide the page container so it doesn't block the dashboard
    if (pageContainer) {
        pageContainer.style.display = 'none';
    }

    const dashboardContent = document.querySelector('#dashboard-redesign-root');
    if (dashboardContent) {
        dashboardContent.style.display = '';
    }

    pageState.isActive = false;
};

window.addEventListener('popstate', (event) => {
    console.log('[StockDetailsPage] Popstate event:', event.state);

    if (event.state?.page === 'stock' && event.state?.symbol) {
        window.navigateToStockPage(event.state.symbol, event.state.isFromWatchlist || false);
    } else {
        if (pageRoot) {
            pageRoot.render(null);
        }
        if (pageContainer) {
            pageContainer.style.display = 'none';
        }
        const dashboardContent = document.querySelector('#dashboard-redesign-root');
        if (dashboardContent) {
            dashboardContent.style.display = '';
        }
        pageState.isActive = false;
    }
});

window.handleInitialStockUrl = () => {
    const path = window.location.pathname;
    const stockMatch = path.match(/^\/stock\/([A-Z0-9]+)$/i);

    if (stockMatch) {
        const symbol = stockMatch[1].toUpperCase();
        console.log(`[StockDetailsPage] Initial load for stock: ${symbol}`);

        // Wait for page container to be ready
        const attemptNavigation = (retries = 0) => {
            if (retries > 20) {
                console.error('[StockDetailsPage] Failed to initialize page after multiple attempts');
                return;
            }

            // Check if React and required functions are ready
            if (typeof React !== 'undefined' && typeof ReactDOM !== 'undefined' && document.getElementById('dashboard-redesign-root')) {
                initPage();
                setTimeout(() => {
                    window.navigateToStockPage(symbol, false);
                }, 50);
            } else {
                setTimeout(() => attemptNavigation(retries + 1), 100);
            }
        };

        attemptNavigation();
    }
};

// Also handle when scripts load after DOM is ready
if (document.readyState === 'complete') {
    // Page already loaded, check URL immediately
    const path = window.location.pathname;
    if (path.startsWith('/stock/')) {
        setTimeout(() => {
            if (typeof window.handleInitialStockUrl === 'function') {
                window.handleInitialStockUrl();
            }
        }, 100);
    }
}

window.StockDetailsPage = StockDetailsPage;

console.log('[StockDetailsPage] Component loaded');

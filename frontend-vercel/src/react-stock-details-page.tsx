export {};

const { useState, useEffect, useCallback, useRef } = React;

const API_BASE_PAGE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

interface StockData {
    symbol?: string;
    name?: string;
    price?: number;
    percentageChange?: number;
    priceChangePercent?: number;
    priceChange?: number;
    marketCap?: number | string;
    peRatio?: number | string;
    dividendYield?: number | string;
    high52Week?: number;
    low52Week?: number;
    volume?: number;
    description?: string;
    ceo?: string;
    headquarters?: string;
    website?: string;
    sector?: string;
    industry?: string;
    isInWatchlist?: boolean;
    dateAdded?: string;
    originalPrice?: number;
    category?: string;
    notes?: string;
    date_added?: string;
    original_price?: number;
    price_change?: number;
    percentage_change?: number;
}

interface NewsArticle {
    link?: string;
    url?: string;
    title: string;
    source?: string;
    published_at?: string;
    publishedAt?: string;
    image_url?: string;
    urlToImage?: string;
}

interface StocktwitMessage {
    id?: string | number;
    body: string;
    sentiment?: string;
    time_ago?: string;
    likes_count?: number;
    replies_count?: number;
    user?: {
        username?: string;
        avatar_url?: string;
        official?: boolean;
    };
}

interface AiInsight {
    ai_insight?: string;
    change_percent?: number;
    period?: string;
}

const StockDetailsPage = ({ symbol, isFromWatchlist = false, onNavigateBack }: {
    symbol: string;
    isFromWatchlist?: boolean;
    onNavigateBack?: () => void;
}) => {
    const [stockData, setStockData] = useState<StockData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [chartData, setChartData] = useState<unknown[] | null>(null);
    const [news, setNews] = useState<NewsArticle[]>([]);
    const [newsLoading, setNewsLoading] = useState(false);
    const [newsPage, setNewsPage] = useState(1);
    const [newsHasMore, setNewsHasMore] = useState(true);
    const [newsLoadingMore, setNewsLoadingMore] = useState(false);
    const newsContainerRef = useRef<HTMLDivElement | null>(null);
    const [stocktwits, setStocktwits] = useState<StocktwitMessage[]>([]);
    const [stocktwitsLoading, setStocktwitsLoading] = useState(false);
    const [stocktwitsLoadingMore, setStocktwitsLoadingMore] = useState(false);
    const [stocktwitsCursor, setStocktwitsCursor] = useState<string | null>(null);
    const [stocktwitsHasMore, setStocktwitsHasMore] = useState(true);
    const sentimentContainerRef = useRef<HTMLDivElement | null>(null);
    const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
    const [aiInsightLoading, setAiInsightLoading] = useState(false);
    const [aiInsightUpgradeRequired, setAiInsightUpgradeRequired] = useState(false);
    const [aiInsightPeriod, setAiInsightPeriod] = useState('7d');
    const chartRootRef = useRef<ReturnType<typeof ReactDOM.createRoot> | null>(null);
    const [addingToWatchlist, setAddingToWatchlist] = useState(false);
    const [isInWatchlist, setIsInWatchlist] = useState(false);
    const isIndex = symbol && symbol.startsWith('^');

    // CEO modal
    const [ceoModalOpen, setCeoModalOpen] = useState(false);
    const [selectedCEO, setSelectedCEO] = useState({ name: '', company: '', symbol: '' });
    const [showFullDesc, setShowFullDesc] = useState(false);

    // Strip titles from CEO names
    const cleanCEOName = (name?: string): string => {
        if (!name || name === '-') return name || '';
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

    // Auto-fetch 7d market analysis on load
    useEffect(() => {
        if (symbol) fetchAiInsight('7d');
    }, [symbol]);

    // Load stock data
    useEffect(() => {
        if (!symbol) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setStockData(null);
            setChartData(null);
            setNews([]);
            setShowFullDesc(false);

            try {
                const authHeaders = await window.AppAuth.getAuthHeaders();
                const useWatchlistEndpoint = isFromWatchlist;

                // Details API call
                const detailPromise = (async () => {
                    const url = useWatchlistEndpoint
                        ? `${API_BASE_PAGE}/api/watchlist/${symbol}/details`
                        : `${API_BASE_PAGE}/api/company/${symbol}`;
                    const opts: RequestInit = useWatchlistEndpoint
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
                        const chartResp = await fetch(`${API_BASE_PAGE}/api/chart/${symbol}?range=1D`, {
                            credentials: 'include'
                        });
                        if (chartResp.ok) {
                            return await chartResp.json();
                        }
                    } catch {
                        // ignore
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
                            const inWatchlist = Array.isArray(watchlistData) && watchlistData.some((item: { symbol: string }) => item.symbol === symbol);
                            setIsInWatchlist(inWatchlist);
                        } else {
                            setIsInWatchlist(false);
                        }
                    } catch {
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
                    } catch {
                        // ignore
                    } finally {
                        setNewsLoading(false);
                    }
                })();

                // Load Stocktwits (skip for indices)
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
                        } catch {
                            // ignore
                        } finally {
                            setStocktwitsLoading(false);
                        }
                    })();
                }

            } catch (err: any) {
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

            if (!chartData || chartData.length === 0) {
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
                    onClose: undefined
                }));
            } catch {
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

    const formatMarketCap = (value?: number | string): string => {
        if (!value || value === '-') return '-';
        if (typeof value === 'number') {
            if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
            if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
            if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
            return `$${value.toFixed(2)}`;
        }
        return value.toString();
    };

    const formatDate = (dateString?: string): string => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTimeAgo = (dateString?: string): string => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const fetchNews = async () => {
        if (newsLoading || !symbol) return;
        setNewsLoading(true);
        setNewsPage(1);
        setNewsHasMore(true);
        setNews([]);
        try {
            const newsResp = await fetch(`${API_BASE_PAGE}/api/news/company/${symbol}?page=1&limit=5`, {
                credentials: 'include'
            });
            if (newsResp.ok) {
                const newsRespData = await newsResp.json();
                setNews(newsRespData.articles || []);
                setNewsHasMore(newsRespData.hasMore);
            }
        } catch {
            // ignore
        } finally {
            setNewsLoading(false);
        }
    };

    const fetchAiInsight = async (period: string) => {
        if (aiInsightLoading || !symbol) return;
        setAiInsightLoading(true);
        setAiInsight(null);
        setAiInsightUpgradeRequired(false);
        try {
            const authUser = window.AppAuth.getCurrentUser();
            const headers: Record<string, string> = {};
            if (authUser) {
                const token = await authUser.getIdToken();
                headers['Authorization'] = `Bearer ${token}`;
            }
            const insightResp = await fetch(`${API_BASE_PAGE}/api/stock/${symbol}/ai-insight?period=${period}`, { headers });
            if (insightResp.status === 403) {
                setAiInsightUpgradeRequired(true);
            } else if (insightResp.ok) {
                const insightData = await insightResp.json();
                setAiInsight(insightData);
            }
        } catch {
            // ignore
        } finally {
            setAiInsightLoading(false);
        }
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
        } catch {
            // ignore
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
        } catch {
            // ignore
        } finally {
            setStocktwitsLoadingMore(false);
        }
    };

    // Handle scroll for infinite loading in sentiment section
    const handleSentimentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
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
        if (isInWatchlist || addingToWatchlist) return;

        setAddingToWatchlist(true);
        try {
            const authHeaders = await window.AppAuth.getAuthHeaders();

            const response = await fetch(`${API_BASE_PAGE}/api/watchlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                credentials: 'include',
                body: JSON.stringify({ symbol })
            });

            if (response.ok) {
                setIsInWatchlist(true);
                if (window.showNotification) {
                    window.showNotification(`${symbol} added to watchlist`, 'success');
                }
                try {
                    window.dispatchEvent(new CustomEvent('watchlistChanged'));
                } catch (_) {}
                if (typeof window.refreshWatchlist === 'function') {
                    window.refreshWatchlist();
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                if (window.showNotification) {
                    window.showNotification((errorData as any).error || `Failed to add ${symbol}`, 'error');
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
                <div className={`stock-page-primary ${isIndex ? 'full-width' : ''}`}>
                    {/* Market Analysis */}
                    <section className="ai-insight-card">
                        <div className="card-header">
                            <i className="fas fa-chart-line"></i>
                            <h3>Market Analysis</h3>
                            {aiInsightLoading && <i className="fas fa-spinner fa-spin loading-indicator"></i>}
                        </div>
                        <div className="card-content">
                            <div className="insight-controls">
                                {[
                                    { value: '7d',  label: '7 Days' },
                                    { value: '1mo', label: '1 Month' },
                                    { value: '6mo', label: '6 Months' },
                                    { value: '1y',  label: '1 Year' },
                                ].map(({ value, label }) => (
                                    <button
                                        key={value}
                                        className={`insight-period-btn ${aiInsightPeriod === value ? 'active' : ''}`}
                                        onClick={() => { setAiInsightPeriod(value); fetchAiInsight(value); }}
                                        disabled={aiInsightLoading}
                                    >{label}</button>
                                ))}
                            </div>
                            {aiInsightLoading ? (
                                <p className="loading-text">Loading analysis...</p>
                            ) : aiInsightUpgradeRequired ? (
                                <div className="insight-upgrade-gate">
                                    <p className="no-data-text">
                                        <i className="fas fa-lock" style={{ marginRight: '6px', color: '#FFB800' }}></i>
                                        AI Market Insights are available on Pro and Elite plans.
                                    </p>
                                    <button
                                        className="insight-upgrade-btn"
                                        onClick={() => window.showUpgradeModal && window.showUpgradeModal('Unlock AI Market Insights with Pro or Elite.')}
                                    >Upgrade to Pro</button>
                                </div>
                            ) : aiInsight?.ai_insight ? (
                                <div>
                                    {aiInsight.change_percent !== undefined && (
                                        <div className={`insight-badge ${aiInsight.change_percent >= 0 ? 'positive' : 'negative'}`}>
                                            <i className={`fas fa-arrow-${aiInsight.change_percent >= 0 ? 'up' : 'down'}`}></i>
                                            <span>{aiInsight.change_percent >= 0 ? '+' : ''}{aiInsight.change_percent}% ({aiInsight.period})</span>
                                        </div>
                                    )}
                                    <p className="insight-text">{aiInsight.ai_insight}</p>
                                </div>
                            ) : (
                                <p className="no-data-text">Select a time period above to load the analysis.</p>
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
                            <button
                                className="fetch-news-btn"
                                onClick={fetchNews}
                                disabled={newsLoading}
                            >
                                <i className={newsLoading ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'}></i>
                                {newsLoading ? 'Fetching...' : 'Fetch News'}
                            </button>
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
                                                        onError={(e) => { const el = e.target as HTMLElement; if (el.parentElement) el.parentElement.style.display = 'none'; }}
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
                                    <button className="fetch-news-btn" onClick={fetchNews}>
                                        <i className="fas fa-sync-alt"></i> Fetch News
                                    </button>
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
                            {(() => {
                                const fullDesc = stockData.description || (isIndex ? 'Market index tracking major equities.' : 'No description available.');
                                const LIMIT = 220;
                                const isTruncatable = fullDesc.length > LIMIT;
                                const cutAt = fullDesc.lastIndexOf(' ', LIMIT);
                                const displayed = (!showFullDesc && isTruncatable)
                                    ? fullDesc.slice(0, cutAt > 0 ? cutAt : LIMIT) + '…'
                                    : fullDesc;
                                return (
                                    <>
                                        <p className="description">{displayed}</p>
                                        {isTruncatable && (
                                            <button className="description-read-more" onClick={() => setShowFullDesc(p => !p)}>
                                                {showFullDesc ? 'Show less' : 'Read more'}
                                            </button>
                                        )}
                                    </>
                                );
                            })()}
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
                                    <span className={`stat-value ${(stockData.priceChange ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                                        <i className={`fas fa-arrow-${(stockData.priceChange ?? 0) >= 0 ? 'up' : 'down'}`}></i>
                                        {(stockData.priceChange ?? 0) >= 0 ? '+' : ''}${stockData.priceChange?.toFixed(2)} ({stockData.percentageChange?.toFixed(2)}%)
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

                    {/* Per-stock notes — always visible regardless of watchlist status */}
                    {window.StockNotesSection && React.createElement(window.StockNotesSection, {
                        symbol: symbol
                    })}
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
                                                href={`https://stocktwits.com/${message.user?.username || 'symbol'}/message/${message.id}`}
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
                                                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
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
                                                    {((message.likes_count ?? 0) > 0 || (message.replies_count ?? 0) > 0) && (
                                                        <div className="tweet-stats">
                                                            {(message.likes_count ?? 0) > 0 && (
                                                                <span><i className="fas fa-heart"></i> {message.likes_count}</span>
                                                            )}
                                                            {(message.replies_count ?? 0) > 0 && (
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

window.StockDetailsPage = StockDetailsPage;

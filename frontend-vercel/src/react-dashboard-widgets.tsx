export {};
import type { SparklineChartProps, MarketStatus, IndexQuote, Mover } from './types/models';

const { useState, useEffect, useRef, useCallback, useMemo } = React;

function routeTo(path: string, state?: Record<string, unknown>, replace?: boolean): void {
    window.dispatchEvent(new CustomEvent('app:navigate', {
        detail: { path, state: state || {}, replace: !!replace }
    }));
}
function getCurrentUser(): FirebaseUser | null {
    return window.AppAuth?.getCurrentUser ? window.AppAuth.getCurrentUser() : null;
}
function getAuthHeaders(user?: FirebaseUser | null): Promise<Record<string, string>> {
    return window.AppAuth?.getAuthHeaders ? window.AppAuth.getAuthHeaders(user) : Promise.resolve({});
}

// Sparkline Component for Mini Charts
const SparklineChart = ({ symbol, data, isPositive, width = 100, height = 40 }: SparklineChartProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [chartData, setChartData] = useState<number[] | null>(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!symbol) return;

        const fetchSparklineData = async () => {
            try {
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const response = await fetch(`${API_BASE}/api/chart/${symbol}?range=1D`, {
                    credentials: 'include'
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data && Array.isArray(data) && data.length > 0) {
                        const prices = data.map((d: Record<string, unknown>) => parseFloat(String(d.close || d.price))).filter((p: number) => !isNaN(p));
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
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const displayWidth = width;
        const displayHeight = height;

        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        (ctx as CanvasRenderingContext2D & { imageSmoothingQuality: string }).imageSmoothingQuality = 'high';
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';
        ctx.clearRect(0, 0, displayWidth, displayHeight);

        const paddingX = 4;
        const paddingY = 6;
        const min = Math.min(...chartData);
        const max = Math.max(...chartData);
        const range = max - min || 1;
        const stepX = (displayWidth - paddingX * 2) / (chartData.length - 1);
        const effectiveHeight = displayHeight - paddingY * 2;

        const startPrice = chartData[0];
        const endPrice = chartData[chartData.length - 1];
        const trendPositive = endPrice >= startPrice;
        const lineColor = trendPositive ? '#00c805' : '#ff5000';
        const fillColorStart = trendPositive ? 'rgba(0, 200, 5, 0.25)' : 'rgba(255, 80, 0, 0.25)';
        const fillColorEnd = trendPositive ? 'rgba(0, 200, 5, 0.02)' : 'rgba(255, 80, 0, 0.02)';

        const points = chartData.map((price, index) => ({
            x: paddingX + index * stepX,
            y: paddingY + effectiveHeight - ((price - min) / range) * effectiveHeight
        }));

        const drawSmoothLine = (ctx: CanvasRenderingContext2D, points: {x: number; y: number}[], tension = 0.3) => {
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

        ctx.beginPath();
        drawSmoothLine(ctx, points, 0.25);
        ctx.lineTo(points[points.length - 1].x, displayHeight);
        ctx.lineTo(points[0].x, displayHeight);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, displayHeight);
        gradient.addColorStop(0, fillColorStart);
        gradient.addColorStop(1, fillColorEnd);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawSmoothLine(ctx, points, 0.25);
        ctx.stroke();

        const lastPoint = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = trendPositive ? 'rgba(0, 200, 5, 0.3)' : 'rgba(255, 80, 0, 0.3)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();

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

// Top Movers Widget Component
const TopMoversWidget = () => {
    const [movers, setMovers] = useState<Mover[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('gainers');

    useEffect(() => {
        const fetchMovers = async () => {
            try {
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const authHeaders = await getAuthHeaders();
                const res = await fetch(`${API_BASE}/api/market/analysis`, {
                    headers: authHeaders,
                    credentials: 'include'
                });
                if (res.ok) {
                    const json = await res.json();
                    setMovers(json.data?.topMovers || []);
                }
            } catch (_) {}
            setLoading(false);
        };
        fetchMovers();
    }, []);

    const gainers = [...movers].filter(m => m.change >= 0).sort((a, b) => b.change - a.change);
    const losers = [...movers].filter(m => m.change < 0).sort((a, b) => a.change - b.change);
    const displayed = tab === 'gainers' ? gainers : losers;

    if (loading) {
        return (
            <div className="top-movers-loading">
                <div className="mover-skeleton"></div>
                <div className="mover-skeleton"></div>
                <div className="mover-skeleton"></div>
            </div>
        );
    }

    return (
        <div className="top-movers-widget">
            <div className="mover-tabs">
                <button
                    className={`mover-tab ${tab === 'gainers' ? 'active gainers' : ''}`}
                    onClick={() => setTab('gainers')}
                >
                    <i className="fas fa-arrow-up"></i> Gainers
                </button>
                <button
                    className={`mover-tab ${tab === 'losers' ? 'active losers' : ''}`}
                    onClick={() => setTab('losers')}
                >
                    <i className="fas fa-arrow-down"></i> Losers
                </button>
            </div>
            <div className="mover-list">
                {displayed.length === 0 ? (
                    <div className="mover-empty">No {tab} data available</div>
                ) : (
                    displayed.map((mover, idx) => {
                        const isPositive = mover.change >= 0;
                        return (
                            <div key={mover.symbol} className="top-mover-row" style={{ cursor: 'pointer' }} onClick={() => window.openStockDetailsModalReact && window.openStockDetailsModalReact(mover.symbol)}>
                                <span className="mover-rank">{idx + 1}</span>
                                <div className="mover-info">
                                    <span className="mover-symbol">{mover.symbol}</span>
                                    <span className="mover-sector">{mover.sector}</span>
                                </div>
                                <SparklineChart symbol={mover.symbol} isPositive={isPositive} width={80} height={32} />
                                <div className="mover-stats">
                                    <span className="mover-price">${mover.price.toFixed(2)}</span>
                                    <span className={`mover-change ${isPositive ? 'positive' : 'negative'}`}>
                                        {isPositive ? '+' : ''}{mover.change.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

// Market Overview Component - Shows major indices
const MarketOverview = ({ marketStatus }: { marketStatus: MarketStatus }) => {
    const [indices, setIndices] = useState<IndexQuote[]>([
        { symbol: '^GSPC', name: 'S&P 500', shortName: 'S&P', price: null, change: null, changePercent: null },
        { symbol: '^IXIC', name: 'NASDAQ', shortName: 'NASDAQ', price: null, change: null, changePercent: null },
        { symbol: '^DJI', name: 'Dow Jones', shortName: 'DOW', price: null, change: null, changePercent: null }
    ]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    useEffect(() => {
        const fetchIndices = async () => {
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

            const fetchIndex = async (symbol: string, fallbackSymbol?: string) => {
                try {
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
        const interval = setInterval(fetchIndices, 60000);
        return () => clearInterval(interval);
    }, []);

    const formatPrice = (price: number | null): string => {
        if (!price) return '—';
        return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatChange = (change: number | null, percent: number | null): { text: string; isPositive: boolean } => {
        if (change === null || percent === null) return { text: '—', isPositive: true };
        const isPositive = percent >= 0;
        const sign = isPositive ? '+' : '';
        return { text: `${sign}${percent.toFixed(2)}%`, isPositive };
    };

    return (
        <div className="market-overview-card">
            <div className="market-overview-header">
                <div className="market-title">
                    <span className="market-label">Markets</span>
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
                            onClick={() => routeTo(`/stock/${index.symbol}`, { isFromWatchlist: false })}
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
const MarketIntelligenceWidget = ({ onNavigate }: { onNavigate: (view: string) => void }) => {
    const [earningsCount, setEarningsCount] = useState<number | null>(null);
    const [newsData, setNewsData] = useState<{ count: number; headline: string | null } | null>(null);
    const [topSector, setTopSector] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchIntelData = async () => {
            try {
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const authHeaders = await getAuthHeaders();
                const opts: RequestInit = { headers: authHeaders, credentials: 'include' };

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

                try {
                    const sectorRes = await fetch(`${API_BASE}/api/sectors/batch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        credentials: 'include',
                        body: JSON.stringify({ symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'JNJ', 'XOM'] })
                    });
                    if (sectorRes.ok) {
                        const sectors = await sectorRes.json();
                        const counts: Record<string, number> = {};
                        Object.values(sectors).forEach((s: unknown) => {
                            const key = String(s);
                            counts[key] = (counts[key] || 0) + 1;
                        });
                        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                        if (top) setTopSector(top[0]);
                    }
                } catch (_) {}
            } catch (_) {}
            setLoading(false);
        };
        fetchIntelData();
    }, []);

    const handleClick = (tab: string) => {
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
            tab: null as string | null
        },
        {
            icon: 'fa-file-alt',
            title: 'Market News',
            subtitle: loading ? 'Loading...' : (newsData?.headline ? newsData.headline.substring(0, 50) + (newsData.headline.length > 50 ? '...' : '') : 'Latest market updates'),
            tab: null as string | null
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

window.SparklineChart = SparklineChart;
window.TopMoversWidget = TopMoversWidget;
window.MarketOverview = MarketOverview;
window.MarketIntelligenceWidget = MarketIntelligenceWidget;

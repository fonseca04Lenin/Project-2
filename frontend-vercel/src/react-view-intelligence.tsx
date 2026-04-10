export {};
import type { StockItem } from './types/models';

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

interface EarningsItem {
    symbol?: string;
    ticker?: string;
    company_name?: string;
    company?: string;
    name?: string;
    earnings_date?: string;
    estimate?: number;
}
interface InsiderItem {
    date?: string;
    filer_name?: string;
    insider?: string;
    name?: string;
    transaction_type?: string;
    shares?: number;
    price?: number;
    source_url?: string;
}
interface AnalystItem {
    date?: string;
    firm?: string;
    analyst?: string;
    rating?: string;
    price_target?: string | number;
    action?: string;
}
interface CorrelationData {
    symbols: string[];
    matrix: number[][];
}
interface TooltipState {
    x: number;
    y: number;
    text: string;
}

// Intelligence View Component
const IntelligenceView = ({ watchlistData }: { watchlistData: StockItem[] }) => {
    const [activeTab, setActiveTab] = useState('earnings');
    const [symbol, setSymbol] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [earnings, setEarnings] = useState<EarningsItem[]>([]);
    const [insider, setInsider] = useState<InsiderItem[]>([]);
    const [analyst, setAnalyst] = useState<AnalystItem[]>([]);

    useEffect(() => {
        loadCurrentTab();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    useEffect(() => {
        const setter = (tab: string) => setActiveTab(tab);
        window.__setIntelTab = setter;
        return () => {
            if (window.__setIntelTab === setter) delete window.__setIntelTab;
        };
    }, []);

    const withAuth = async () => {
        const authHeaders = await getAuthHeaders();
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

    const DataSourceLabel = ({ source, url }: { source: string; url?: string | null }) => {
        const inner = (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: url ? 'rgba(0, 217, 36, 0.12)' : 'rgba(0, 217, 36, 0.1)',
                borderRadius: '4px',
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.6)',
                marginTop: '1rem',
                cursor: url ? 'pointer' : 'default',
                transition: 'background 0.2s'
            }}>
                <i className="fas fa-database" style={{ color: '#00D924' }}></i>
                <span>Data provided by <strong style={{ color: '#fff' }}>{source}</strong></span>
                {url && <i className="fas fa-external-link-alt" style={{ marginLeft: 'auto', color: '#00D924', fontSize: '0.7rem' }}></i>}
            </div>
        );
        if (url) {
            return <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{inner}</a>;
        }
        return inner;
    };

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
                        {(loading ? Array.from({length:5}) as EarningsItem[] : earnings).slice(0,5).map((item, i) => {
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
                        {(loading ? Array.from({length:5}) as InsiderItem[] : insider).slice(0,5).map((t, i) => {
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
                            const secUrl = !loading && (t?.source_url || (symbol ? `https://finnhub.io/docs/api/insider-transactions` : null));

                            return (
                            <div
                                key={i}
                                className="intel-item"
                                style={{ cursor: !loading && secUrl ? 'pointer' : 'default' }}
                                onClick={() => !loading && secUrl && window.open(secUrl, '_blank', 'noopener,noreferrer')}
                                title={(!loading && secUrl) ? 'View SEC Form 4 filing' : undefined}
                            >
                                <div className="intel-symbol">{symbol}</div>
                                <div className="intel-details">
                                    <div className="intel-company">{loading ? 'Loading…' : (t.filer_name || t.insider || t.name || '—')}</div>
                                    <div className="intel-date" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        {loading ? '' : formattedDate}
                                        {!loading && secUrl && <i className="fas fa-external-link-alt" style={{ fontSize: '0.6rem', color: 'rgba(0,217,36,0.7)' }}></i>}
                                    </div>
                                </div>
                                <div className="intel-estimate">{loading ? '' : formattedTransaction}</div>
                            </div>
                            );
                        })}
                    </div>
                    <DataSourceLabel source="SEC Form 4 via Finnhub" url={symbol ? `https://finnhub.io/docs/api/insider-transactions` : null} />
                </div>
            )}

            {activeTab === 'analyst' && (
                <div className="intel-card">
                    <div className="intel-header">
                        <h3><i className="fas fa-chart-line"></i> Analyst Ratings</h3>
                        <span className="intel-count">{analyst.length}</span>
                    </div>
                    <div className="intel-list">
                        {(loading ? Array.from({length:5}) as AnalystItem[] : analyst).slice(0,5).map((r, i) => {
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
const CorrelationHeatmap = ({ watchlistData }: { watchlistData: StockItem[] }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [correlationData, setCorrelationData] = useState<CorrelationData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

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
                const authHeaders = await getAuthHeaders();
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

    useEffect(() => {
        if (!correlationData || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { symbols: syms, matrix } = correlationData;
        const n = syms.length;

        const labelWidth = 80;
        const cellSize = Math.min(50, Math.floor((canvas.width - labelWidth) / n));
        const totalGrid = cellSize * n;

        canvas.width = labelWidth + totalGrid + 20;
        canvas.height = labelWidth + totalGrid + 20;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const getColor = (val: number): string => {
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

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const x = labelWidth + j * cellSize;
                const y = labelWidth + i * cellSize;
                ctx.fillStyle = getColor(matrix[i][j]);
                ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
            }
        }

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

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
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

window.IntelligenceView = IntelligenceView;
window.CorrelationHeatmap = CorrelationHeatmap;

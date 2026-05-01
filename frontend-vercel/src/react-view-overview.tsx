export {};
import type { OverviewViewProps } from './types/models';

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

const SparklineChart = window.SparklineChart;
const MarketOverview = window.MarketOverview;
const MarketIntelligenceWidget = window.MarketIntelligenceWidget;
const TopMoversWidget = window.TopMoversWidget;

const AI_TOOLS = [
    { tab: 'brief',    icon: 'fa-newspaper',     label: 'Morning Brief',      desc: 'Watchlist summary, daily',        color: '#00D924' },
    { tab: 'thesis',   icon: 'fa-balance-scale',  label: 'Thesis Builder',     desc: 'Bull & bear case for any ticker', color: '#00D4AA' },
    { tab: 'health',   icon: 'fa-heartbeat',      label: 'Health Score',       desc: 'Portfolio diversification grade', color: '#7FE832' },
    { tab: 'rotation', icon: 'fa-arrows-rotate',  label: 'Sector Rotation',    desc: 'Track institutional money flow',  color: '#FFB800' },
    { tab: 'earnings', icon: 'fa-chart-bar',      label: 'Earnings Breakdown', desc: 'AI reads the earnings report',    color: '#FF9500' },
    { tab: 'portfolio',icon: 'fa-shield-halved',  label: 'Portfolio Guidance', desc: 'Exposure & risk assessment',      color: '#A78BFA' },
];

// Overview Tab Component
const OverviewView = ({ watchlistData, marketStatus, onNavigate, onNavigateToAiTool, onStockHover, preferences = {} }: OverviewViewProps) => {
    const [sparklineData, setSparklineData] = useState<Record<string, unknown>>({});
    const showSparklines = preferences.showSparklines !== false;
    const showPercentChange = preferences.showPercentChange !== false;
    const compactNumbers = preferences.compactNumbers || false;
    const currencySymbol = ({ USD: '$', EUR: '€', GBP: '£', JPY: '¥' } as Record<string, string>)[preferences.currency || 'USD'] || '$';

    const formatStockPrice = (price: number): string => {
        if (!price) return `${currencySymbol}0.00`;
        if (compactNumbers && price >= 1000) {
            if (price >= 1e9) return `${currencySymbol}${(price / 1e9).toFixed(2)}B`;
            if (price >= 1e6) return `${currencySymbol}${(price / 1e6).toFixed(2)}M`;
            if (price >= 1e3) return `${currencySymbol}${(price / 1e3).toFixed(2)}K`;
        }
        return `${currencySymbol}${price.toFixed(2)}`;
    };

    return (
        <div className="overview-view">
            {/* Market Overview */}
            <MarketOverview marketStatus={marketStatus} />

            {/* AI Research Quick Access */}
            {onNavigateToAiTool && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>AI Research</span>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.6rem' }}>
                        {AI_TOOLS.map(tool => (
                            <button
                                key={tool.tab}
                                onClick={() => onNavigateToAiTool(tool.tab)}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '8px',
                                    padding: '0.85rem 0.9rem',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'border-color 0.15s, background 0.15s',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.16)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                                }}
                            >
                                <i className={`fas ${tool.icon}`} style={{ color: tool.color, fontSize: '0.95rem' }} />
                                <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.8rem', marginTop: '0.5rem', lineHeight: 1.2 }}>{tool.label}</div>
                                <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.72rem', marginTop: '0.3rem', lineHeight: 1.3 }}>{tool.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

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
                                    <div className="stock-name-enhanced">{stock.company_name || stock.name || stock.symbol}</div>
                                </div>
                                {showSparklines && (
                                <div className="stock-sparkline">
                                    <SparklineChart
                                        symbol={stock.symbol}
                                        isPositive={(stock.change_percent || 0) >= 0}
                                        width={120}
                                        height={45}
                                    />
                                </div>
                                )}
                                <div className="stock-price-group">
                                    <div className={`stock-price-enhanced ${(stock.change_percent || 0) >= 0 ? 'positive' : 'negative'}`}>
                                    {formatStockPrice(stock.current_price || stock.price || 0)}
                                </div>
                                    {showPercentChange && (
                                    <div className={`stock-change-enhanced ${(stock.change_percent || 0) >= 0 ? 'positive' : 'negative'}`}>
                                    {(stock.change_percent || 0) >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2) || '0.00'}%
                                    </div>
                                    )}
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

                {/* Middle Column - Top Movers */}
                <div className="main-card enhanced">
                    <div className="card-header">
                        <h3><i className="fas fa-fire"></i> Top Movers</h3>
                    </div>
                    <TopMoversWidget />
                </div>

                {/* Right Column - Market Intelligence Quick Look */}
                <div className="main-card enhanced">
                    <div className="card-header">
                        <h3><i className="fas fa-database"></i> Market Intelligence</h3>
                        <button className="view-all-btn" onClick={() => onNavigate('intelligence')}>
                            Explore <i className="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <MarketIntelligenceWidget onNavigate={onNavigate} />
                </div>
            </div>
        </div>
    );
};

// Watchlist View Component

window.OverviewView = OverviewView;

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
    { tab: 'brief',    icon: 'fa-chart-line',     label: 'Morning Brief',      desc: 'Watchlist summary, daily',        color: '#00C805' },
    { tab: 'thesis',   icon: 'fa-chart-bar',       label: 'Thesis Builder',     desc: 'Bull & bear case for any ticker', color: '#00C805' },
    { tab: 'health',   icon: 'fa-wave-square',     label: 'Health Score',       desc: 'Portfolio diversification grade', color: '#FFD700' },
    { tab: 'rotation', icon: 'fa-clock',           label: 'Sector Rotation',    desc: 'Track institutional money flow',  color: '#00C805' },
    { tab: 'earnings', icon: 'fa-file-lines',      label: 'Earnings Breakdown', desc: 'AI reads the earnings report',    color: '#FF6B35' },
    { tab: 'portfolio',icon: 'fa-circle-dot',      label: 'Portfolio Guidance', desc: 'Exposure & risk assessment',      color: '#00C805' },
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
                <div className="ai-tools-section">
                    <p className="ai-tools-label">AI Research</p>
                    <div className="ai-tools-grid">
                        {AI_TOOLS.map(tool => (
                            <button
                                key={tool.tab}
                                className="ai-tool-card"
                                onClick={() => onNavigateToAiTool(tool.tab)}
                            >
                                <i className={`fas ${tool.icon}`} style={{ color: tool.color, fontSize: '0.9rem', marginBottom: '0.5rem' }} />
                                <div className="ai-tool-title">{tool.label}</div>
                                <div className="ai-tool-desc">{tool.desc}</div>
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

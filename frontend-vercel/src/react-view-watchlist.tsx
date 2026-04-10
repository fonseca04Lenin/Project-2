export {};
import type { WatchlistViewProps } from './types/models';

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

// Watchlist View Component
const WatchlistView = ({ watchlistData, onOpenDetails, onRemove, onAdd, selectedCategory, onCategoryChange, categories, onAddFirstStock, onStockHover, updatingStocks = new Set(), preferences = {} }: WatchlistViewProps) => {
    const [displayCount, setDisplayCount] = useState(12);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
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
    // Reset display count when category changes
    useEffect(() => { setDisplayCount(12); }, [selectedCategory]);

    // Infinite scroll: load 12 more when sentinel enters viewport
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setDisplayCount(prev => prev + 12);
            }
        }, { threshold: 0.1 });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [sentinelRef.current]);

    // Count stocks per category from unfiltered data
    const categoryCounts: Record<string, number> = {};
    watchlistData.forEach(stock => {
        const cat = stock.category || 'General';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    // Filter watchlist based on selected category
    const filteredWatchlist = watchlistData.filter((s) => {
        if (selectedCategory === 'All') return true;
        const stockCategory = (s.category || 'General').toString().trim();
        const selectedCat = selectedCategory.toString().trim();
        return stockCategory.toLowerCase() === selectedCat.toLowerCase();
    });

    return (
        <div className="watchlist-view">
            <div className="view-header">
                <h2>My Watchlist</h2>
                {filteredWatchlist.length > 0 && (
                    <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.875rem', marginLeft: '1rem' }}>
                        {filteredWatchlist.length} {filteredWatchlist.length === 1 ? 'stock' : 'stocks'}
                        {selectedCategory !== 'All' && ` in ${selectedCategory}`}
                    </span>
                )}
            </div>

            {/* Category Filter Buttons */}
            <div className="category-filters" style={{
                display: 'flex',
                gap: '0.5rem',
                padding: '1.5rem 2rem',
                flexWrap: 'wrap',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
                {categories.map(category => {
                    const count = category === 'All'
                        ? watchlistData.length
                        : (categoryCounts[category] || 0);

                    return (
                    <button
                        key={category}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                                if (onCategoryChange) {
                                    onCategoryChange(category);
                                }
                            } catch (error) {
                                // Error changing category
                            }
                        }}
                        className={`filter-btn ${selectedCategory === category ? 'active' : ''}`}
                        style={{
                            padding: '0.625rem 1.25rem',
                            background: selectedCategory === category
                                ? 'linear-gradient(135deg, #00D924, #00B01F)'
                                : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${selectedCategory === category ? 'transparent' : 'rgba(255, 255, 255, 0.1)'}`,
                            borderRadius: '4px',
                            color: selectedCategory === category ? '#000000' : 'rgba(255, 255, 255, 0.7)',
                            fontWeight: selectedCategory === category ? '600' : '500',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            fontSize: '0.875rem'
                        }}
                        onMouseOver={(e) => {
                            if (selectedCategory !== category) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                            }
                        }}
                        onMouseOut={(e) => {
                            if (selectedCategory !== category) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                            }
                        }}
                    >
                        {category}
                        {count > 0 && (
                            <span style={{
                                marginLeft: '0.5rem',
                                opacity: selectedCategory === category ? 1 : 0.6,
                                fontSize: '0.75rem'
                            }}>
                                ({count})
                            </span>
                        )}
                    </button>
                    );
                })}
            </div>

            {/* Show message if no stocks match filter */}
            {filteredWatchlist.length === 0 && selectedCategory !== 'All' && (
                <div style={{
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.5)'
                }}>
                    <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                        No stocks found in <strong>{selectedCategory}</strong> category
                    </p>
                    <p style={{ fontSize: '0.875rem' }}>
                        Try selecting a different category or add stocks to this category
                    </p>
                </div>
            )}

            <div className="watchlist-grid">
                {filteredWatchlist.slice(0, displayCount).map((stock, index) => (
                    <div
                        key={index}
                        className="watchlist-card"
                        data-stock-symbol={stock.symbol}
                        role="group"
                        aria-label={`${stock.symbol} card`}
                        onMouseEnter={() => onStockHover && onStockHover(stock.symbol)}
                    >
                        <div className="card-top">
                            <div className="stock-symbol">{stock.symbol}</div>
                            <button className="more-btn">
                                <i className="fas fa-ellipsis-v"></i>
                            </button>
                        </div>
                        <div className="stock-name">{stock.name}</div>
                        <div className={`stock-price-large ${(stock.change_percent || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {formatStockPrice(stock.current_price || stock.price || 0)}
                        </div>
                        {showPercentChange && (
                        <div className={`stock-change-large ${(stock.change_percent || 0) >= 0 ? 'positive' : 'negative'}`}>
                            <i
                                className={(stock.change_percent || 0) >= 0 ? 'fas fa-arrow-trend-up' : 'fas fa-arrow-trend-down'}
                                style={{
                                    marginRight: '8px',
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    color: (stock.change_percent || 0) >= 0 ? '#00D924' : '#ef4444',
                                    textShadow: (stock.change_percent || 0) >= 0
                                        ? '0 0 10px rgba(0, 217, 36, 0.7), 0 0 15px rgba(0, 217, 36, 0.5)'
                                        : '0 0 10px rgba(239, 68, 68, 0.7), 0 0 15px rgba(239, 68, 68, 0.5)',
                                    display: 'inline-block',
                                    lineHeight: '1'
                                }}
                            />
                            {(stock.change_percent || 0) >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2) || '0.00'}%
                        </div>
                        )}
                        <div className="card-actions">
                            <button className="card-action-btn" onClick={() => onOpenDetails && onOpenDetails(stock.symbol)}>
                                <i className="fas fa-info-circle"></i> Details
                            </button>
                            <button className="card-action-btn" onClick={() => window.viewChart && window.viewChart(stock.symbol)}>
                                <i className="fas fa-chart-line"></i> Chart
                            </button>
                            <button className="card-action-btn" onClick={() => onRemove && onRemove(stock.symbol)}>
                                <i className="fas fa-trash"></i> Remove
                            </button>
                        </div>
                    </div>
                ))}
                {watchlistData.length === 0 && (
                    <div className="empty-watchlist">
                        <i className="fas fa-briefcase"></i>
                        <h3>Your watchlist is empty</h3>
                        <p>Add stocks to start tracking</p>
                        <button className="empty-action-btn" onClick={onAddFirstStock}>
                            Add Your First Stock
                        </button>
                    </div>
                )}
            </div>

            {/* Infinite scroll sentinel */}
            {filteredWatchlist.length > displayCount && (
                <div ref={sentinelRef} style={{ height: '1px', marginTop: '1rem' }} />
            )}
        </div>
    );
};

window.WatchlistView = WatchlistView;

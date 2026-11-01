import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MarketStatus, IndexQuote } from '../../types/models';
import { api } from '../../lib/api';

export function MarketOverview({ marketStatus }: { marketStatus: MarketStatus }) {
    const navigate = useNavigate();
    const [indices, setIndices] = useState<IndexQuote[]>([
        { symbol: '^GSPC', name: 'S&P 500', shortName: 'S&P', price: null, change: null, changePercent: null },
        { symbol: '^IXIC', name: 'NASDAQ', shortName: 'NASDAQ', price: null, change: null, changePercent: null },
        { symbol: '^DJI', name: 'Dow Jones', shortName: 'DOW', price: null, change: null, changePercent: null },
    ]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    useEffect(() => {
        const fetchIndex = async (symbol: string, fallback?: string) => {
            try {
                let data;
                try { data = await api.stocks.company(symbol); } catch { if (fallback) data = await api.stocks.company(fallback); }
                if (!data) return null;
                return {
                    price: data.price || data.currentPrice || data.regularMarketPrice,
                    change: data.change || data.priceChange || 0,
                    changePercent: data.changePercent || data.priceChangePercent || data.percentageChange || 0,
                };
            } catch {
                return null;
            }
        };

        const refresh = async () => {
            const [sp500, nasdaq, dow] = await Promise.all([
                fetchIndex('^GSPC', 'SPY'),
                fetchIndex('^IXIC', 'QQQ'),
                fetchIndex('^DJI', 'DIA'),
            ]);
            setIndices((prev) => [
                { ...prev[0], ...(sp500 || {}) },
                { ...prev[1], ...(nasdaq || {}) },
                { ...prev[2], ...(dow || {}) },
            ]);
            setLastUpdate(new Date());
            setLoading(false);
        };

        refresh();
        const interval = setInterval(refresh, 60000);
        return () => clearInterval(interval);
    }, []);

    const formatPrice = (price: number | null): string =>
        price == null ? '—' : price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const formatChange = (percent: number | null) => {
        if (percent == null) return { text: '—', isPositive: true };
        const isPositive = percent >= 0;
        return { text: `${isPositive ? '+' : ''}${percent.toFixed(2)}%`, isPositive };
    };

    return (
        <div className="market-overview-card">
            <div className="market-overview-header">
                <div className="market-title">
                    <span className="market-label">Markets</span>
                    {marketStatus?.status && (
                        <span className="market-status-badge" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: marketStatus.isOpen ? '#00D924' : 'rgba(255,255,255,0.5)' }}>
                            {marketStatus.status}
                        </span>
                    )}
                </div>
                {lastUpdate && (
                    <span className="market-update-time">
                        {lastUpdate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                )}
            </div>

            <div className="market-indices">
                {indices.map((index) => {
                    const { text, isPositive } = formatChange(index.changePercent);
                    return (
                        <div
                            key={index.symbol}
                            className="market-index-item clickable"
                            onClick={() => navigate(`/stock/${encodeURIComponent(index.symbol)}`, { state: { isFromWatchlist: false } })}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="index-name">{index.shortName}</div>
                            <div className="index-data">
                                {loading ? (
                                    <div className="index-skeleton"></div>
                                ) : (
                                    <>
                                        <span className="index-price">{formatPrice(index.price)}</span>
                                        <span className={`index-change ${isPositive ? 'up' : 'down'}`}>{text}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

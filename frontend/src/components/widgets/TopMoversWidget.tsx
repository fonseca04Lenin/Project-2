import { useEffect, useState } from 'react';
import type { Mover } from '../../types/models';
import { api } from '../../lib/api';
import { events, EVT } from '../../lib/events';
import { SparklineChart } from './SparklineChart';

export function TopMoversWidget() {
    const [movers, setMovers] = useState<Mover[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const json = await api.market.analysis();
                if (!cancelled) setMovers((json.data?.topMovers as Mover[]) || []);
            } catch { /* ignore */ } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const gainers = [...movers].filter((m) => m.change >= 0).sort((a, b) => b.change - a.change);
    const losers = [...movers].filter((m) => m.change < 0).sort((a, b) => a.change - b.change);
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
                <button className={`mover-tab ${tab === 'gainers' ? 'active gainers' : ''}`} onClick={() => setTab('gainers')}>
                    <i className="fas fa-arrow-up"></i> Gainers
                </button>
                <button className={`mover-tab ${tab === 'losers' ? 'active losers' : ''}`} onClick={() => setTab('losers')}>
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
                            <div
                                key={mover.symbol}
                                className="top-mover-row"
                                style={{ cursor: 'pointer' }}
                                onClick={() => events.emit(EVT.STOCK_DETAILS_OPEN, { symbol: mover.symbol })}
                            >
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
}

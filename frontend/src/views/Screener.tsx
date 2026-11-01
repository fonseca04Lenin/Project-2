import { useEffect, useState } from 'react';
import type { ScreenerViewProps, ScreenerRow } from '../types/models';
import { api } from '../lib/api';
import { events, EVT } from '../lib/events';

interface ScreenerMeta {
    label: string;
    fa: string;
    metricKey: string;
    metricLabel: string;
    color: string;
}

const SCREENER_META: Record<string, ScreenerMeta> = {
    'daily-price-jumps': { label: 'Daily Price Jumps', fa: 'fas fa-chart-line', metricKey: 'change_pct', metricLabel: '1D % Chg', color: '#22c55e' },
    'daily-price-dips': { label: 'Daily Price Dips', fa: 'fas fa-arrow-down', metricKey: 'change_pct', metricLabel: '1D % Chg', color: '#ef4444' },
    'upcoming-earnings': { label: 'Upcoming Earnings', fa: 'fas fa-calendar-alt', metricKey: 'earnings_date', metricLabel: 'Earnings Date', color: '#f59e0b' },
    'analyst-picks': { label: 'Analyst Picks', fa: 'fas fa-medal', metricKey: 'buy_score', metricLabel: 'Buy Score', color: '#8b5cf6' },
    'highest-implied-volatility': { label: 'Highest Implied Volatility', fa: 'fas fa-bolt', metricKey: 'implied_volatility', metricLabel: 'Est. IV', color: '#06b6d4' },
};

export default function Screener({ screenerType, onChangeScreener }: ScreenerViewProps) {
    const [results, setResults] = useState<ScreenerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const currentType = (screenerType as keyof typeof SCREENER_META) || 'daily-price-jumps';
    const meta = SCREENER_META[currentType] || SCREENER_META['daily-price-jumps'];

    const fetchScreener = async (type: keyof typeof SCREENER_META) => {
        setLoading(true);
        setError('');
        setResults([]);
        try {
            const data = await api.market.screener(type as any);
            setResults(data.results || []);
        } catch {
            setError('Could not load screener data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchScreener(currentType); }, [currentType]);

    const openDetails = (symbol: string) => events.emit(EVT.STOCK_DETAILS_OPEN, { symbol });

    const formatMetric = (row: ScreenerRow): React.ReactNode => {
        const key = meta.metricKey;
        const val = (row as any)[key];
        if (val === undefined || val === null) return '—';
        if (key === 'change_pct') {
            const n = parseFloat(String(val));
            return <span style={{ color: n >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{(n >= 0 ? '+' : '') + n.toFixed(2) + '%'}</span>;
        }
        if (key === 'implied_volatility') return String(val) + '%';
        if (key === 'buy_score') return (parseFloat(String(val)) * 100).toFixed(0) + '%';
        if (key === 'earnings_date') return String(val);
        return String(val);
    };

    const formatVol = (v: unknown): string => {
        if (!v) return '—';
        const n = Number(v);
        if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return String(v);
    };

    return (
        <div className="screener-view">
            <div className="screener-sidebar">
                <div className="screener-sidebar-title">Stock Screeners</div>
                {Object.entries(SCREENER_META).map(([id, m]) => (
                    <button
                        key={id}
                        className={`screener-sidebar-item ${id === currentType ? 'active' : ''}`}
                        onClick={() => onChangeScreener(id)}
                    >
                        <span className="screener-sidebar-icon" style={{ color: m.color }}><i className={m.fa}></i></span>
                        <span>{m.label}</span>
                    </button>
                ))}
            </div>

            <div className="screener-main">
                <div className="screener-header">
                    <div className="screener-title-row">
                        <span className="screener-title-icon" style={{ color: meta.color }}><i className={meta.fa}></i></span>
                        <div>
                            <h2 className="screener-title">{meta.label}</h2>
                            <p className="screener-subtitle">{loading ? 'Loading...' : `${results.length} results · Updated just now`}</p>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="screener-loading">
                        <i className="fas fa-spinner fa-spin"></i>
                        <span>Loading screener data...</span>
                    </div>
                ) : error ? (
                    <div className="screener-error">{error}</div>
                ) : (
                    <div className="screener-table-wrap">
                        <table className="screener-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Symbol</th>
                                    {currentType !== 'upcoming-earnings' && <th>Price</th>}
                                    <th>{meta.metricLabel}</th>
                                    {currentType !== 'upcoming-earnings' && <th>Volume</th>}
                                    <th>Watch</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((row, i) => (
                                    <tr key={row.symbol || i} className="screener-row">
                                        <td className="screener-rank">{i + 1}</td>
                                        <td className="screener-symbol-cell">
                                            <button className="screener-symbol-btn" onClick={() => openDetails(row.symbol)}>
                                                <span className="screener-sym">{row.symbol}</span>
                                                <span className="screener-name">{row.name || row.symbol}</span>
                                            </button>
                                        </td>
                                        {currentType !== 'upcoming-earnings' && (
                                            <td className="screener-price">{row.price ? '$' + parseFloat(String(row.price)).toFixed(2) : '—'}</td>
                                        )}
                                        <td className="screener-metric">{formatMetric(row)}</td>
                                        {currentType !== 'upcoming-earnings' && (
                                            <td className="screener-volume">{formatVol(row.volume)}</td>
                                        )}
                                        <td>
                                            <button className="screener-watch-btn" onClick={() => openDetails(row.symbol)}>
                                                <i className="fas fa-plus"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

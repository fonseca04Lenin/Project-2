export {};
import type { ScreenerViewProps, ScreenerRow } from './types/models';

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

interface ScreenerMeta {
    label: string;
    fa: string;
    metricKey: string;
    metricLabel: string;
    color: string;
}

// Screener View Component
const SCREENER_META: Record<string, ScreenerMeta> = {
    'daily-price-jumps':           { label: 'Daily Price Jumps',           fa: 'fas fa-chart-line',    metricKey: 'change_pct',         metricLabel: '1D % Chg',     color: '#22c55e' },
    'daily-price-dips':            { label: 'Daily Price Dips',            fa: 'fas fa-arrow-down',    metricKey: 'change_pct',         metricLabel: '1D % Chg',     color: '#ef4444' },
    'upcoming-earnings':           { label: 'Upcoming Earnings',           fa: 'fas fa-calendar-alt',  metricKey: 'earnings_date',      metricLabel: 'Earnings Date', color: '#f59e0b' },
    'analyst-picks':               { label: 'Analyst Picks',               fa: 'fas fa-medal',         metricKey: 'buy_score',          metricLabel: 'Buy Score',    color: '#8b5cf6' },
    'highest-implied-volatility':  { label: 'Highest Implied Volatility',  fa: 'fas fa-bolt',          metricKey: 'implied_volatility', metricLabel: 'Est. IV',      color: '#06b6d4' },
};

const ScreenerView = ({ screenerType, onNavigate, onChangeScreener }: ScreenerViewProps) => {
    const [results, setResults] = useState<ScreenerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const currentType = screenerType || 'daily-price-jumps';
    const meta = SCREENER_META[currentType] || SCREENER_META['daily-price-jumps'];

    const fetchScreener = async (type: string) => {
        setLoading(true);
        setError('');
        setResults([]);
        try {
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const res = await fetch(`${API_BASE}/api/screener/${type}`);
            if (!res.ok) throw new Error('Failed to load screener data');
            const data = await res.json();
            setResults(data.results || []);
        } catch (e) {
            setError('Could not load screener data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchScreener(currentType); }, [currentType]);

    const formatMetric = (row: ScreenerRow): React.ReactNode => {
        const key = meta.metricKey;
        const val = row[key];
        if (val === undefined || val === null) return '—';
        if (key === 'change_pct') {
            const n = parseFloat(String(val));
            return React.createElement('span', { style: { color: n >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 } },
                (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
            );
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

    return React.createElement('div', { className: 'screener-view' },
        React.createElement('div', { className: 'screener-sidebar' },
            React.createElement('div', { className: 'screener-sidebar-title' }, 'Stock Screeners'),
            Object.entries(SCREENER_META).map(([id, m]) =>
                React.createElement('button', {
                    key: id,
                    className: `screener-sidebar-item ${id === currentType ? 'active' : ''}`,
                    onClick: () => { onChangeScreener(id); }
                },
                    React.createElement('span', { className: 'screener-sidebar-icon', style: { color: m.color } },
                        React.createElement('i', { className: m.fa })
                    ),
                    React.createElement('span', null, m.label)
                )
            )
        ),
        React.createElement('div', { className: 'screener-main' },
            React.createElement('div', { className: 'screener-header' },
                React.createElement('div', { className: 'screener-title-row' },
                    React.createElement('span', { className: 'screener-title-icon', style: { color: meta.color } },
                        React.createElement('i', { className: meta.fa })
                    ),
                    React.createElement('div', null,
                        React.createElement('h2', { className: 'screener-title' }, meta.label),
                        React.createElement('p', { className: 'screener-subtitle' },
                            loading ? 'Loading...' : `${results.length} results · Updated just now`
                        )
                    )
                )
            ),
            loading ? React.createElement('div', { className: 'screener-loading' },
                React.createElement('i', { className: 'fas fa-spinner fa-spin' }),
                React.createElement('span', null, 'Loading screener data...')
            ) : error ? React.createElement('div', { className: 'screener-error' }, error)
            : React.createElement('div', { className: 'screener-table-wrap' },
                React.createElement('table', { className: 'screener-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            React.createElement('th', null, '#'),
                            React.createElement('th', null, 'Symbol'),
                            currentType !== 'upcoming-earnings' && React.createElement('th', null, 'Price'),
                            React.createElement('th', null, meta.metricLabel),
                            currentType !== 'upcoming-earnings' && React.createElement('th', null, 'Volume'),
                            React.createElement('th', null, 'Watch'),
                        )
                    ),
                    React.createElement('tbody', null,
                        results.map((row, i) =>
                            React.createElement('tr', { key: row.symbol || i, className: 'screener-row' },
                                React.createElement('td', { className: 'screener-rank' }, i + 1),
                                React.createElement('td', { className: 'screener-symbol-cell' },
                                    React.createElement('button', {
                                        className: 'screener-symbol-btn',
                                        onClick: () => window.openStockDetailsModalReact && window.openStockDetailsModalReact(row.symbol)
                                    },
                                        React.createElement('span', { className: 'screener-sym' }, row.symbol),
                                        React.createElement('span', { className: 'screener-name' }, row.name || row.symbol)
                                    )
                                ),
                                currentType !== 'upcoming-earnings' && React.createElement('td', { className: 'screener-price' },
                                    row.price ? '$' + parseFloat(String(row.price)).toFixed(2) : '—'
                                ),
                                React.createElement('td', { className: 'screener-metric' }, formatMetric(row)),
                                currentType !== 'upcoming-earnings' && React.createElement('td', { className: 'screener-volume' }, formatVol(row.volume)),
                                React.createElement('td', null,
                                    React.createElement('button', {
                                        className: 'screener-watch-btn',
                                        onClick: () => window.openStockDetailsModalReact && window.openStockDetailsModalReact(row.symbol)
                                    }, React.createElement('i', { className: 'fas fa-plus' }))
                                )
                            )
                        )
                    )
                )
            )
        )
    );
};

window.ScreenerView = ScreenerView;

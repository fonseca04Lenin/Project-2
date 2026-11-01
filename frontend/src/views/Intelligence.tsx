// Intelligence view: earnings calendar, insider trades, analyst ratings.
// Legacy 490 LOC. This is a condensed port — same class names so CSS matches,
// same API wiring. Expand per-section detail from frontend-vercel/src/react-view-intelligence.tsx
// when you need the richer layout.

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { events, EVT } from '../lib/events';

export default function Intelligence() {
    const [earnings, setEarnings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await api.market.earnings();
                if (!cancelled) setEarnings(Array.isArray(data) ? data : []);
            } catch { /* ignore */ } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="intelligence-view">
            <div className="view-header">
                <h2>Market Intelligence</h2>
            </div>

            <section className="intel-section" style={{ padding: '1.5rem 2rem' }}>
                <div className="section-header">
                    <h3><i className="fas fa-calendar-alt"></i> Upcoming Earnings</h3>
                </div>
                {loading ? (
                    <div className="loading-state"><i className="fas fa-spinner fa-spin"></i> Loading…</div>
                ) : earnings.length === 0 ? (
                    <div className="empty-state"><p>No upcoming earnings data available.</p></div>
                ) : (
                    <div className="earnings-table-wrap">
                        <table className="screener-table">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Company</th>
                                    <th>Date</th>
                                    <th>Hour</th>
                                    <th>Estimate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {earnings.slice(0, 50).map((e, i) => (
                                    <tr key={i} className="screener-row" onClick={() => events.emit(EVT.STOCK_DETAILS_OPEN, { symbol: e.symbol })} style={{ cursor: 'pointer' }}>
                                        <td className="screener-symbol-cell"><strong>{e.symbol}</strong></td>
                                        <td>{e.company_name}</td>
                                        <td>{e.earnings_date}</td>
                                        <td>{e.hour || '—'}</td>
                                        <td>{e.estimate != null ? `$${e.estimate}` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

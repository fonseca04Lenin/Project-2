// Paper trading. Legacy version is 939 LOC with a full portfolio + order book UI.
// This port covers the core flows (view portfolio, place order, see positions)
// using the real backend endpoints — enough to be usable while the richer legacy
// layout is ported from frontend-vercel/src/react-paper-trading.tsx.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';

export default function PaperTrading() {
    const [portfolio, setPortfolio] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState<{ symbol: string; side: 'buy' | 'sell'; quantity: string; order_type: 'market' | 'limit'; limit_price: string }>({
        symbol: '', side: 'buy', quantity: '1', order_type: 'market', limit_price: '',
    });
    const [submitting, setSubmitting] = useState(false);

    const refresh = async () => {
        try {
            const [p, o] = await Promise.all([
                api.paperTrading.portfolio(),
                api.paperTrading.orders({ limit: 20 }),
            ]);
            setPortfolio(p);
            setOrders(Array.isArray(o) ? o : []);
        } catch (e: any) {
            console.error('paper trading refresh failed:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { refresh(); }, []);

    const placeOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.symbol.trim() || !form.quantity) return;
        setSubmitting(true);
        try {
            const res = await api.paperTrading.placeOrder({
                symbol: form.symbol.trim().toUpperCase(),
                side: form.side,
                quantity: parseFloat(form.quantity),
                order_type: form.order_type,
                limit_price: form.order_type === 'limit' ? parseFloat(form.limit_price) : undefined,
            });
            notify(res.message || 'Order placed', 'success');
            await refresh();
        } catch (err: any) {
            notify(err?.message || 'Order failed', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="loading-state" style={{ padding: '2rem' }}><i className="fas fa-spinner fa-spin"></i> Loading paper trading…</div>;

    return (
        <div className="paper-trading-view" style={{ padding: '1.5rem 2rem' }}>
            <div className="view-header"><h2>Paper Trading</h2></div>

            <div className="pt-grid" style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '1fr 1fr', marginTop: '1.5rem' }}>
                <section className="pt-portfolio">
                    <h3 style={{ marginBottom: '1rem' }}>Portfolio</h3>
                    {portfolio && (
                        <div className="pt-stats" style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '1rem' }}>
                            <div><div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Cash</div><div style={{ fontSize: '1.2rem', fontWeight: 600 }}>${(portfolio.cash || 0).toFixed(2)}</div></div>
                            <div><div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Total value</div><div style={{ fontSize: '1.2rem', fontWeight: 600 }}>${(portfolio.total_value || 0).toFixed(2)}</div></div>
                            <div><div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Buying power</div><div style={{ fontSize: '1.2rem', fontWeight: 600 }}>${(portfolio.buying_power || 0).toFixed(2)}</div></div>
                            <div><div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Positions</div><div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{portfolio.positions?.length || 0}</div></div>
                        </div>
                    )}
                    <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Positions</h4>
                    {portfolio?.positions?.length ? (
                        <table className="screener-table">
                            <thead><tr><th>Symbol</th><th>Qty</th><th>Avg</th><th>Price</th><th>P/L</th></tr></thead>
                            <tbody>
                                {portfolio.positions.map((p: any) => (
                                    <tr key={p.symbol} className="screener-row">
                                        <td><strong>{p.symbol}</strong></td>
                                        <td>{p.qty}</td>
                                        <td>${(p.avg_price || 0).toFixed(2)}</td>
                                        <td>${(p.current_price || 0).toFixed(2)}</td>
                                        <td style={{ color: (p.unrealized_pl || 0) >= 0 ? '#00D924' : '#ef4444' }}>${(p.unrealized_pl || 0).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <p style={{ color: 'rgba(255,255,255,0.5)' }}>No positions yet.</p>}
                </section>

                <section className="pt-order">
                    <h3 style={{ marginBottom: '1rem' }}>Place order</h3>
                    <form onSubmit={placeOrder} className="pt-form" style={{ display: 'grid', gap: '0.75rem', maxWidth: '360px' }}>
                        <input className="search-input" placeholder="SYMBOL" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
                        <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as 'buy' | 'sell' })} className="search-input">
                            <option value="buy">Buy</option>
                            <option value="sell">Sell</option>
                        </select>
                        <input className="search-input" type="number" step="0.01" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                        <select value={form.order_type} onChange={(e) => setForm({ ...form, order_type: e.target.value as 'market' | 'limit' })} className="search-input">
                            <option value="market">Market</option>
                            <option value="limit">Limit</option>
                        </select>
                        {form.order_type === 'limit' && (
                            <input className="search-input" type="number" step="0.01" placeholder="Limit price" value={form.limit_price} onChange={(e) => setForm({ ...form, limit_price: e.target.value })} />
                        )}
                        <button type="submit" className="search-btn" disabled={submitting}>
                            {submitting ? <><i className="fas fa-spinner fa-spin" /> Placing…</> : `Place ${form.side.toUpperCase()}`}
                        </button>
                    </form>

                    <h4 style={{ margin: '1.5rem 0 0.5rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Recent orders</h4>
                    {orders.length ? (
                        <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>
                            {orders.slice(0, 10).map((o: any) => (
                                <li key={o.id || o.order_id} style={{ padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    {o.symbol} — {o.side} {o.quantity} @ {o.order_type} <span style={{ opacity: 0.6 }}>({o.status})</span>
                                </li>
                            ))}
                        </ul>
                    ) : <p style={{ color: 'rgba(255,255,255,0.5)' }}>No orders yet.</p>}
                </section>
            </div>
        </div>
    );
}

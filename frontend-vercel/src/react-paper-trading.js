// Paper Trading View — AI Stock Sage
// Phases 1-3: Portfolio, Orders, Analytics & History Chart

(function() {
    const { useState, useEffect, useRef, useCallback } = React;

    const API_BASE = () => window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
    const STARTING_BALANCE = 100000;

    // ---------------------------------------------------------------- //
    // Utilities                                                          //
    // ---------------------------------------------------------------- //

    const fmt = {
        currency: (n, compact = false) => {
            if (n == null || isNaN(n)) return '—';
            if (compact && Math.abs(n) >= 1000) {
                return (n >= 0 ? '' : '-') + '$' + (Math.abs(n) / 1000).toFixed(1) + 'k';
            }
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
        },
        pct: (n) => {
            if (n == null || isNaN(n)) return '—';
            return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
        },
        shares: (n) => {
            if (n == null || isNaN(n)) return '—';
            return Number.isInteger(n) ? n.toString() : n.toFixed(4);
        },
        date: (s) => {
            if (!s) return '—';
            try {
                return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } catch { return s; }
        },
        time: (s) => {
            if (!s) return '—';
            try {
                return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch { return s; }
        },
    };

    const pnlClass = (n) => (n > 0 ? 'pt-positive' : n < 0 ? 'pt-negative' : 'pt-neutral');

    // ---------------------------------------------------------------- //
    // API helpers                                                        //
    // ---------------------------------------------------------------- //

    async function authFetch(path, options = {}) {
        const headers = await window.AppAuth.getAuthHeaders();
        return fetch(API_BASE() + path, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...headers, ...(options.headers || {}) },
            credentials: 'include',
        });
    }

    // ---------------------------------------------------------------- //
    // Portfolio History Chart                                            //
    // ---------------------------------------------------------------- //

    const PortfolioChart = ({ history, initialBalance }) => {
        const canvasRef = useRef(null);
        const chartRef = useRef(null);

        useEffect(() => {
            if (!canvasRef.current || !history || history.length < 2) return;

            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }

            const labels = history.map(h => {
                try { return new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
                catch { return h.date || ''; }
            });
            const values = history.map(h => h.total_value || 0);
            const endValue = values[values.length - 1];
            const isPositive = endValue >= initialBalance;
            const lineColor = isPositive ? '#00D924' : '#ef4444';

            const ctx = canvasRef.current.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 240);
            gradient.addColorStop(0, isPositive ? 'rgba(0,217,36,0.18)' : 'rgba(239,68,68,0.18)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');

            chartRef.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        data: values,
                        borderColor: lineColor,
                        borderWidth: 2,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: lineColor,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => fmt.currency(ctx.parsed.y),
                            },
                            backgroundColor: 'rgba(10,10,10,0.92)',
                            titleColor: '#999',
                            bodyColor: '#fff',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                        },
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(255,255,255,0.04)' },
                            ticks: { color: '#666', maxTicksLimit: 8, font: { size: 11 } },
                        },
                        y: {
                            grid: { color: 'rgba(255,255,255,0.04)' },
                            ticks: {
                                color: '#666',
                                font: { size: 11 },
                                callback: v => '$' + (v / 1000).toFixed(0) + 'k',
                            },
                        },
                    },
                    interaction: { mode: 'index', intersect: false },
                },
            });

            return () => {
                if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
            };
        }, [history, initialBalance]);

        if (!history || history.length < 2) {
            return (
                <div className="pt-chart-empty">
                    <i className="fas fa-chart-line"></i>
                    <p>Place your first trade to start tracking portfolio performance</p>
                </div>
            );
        }

        return <canvas ref={canvasRef} style={{ width: '100%', height: '260px' }} />;
    };

    // ---------------------------------------------------------------- //
    // Trade Form                                                         //
    // ---------------------------------------------------------------- //

    const TradeForm = ({ onOrderPlaced, portfolioSummary }) => {
        const [symbol, setSymbol] = useState('');
        const [side, setSide] = useState('buy');
        const [quantity, setQuantity] = useState('');
        const [orderType, setOrderType] = useState('market');
        const [limitPrice, setLimitPrice] = useState('');
        const [stockInfo, setStockInfo] = useState(null);
        const [loading, setLoading] = useState(false);
        const [submitting, setSubmitting] = useState(false);
        const [error, setError] = useState('');
        const [suggestions, setSuggestions] = useState([]);
        const [showSuggestions, setShowSuggestions] = useState(false);
        const debounceRef = useRef(null);
        const suggestionsRef = useRef(null);

        const estimatedCost = () => {
            const qty = parseFloat(quantity);
            const price = orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : stockInfo?.price;
            if (!qty || !price || isNaN(qty) || isNaN(price)) return null;
            return qty * price;
        };

        const cash = portfolioSummary?.cash_balance || 0;
        const est = estimatedCost();
        const isAffordable = side === 'sell' || !est || est <= cash;

        // Search suggestions
        const searchSymbol = useCallback(async (query) => {
            if (query.length < 1) { setSuggestions([]); return; }
            try {
                const headers = await window.AppAuth.getAuthHeaders();
                const r = await fetch(`${API_BASE()}/api/search/stocks?q=${encodeURIComponent(query)}&limit=5`, {
                    headers, credentials: 'include'
                });
                if (r.ok) {
                    const data = await r.json();
                    setSuggestions(Array.isArray(data) ? data.slice(0, 5) : []);
                }
            } catch { setSuggestions([]); }
        }, []);

        const handleSymbolChange = (val) => {
            setSymbol(val.toUpperCase());
            setStockInfo(null);
            setError('');
            clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => searchSymbol(val), 300);
            setShowSuggestions(true);
        };

        const selectSuggestion = (s) => {
            const sym = (s.symbol || s.ticker || '').toUpperCase();
            setSymbol(sym);
            setSuggestions([]);
            setShowSuggestions(false);
            fetchStockPrice(sym);
        };

        const fetchStockPrice = async (sym) => {
            if (!sym) return;
            setLoading(true);
            setError('');
            try {
                const r = await authFetch('/api/search', {
                    method: 'POST',
                    body: JSON.stringify({ symbol: sym }),
                });
                if (r.ok) {
                    const data = await r.json();
                    setStockInfo({ symbol: sym, price: data.price || data.current_price, name: data.name || data.company_name || sym });
                } else {
                    setError(`Could not find "${sym}"`);
                    setStockInfo(null);
                }
            } catch {
                setError('Network error fetching price');
                setStockInfo(null);
            } finally {
                setLoading(false);
            }
        };

        const handleSymbolBlur = () => {
            setTimeout(() => setShowSuggestions(false), 150);
            if (symbol && !stockInfo) fetchStockPrice(symbol);
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!symbol || !quantity || (!stockInfo && orderType === 'market')) {
                setError('Please fill in all required fields');
                return;
            }
            setSubmitting(true);
            setError('');
            try {
                const body = {
                    symbol,
                    side,
                    quantity: parseFloat(quantity),
                    order_type: orderType,
                };
                if (orderType === 'limit' && limitPrice) {
                    body.limit_price = parseFloat(limitPrice);
                }
                const r = await authFetch('/api/paper-trading/orders', { method: 'POST', body: JSON.stringify(body) });
                const data = await r.json();
                if (r.ok && data.success) {
                    window.showNotification && window.showNotification(data.message, 'success');
                    setSymbol('');
                    setQuantity('');
                    setLimitPrice('');
                    setStockInfo(null);
                    setSide('buy');
                    onOrderPlaced && onOrderPlaced();
                } else {
                    setError(data.error || data.message || 'Order failed');
                }
            } catch {
                setError('Network error placing order');
            } finally {
                setSubmitting(false);
            }
        };

        // Sell position shortcut
        useEffect(() => {
            const handler = (e) => {
                const { symbol: sym, side: s, quantity: q } = e.detail || {};
                if (sym) { setSymbol(sym); fetchStockPrice(sym); }
                if (s) setSide(s);
                if (q) setQuantity(String(q));
            };
            window.addEventListener('pt:prefill', handler);
            return () => window.removeEventListener('pt:prefill', handler);
        }, []);

        return (
            <form className="pt-trade-form" onSubmit={handleSubmit}>
                <h3 className="pt-form-title">Place Order</h3>

                {/* Buy / Sell Toggle */}
                <div className="pt-side-toggle">
                    <button type="button" className={`pt-side-btn ${side === 'buy' ? 'active-buy' : ''}`} onClick={() => setSide('buy')}>Buy</button>
                    <button type="button" className={`pt-side-btn ${side === 'sell' ? 'active-sell' : ''}`} onClick={() => setSide('sell')}>Sell</button>
                </div>

                {/* Symbol */}
                <div className="pt-field" style={{ position: 'relative' }}>
                    <label>Symbol</label>
                    <input
                        type="text"
                        placeholder="e.g. AAPL"
                        value={symbol}
                        onChange={e => handleSymbolChange(e.target.value)}
                        onBlur={handleSymbolBlur}
                        onFocus={() => symbol && setShowSuggestions(true)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="pt-suggestions" ref={suggestionsRef}>
                            {suggestions.map((s, i) => (
                                <div key={i} className="pt-suggestion-item" onMouseDown={() => selectSuggestion(s)}>
                                    <span className="pt-sugg-sym">{s.symbol || s.ticker}</span>
                                    <span className="pt-sugg-name">{s.name || s.description || ''}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Stock price info */}
                {loading && <div className="pt-price-preview"><span className="pt-price-loading">Fetching price…</span></div>}
                {stockInfo && !loading && (
                    <div className="pt-price-preview">
                        <span className="pt-price-name">{stockInfo.name}</span>
                        <span className="pt-price-val">{fmt.currency(stockInfo.price)}</span>
                    </div>
                )}

                {/* Quantity */}
                <div className="pt-field">
                    <label>Shares</label>
                    <input type="number" placeholder="0" min="0.001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>

                {/* Order Type */}
                <div className="pt-field">
                    <label>Order Type</label>
                    <div className="pt-order-type-toggle">
                        <button type="button" className={`pt-type-btn ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Market</button>
                        <button type="button" className={`pt-type-btn ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Limit</button>
                    </div>
                </div>

                {orderType === 'limit' && (
                    <div className="pt-field">
                        <label>Limit Price</label>
                        <input type="number" placeholder="0.00" min="0.01" step="0.01" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} />
                    </div>
                )}

                {/* Cost estimate */}
                {est != null && (
                    <div className={`pt-cost-estimate ${!isAffordable ? 'pt-cost-insufficient' : ''}`}>
                        <span>{side === 'buy' ? 'Estimated Cost' : 'Estimated Proceeds'}</span>
                        <span className="pt-cost-val">{fmt.currency(est)}</span>
                        {!isAffordable && <span className="pt-cost-warn">Insufficient cash ({fmt.currency(cash)} available)</span>}
                    </div>
                )}

                {error && <div className="pt-form-error">{error}</div>}

                <button type="submit" className={`pt-submit-btn ${side === 'sell' ? 'sell' : ''}`} disabled={submitting || (!stockInfo && orderType === 'market')}>
                    {submitting ? 'Placing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || 'Stock'}`}
                </button>

                <div className="pt-cash-note">
                    <i className="fas fa-wallet"></i> {fmt.currency(cash)} available
                </div>
            </form>
        );
    };

    // ---------------------------------------------------------------- //
    // Positions Table                                                    //
    // ---------------------------------------------------------------- //

    const PositionsTable = ({ positions }) => {
        if (!positions || positions.length === 0) {
            return (
                <div className="pt-empty-state">
                    <i className="fas fa-layer-group"></i>
                    <p>No open positions</p>
                    <span>Use the trade form to buy your first stock</span>
                </div>
            );
        }

        const handleSellAll = (pos) => {
            window.dispatchEvent(new CustomEvent('pt:prefill', { detail: { symbol: pos.symbol, side: 'sell', quantity: pos.shares } }));
            document.querySelector('.pt-trade-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };

        return (
            <div className="pt-positions-wrapper">
                <table className="pt-positions-table">
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Shares</th>
                            <th>Avg Cost</th>
                            <th>Current</th>
                            <th>Market Value</th>
                            <th>P&amp;L</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {positions.map(pos => (
                            <tr key={pos.symbol} className="pt-position-row">
                                <td>
                                    <div className="pt-pos-symbol">{pos.symbol}</div>
                                    <div className="pt-pos-name">{(pos.company_name || '').split(' ').slice(0, 3).join(' ')}</div>
                                </td>
                                <td>{fmt.shares(pos.shares)}</td>
                                <td>{fmt.currency(pos.avg_cost)}</td>
                                <td>{fmt.currency(pos.current_price)}</td>
                                <td>{fmt.currency(pos.market_value)}</td>
                                <td>
                                    <div className={pnlClass(pos.unrealized_pnl)}>
                                        <div>{fmt.currency(pos.unrealized_pnl)}</div>
                                        <div className="pt-pnl-pct">{fmt.pct(pos.unrealized_pnl_pct)}</div>
                                    </div>
                                </td>
                                <td>
                                    <button className="pt-sell-btn" onClick={() => handleSellAll(pos)} title="Sell position">
                                        <i className="fas fa-sign-out-alt"></i>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // ---------------------------------------------------------------- //
    // Trade History Table                                               //
    // ---------------------------------------------------------------- //

    const TradeHistoryTable = ({ trades }) => {
        if (!trades || trades.length === 0) {
            return (
                <div className="pt-empty-state">
                    <i className="fas fa-history"></i>
                    <p>No trades yet</p>
                </div>
            );
        }

        return (
            <div className="pt-positions-wrapper">
                <table className="pt-positions-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Symbol</th>
                            <th>Side</th>
                            <th>Shares</th>
                            <th>Price</th>
                            <th>Total</th>
                            <th>P&amp;L</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trades.map(t => (
                            <tr key={t.id} className="pt-trade-row">
                                <td className="pt-date-cell">{fmt.time(t.timestamp)}</td>
                                <td><span className="pt-pos-symbol">{t.symbol}</span></td>
                                <td>
                                    <span className={`pt-side-badge ${t.side}`}>{t.side?.toUpperCase()}</span>
                                </td>
                                <td>{fmt.shares(t.quantity)}</td>
                                <td>{fmt.currency(t.price)}</td>
                                <td>{fmt.currency(t.total_value)}</td>
                                <td>
                                    {t.side === 'sell' ? (
                                        <span className={pnlClass(t.realized_pnl)}>{fmt.currency(t.realized_pnl)}</span>
                                    ) : <span className="pt-neutral">—</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // ---------------------------------------------------------------- //
    // Orders Table                                                      //
    // ---------------------------------------------------------------- //

    const OrdersTable = ({ orders, onCancel }) => {
        if (!orders || orders.length === 0) {
            return (
                <div className="pt-empty-state">
                    <i className="fas fa-list-alt"></i>
                    <p>No orders</p>
                </div>
            );
        }

        return (
            <div className="pt-positions-wrapper">
                <table className="pt-positions-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Symbol</th>
                            <th>Side</th>
                            <th>Type</th>
                            <th>Shares</th>
                            <th>Price</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map(o => (
                            <tr key={o.id} className="pt-trade-row">
                                <td className="pt-date-cell">{fmt.time(o.created_at)}</td>
                                <td><span className="pt-pos-symbol">{o.symbol}</span></td>
                                <td><span className={`pt-side-badge ${o.side}`}>{o.side?.toUpperCase()}</span></td>
                                <td className="pt-type-cell">{o.order_type}</td>
                                <td>{fmt.shares(o.quantity)}</td>
                                <td>{o.fill_price ? fmt.currency(o.fill_price) : o.limit_price ? fmt.currency(o.limit_price) + ' (limit)' : '—'}</td>
                                <td><span className={`pt-status-badge ${o.status}`}>{o.status}</span></td>
                                <td>
                                    {o.status === 'pending' && (
                                        <button className="pt-cancel-btn" onClick={() => onCancel(o.id)} title="Cancel order">
                                            <i className="fas fa-times"></i>
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // ---------------------------------------------------------------- //
    // Analytics Panel                                                   //
    // ---------------------------------------------------------------- //

    const AnalyticsPanel = ({ analytics }) => {
        if (!analytics) return null;

        const stats = [
            { label: 'Total Trades', value: analytics.total_trades || 0, icon: 'fa-exchange-alt' },
            { label: 'Win Rate', value: analytics.total_sells > 0 ? fmt.pct(analytics.win_rate) : '—', icon: 'fa-trophy', className: analytics.win_rate >= 50 ? 'pt-positive' : analytics.total_sells > 0 ? 'pt-negative' : '' },
            { label: 'Realized P&L', value: fmt.currency(analytics.realized_pnl), icon: 'fa-dollar-sign', className: pnlClass(analytics.realized_pnl) },
            { label: 'Avg Win', value: analytics.avg_win ? fmt.currency(analytics.avg_win) : '—', icon: 'fa-arrow-up', className: 'pt-positive' },
            { label: 'Avg Loss', value: analytics.avg_loss ? fmt.currency(analytics.avg_loss) : '—', icon: 'fa-arrow-down', className: 'pt-negative' },
        ];

        return (
            <div className="pt-analytics-grid">
                {stats.map((s, i) => (
                    <div key={i} className="pt-analytics-card">
                        <div className="pt-analytics-icon"><i className={`fas ${s.icon}`}></i></div>
                        <div className="pt-analytics-body">
                            <div className={`pt-analytics-value ${s.className || ''}`}>{s.value}</div>
                            <div className="pt-analytics-label">{s.label}</div>
                        </div>
                    </div>
                ))}
                {analytics.best_trade && (
                    <div className="pt-analytics-card">
                        <div className="pt-analytics-icon"><i className="fas fa-star"></i></div>
                        <div className="pt-analytics-body">
                            <div className="pt-analytics-value pt-positive">{fmt.currency(analytics.best_trade.realized_pnl)}</div>
                            <div className="pt-analytics-label">Best Trade ({analytics.best_trade.symbol})</div>
                        </div>
                    </div>
                )}
                {analytics.worst_trade && (
                    <div className="pt-analytics-card">
                        <div className="pt-analytics-icon"><i className="fas fa-arrow-alt-circle-down"></i></div>
                        <div className="pt-analytics-body">
                            <div className="pt-analytics-value pt-negative">{fmt.currency(analytics.worst_trade.realized_pnl)}</div>
                            <div className="pt-analytics-label">Worst Trade ({analytics.worst_trade.symbol})</div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ---------------------------------------------------------------- //
    // Main Paper Trading View                                           //
    // ---------------------------------------------------------------- //

    const PaperTradingView = () => {
        const [portfolio, setPortfolio] = useState(null);
        const [trades, setTrades] = useState([]);
        const [orders, setOrders] = useState([]);
        const [history, setHistory] = useState([]);
        const [analytics, setAnalytics] = useState(null);
        const [loading, setLoading] = useState(true);
        const [activeTab, setActiveTab] = useState('trades');
        const [resetting, setResetting] = useState(false);
        const [showResetConfirm, setShowResetConfirm] = useState(false);
        const refreshIntervalRef = useRef(null);

        const loadPortfolio = useCallback(async () => {
            try {
                const r = await authFetch('/api/paper-trading/portfolio');
                if (r.ok) setPortfolio(await r.json());
            } catch (e) {
                console.error('Paper trading: failed to load portfolio', e);
            } finally {
                setLoading(false);
            }
        }, []);

        const loadTrades = useCallback(async () => {
            try {
                const r = await authFetch('/api/paper-trading/trades?limit=50');
                if (r.ok) setTrades(await r.json());
            } catch {}
        }, []);

        const loadOrders = useCallback(async () => {
            try {
                const r = await authFetch('/api/paper-trading/orders?limit=50');
                if (r.ok) setOrders(await r.json());
            } catch {}
        }, []);

        const loadHistory = useCallback(async () => {
            try {
                const r = await authFetch('/api/paper-trading/history');
                if (r.ok) setHistory(await r.json());
            } catch {}
        }, []);

        const loadAnalytics = useCallback(async () => {
            try {
                const r = await authFetch('/api/paper-trading/analytics');
                if (r.ok) setAnalytics(await r.json());
            } catch {}
        }, []);

        const loadAll = useCallback(() => {
            loadPortfolio();
            loadTrades();
            loadOrders();
            loadHistory();
            loadAnalytics();
        }, [loadPortfolio, loadTrades, loadOrders, loadHistory, loadAnalytics]);

        useEffect(() => {
            loadAll();
            // Refresh portfolio every 60s for live P&L
            refreshIntervalRef.current = setInterval(loadPortfolio, 60000);
            return () => clearInterval(refreshIntervalRef.current);
        }, []);

        const handleOrderPlaced = () => {
            loadAll();
        };

        const handleCancelOrder = async (orderId) => {
            try {
                const r = await authFetch(`/api/paper-trading/orders/${orderId}`, { method: 'DELETE' });
                const data = await r.json();
                if (r.ok && data.success) {
                    window.showNotification && window.showNotification('Order cancelled', 'success');
                    loadOrders();
                } else {
                    window.showNotification && window.showNotification(data.error || 'Could not cancel order', 'error');
                }
            } catch {
                window.showNotification && window.showNotification('Network error', 'error');
            }
        };

        const handleReset = async () => {
            setResetting(true);
            try {
                const r = await authFetch('/api/paper-trading/reset', { method: 'POST' });
                const data = await r.json();
                if (r.ok && data.success) {
                    window.showNotification && window.showNotification(data.message, 'success');
                    setShowResetConfirm(false);
                    loadAll();
                } else {
                    window.showNotification && window.showNotification('Reset failed', 'error');
                }
            } catch {
                window.showNotification && window.showNotification('Network error', 'error');
            } finally {
                setResetting(false);
            }
        };

        if (loading) {
            return (
                <div className="pt-loading">
                    <div className="pt-spinner"></div>
                    <span>Loading portfolio…</span>
                </div>
            );
        }

        const totalReturn = portfolio?.total_return ?? 0;
        const totalReturnPct = portfolio?.total_return_pct ?? 0;
        const unrealizedPnl = portfolio?.unrealized_pnl ?? 0;
        const initialBalance = portfolio?.initial_balance || STARTING_BALANCE;

        // Stat cards
        const statCards = [
            {
                label: 'Portfolio Value',
                value: fmt.currency(portfolio?.total_value),
                icon: 'fa-briefcase',
                sub: null,
            },
            {
                label: 'Cash Available',
                value: fmt.currency(portfolio?.cash_balance),
                icon: 'fa-wallet',
                sub: null,
            },
            {
                label: 'Total Return',
                value: fmt.currency(totalReturn),
                icon: 'fa-chart-line',
                sub: fmt.pct(totalReturnPct),
                className: pnlClass(totalReturn),
            },
            {
                label: 'Unrealized P&L',
                value: fmt.currency(unrealizedPnl),
                icon: 'fa-layer-group',
                sub: portfolio?.positions?.length ? `${portfolio.positions.length} position${portfolio.positions.length !== 1 ? 's' : ''}` : 'No positions',
                className: pnlClass(unrealizedPnl),
            },
        ];

        return (
            <div className="pt-view">
                {/* Header */}
                <div className="pt-view-header">
                    <div>
                        <h2 className="pt-view-title">
                            <i className="fas fa-flask"></i> Paper Trading
                        </h2>
                        <p className="pt-view-subtitle">Practice trading with ${(STARTING_BALANCE / 1000).toFixed(0)}k virtual money. No real funds at risk.</p>
                    </div>
                    <button className="pt-reset-btn" onClick={() => setShowResetConfirm(true)}>
                        <i className="fas fa-redo"></i> Reset Portfolio
                    </button>
                </div>

                {/* Stat Cards */}
                <div className="pt-stats-grid">
                    {statCards.map((card, i) => (
                        <div key={i} className="pt-stat-card">
                            <div className="pt-stat-icon"><i className={`fas ${card.icon}`}></i></div>
                            <div className="pt-stat-body">
                                <div className="pt-stat-label">{card.label}</div>
                                <div className={`pt-stat-value ${card.className || ''}`}>{card.value}</div>
                                {card.sub && <div className={`pt-stat-sub ${card.className || ''}`}>{card.sub}</div>}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Content: Trade Form + Positions */}
                <div className="pt-main-grid">
                    <div className="pt-panel">
                        <h3 className="pt-panel-title"><i className="fas fa-layer-group"></i> Open Positions</h3>
                        <PositionsTable positions={portfolio?.positions || []} />
                    </div>
                    <div className="pt-panel pt-form-panel">
                        <TradeForm onOrderPlaced={handleOrderPlaced} portfolioSummary={portfolio} />
                    </div>
                </div>

                {/* Bottom Tabs: History | Chart | Analytics | Orders */}
                <div className="pt-panel pt-bottom-panel">
                    <div className="pt-inner-tabs">
                        {[
                            { key: 'trades', label: 'Trade History', icon: 'fa-history' },
                            { key: 'chart', label: 'Portfolio Chart', icon: 'fa-chart-area' },
                            { key: 'analytics', label: 'Performance', icon: 'fa-tachometer-alt' },
                            { key: 'orders', label: 'All Orders', icon: 'fa-list-alt' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                className={`pt-inner-tab ${activeTab === tab.key ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                <i className={`fas ${tab.icon}`}></i> {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="pt-tab-content">
                        {activeTab === 'trades' && <TradeHistoryTable trades={trades} />}
                        {activeTab === 'chart' && (
                            <div className="pt-chart-wrapper">
                                <PortfolioChart history={history} initialBalance={initialBalance} />
                            </div>
                        )}
                        {activeTab === 'analytics' && <AnalyticsPanel analytics={analytics} />}
                        {activeTab === 'orders' && <OrdersTable orders={orders} onCancel={handleCancelOrder} />}
                    </div>
                </div>

                {/* Reset Confirmation Modal */}
                {showResetConfirm && ReactDOM.createPortal(
                    <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
                        <div className="modal-content pt-reset-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2><i className="fas fa-exclamation-triangle"></i> Reset Portfolio</h2>
                                <button className="modal-close" onClick={() => setShowResetConfirm(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }}>
                                    This will permanently delete all positions, orders, and trade history, and restart with a fresh ${(STARTING_BALANCE / 1000).toFixed(0)}k balance.
                                </p>
                                <p style={{ color: '#ef4444', fontWeight: 600 }}>This action cannot be undone.</p>
                            </div>
                            <div className="modal-footer">
                                <button className="btn-secondary" onClick={() => setShowResetConfirm(false)}>Cancel</button>
                                <button
                                    className="pt-confirm-reset-btn"
                                    onClick={handleReset}
                                    disabled={resetting}
                                >
                                    {resetting ? 'Resetting…' : 'Reset Portfolio'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        );
    };

    window.PaperTradingView = PaperTradingView;
})();

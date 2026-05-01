export {};
import type { StockItem } from './types/models';

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

// ============================================================
const AISuiteView = ({ watchlistData, defaultTab = 'brief', onTabChange }: { watchlistData: StockItem[]; defaultTab?: string; onTabChange?: (tab: string) => void }) => {
    const [activeTab, setActiveTab] = useState(defaultTab);

    useEffect(() => { setActiveTab(defaultTab); }, [defaultTab]);

    const switchTab = (tab: string) => { setActiveTab(tab); onTabChange?.(tab); };

    const withAuth = async () => {
        const authHeaders = await getAuthHeaders();
        const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
        return { authHeaders, API_BASE };
    };

    const UpgradeGate = ({ message }: { message: string }) => (
        <div style={{
            textAlign: 'center',
            padding: '3rem 2rem',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.06)',
        }}>
            <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFB800, #FF6B35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: 22,
            }}>
                <i className="fas fa-crown"></i>
            </div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>
                Pro Feature
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.87rem', maxWidth: 360, margin: '0 auto 20px', lineHeight: 1.6 }}>
                {message}
            </div>
            <button
                onClick={() => window.showUpgradeModal && window.showUpgradeModal(message)}
                style={{
                    background: 'linear-gradient(135deg, #00D4AA, #00A878)',
                    color: '#000', border: 'none', borderRadius: 10,
                    padding: '10px 24px', fontWeight: 700, fontSize: '0.9rem',
                    cursor: 'pointer',
                }}
            >
                <i className="fas fa-bolt" style={{ marginRight: 6 }}></i>
                Upgrade to Pro — 7-day free trial
            </button>
        </div>
    );

    const SkeletonBlock = ({ height = '1.2rem', width = '100%', style = {} }: { height?: string; width?: string; style?: React.CSSProperties }) => (
        <div style={{
            height,
            width,
            borderRadius: '6px',
            background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            ...style
        }} />
    );

    // ── Morning Brief Tab ────────────────────────────────────
    const MorningBriefTab = () => {
        const [loading, setLoading] = useState(false);
        const [data, setData] = useState<Record<string, unknown> | null>(null);
        const [error, setError] = useState('');

        useEffect(() => { loadBrief(); }, []);

        const loadBrief = async (refresh = false) => {
            if (!watchlistData || watchlistData.length === 0) return;
            setLoading(true); setError('');
            try {
                const { authHeaders, API_BASE } = await withAuth();
                const url = `${API_BASE}/api/ai/morning-brief${refresh ? '?refresh=1' : ''}`;
                const r = await fetch(url, { headers: authHeaders, credentials: 'include' });
                if (r.status === 403) {
                    const j = await r.json().catch(() => ({}));
                    if (j.error === 'upgrade_required') { setError('upgrade_required'); return; }
                }
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || 'Failed to load');
                }
                const j = await r.json();
                setData(j.brief || null);
            } catch (e) {
                setError((e as Error).message || 'Unable to load morning brief');
            } finally {
                setLoading(false);
            }
        };

        if (!watchlistData || watchlistData.length === 0) {
            return (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.5)' }}>
                    <i className="fas fa-plus-circle" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block' }}></i>
                    Add stocks to your watchlist to get a personalized morning brief.
                </div>
            );
        }

        const briefData = data as { date_label?: string; narrative?: string; movers?: {symbol: string; change: number; price: number}[]; earnings_this_week?: {symbol: string; date: string}[] } | null;

        return (
            <div style={{ maxWidth: '820px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>
                            <i className="fas fa-newspaper" style={{ color: '#00D924', marginRight: '0.5rem' }}></i>
                            Morning Brief
                        </h3>
                        {briefData && <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{briefData.date_label}</span>}
                    </div>
                    <button className="search-btn" onClick={() => loadBrief(true)} disabled={loading} style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}>
                        <i className="fas fa-sync-alt" style={{ marginRight: '0.4rem' }}></i>Refresh
                    </button>
                </div>

                {error === 'upgrade_required' ? (
                    <UpgradeGate message="Morning Brief gives you a personalized daily AI briefing on your watchlist's top movers and upcoming earnings." />
                ) : error && (
                    <div style={{ color: '#FF6B35', marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,107,53,0.1)', borderRadius: '8px' }}>{error}</div>
                )}

                {error !== 'upgrade_required' && (
                <div className="intel-card" style={{ marginBottom: '1rem' }}>
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <SkeletonBlock height="1rem" width="60%" />
                            <SkeletonBlock height="1rem" />
                            <SkeletonBlock height="1rem" />
                            <SkeletonBlock height="1rem" width="80%" />
                        </div>
                    ) : briefData ? (
                        <p style={{ margin: 0, lineHeight: 1.7, color: 'rgba(255,255,255,0.85)', fontSize: '0.95rem' }}>
                            {briefData.narrative}
                        </p>
                    ) : null}
                </div>
                )}

                {!loading && briefData && briefData.movers && briefData.movers.length > 0 && (
                    <div className="intel-card" style={{ marginBottom: '1rem' }}>
                        <div className="intel-header" style={{ marginBottom: '0.75rem' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>
                                <i className="fas fa-bolt" style={{ color: '#FFB800', marginRight: '0.4rem' }}></i>Top Movers
                            </h4>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {briefData.movers.map((m, i) => (
                                <div key={i} style={{
                                    padding: '0.6rem 1rem',
                                    background: 'rgba(255,255,255,0.04)',
                                    borderRadius: '8px',
                                    borderLeft: `3px solid ${m.change >= 0 ? '#00D924' : '#FF6B35'}`,
                                    minWidth: '120px'
                                }}>
                                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>{m.symbol}</div>
                                    <div style={{ color: m.change >= 0 ? '#00D924' : '#FF6B35', fontSize: '0.85rem', fontWeight: 600 }}>
                                        {m.change >= 0 ? '+' : ''}{m.change}%
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>${m.price}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!loading && briefData && briefData.earnings_this_week && briefData.earnings_this_week.length > 0 && (
                    <div className="intel-card" style={{ marginBottom: '1rem' }}>
                        <div className="intel-header" style={{ marginBottom: '0.75rem' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>
                                <i className="fas fa-calendar-check" style={{ color: '#00D924', marginRight: '0.4rem' }}></i>Earnings This Week
                            </h4>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {briefData.earnings_this_week.map((e, i) => (
                                <span key={i} style={{
                                    padding: '0.3rem 0.75rem',
                                    background: 'rgba(0,217,36,0.1)',
                                    border: '1px solid rgba(0,217,36,0.2)',
                                    borderRadius: '20px',
                                    fontSize: '0.8rem',
                                    color: '#00D924'
                                }}>
                                    {e.symbol} <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '0.3rem' }}>{e.date}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── Thesis Builder Tab ───────────────────────────────────
    const ThesisBuilderTab = () => {
        const [symbol, setSymbol] = useState('');
        const [loading, setLoading] = useState(false);
        const [data, setData] = useState<Record<string, unknown> | null>(null);
        const [error, setError] = useState('');

        const analyze = async () => {
            const sym = symbol.trim().toUpperCase();
            if (!sym) return;
            setLoading(true); setError(''); setData(null);
            try {
                const { authHeaders, API_BASE } = await withAuth();
                const r = await fetch(`${API_BASE}/api/ai/thesis`, {
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ symbol: sym })
                });
                if (r.status === 403) {
                    const j = await r.json().catch(() => ({}));
                    if (j.error === 'upgrade_required') { setError('upgrade_required'); return; }
                }
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || 'Failed to build thesis');
                }
                setData(await r.json());
            } catch (e) {
                setError((e as Error).message || 'Unable to build thesis');
            } finally {
                setLoading(false);
            }
        };

        const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') analyze(); };

        type ThesisPoint = { title: string; body: string };
        const thesisData = data as { symbol?: string; current_price?: number; pe_ratio?: number; sector?: string; three_month_return?: number; market_cap_label?: string; thesis?: { bull_case?: ThesisPoint[]; bear_case?: ThesisPoint[] } } | null;

        return (
            <div style={{ maxWidth: '960px' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff', fontSize: '1.1rem' }}>
                        <i className="fas fa-balance-scale" style={{ color: '#00D924', marginRight: '0.5rem' }}></i>
                        Thesis Builder
                    </h3>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                        Enter any ticker to generate a bull and bear investment case grounded in live data.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <input
                        className="search-input"
                        style={{ maxWidth: '180px', textTransform: 'uppercase' }}
                        value={symbol}
                        onChange={e => setSymbol(e.target.value.toUpperCase())}
                        onKeyDown={handleKey}
                        placeholder="e.g. NVDA"
                    />
                    <button className="search-btn" onClick={analyze} disabled={loading || !symbol.trim()}>
                        {loading ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.4rem' }}></i>Analyzing…</> : 'Analyze'}
                    </button>
                    {error && error !== 'upgrade_required' && <span style={{ color: '#FF6B35', fontSize: '0.85rem' }}>{error}</span>}
                </div>

                {error === 'upgrade_required' && (
                    <UpgradeGate message="Thesis Builder generates AI-powered bull and bear investment cases grounded in live market data." />
                )}

                {loading && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {[0, 1].map(i => (
                            <div key={i} className="intel-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <SkeletonBlock height="1rem" width="40%" />
                                <SkeletonBlock height="0.8rem" />
                                <SkeletonBlock height="0.8rem" width="90%" />
                                <SkeletonBlock height="0.8rem" />
                            </div>
                        ))}
                    </div>
                )}

                {thesisData && !loading && (
                    <>
                        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>{thesisData.symbol}</div>
                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                {thesisData.current_price && thesisData.current_price > 0 && <span><span style={{ color: 'rgba(255,255,255,0.4)' }}>Price</span> <strong style={{ color: '#fff' }}>${Number(thesisData.current_price).toFixed(2)}</strong></span>}
                                {thesisData.pe_ratio && <span><span style={{ color: 'rgba(255,255,255,0.4)' }}>P/E</span> <strong style={{ color: '#fff' }}>{Number(thesisData.pe_ratio).toFixed(1)}x</strong></span>}
                                {thesisData.sector && <span><span style={{ color: 'rgba(255,255,255,0.4)' }}>Sector</span> <strong style={{ color: '#fff' }}>{thesisData.sector}</strong></span>}
                                {thesisData.three_month_return !== null && thesisData.three_month_return !== undefined && (
                                    <span>
                                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>3M</span>{' '}
                                        <strong style={{ color: Number(thesisData.three_month_return) >= 0 ? '#00D924' : '#FF6B35' }}>
                                            {Number(thesisData.three_month_return) >= 0 ? '+' : ''}{thesisData.three_month_return}%
                                        </strong>
                                    </span>
                                )}
                                {thesisData.market_cap_label && <span><span style={{ color: 'rgba(255,255,255,0.4)' }}>Mkt Cap</span> <strong style={{ color: '#fff' }}>{thesisData.market_cap_label}</strong></span>}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ background: 'rgba(0,217,36,0.08)', borderLeft: '3px solid #00D924', borderRadius: '10px', padding: '1.25rem' }}>
                                <div style={{ color: '#00D924', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <i className="fas fa-arrow-trend-up" style={{ marginRight: '0.4rem' }}></i>Bull Case
                                </div>
                                {(thesisData.thesis?.bull_case || []).map((pt, i) => (
                                    <div key={i} style={{ marginBottom: '1rem' }}>
                                        <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem', marginBottom: '0.3rem' }}>{pt.title}</div>
                                        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.84rem', lineHeight: 1.6 }}>{pt.body}</div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ background: 'rgba(255,107,53,0.08)', borderLeft: '3px solid #FF6B35', borderRadius: '10px', padding: '1.25rem' }}>
                                <div style={{ color: '#FF6B35', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <i className="fas fa-arrow-trend-down" style={{ marginRight: '0.4rem' }}></i>Bear Case
                                </div>
                                {(thesisData.thesis?.bear_case || []).map((pt, i) => (
                                    <div key={i} style={{ marginBottom: '1rem' }}>
                                        <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem', marginBottom: '0.3rem' }}>{pt.title}</div>
                                        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.84rem', lineHeight: 1.6 }}>{pt.body}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };

    // ── Health Score Tab ─────────────────────────────────────
    const HealthScoreTab = () => {
        const [loading, setLoading] = useState(false);
        const [data, setData] = useState<Record<string, unknown> | null>(null);
        const [error, setError] = useState('');

        useEffect(() => { loadScore(); }, []);

        const loadScore = async (refresh = false) => {
            if (!watchlistData || watchlistData.length === 0) return;
            setLoading(true); setError('');
            try {
                const { authHeaders, API_BASE } = await withAuth();
                const url = `${API_BASE}/api/ai/health-score${refresh ? '?refresh=1' : ''}`;
                const r = await fetch(url, { headers: authHeaders, credentials: 'include' });
                if (r.status === 403) {
                    const j = await r.json().catch(() => ({}));
                    if (j.error === 'upgrade_required') { setError('upgrade_required'); return; }
                }
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || 'Failed to load');
                }
                setData(await r.json());
            } catch (e) {
                setError((e as Error).message || 'Unable to load health score');
            } finally {
                setLoading(false);
            }
        };

        if (!watchlistData || watchlistData.length === 0) {
            return (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.5)' }}>
                    <i className="fas fa-plus-circle" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block' }}></i>
                    Add stocks to your watchlist to get a portfolio health score.
                </div>
            );
        }

        const gradeGradient = (grade: string): string => {
            const g: Record<string, string> = { A: '#00D924', B: '#7FE832', C: '#FFB800', D: '#FF6B35' };
            return g[grade] || '#888';
        };

        const MetricBar = ({ label, value, max, unit = '%', color = '#00D924' }: { label: string; value: number; max: number; unit?: string; color?: string }) => {
            const pct = Math.min((value / max) * 100, 100);
            return (
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem' }}>{label}</span>
                        <span style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600 }}>{value}{unit}</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
                    </div>
                </div>
            );
        };

        type HealthData = {
            grade: string; narrative: string; suggestions?: string[];
            metrics: { sector_count: number; top_sector_pct: number; avg_volatility_pct: number; max_correlation: number };
            sector_breakdown?: { sector: string; pct: number }[];
        };
        const healthData = data as HealthData | null;

        return (
            <div style={{ maxWidth: '860px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>
                        <i className="fas fa-heartbeat" style={{ color: '#00D924', marginRight: '0.5rem' }}></i>
                        Portfolio Health Score
                    </h3>
                    <button className="search-btn" onClick={() => loadScore(true)} disabled={loading} style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}>
                        <i className="fas fa-sync-alt" style={{ marginRight: '0.4rem' }}></i>Refresh
                    </button>
                </div>

                {error === 'upgrade_required' ? (
                    <UpgradeGate message="Portfolio Health Score gives your watchlist an AI-powered grade with diversification analysis and actionable suggestions." />
                ) : error && (
                    <div style={{ color: '#FF6B35', marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,107,53,0.1)', borderRadius: '8px' }}>{error}</div>
                )}

                {error !== 'upgrade_required' && loading && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="intel-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', padding: '2rem' }}>
                            <SkeletonBlock height="5rem" width="5rem" style={{ borderRadius: '50%' }} />
                            <SkeletonBlock height="0.9rem" width="60%" />
                        </div>
                        <div className="intel-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {[1,2,3,4].map(i => <SkeletonBlock key={i} height="0.8rem" />)}
                        </div>
                    </div>
                )}

                {healthData && !loading && (
                    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.25rem' }}>
                        <div className="intel-card" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
                            <div style={{ fontSize: '5rem', fontWeight: 900, lineHeight: 1, color: gradeGradient(healthData.grade), textShadow: `0 0 30px ${gradeGradient(healthData.grade)}88`, marginBottom: '0.75rem' }}>
                                {healthData.grade}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.6 }}>
                                {healthData.narrative}
                            </div>
                            {healthData.suggestions && healthData.suggestions.length > 0 && (
                                <div style={{ marginTop: '1.25rem', textAlign: 'left' }}>
                                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Suggestions</div>
                                    {healthData.suggestions.map((s, i) => (
                                        <div key={i} style={{ padding: '0.4rem 0.75rem', background: 'rgba(0,217,36,0.06)', borderLeft: '2px solid rgba(0,217,36,0.4)', borderRadius: '0 4px 4px 0', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                                            {s}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="intel-card">
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Portfolio Metrics</div>
                                <MetricBar label="Sector Diversification" value={healthData.metrics.sector_count} max={11} unit=" sectors" color="#00D924" />
                                <MetricBar label="Top Sector Concentration" value={healthData.metrics.top_sector_pct} max={100} unit="%" color={healthData.metrics.top_sector_pct > 50 ? '#FF6B35' : '#7FE832'} />
                                <MetricBar label="Avg Annualized Volatility" value={healthData.metrics.avg_volatility_pct} max={80} unit="%" color={healthData.metrics.avg_volatility_pct > 40 ? '#FF6B35' : '#FFB800'} />
                                <MetricBar label="Max Pairwise Correlation" value={Math.round(healthData.metrics.max_correlation * 100)} max={100} unit="%" color={healthData.metrics.max_correlation > 0.8 ? '#FF6B35' : '#7FE832'} />
                            </div>

                            {healthData.sector_breakdown && healthData.sector_breakdown.length > 0 && (
                                <div className="intel-card">
                                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Sector Breakdown</div>
                                    {healthData.sector_breakdown.map((s, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
                                            <div style={{ width: '130px', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', flexShrink: 0 }}>{s.sector}</div>
                                            <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>
                                                <div style={{ height: '100%', width: `${s.pct}%`, background: '#00D924', borderRadius: '3px', opacity: 0.7 + (i === 0 ? 0.3 : 0) }} />
                                            </div>
                                            <div style={{ width: '40px', textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>{s.pct}%</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── Sector Rotation Tab ──────────────────────────────────
    const SectorRotationTab = () => {
        const [loading, setLoading] = useState(false);
        const [data, setData] = useState<Record<string, unknown> | null>(null);
        const [error, setError] = useState('');
        const [sortKey, setSortKey] = useState('change_1w');
        const [displayedText, setDisplayedText] = useState('');
        const [isTyping, setIsTyping] = useState(false);
        const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

        useEffect(() => { loadRotation(); return () => { if (typingRef.current) clearTimeout(typingRef.current); }; }, []);

        const startTypingAnimation = (text: string) => {
            setIsTyping(true);
            setDisplayedText('');
            const words = text.split(' ');
            let idx = 0;
            const typeNext = () => {
                if (idx < words.length) {
                    setDisplayedText(prev => prev + (idx > 0 ? ' ' : '') + words[idx]);
                    idx++;
                    typingRef.current = setTimeout(typeNext, 40);
                } else {
                    setIsTyping(false);
                }
            };
            typeNext();
        };

        const loadRotation = async (refresh = false) => {
            setLoading(true); setError(''); setDisplayedText('');
            try {
                const { authHeaders, API_BASE } = await withAuth();
                const url = `${API_BASE}/api/ai/sector-rotation${refresh ? '?refresh=1' : ''}`;
                const r = await fetch(url, { headers: authHeaders, credentials: 'include' });
                if (r.status === 403) {
                    const j = await r.json().catch(() => ({}));
                    if (j.error === 'upgrade_required') { setError('upgrade_required'); return; }
                }
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || 'Failed to load');
                }
                const j = await r.json();
                setData(j);
                setLoading(false);
                setTimeout(() => startTypingAnimation(j.narrative || ''), 100);
            } catch (e) {
                setError((e as Error).message || 'Unable to load sector rotation');
                setLoading(false);
            }
        };

        type SectorRow = { name: string; etf: string; change_1w?: number; change_1m?: number; change_3m?: number; signal: string; signal_color: string };
        type RotationData = { sectors: SectorRow[]; narrative?: string };
        const rotationData = data as RotationData | null;
        const sortedSectors = rotationData ? [...rotationData.sectors].sort((a, b) => ((b[sortKey as keyof SectorRow] as number) || -999) - ((a[sortKey as keyof SectorRow] as number) || -999)) : [];

        const ChangeCell = ({ val }: { val?: number | null }) => {
            if (val === null || val === undefined) return <td style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'right', padding: '0.6rem 0.75rem', fontSize: '0.85rem' }}>—</td>;
            const pos = val >= 0;
            return (
                <td style={{ color: pos ? '#00D924' : '#FF6B35', textAlign: 'right', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>
                    {pos ? '+' : ''}{val}%
                </td>
            );
        };

        return (
            <div style={{ maxWidth: '920px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>
                        <i className="fas fa-arrows-rotate" style={{ color: '#00D924', marginRight: '0.5rem' }}></i>
                        Sector Rotation
                    </h3>
                    <button className="search-btn" onClick={() => loadRotation(true)} disabled={loading} style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}>
                        <i className="fas fa-sync-alt" style={{ marginRight: '0.4rem' }}></i>Refresh
                    </button>
                </div>

                {error === 'upgrade_required' ? (
                    <UpgradeGate message="Sector Rotation tracks institutional money flow across all 11 S&P sectors with AI-generated strategy notes." />
                ) : error && (
                    <div style={{ color: '#FF6B35', marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,107,53,0.1)', borderRadius: '8px' }}>{error}</div>
                )}

                {error !== 'upgrade_required' && (<div className="intel-card" style={{ marginBottom: '1.25rem', minHeight: '80px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <SkeletonBlock height="1rem" />
                            <SkeletonBlock height="1rem" width="85%" />
                            <SkeletonBlock height="1rem" width="70%" />
                        </div>
                    ) : (
                        <p style={{ margin: 0, lineHeight: 1.7, color: 'rgba(255,255,255,0.85)', fontSize: '0.95rem' }}>
                            {displayedText}
                            {isTyping && <span style={{ opacity: 0.6, animation: 'blink 1s infinite' }}>|</span>}
                        </p>
                    )}
                </div>)}

                {!loading && rotationData && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', alignSelf: 'center' }}>Sort by:</span>
                        {[['change_1w', '1W'], ['change_1m', '1M'], ['change_3m', '3M']].map(([key, label]) => (
                            <button key={key}
                                onClick={() => setSortKey(key)}
                                style={{
                                    padding: '0.25rem 0.6rem',
                                    borderRadius: '4px',
                                    border: '1px solid',
                                    borderColor: sortKey === key ? '#00D924' : 'rgba(255,255,255,0.15)',
                                    background: sortKey === key ? 'rgba(0,217,36,0.12)' : 'transparent',
                                    color: sortKey === key ? '#00D924' : 'rgba(255,255,255,0.5)',
                                    fontSize: '0.78rem',
                                    cursor: 'pointer'
                                }}>
                                {label}
                            </button>
                        ))}
                    </div>
                )}

                {!loading && rotationData && (
                    <div className="intel-card" style={{ padding: 0, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    {['Sector', 'ETF', '1W', '1M', '3M', 'Signal'].map(h => (
                                        <th key={h} style={{ padding: '0.7rem 0.75rem', textAlign: h === 'Sector' ? 'left' : 'right', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSectors.map((s, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '0.6rem 0.75rem', color: '#fff', fontSize: '0.87rem', fontWeight: 500 }}>{s.name}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textAlign: 'right' }}>{s.etf}</td>
                                        <ChangeCell val={s.change_1w} />
                                        <ChangeCell val={s.change_1m} />
                                        <ChangeCell val={s.change_3m} />
                                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                                            <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, color: s.signal_color, background: `${s.signal_color}18`, border: `1px solid ${s.signal_color}44`, whiteSpace: 'nowrap' }}>
                                                {s.signal}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    // ── Earnings Breakdown Tab ───────────────────────────────
    const EarningsBreakdownTab = () => {
        const [symbol, setSymbol] = useState('');
        const [loading, setLoading] = useState(false);
        const [data, setData] = useState<Record<string, unknown> | null>(null);
        const [error, setError] = useState('');

        const analyze = async () => {
            const sym = symbol.trim().toUpperCase();
            if (!sym) return;
            setLoading(true); setError(''); setData(null);
            try {
                const { authHeaders, API_BASE } = await withAuth();
                const r = await fetch(`${API_BASE}/api/ai/earnings-breakdown?symbol=${sym}`, { headers: authHeaders, credentials: 'include' });
                if (r.status === 403) {
                    const j = await r.json().catch(() => ({}));
                    if (j.error === 'upgrade_required') { setError('upgrade_required'); return; }
                }
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || 'Failed to load earnings data');
                }
                setData(await r.json());
            } catch (e) {
                setError((e as Error).message || 'Unable to load earnings data');
            } finally {
                setLoading(false);
            }
        };

        const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') analyze(); };

        type EarningsData = {
            symbol: string; company_name: string; sector: string; current_price: number;
            metrics: {
                trailing_eps?: number | null; forward_eps?: number | null;
                earnings_growth?: number | null; quarterly_earnings_growth?: number | null;
                revenue_growth?: number | null; profit_margin?: number | null;
                trailing_pe?: number | null; forward_pe?: number | null;
                revenue_summary: string;
            };
            analysis: { result: string; key_takeaway: string; what_to_watch: string };
        };
        const d = data as EarningsData | null;

        const MetricPill = ({ label, value, positive }: { label: string; value: string; positive?: boolean }) => (
            <div style={{ padding: '0.5rem 0.85rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>{label}</div>
                <div style={{ color: positive === undefined ? '#fff' : positive ? '#00D924' : '#FF6B35', fontWeight: 700, fontSize: '0.88rem' }}>{value}</div>
            </div>
        );

        return (
            <div style={{ maxWidth: '860px' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 0.4rem 0', color: '#fff', fontSize: '1.1rem' }}>
                        <i className="fas fa-chart-bar" style={{ color: '#FF9500', marginRight: '0.5rem' }}></i>
                        Earnings Breakdown
                    </h3>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem' }}>
                        Enter a ticker to get an AI-written breakdown of recent earnings and what to watch next.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.75rem' }}>
                    <input
                        className="search-input"
                        style={{ maxWidth: '180px', textTransform: 'uppercase' }}
                        value={symbol}
                        onChange={e => setSymbol(e.target.value.toUpperCase())}
                        onKeyDown={handleKey}
                        placeholder="e.g. AAPL"
                    />
                    <button className="search-btn" onClick={analyze} disabled={loading || !symbol.trim()}>
                        {loading ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.4rem' }}></i>Loading…</> : 'Analyze'}
                    </button>
                    {error && error !== 'upgrade_required' && <span style={{ color: '#FF6B35', fontSize: '0.85rem' }}>{error}</span>}
                </div>

                {error === 'upgrade_required' && (
                    <UpgradeGate message="Earnings Breakdown gives you an AI-written analysis of any stock's recent earnings — what happened, what it means, and what to watch next." />
                )}

                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <SkeletonBlock height="1rem" width="50%" />
                        <SkeletonBlock height="0.85rem" />
                        <SkeletonBlock height="0.85rem" width="85%" />
                        <SkeletonBlock height="0.85rem" width="70%" />
                    </div>
                )}

                {d && !loading && (
                    <>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem' }}>{d.symbol}</span>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{d.company_name}</span>
                            {d.current_price > 0 && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>${d.current_price.toFixed(2)}</span>}
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>{d.sector}</span>
                        </div>

                        {/* Metrics row */}
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                            {d.metrics.trailing_eps != null && <MetricPill label="Trailing EPS" value={`$${d.metrics.trailing_eps.toFixed(2)}`} />}
                            {d.metrics.forward_eps != null && <MetricPill label="Forward EPS" value={`$${d.metrics.forward_eps.toFixed(2)}`} />}
                            {d.metrics.trailing_pe != null && <MetricPill label="Trailing P/E" value={`${d.metrics.trailing_pe}x`} />}
                            {d.metrics.forward_pe != null && <MetricPill label="Forward P/E" value={`${d.metrics.forward_pe}x`} />}
                            {d.metrics.earnings_growth != null && <MetricPill label="EPS Growth (YoY)" value={`${d.metrics.earnings_growth > 0 ? '+' : ''}${d.metrics.earnings_growth}%`} positive={d.metrics.earnings_growth >= 0} />}
                            {d.metrics.revenue_growth != null && <MetricPill label="Revenue Growth (YoY)" value={`${d.metrics.revenue_growth > 0 ? '+' : ''}${d.metrics.revenue_growth}%`} positive={d.metrics.revenue_growth >= 0} />}
                            {d.metrics.profit_margin != null && <MetricPill label="Profit Margin" value={`${d.metrics.profit_margin}%`} positive={d.metrics.profit_margin >= 0} />}
                        </div>

                        {/* AI Analysis */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="intel-card" style={{ padding: '1.1rem 1.25rem' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>Result</div>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: '0.92rem', lineHeight: 1.65 }}>{d.analysis.result}</p>
                            </div>
                            <div className="intel-card" style={{ padding: '1.1rem 1.25rem' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>Key Takeaway</div>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: '0.92rem', lineHeight: 1.65 }}>{d.analysis.key_takeaway}</p>
                            </div>
                            <div className="intel-card" style={{ padding: '1.1rem 1.25rem', borderLeft: '3px solid #FF9500' }}>
                                <div style={{ color: '#FF9500', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                                    <i className="fas fa-eye" style={{ marginRight: '0.4rem' }}></i>What to Watch
                                </div>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: '0.92rem', lineHeight: 1.65 }}>{d.analysis.what_to_watch}</p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };

    // ── Portfolio Guidance Tab ───────────────────────────────
    const PortfolioGuidanceTab = () => {
        const [loading, setLoading] = useState(false);
        const [data, setData] = useState<Record<string, unknown> | null>(null);
        const [error, setError] = useState('');

        useEffect(() => { load(); }, []);

        const load = async (refresh = false) => {
            if (!watchlistData || watchlistData.length === 0) return;
            setLoading(true); setError('');
            try {
                const { authHeaders, API_BASE } = await withAuth();
                const url = `${API_BASE}/api/ai/portfolio-guidance${refresh ? '?refresh=1' : ''}`;
                const r = await fetch(url, { headers: authHeaders, credentials: 'include' });
                if (r.status === 403) {
                    const j = await r.json().catch(() => ({}));
                    if (j.error === 'upgrade_required') { setError('upgrade_required'); return; }
                }
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || 'Failed to load');
                }
                setData(await r.json());
            } catch (e) {
                setError((e as Error).message || 'Unable to load portfolio guidance');
            } finally {
                setLoading(false);
            }
        };

        if (!watchlistData || watchlistData.length === 0) {
            return (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.5)' }}>
                    <i className="fas fa-plus-circle" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block' }}></i>
                    Add stocks to your watchlist to get portfolio guidance.
                </div>
            );
        }

        type GuidanceData = { holdings_count: number; sector_summary: string; market_context: string; narrative: string; guidance: string[] };
        const d = data as GuidanceData | null;

        return (
            <div style={{ maxWidth: '820px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h3 style={{ margin: '0 0 0.3rem 0', color: '#fff', fontSize: '1.1rem' }}>
                            <i className="fas fa-shield-halved" style={{ color: '#A78BFA', marginRight: '0.5rem' }}></i>
                            Portfolio Guidance
                        </h3>
                        {d && <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)' }}>{d.holdings_count} positions analyzed</span>}
                    </div>
                    <button className="search-btn" onClick={() => load(true)} disabled={loading} style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}>
                        <i className="fas fa-sync-alt" style={{ marginRight: '0.4rem' }}></i>Refresh
                    </button>
                </div>

                {error === 'upgrade_required' ? (
                    <UpgradeGate message="Portfolio Guidance gives you an AI advisor's frank read on your holdings — sector exposure, valuation risk, and specific actionable steps." />
                ) : error && (
                    <div style={{ color: '#FF6B35', marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,107,53,0.1)', borderRadius: '8px' }}>{error}</div>
                )}

                {error !== 'upgrade_required' && loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                        <SkeletonBlock height="1rem" />
                        <SkeletonBlock height="1rem" width="90%" />
                        <SkeletonBlock height="1rem" width="80%" />
                        <SkeletonBlock height="1rem" width="60%" />
                    </div>
                )}

                {d && !loading && (
                    <>
                        {d.market_context && (
                            <div style={{ marginBottom: '1rem', padding: '0.5rem 0.85rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <i className="fas fa-chart-line" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}></i>
                                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.8rem' }}>{d.market_context}</span>
                            </div>
                        )}

                        <div className="intel-card" style={{ marginBottom: '1rem' }}>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem' }}>Assessment</div>
                            <p style={{ margin: 0, lineHeight: 1.7, color: 'rgba(255,255,255,0.85)', fontSize: '0.93rem' }}>{d.narrative}</p>
                        </div>

                        {d.guidance && d.guidance.length > 0 && (
                            <div className="intel-card">
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.85rem' }}>Guidance</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    {d.guidance.map((point, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <span style={{ color: '#A78BFA', fontWeight: 700, fontSize: '0.8rem', minWidth: '18px', paddingTop: '0.1rem' }}>
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                            <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: '0.88rem', lineHeight: 1.6 }}>{point}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    // ── Main render ──────────────────────────────────────────
    const tabs = [
        { key: 'brief',    label: 'Morning Brief',      icon: 'fa-newspaper' },
        { key: 'thesis',   label: 'Thesis Builder',     icon: 'fa-balance-scale' },
        { key: 'health',   label: 'Health Score',       icon: 'fa-heartbeat' },
        { key: 'rotation', label: 'Sector Rotation',    icon: 'fa-arrows-rotate' },
        { key: 'earnings', label: 'Earnings Breakdown', icon: 'fa-chart-bar' },
        { key: 'portfolio',label: 'Portfolio Guidance', icon: 'fa-shield-halved' },
    ];

    return (
        <div className="intelligence-view">
            <div className="view-header">
                <h2><i className="fas fa-brain" style={{ marginRight: '0.5rem', color: '#00D924' }}></i>AI Research</h2>
                <div className="intel-tabs">
                    {tabs.map(t => (
                        <button key={t.key} className={`intel-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => switchTab(t.key)}>
                            <i className={`fas ${t.icon}`} style={{ marginRight: '0.4rem' }}></i>{t.label}
                        </button>
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
            `}</style>

            <div style={{ padding: '0.5rem 0' }}>
                {activeTab === 'brief'    && <MorningBriefTab />}
                {activeTab === 'thesis'   && <ThesisBuilderTab />}
                {activeTab === 'health'   && <HealthScoreTab />}
                {activeTab === 'rotation' && <SectorRotationTab />}
                {activeTab === 'earnings' && <EarningsBreakdownTab />}
                {activeTab === 'portfolio'&& <PortfolioGuidanceTab />}
            </div>
        </div>
    );
};

window.AISuiteView = AISuiteView;

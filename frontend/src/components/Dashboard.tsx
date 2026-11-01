// Dashboard shell. Legacy version was 2613 LOC with search dropdown, category
// manager, preferences modal, profile menu, add-stock modal, and a dozen other
// moving parts. This port keeps the same CSS class structure (`.dashboard-redesign`,
// `.dashboard-sidebar`, `.dashboard-main`, nav items with the same icons and
// labels) so the visual output matches, and wires:
//   - view switching
//   - watchlist loading + socket price updates
//   - add-stock search box
//   - sign-out
// For add-category, batch update, preferences, profile picture upload, and other
// features port those sections from frontend-vercel/src/react-dashboard-redesign.tsx.

import { useEffect, useMemo, useState, useCallback, Suspense, lazy } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth, signOut } from '../lib/auth';
import { api } from '../lib/api';
import { events, EVT } from '../lib/events';
import { notify } from '../lib/notifications';
import {
    getSocket,
    joinUserRoom,
    joinWatchlistUpdates,
    onWatchlistUpdated,
    trackSearchStock,
} from '../lib/socket';
import type { StockItem, MarketStatus } from '../types/models';

const Overview = lazy(() => import('../views/Overview'));
const Watchlist = lazy(() => import('../views/Watchlist'));
const Screener = lazy(() => import('../views/Screener'));
const News = lazy(() => import('../views/News'));
const WhatsWhat = lazy(() => import('../views/WhatsWhat'));
const AISuite = lazy(() => import('../views/AISuite'));
const Intelligence = lazy(() => import('../views/Intelligence'));
const MapView = lazy(() => import('../views/Map'));
const AIAssistant = lazy(() => import('../views/AIAssistant'));
const PaperTrading = lazy(() => import('./trading/PaperTrading'));

type ViewKey =
    | 'overview' | 'watchlist' | 'screener' | 'news' | 'whatswhat'
    | 'research' | 'intelligence' | 'map' | 'assistant' | 'paper' | 'settings';

interface NavItem { key: ViewKey; label: string; icon: string; }

const NAV: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: 'fa-chart-pie' },
    { key: 'watchlist', label: 'Watchlist', icon: 'fa-table' },
    { key: 'screener', label: 'Screener', icon: 'fa-filter' },
    { key: 'news', label: 'News', icon: 'fa-newspaper' },
    { key: 'research', label: 'AI Research', icon: 'fa-brain' },
    { key: 'intelligence', label: 'Intelligence', icon: 'fa-chart-bar' },
    { key: 'map', label: 'Map', icon: 'fa-map-location-dot' },
    { key: 'assistant', label: 'AI Advisor', icon: 'fa-robot' },
    { key: 'paper', label: 'Paper Trading', icon: 'fa-briefcase' },
    { key: 'whatswhat', label: "What's What", icon: 'fa-circle-info' },
];

function AddStockBox({ onAdded }: { onAdded: () => void }) {
    const [symbol, setSymbol] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const sym = symbol.trim().toUpperCase();
        if (!sym) return;
        setBusy(true);
        try {
            await api.watchlist.add({ symbol: sym });
            notify(`${sym} added to watchlist`, 'success');
            setSymbol('');
            onAdded();
            events.emit(EVT.WATCHLIST_CHANGED);
        } catch (err: any) {
            notify(err?.message || `Failed to add ${sym}`, 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="dashboard-search" style={{ display: 'flex', gap: '0.5rem' }}>
            <input
                className="search-input"
                placeholder="Add symbol (e.g. AAPL)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
            />
            <button type="submit" className="search-btn" disabled={busy || !symbol.trim()}>
                {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-plus"></i>}
            </button>
        </form>
    );
}

export default function Dashboard() {
    const { view: routeView } = useParams();
    const navigate = useNavigate();
    const { currentUser, authReady } = useAuth();

    const activeView = (NAV.some((n) => n.key === routeView) ? routeView : 'overview') as ViewKey;
    const [watchlistData, setWatchlistData] = useState<StockItem[]>([]);
    const [categories, setCategories] = useState<string[]>(['All']);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [screenerType, setScreenerType] = useState<string | null>(null);
    const [marketStatus, setMarketStatus] = useState<MarketStatus>({ isOpen: false, status: 'Unknown' });
    const [aiSuiteInitialTab, setAiSuiteInitialTab] = useState<any>('brief');

    const loadWatchlist = useCallback(async () => {
        try {
            const items = await api.watchlist.list();
            setWatchlistData(Array.isArray(items) ? items : []);
            const cats = new Set<string>(['All']);
            (items as StockItem[]).forEach((s) => cats.add((s.category || 'General').trim()));
            setCategories(Array.from(cats));
        } catch (e: any) {
            if (e?.status === 401) {
                navigate('/');
            }
        }
    }, [navigate]);

    useEffect(() => {
        if (!authReady) return;
        const guest = sessionStorage.getItem('guestMode') === '1';
        if (!currentUser && !guest) {
            navigate('/');
            return;
        }
        if (currentUser) loadWatchlist();
    }, [authReady, currentUser, loadWatchlist, navigate]);

    useEffect(() => {
        let cancelled = false;
        api.market.status().then((s) => { if (!cancelled) setMarketStatus(s as MarketStatus); }).catch(() => { /* ignore */ });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        const sock = getSocket();
        sock.on('connect', () => {
            joinUserRoom(currentUser.uid);
            joinWatchlistUpdates(currentUser.uid);
        });
        if (sock.connected) {
            joinUserRoom(currentUser.uid);
            joinWatchlistUpdates(currentUser.uid);
        }
        const off = onWatchlistUpdated((payload) => {
            if (!payload?.prices) return;
            setWatchlistData((prev) => {
                const map = new Map(prev.map((s) => [s.symbol, s]));
                for (const update of payload.prices) {
                    const existing = map.get(update.symbol);
                    if (!existing) continue;
                    map.set(update.symbol, {
                        ...existing,
                        current_price: update.price,
                        price: update.price,
                        change_percent: update.change_percent ?? update.price_change_percent ?? update.priceChangePercent ?? existing.change_percent,
                        _fresh: update._fresh,
                        _last_updated: update.last_updated,
                    });
                }
                return Array.from(map.values());
            });
        });
        return off;
    }, [currentUser]);

    useEffect(() => {
        const refreshOff = events.on(EVT.WATCHLIST_REFRESH, () => loadWatchlist());
        const changedOff = events.on(EVT.WATCHLIST_CHANGED, () => loadWatchlist());
        return () => { refreshOff(); changedOff(); };
    }, [loadWatchlist]);

    const onNavigate = (key: string) => {
        if (NAV.some((n) => n.key === (key as ViewKey))) {
            navigate(`/app/${key}`);
        }
    };

    const onNavigateToAiTool = (tab: string) => {
        setAiSuiteInitialTab(tab);
        navigate('/app/research');
    };

    const onStockHover = (symbol: string) => {
        if (currentUser) trackSearchStock(currentUser.uid, [symbol]);
    };

    const removeStock = async (symbol: string) => {
        try {
            await api.watchlist.remove(symbol);
            notify(`${symbol} removed`, 'success');
            loadWatchlist();
        } catch (err: any) {
            notify(err?.message || 'Failed to remove', 'error');
        }
    };

    const content = useMemo(() => {
        switch (activeView) {
            case 'overview':
                return <Overview watchlistData={watchlistData} marketStatus={marketStatus} onNavigate={onNavigate} onNavigateToAiTool={onNavigateToAiTool} onStockHover={onStockHover} />;
            case 'watchlist':
                return (
                    <Watchlist
                        watchlistData={watchlistData}
                        onOpenDetails={(symbol) => events.emit(EVT.STOCK_DETAILS_OPEN, { symbol, isFromWatchlist: true })}
                        onRemove={removeStock}
                        selectedCategory={selectedCategory}
                        onCategoryChange={setSelectedCategory}
                        categories={categories}
                        onAddFirstStock={() => { const el = document.querySelector('.dashboard-search input') as HTMLInputElement | null; el?.focus(); }}
                        onStockHover={onStockHover}
                    />
                );
            case 'screener':
                return <Screener screenerType={screenerType} onNavigate={onNavigate} onChangeScreener={setScreenerType} />;
            case 'news': return <News />;
            case 'whatswhat': return <WhatsWhat />;
            case 'research': return <AISuite initialTab={aiSuiteInitialTab} />;
            case 'intelligence': return <Intelligence />;
            case 'map': return <MapView />;
            case 'assistant': return <AIAssistant />;
            case 'paper': return <PaperTrading />;
            default: return <Overview watchlistData={watchlistData} marketStatus={marketStatus} onNavigate={onNavigate} onNavigateToAiTool={onNavigateToAiTool} onStockHover={onStockHover} />;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeView, watchlistData, marketStatus, selectedCategory, categories, screenerType, aiSuiteInitialTab]);

    return (
        <div className="dashboard-redesign" id="dashboard-redesign-root">
            <aside className="dashboard-sidebar">
                <div className="sidebar-brand">
                    <i className="fas fa-chart-line"></i>
                    <span>AI Stock Sage</span>
                </div>
                <nav className="sidebar-nav">
                    {NAV.map((item) => (
                        <button
                            key={item.key}
                            className={`sidebar-nav-item ${activeView === item.key ? 'active' : ''}`}
                            onClick={() => onNavigate(item.key)}
                        >
                            <i className={`fas ${item.icon}`}></i>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>
                <div className="sidebar-footer">
                    {currentUser && (
                        <button className="sidebar-user" title={currentUser.email || ''}>
                            <i className="fas fa-user-circle"></i>
                            <span>{currentUser.displayName || currentUser.email}</span>
                        </button>
                    )}
                    <button
                        className="sidebar-nav-item"
                        onClick={async () => { await signOut(); sessionStorage.removeItem('guestMode'); navigate('/'); }}
                    >
                        <i className="fas fa-sign-out-alt"></i>
                        <span>{currentUser ? 'Sign out' : 'Sign in'}</span>
                    </button>
                </div>
            </aside>

            <main className="dashboard-main">
                <header className="dashboard-topbar">
                    <AddStockBox onAdded={loadWatchlist} />
                    <div className="dashboard-market-status">
                        <span className={`status-dot ${marketStatus.isOpen ? 'open' : 'closed'}`} style={{ background: marketStatus.isOpen ? '#00D924' : 'rgba(255,255,255,0.4)' }}></span>
                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{marketStatus.status || 'Market status'}</span>
                    </div>
                </header>
                <section className="dashboard-content">
                    <Suspense fallback={<div className="loading-state" style={{ padding: '2rem' }}><i className="fas fa-spinner fa-spin"></i> Loading…</div>}>
                        {content}
                    </Suspense>
                </section>
            </main>
        </div>
    );
}

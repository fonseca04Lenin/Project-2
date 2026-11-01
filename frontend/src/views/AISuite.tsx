// AI Suite view: the 6 AI research tools. Legacy version is 990 LOC with
// per-tool rich UIs. This port preserves the tab shell + wires the real
// endpoints — each tab renders the raw AI response. See
// frontend-vercel/src/react-view-aisuite.tsx for the full styled layouts.

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { events, EVT } from '../lib/events';

type Tab = 'brief' | 'thesis' | 'health' | 'rotation' | 'earnings' | 'portfolio';

const TABS: { id: Tab; label: string; icon: string; needsSymbol: boolean }[] = [
    { id: 'brief', label: 'Morning Brief', icon: 'fa-chart-line', needsSymbol: false },
    { id: 'thesis', label: 'Thesis Builder', icon: 'fa-chart-bar', needsSymbol: true },
    { id: 'health', label: 'Health Score', icon: 'fa-wave-square', needsSymbol: false },
    { id: 'rotation', label: 'Sector Rotation', icon: 'fa-clock', needsSymbol: false },
    { id: 'earnings', label: 'Earnings Breakdown', icon: 'fa-file-lines', needsSymbol: true },
    { id: 'portfolio', label: 'Portfolio Guidance', icon: 'fa-circle-dot', needsSymbol: false },
];

export default function AISuite({ initialTab = 'brief' as Tab }: { initialTab?: Tab }) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const [symbol, setSymbol] = useState('AAPL');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [upgradeRequired, setUpgradeRequired] = useState(false);

    const run = async (currentTab: Tab, currentSymbol: string) => {
        setLoading(true);
        setResult(null);
        setUpgradeRequired(false);
        try {
            let data;
            switch (currentTab) {
                case 'brief': data = await api.ai.morningBrief(); break;
                case 'thesis': data = await api.ai.thesis(currentSymbol); break;
                case 'health': data = await api.ai.healthScore(); break;
                case 'rotation': data = await api.ai.sectorRotation(); break;
                case 'earnings': data = await api.ai.earningsBreakdown(currentSymbol); break;
                case 'portfolio': data = await api.ai.portfolioGuidance(); break;
            }
            setResult(data);
        } catch (e: any) {
            if (e?.status === 403) {
                setUpgradeRequired(true);
                events.emit(EVT.UPGRADE_SHOW, { reason: 'AI Suite requires Pro or Elite.' });
            } else {
                setResult({ error: e?.message || 'Request failed' });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const info = TABS.find((t) => t.id === tab);
        if (info && !info.needsSymbol) run(tab, symbol);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    const info = TABS.find((t) => t.id === tab)!;

    return (
        <div className="aisuite-view">
            <div className="view-header">
                <h2>AI Research Suite</h2>
            </div>

            <div className="ai-tabs" style={{ display: 'flex', gap: '0.5rem', padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        className={`ai-tab-btn ${tab === t.id ? 'active' : ''}`}
                        onClick={() => setTab(t.id)}
                        style={{
                            padding: '0.5rem 1rem',
                            background: tab === t.id ? 'rgba(0, 217, 36, 0.1)' : 'transparent',
                            border: `1px solid ${tab === t.id ? '#00D924' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '4px',
                            color: tab === t.id ? '#00D924' : 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                        }}
                    >
                        <i className={`fas ${t.icon}`} style={{ marginRight: '0.5rem' }}></i>{t.label}
                    </button>
                ))}
            </div>

            <div className="ai-content" style={{ padding: '1.5rem 2rem' }}>
                <div className="ai-controls" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                    {info.needsSymbol && (
                        <input
                            className="search-input"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            placeholder="Enter symbol"
                            style={{ maxWidth: '160px' }}
                        />
                    )}
                    <button className="search-btn" onClick={() => run(tab, symbol)} disabled={loading}>
                        {loading ? <><i className="fas fa-spinner fa-spin" /> Running…</> : <><i className="fas fa-play" /> Run {info.label}</>}
                    </button>
                </div>

                {upgradeRequired && (
                    <div className="insight-upgrade-gate" style={{ padding: '1rem', border: '1px solid rgba(255,184,0,0.3)', borderRadius: '8px' }}>
                        <p><i className="fas fa-lock" style={{ color: '#FFB800', marginRight: '0.5rem' }}></i>AI Suite requires Pro or Elite.</p>
                    </div>
                )}

                {result && (
                    <pre style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '70vh', overflow: 'auto' }}>
                        {JSON.stringify(result, null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );
}

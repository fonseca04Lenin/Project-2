// Map view: company HQ heatmap. Legacy version used Leaflet (1377 LOC) which
// is not currently loaded in the legacy index.html either, so a slimmed-down
// list rendering keeps feature parity. See frontend-vercel/src/react-view-map.tsx
// for the full Leaflet implementation and port when the Leaflet CDN tag is added.

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { events, EVT } from '../lib/events';

interface Company {
    symbol: string;
    name: string;
    city: string;
    sector: string;
    industry: string;
    marketCap: number;
    website: string;
    lat: number;
    lng: number;
}

export default function MapView() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await api.map.locations();
                if (!cancelled) setCompanies(data.companies || []);
            } catch { /* ignore */ } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const filtered = filter
        ? companies.filter((c) => c.name?.toLowerCase().includes(filter.toLowerCase()) || c.symbol?.toLowerCase().includes(filter.toLowerCase()) || c.sector?.toLowerCase().includes(filter.toLowerCase()))
        : companies;

    return (
        <div className="map-view">
            <div className="view-header">
                <h2>Company Locations</h2>
                <input className="search-input" placeholder="Filter by name, symbol, or sector" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: '280px' }} />
            </div>

            <div className="map-content" style={{ padding: '1.5rem 2rem' }}>
                {loading ? (
                    <div className="loading-state"><i className="fas fa-spinner fa-spin"></i> Loading locations…</div>
                ) : (
                    <div className="companies-grid" style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                        {filtered.slice(0, 60).map((c) => (
                            <div
                                key={c.symbol}
                                className="company-card"
                                onClick={() => events.emit(EVT.STOCK_DETAILS_OPEN, { symbol: c.symbol })}
                                style={{ cursor: 'pointer', padding: '1rem', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <strong style={{ color: '#00D924' }}>{c.symbol}</strong>
                                    <small style={{ color: 'rgba(255,255,255,0.4)' }}>{c.sector}</small>
                                </div>
                                <div style={{ fontSize: '0.9rem', margin: '0.25rem 0', color: 'rgba(255,255,255,0.85)' }}>{c.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                                    <i className="fas fa-location-dot" style={{ marginRight: '4px' }}></i>{c.city}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

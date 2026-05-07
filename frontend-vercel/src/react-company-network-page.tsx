export {};

const { useEffect, useMemo, useState } = React;

const API_BASE_NETWORK = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

interface CompanyNetworkNode {
    id: string;
    label: string;
    type: 'brand' | 'business_line' | 'sector' | 'industry' | 'location';
    source: string;
}

interface CompanyNetworkPayload {
    symbol: string;
    name: string;
    description: string;
    sector: string;
    industry: string;
    headquarters: string;
    website: string;
    network: {
        center: {
            symbol: string;
            label: string;
        };
        nodes: CompanyNetworkNode[];
    };
}

const NODE_TYPE_LABELS: Record<string, string> = {
    brand: 'Brand',
    business_line: 'Business line',
    sector: 'Sector',
    industry: 'Industry',
    location: 'Location',
};

function routeTo(path: string, state?: Record<string, unknown>, replace?: boolean): void {
    window.dispatchEvent(new CustomEvent('app:navigate', {
        detail: { path, state: state || {}, replace: !!replace }
    }));
}

const CompanyNetworkPage = ({ symbol, onNavigateBack, isFromWatchlist = false }: {
    symbol: string;
    onNavigateBack?: () => void;
    isFromWatchlist?: boolean;
}) => {
    const [data, setData] = useState<CompanyNetworkPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewportWidth, setViewportWidth] = useState<number>(() => window.innerWidth);

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadNetwork = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`${API_BASE_NETWORK}/api/company/${symbol}/network`, {
                    credentials: 'include',
                });
                if (!response.ok) {
                    throw new Error(`Failed to load company network: HTTP ${response.status}`);
                }
                const payload = await response.json();
                if (!cancelled) {
                    setData(payload);
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || 'Failed to load company network');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadNetwork();
        return () => {
            cancelled = true;
        };
    }, [symbol]);

    const handleBack = () => {
        if (onNavigateBack) {
            onNavigateBack();
            return;
        }
        routeTo(`/stock/${symbol}`, { isFromWatchlist });
    };

    const graphNodes = data?.network?.nodes || [];
    const isCompact = viewportWidth < 920;

    const nodeLayout = useMemo(() => {
        if (!graphNodes.length) return [];

        const radiusX = isCompact ? 34 : 38;
        const radiusY = isCompact ? 38 : 30;

        return graphNodes.map((node, index) => {
            const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / graphNodes.length);
            const x = 50 + Math.cos(angle) * radiusX;
            const y = 50 + Math.sin(angle) * radiusY;
            return { ...node, x, y };
        });
    }, [graphNodes, isCompact]);

    if (loading) {
        return (
            <div className="company-network-page">
                <div className="company-network-shell">
                    <div className="company-network-loading">
                        <div className="spinner-large"></div>
                        <p>Building {symbol} network…</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="company-network-page">
                <div className="company-network-shell">
                    <div className="company-network-topbar">
                        <button className="back-button" onClick={handleBack}>
                            <i className="fas fa-arrow-left"></i>
                            <span>Back to Stock</span>
                        </button>
                    </div>
                    <div className="company-network-error">
                        <i className="fas fa-circle-exclamation"></i>
                        <h2>Company network unavailable</h2>
                        <p>{error || 'No network data found.'}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="company-network-page">
            <div className="company-network-shell">
                <div className="company-network-topbar">
                    <button className="back-button" onClick={handleBack}>
                        <i className="fas fa-arrow-left"></i>
                        <span>Back</span>
                    </button>
                    <div className="company-network-kicker">
                        <span className="network-symbol">{data.symbol}</span>
                        <span className="network-dot"></span>
                        <span>{data.name}</span>
                        <span className="network-dot"></span>
                        <span>{graphNodes.length} nodes</span>
                    </div>
                </div>

                <section className="company-network-board">
                    <div className="company-network-grid"></div>
                    <svg className="company-network-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        {nodeLayout.map((node) => (
                            <line
                                key={`line-${node.id}`}
                                x1="50"
                                y1="50"
                                x2={node.x}
                                y2={node.y}
                                className={`network-line type-${node.type}`}
                            />
                        ))}
                    </svg>

                    <div className="company-network-center">
                        <div className="company-network-center-ring"></div>
                        <div className="company-network-center-card">
                            <span className="company-network-center-symbol">{data.symbol}</span>
                            <h2>{data.name}</h2>
                            <p>{data.industry || data.sector || 'Public company'}</p>
                        </div>
                    </div>

                    {nodeLayout.map((node) => (
                        <article
                            key={node.id}
                            className={`company-network-node type-${node.type}`}
                            style={{ left: `${node.x}%`, top: `${node.y}%` }}
                        >
                            <span className="company-network-node-type">{NODE_TYPE_LABELS[node.type] || 'Node'}</span>
                            <strong>{node.label}</strong>
                        </article>
                    ))}
                </section>

                <section className="company-network-legend">
                    <div className="company-network-legend-item">
                        <span className="legend-swatch type-brand"></span>
                        <span>Brands</span>
                    </div>
                    <div className="company-network-legend-item">
                        <span className="legend-swatch type-business_line"></span>
                        <span>Business lines</span>
                    </div>
                    <div className="company-network-legend-item">
                        <span className="legend-swatch type-sector"></span>
                        <span>Sector / industry</span>
                    </div>
                    <div className="company-network-legend-item">
                        <span className="legend-swatch type-location"></span>
                        <span>Location</span>
                    </div>
                </section>
            </div>
        </div>
    );
};

window.CompanyNetworkPage = CompanyNetworkPage;

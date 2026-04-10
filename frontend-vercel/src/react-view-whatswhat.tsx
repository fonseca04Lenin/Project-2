export {};

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

interface TopMover {
    symbol: string;
    change: number;
    price?: number;
    sector?: string;
    ai_reason?: string;
}
interface UpcomingEvent {
    title: string;
    date: string;
}
interface SectorPerf {
    name: string;
    change: number;
}
interface MarketData {
    topMovers?: TopMover[];
    upcomingEvents?: UpcomingEvent[];
    sectorPerformance?: SectorPerf[];
}

// What's Hot View Component - Market Analysis & Trends
const WhatsWhatView = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [analysis, setAnalysis] = useState('');
    const [displayedText, setDisplayedText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [typingComplete, setTypingComplete] = useState(false);
    const [marketData, setMarketData] = useState<MarketData | null>(null);
    const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        loadMarketAnalysis();
    }, []);

    const loadMarketAnalysis = async () => {
        try {
            setLoading(true);
            setError('');
            const authHeaders = await getAuthHeaders();
            const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
            const r = await fetch(`${API_BASE}/api/market/analysis`, {
                headers: authHeaders,
                credentials: 'include'
            });
            if (!r.ok) throw new Error('Failed to fetch market analysis');
            const data = await r.json();
            const analysisText = (data.analysis || '').replace(/\bundefined\b/gi, '').replace(/\s{2,}/g, ' ').trim();
            setAnalysis(analysisText);
            setMarketData(data.data || null);
            setLoading(false);
            setTimeout(() => startTypingAnimation(analysisText), 100);
        } catch (e) {
            console.error('Error loading market analysis:', e);
            setError('Unable to load market analysis');
            setLoading(false);
        }
    };

    const startTypingAnimation = (text: string) => {
        setIsTyping(true);
        setDisplayedText('');
        const words = text.split(' ');
        let currentIndex = 0;

        const typeNextWord = () => {
            if (currentIndex < words.length) {
                setDisplayedText(prev => prev + (currentIndex > 0 ? ' ' : '') + words[currentIndex]);
                currentIndex++;
                typingRef.current = setTimeout(typeNextWord, 50);
            } else {
                setIsTyping(false);
                setTypingComplete(true);
            }
        };

        typeNextWord();
    };

    useEffect(() => {
        return () => {
            if (typingRef.current) {
                clearTimeout(typingRef.current);
            }
        };
    }, []);

    const skipTyping = () => {
        if (typingRef.current) {
            clearTimeout(typingRef.current);
        }
        setDisplayedText(analysis);
        setIsTyping(false);
        setTypingComplete(true);
    };

    return (
        <div className="whatswhat-view" style={{
            padding: '2rem',
            maxWidth: '1400px',
            margin: '0 auto'
        }}>
            <div className="view-header" style={{
                marginBottom: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div>
                    <h2 style={{
                        fontSize: '2rem',
                        fontWeight: '700',
                        background: 'linear-gradient(135deg, #00D924, #FF6B35)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        marginBottom: '0.5rem'
                    }}>
                        <i className="fas fa-fire" style={{ marginRight: '0.75rem' }}></i>
                        What's Hot in the Market
                    </h2>
                    <p style={{
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontSize: '0.9375rem'
                    }}>
                        AI-powered market insights, trends, and geopolitical analysis
                    </p>
                </div>
                <button
                    onClick={loadMarketAnalysis}
                    disabled={loading}
                    style={{
                        padding: '0.75rem 1.5rem',
                        background: 'rgba(0, 217, 36, 0.1)',
                        border: '1px solid rgba(0, 217, 36, 0.3)',
                        borderRadius: '6px',
                        color: '#00D924',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.3s ease'
                    }}
                >
                    <i className={`fas fa-${loading ? 'spinner fa-spin' : 'sync-alt'}`} style={{ marginRight: '0.5rem' }}></i>
                    Refresh Analysis
                </button>
            </div>

            {/* Main AI Analysis Card */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(0, 217, 36, 0.05), rgba(255, 107, 53, 0.05))',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '2.5rem',
                marginBottom: '2rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Animated gradient overlay */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #00D924, #FF6B35, #00D924)',
                    backgroundSize: '200% 100%',
                    animation: isTyping ? 'gradientMove 2s linear infinite' : 'none'
                }}></div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '1.5rem'
                }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #00D924, #FF6B35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: '1rem'
                    }}>
                        <i className="fas fa-brain" style={{ color: '#fff' }}></i>
                    </div>
                    <div>
                        <h3 style={{
                            fontSize: '1.25rem',
                            fontWeight: '600',
                            color: '#fff',
                            marginBottom: '0.25rem'
                        }}>
                            This Week's Market Landscape
                        </h3>
                        <p style={{
                            fontSize: '0.875rem',
                            color: 'rgba(255, 255, 255, 0.5)',
                            margin: 0
                        }}>
                            Generated {new Date().toLocaleDateString()} • AI-Powered Analysis
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#00D924', marginBottom: '1rem' }}></i>
                        <p style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Analyzing current market conditions...</p>
                    </div>
                ) : error ? (
                    <div style={{
                        padding: '2rem',
                        background: 'rgba(255, 107, 53, 0.1)',
                        border: '1px solid rgba(255, 107, 53, 0.3)',
                        borderRadius: '8px',
                        textAlign: 'center'
                    }}>
                        <i className="fas fa-exclamation-circle" style={{ fontSize: '2rem', color: '#FF6B35', marginBottom: '1rem' }}></i>
                        <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{error}</p>
                    </div>
                ) : (
                    <>
                        <div style={{
                            fontSize: '1.125rem',
                            lineHeight: '1.8',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '1.5rem',
                            minHeight: '200px'
                        }}>
                            {displayedText}
                            {isTyping && <span className="typing-cursor" style={{
                                display: 'inline-block',
                                width: '2px',
                                height: '1.2em',
                                background: '#00D924',
                                marginLeft: '4px',
                                animation: 'blink 1s infinite'
                            }}></span>}
                        </div>
                        {isTyping && (
                            <button
                                onClick={skipTyping}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    color: 'rgba(255, 255, 255, 0.6)',
                                    fontSize: '0.875rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <i className="fas fa-forward" style={{ marginRight: '0.5rem' }}></i>
                                Skip Animation
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Supporting Content Grid */}
            {typingComplete && marketData && (
                <div className="supporting-content" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '1.5rem',
                    marginBottom: '2rem'
                }}>
                    {/* What's Hot - Top Market Movers */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(0, 217, 36, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)',
                        border: '1px solid rgba(0, 217, 36, 0.2)',
                        borderRadius: '16px',
                        padding: '2rem',
                        minHeight: '450px',
                        gridColumn: 'span 1'
                    }}>
                        <h4 style={{
                            fontSize: '1.5rem',
                            fontWeight: '700',
                            color: '#fff',
                            marginBottom: '1.5rem',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <i className="fas fa-fire" style={{ color: '#FF6B35', marginRight: '0.75rem', fontSize: '1.25rem' }}></i>
                            What's Hot
                            <span style={{
                                marginLeft: 'auto',
                                fontSize: '0.75rem',
                                color: 'rgba(255, 255, 255, 0.5)',
                                fontWeight: '400'
                            }}>Top 5 Movers</span>
                        </h4>
                        <div style={{ fontSize: '0.9375rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                            {marketData.topMovers && marketData.topMovers.length > 0 ? (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {marketData.topMovers.slice(0, 5).map((stock, idx) => (
                                        <li key={idx} style={{
                                            padding: '1.25rem',
                                            marginBottom: idx < 4 ? '0.75rem' : 0,
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(255, 255, 255, 0.05)',
                                            transition: 'transform 0.2s, background 0.2s',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => window.openStockDetailsModalReact && window.openStockDetailsModalReact(stock.symbol)}
                                        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                                        onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'; e.currentTarget.style.transform = 'translateX(0)'; }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        color: 'rgba(255, 255, 255, 0.4)',
                                                        fontWeight: '600',
                                                        width: '20px'
                                                    }}>#{idx + 1}</span>
                                                    <div>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>{stock.symbol}</div>
                                                        {stock.sector && (
                                                            <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.25rem' }}>
                                                                {stock.sector}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{
                                                        color: stock.change >= 0 ? '#00D924' : '#FF6B35',
                                                        fontWeight: '700',
                                                        fontSize: '1.25rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}>
                                                        <i className={stock.change >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down'} style={{ fontSize: '0.875rem' }}></i>
                                                        {stock.change >= 0 ? '+' : ''}{stock.change}%
                                                    </div>
                                                    {stock.price && (
                                                        <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.25rem' }}>
                                                            ${stock.price.toLocaleString()}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {stock.ai_reason && (
                                                <div style={{
                                                    marginTop: '0.75rem',
                                                    padding: '0.75rem',
                                                    background: 'rgba(0, 217, 36, 0.08)',
                                                    borderRadius: '8px',
                                                    borderLeft: `3px solid ${stock.change >= 0 ? '#00D924' : '#FF6B35'}`
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                        <i className="fas fa-robot" style={{ fontSize: '0.75rem', color: '#00D924' }}></i>
                                                        <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)', fontWeight: '600', textTransform: 'uppercase' }}>AI Insight</span>
                                                    </div>
                                                    <p style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.8)', margin: 0, lineHeight: '1.4' }}>
                                                        {stock.ai_reason}
                                                    </p>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>
                                    <i className="fas fa-chart-line" style={{ fontSize: '2rem', color: 'rgba(255, 255, 255, 0.3)', marginBottom: '1rem', display: 'block' }}></i>
                                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>No movers data available</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Key Economic Events */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '1.5rem'
                    }}>
                        <h4 style={{
                            fontSize: '1.125rem',
                            fontWeight: '600',
                            color: '#fff',
                            marginBottom: '1rem',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <i className="fas fa-calendar-alt" style={{ color: '#FF6B35', marginRight: '0.75rem' }}></i>
                            Upcoming Events
                        </h4>
                        <div style={{ fontSize: '0.9375rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                            {marketData.upcomingEvents ? (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {marketData.upcomingEvents.slice(0, 5).map((event, idx) => (
                                        <li key={idx} style={{
                                            padding: '0.75rem 0',
                                            borderBottom: idx < 4 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none'
                                        }}>
                                            <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{event.title}</div>
                                            <div style={{ fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.5)' }}>{event.date}</div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>Loading upcoming events...</p>
                            )}
                        </div>
                    </div>

                    {/* Sector Performance */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(0, 149, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)',
                        border: '1px solid rgba(0, 149, 255, 0.2)',
                        borderRadius: '16px',
                        padding: '2rem',
                        minHeight: '450px'
                    }}>
                        <h4 style={{
                            fontSize: '1.5rem',
                            fontWeight: '700',
                            color: '#fff',
                            marginBottom: '1.5rem',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <i className="fas fa-chart-pie" style={{ color: '#0095FF', marginRight: '0.75rem', fontSize: '1.25rem' }}></i>
                            Sector Performance
                            <span style={{
                                marginLeft: 'auto',
                                fontSize: '0.75rem',
                                color: 'rgba(255, 255, 255, 0.5)',
                                fontWeight: '400'
                            }}>Weekly Change</span>
                        </h4>
                        <div style={{ fontSize: '0.9375rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                            {marketData.sectorPerformance && marketData.sectorPerformance.length > 0 ? (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {marketData.sectorPerformance.slice(0, 6).map((sector, idx) => (
                                        <li key={idx} style={{
                                            padding: '1rem',
                                            marginBottom: idx < 5 ? '0.5rem' : 0,
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    background: sector.change >= 0 ? '#00D924' : '#FF6B35'
                                                }}></div>
                                                <span style={{ fontWeight: '500' }}>{sector.name}</span>
                                            </div>
                                            <span style={{
                                                color: sector.change >= 0 ? '#00D924' : '#FF6B35',
                                                fontWeight: '700',
                                                fontSize: '1rem'
                                            }}>
                                                {sector.change >= 0 ? '+' : ''}{sector.change}%
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>
                                    <i className="fas fa-chart-pie" style={{ fontSize: '2rem', color: 'rgba(255, 255, 255, 0.3)', marginBottom: '1rem', display: 'block' }}></i>
                                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>No sector data available</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Geopolitical Insights */}
            {typingComplete && (
                <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '2rem',
                    marginBottom: '2rem'
                }}>
                    <h3 style={{
                        fontSize: '1.5rem',
                        fontWeight: '600',
                        color: '#fff',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <i className="fas fa-globe" style={{ color: '#FF6B35', marginRight: '0.75rem' }}></i>
                        Geopolitical Factors
                    </h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '1rem'
                    }}>
                        <div style={{ padding: '1rem', background: 'rgba(0, 217, 36, 0.05)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.5rem' }}>Federal Reserve</div>
                            <div style={{ fontSize: '1rem', color: '#fff', fontWeight: '600' }}>Interest Rate Decision Pending</div>
                        </div>
                        <div style={{ padding: '1rem', background: 'rgba(255, 107, 53, 0.05)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.5rem' }}>Global Trade</div>
                            <div style={{ fontSize: '1rem', color: '#fff', fontWeight: '600' }}>Supply Chain Developments</div>
                        </div>
                        <div style={{ padding: '1rem', background: 'rgba(0, 217, 36, 0.05)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.5rem' }}>Energy Markets</div>
                            <div style={{ fontSize: '1rem', color: '#fff', fontWeight: '600' }}>Oil Prices Fluctuating</div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes gradientMove {
                    0% { background-position: 0% 50%; }
                    100% { background-position: 200% 50%; }
                }
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
};

window.WhatsWhatView = WhatsWhatView;

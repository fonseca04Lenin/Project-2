import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export function MarketIntelligenceWidget({ onNavigate }: { onNavigate: (view: string) => void }) {
    const [earningsCount, setEarningsCount] = useState<number | null>(null);
    const [newsData, setNewsData] = useState<{ count: number; headline: string | null } | null>(null);
    const [topSector, setTopSector] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [earningsRes, newsRes] = await Promise.allSettled([
                    api.market.earnings(),
                    api.news.market({ limit: 5 }),
                ]);

                if (earningsRes.status === 'fulfilled') {
                    const arr = Array.isArray(earningsRes.value) ? earningsRes.value : [];
                    if (!cancelled) setEarningsCount(arr.length);
                }

                if (newsRes.status === 'fulfilled') {
                    const data: any = newsRes.value;
                    const articles = Array.isArray(data) ? data : (data.articles || []);
                    if (!cancelled) setNewsData({ count: articles.length, headline: articles[0]?.title || articles[0]?.headline || null });
                }

                try {
                    const sectors = await api.market.sectorsBatch(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'JNJ', 'XOM']);
                    const counts: Record<string, number> = {};
                    Object.values(sectors).forEach((s) => {
                        const key = String(s);
                        counts[key] = (counts[key] || 0) + 1;
                    });
                    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                    if (top && !cancelled) setTopSector(top[0]);
                } catch { /* ignore */ }
            } catch { /* ignore */ } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleClick = (tab: string) => {
        if (tab === 'earnings') { onNavigate('research'); return; }
        onNavigate('news');
    };

    const items = [
        { icon: 'fa-calendar', title: 'Earnings Calendar', subtitle: loading ? 'Loading...' : (earningsCount !== null ? `${earningsCount} companies reporting soon` : 'View upcoming earnings'), tab: 'earnings' as const },
        { icon: 'fa-chart-bar', title: 'Sector Performance', subtitle: loading ? 'Loading...' : (topSector ? `${topSector} leading today` : 'View sector trends'), tab: null as string | null },
        { icon: 'fa-file-alt', title: 'Market News', subtitle: loading ? 'Loading...' : (newsData?.headline ? newsData.headline.substring(0, 50) + (newsData.headline.length > 50 ? '...' : '') : 'Latest market updates'), tab: null as string | null },
    ];

    return (
        <div className="insights-list">
            {items.map((item, i) => (
                <div
                    key={i}
                    className="insight-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => item.tab ? handleClick(item.tab) : onNavigate(item.title === 'Market News' ? 'news' : 'research')}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            item.tab ? handleClick(item.tab) : onNavigate(item.title === 'Market News' ? 'news' : 'research');
                        }
                    }}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="insight-icon"><i className={`fas ${item.icon}`}></i></div>
                    <div className="insight-content">
                        <h4>{item.title}</h4>
                        <p>{item.subtitle}</p>
                    </div>
                    <i className="fas fa-chevron-right insight-chevron"></i>
                </div>
            ))}
        </div>
    );
}

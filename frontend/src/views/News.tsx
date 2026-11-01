import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

interface NewsArticle {
    title?: string;
    description?: string;
    summary?: string;
    url?: string;
    link?: string;
    source?: string;
    category?: string;
    published_at?: string;
    publishedAt?: string;
    image_url?: string;
}

const PAGE_SIZE = 9;

export default function News() {
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [articles, setArticles] = useState<NewsArticle[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [query, setQuery] = useState('');

    const inFlightRef = useRef(false);
    const pageRef = useRef(1);
    const queryRef = useRef('');

    const fetchPage = async (page: number, append: boolean, currentQuery: string) => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;

        if (append) setLoadingMore(true);
        else { setLoading(true); setHasMore(true); setError(''); }

        try {
            const data = await api.news.market({
                limit: PAGE_SIZE,
                page,
                q: currentQuery.trim() || undefined,
            });
            const fetched: NewsArticle[] = (data.articles as NewsArticle[]) || [];
            if (append) setArticles((prev) => [...prev, ...fetched]);
            else setArticles(fetched);
            setHasMore(fetched.length >= PAGE_SIZE);
        } catch {
            setError('Unable to load news right now');
            if (!append) { setArticles([]); setHasMore(false); }
        } finally {
            if (append) setLoadingMore(false);
            else setLoading(false);
            inFlightRef.current = false;
        }
    };

    useEffect(() => {
        pageRef.current = 1;
        queryRef.current = '';
        fetchPage(1, false, '');
    }, []);

    const loadMore = () => {
        if (inFlightRef.current || !hasMore) return;
        const next = pageRef.current + 1;
        pageRef.current = next;
        fetchPage(next, true, queryRef.current);
    };

    const triggerSearch = () => {
        if (loading || loadingMore) return;
        pageRef.current = 1;
        queryRef.current = query;
        fetchPage(1, false, query);
    };

    const getImgUrl = (a: NewsArticle): string | null => {
        if (a?.image_url && a.image_url !== 'null' && a.image_url.trim() !== '') return a.image_url;
        return null;
    };

    return (
        <div className="news-view">
            <div className="view-header">
                <h2>Market News</h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                        className="search-input"
                        style={{ maxWidth: '240px' }}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); triggerSearch(); } }}
                        placeholder="Search news"
                    />
                    <button className="search-btn" onClick={triggerSearch} disabled={loading || loadingMore}>
                        {query.trim() ? 'Search' : 'Refresh'}
                    </button>
                    {error && <span style={{ color: '#FF6B35', fontSize: '0.9rem' }}>{error}</span>}
                </div>
            </div>

            <div className="news-editorial">
                {loading ? (
                    <div className="news-hero-skeleton">
                        <div className="news-hero-img-skel skeleton-pulse" />
                        <div className="news-hero-text-skel">
                            <div className="skeleton-pulse" style={{ height: '12px', width: '72px', marginBottom: '4px' }} />
                            <div className="skeleton-pulse" style={{ height: '30px', width: '92%', marginBottom: '6px' }} />
                            <div className="skeleton-pulse" style={{ height: '30px', width: '68%', marginBottom: '14px' }} />
                            <div className="skeleton-pulse" style={{ height: '13px', width: '100%', marginBottom: '5px' }} />
                            <div className="skeleton-pulse" style={{ height: '13px', width: '80%', marginBottom: '5px' }} />
                            <div className="skeleton-pulse" style={{ height: '13px', width: '60%' }} />
                        </div>
                    </div>
                ) : articles[0] && (() => {
                    const a = articles[0];
                    const imgUrl = getImgUrl(a);
                    const articleUrl = a.url || a.link;
                    return (
                        <article
                            className="news-hero"
                            onClick={() => articleUrl && window.open(articleUrl, '_blank', 'noopener,noreferrer')}
                            style={{ cursor: articleUrl ? 'pointer' : 'default' }}
                        >
                            <div className="news-hero-image">
                                {imgUrl && (
                                    <img
                                        src={imgUrl}
                                        alt={a.title || 'News'}
                                        className="news-hero-img"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                            const ph = e.currentTarget.parentElement?.querySelector('.news-img-placeholder') as HTMLElement | null;
                                            if (ph) ph.style.display = 'flex';
                                        }}
                                    />
                                )}
                                <div className="news-img-placeholder" style={{ display: imgUrl ? 'none' : 'flex' }}>
                                    <i className="fas fa-chart-line" />
                                </div>
                            </div>
                            <div className="news-hero-content">
                                <span className="news-source-tag">{a.source || a.category || 'Market News'}</span>
                                <h2 className="news-hero-title">{a.title || '—'}</h2>
                                {(a.description || a.summary) && <p className="news-hero-desc">{a.description || a.summary}</p>}
                                <div className="news-item-meta">
                                    <span className="news-time"><i className="fas fa-clock" /> {a.published_at || a.publishedAt || ''}</span>
                                    {articleUrl && (
                                        <a className="read-more" href={articleUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                            Read More <i className="fas fa-arrow-right" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </article>
                    );
                })()}

                <div className="news-section-divider" />

                <div className="news-body">
                    <div className="news-main-col">
                        {(loading ? Array.from({ length: 4 }) as NewsArticle[] : articles.slice(1, 5)).map((a, i) => {
                            if (loading) {
                                return (
                                    <div key={i} className="news-list-item">
                                        <div className="news-list-text">
                                            <div className="skeleton-pulse" style={{ height: '11px', width: '56px', marginBottom: '7px' }} />
                                            <div className="skeleton-pulse" style={{ height: '18px', width: '95%', marginBottom: '5px' }} />
                                            <div className="skeleton-pulse" style={{ height: '18px', width: '72%', marginBottom: '8px' }} />
                                            <div className="skeleton-pulse" style={{ height: '11px', width: '44%' }} />
                                        </div>
                                        <div className="news-list-thumb skeleton-pulse" />
                                    </div>
                                );
                            }
                            if (!a) return null;
                            const imgUrl = getImgUrl(a);
                            const articleUrl = a.url || a.link;
                            return (
                                <article
                                    key={a.url || a.title || i}
                                    className="news-list-item"
                                    onClick={() => articleUrl && window.open(articleUrl, '_blank', 'noopener,noreferrer')}
                                    style={{ cursor: articleUrl ? 'pointer' : 'default' }}
                                >
                                    <div className="news-list-text">
                                        <span className="news-source-tag">{a.source || 'News'}</span>
                                        <h3 className="news-list-title">{a.title || '—'}</h3>
                                        {(a.description || a.summary) && <p className="news-list-desc">{a.description || a.summary}</p>}
                                        <span className="news-time"><i className="fas fa-clock" /> {a.published_at || a.publishedAt || ''}</span>
                                    </div>
                                    {imgUrl && (
                                        <div className="news-list-thumb">
                                            <img src={imgUrl} alt={a.title || ''} className="news-thumb-img" onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>

                    <div className="news-sidebar-col">
                        {(loading ? Array.from({ length: 4 }) as NewsArticle[] : articles.slice(5, 9)).map((a, i) => {
                            if (loading) {
                                return (
                                    <div key={i} className="news-sidebar-item">
                                        <div className="news-sidebar-thumb skeleton-pulse" />
                                        <div className="news-sidebar-text">
                                            <div className="skeleton-pulse" style={{ height: '11px', width: '48px', marginBottom: '5px' }} />
                                            <div className="skeleton-pulse" style={{ height: '15px', width: '100%', marginBottom: '4px' }} />
                                            <div className="skeleton-pulse" style={{ height: '15px', width: '75%' }} />
                                        </div>
                                    </div>
                                );
                            }
                            if (!a) return null;
                            const imgUrl = getImgUrl(a);
                            const articleUrl = a.url || a.link;
                            return (
                                <article
                                    key={a.url || a.title || i}
                                    className="news-sidebar-item"
                                    onClick={() => articleUrl && window.open(articleUrl, '_blank', 'noopener,noreferrer')}
                                    style={{ cursor: articleUrl ? 'pointer' : 'default' }}
                                >
                                    {imgUrl && (
                                        <div className="news-sidebar-thumb">
                                            <img src={imgUrl} alt={a.title || ''} className="news-thumb-img" onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                                        </div>
                                    )}
                                    <div className="news-sidebar-text">
                                        <span className="news-source-tag">{a.source || 'News'}</span>
                                        <h4 className="news-sidebar-title">{a.title || '—'}</h4>
                                        <span className="news-time"><i className="fas fa-clock" /> {a.published_at || a.publishedAt || ''}</span>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>

                {!loading && articles.length > 9 && (
                    <div className="news-more-list">
                        <div className="news-section-divider" />
                        {articles.slice(9).map((a, i) => {
                            const imgUrl = getImgUrl(a);
                            const articleUrl = a.url || a.link;
                            return (
                                <article key={a.url || a.title || i} className="news-list-item" onClick={() => articleUrl && window.open(articleUrl, '_blank', 'noopener,noreferrer')} style={{ cursor: articleUrl ? 'pointer' : 'default' }}>
                                    <div className="news-list-text">
                                        <span className="news-source-tag">{a.source || 'News'}</span>
                                        <h3 className="news-list-title">{a.title || '—'}</h3>
                                        {(a.description || a.summary) && <p className="news-list-desc">{a.description || a.summary}</p>}
                                        <span className="news-time"><i className="fas fa-clock" /> {a.published_at || a.publishedAt || ''}</span>
                                    </div>
                                    {imgUrl && (
                                        <div className="news-list-thumb">
                                            <img src={imgUrl} alt={a.title || ''} className="news-thumb-img" onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {!loading && articles.length === 0 && !error && <div className="news-empty-message">No news articles found</div>}

            {!loading && articles.length > 0 && (
                <div className="news-infinite-status">
                    {hasMore && (
                        <button className="load-more-btn" onClick={loadMore} disabled={loadingMore}>
                            {loadingMore ? (<><i className="fas fa-spinner fa-spin" /> Loading...</>) : (<><i className="fas fa-plus" /> Load More News</>)}
                        </button>
                    )}
                    {!hasMore && <div className="news-end-message">No more news to load</div>}
                </div>
            )}
        </div>
    );
}

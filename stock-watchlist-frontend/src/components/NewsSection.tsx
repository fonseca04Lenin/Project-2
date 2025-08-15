import React, { useState, useEffect } from 'react';
import { NewsItem } from '../types/stock';

const NewsSection: React.FC = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const response = await fetch('/api/news/market');
      if (response.ok) {
        const data = await response.json();
        setNews(data.news || []);
      }
    } catch (error) {
      console.error('Failed to fetch news:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchNews();
  };

  if (loading) {
    return (
      <section className="news-section">
        <div className="section-header">
          <h2>
            <i className="fas fa-newspaper"></i>
            Market News
          </h2>
        </div>
        <div className="loading-state">
          <i className="fas fa-spinner fa-spin"></i>
          <p>Loading news...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="news-section">
      <div className="section-header">
        <h2>
          <i className="fas fa-newspaper"></i>
          Market News
        </h2>
        <button className="refresh-btn" onClick={handleRefresh} title="Refresh News">
          <i className="fas fa-sync-alt"></i>
        </button>
      </div>

      <div className="news-container">
        {news.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-newspaper"></i>
            <p>No news available</p>
            <small>Check back later for the latest market updates</small>
          </div>
        ) : (
          news.map((item, index) => (
            <div key={index} className="news-item">
              <div className="news-item-header">
                <div className="news-item-title">
                  <a href={item.link} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                </div>
              </div>
              
              <div className="news-item-meta">
                <span className="news-item-source">{item.source}</span>
                <span className="news-item-date">{formatDate(item.published_at)}</span>
              </div>
              
              {item.summary && (
                <div className="news-item-summary">{item.summary}</div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default NewsSection; 
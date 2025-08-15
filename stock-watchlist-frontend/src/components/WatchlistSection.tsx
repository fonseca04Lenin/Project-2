import React, { useState, useEffect } from 'react';
import { WatchlistItem, WebSocketWatchlistUpdate, WebSocketAlertTriggered } from '../types/stock';
import { useWebSocket } from '../contexts/WebSocketContext';

const WatchlistSection: React.FC = () => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { socket, isConnected } = useWebSocket();

  useEffect(() => {
    fetchWatchlist();
  }, []);

  // Listen for real-time watchlist updates
  useEffect(() => {
    if (socket && isConnected) {
      socket.on('watchlist_updated', (data: WebSocketWatchlistUpdate) => {
        console.log('📊 Real-time watchlist update received:', data);
        setWatchlist(prev => {
          const updated = [...prev];
          data.prices.forEach((priceUpdate) => {
            const index = updated.findIndex(item => item.symbol === priceUpdate.symbol);
            if (index !== -1) {
              updated[index] = {
                ...updated[index],
                price: priceUpdate.price,
                priceChange: priceUpdate.price_change,
                priceChangePercent: priceUpdate.price_change_percent,
                lastUpdated: priceUpdate.last_updated
              };
            }
          });
          return updated;
        });
      });

      socket.on('alert_triggered', (data: WebSocketAlertTriggered) => {
        console.log('🔔 Alert triggered:', data);
        // You could show a notification here
        showNotification(`Alert triggered for ${data.symbol}!`, 'warning');
      });

      return () => {
        socket.off('watchlist_updated');
        socket.off('alert_triggered');
      };
    }
  }, [socket, isConnected]);

  const showNotification = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    // Create a notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
      ${message}
    `;
    
    // Add to notification container
    const container = document.getElementById('notificationContainer');
    if (container) {
      container.appendChild(notification);
      
      // Remove after 5 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 5000);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const response = await fetch('/api/watchlist', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setWatchlist(data.watchlist || []);
      }
    } catch (error) {
      console.error('Failed to fetch watchlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromWatchlist = async (symbol: string) => {
    try {
      const response = await fetch(`/api/watchlist/${symbol}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
        showNotification(`${symbol} removed from watchlist`, 'success');
      }
    } catch (error) {
      console.error('Failed to remove from watchlist:', error);
      showNotification('Failed to remove from watchlist', 'error');
    }
  };

  const handleClearWatchlist = async () => {
    if (!window.confirm('Are you sure you want to clear your watchlist?')) {
      return;
    }

    try {
      // Remove each item one by one
      for (const item of watchlist) {
        await fetch(`/api/watchlist/${item.symbol}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      }
      setWatchlist([]);
      showNotification('Watchlist cleared', 'success');
    } catch (error) {
      console.error('Failed to clear watchlist:', error);
      showNotification('Failed to clear watchlist', 'error');
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const formatPriceChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${formatPrice(change)}`;
  };

  const formatPriceChangePercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const getPerformanceClass = (change: number) => {
    if (change > 0) return 'watchlist-perf-up';
    if (change < 0) return 'watchlist-perf-down';
    return 'watchlist-perf-flat';
  };

  if (loading) {
    return (
      <section className="watchlist-section">
        <div className="section-header">
          <h2>
            <i className="fas fa-star"></i>
            My Watchlist
          </h2>
        </div>
        <div className="loading-state">
          <i className="fas fa-spinner fa-spin"></i>
          <p>Loading watchlist...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="watchlist-section">
      <div className="section-header">
        <h2>
          <i className="fas fa-star"></i>
          My Watchlist
          {isConnected && (
            <span style={{ fontSize: '0.8rem', color: '#22c55e', marginLeft: '0.5rem' }}>
              <i className="fas fa-circle"></i> Live
            </span>
          )}
        </h2>
        {watchlist.length > 0 && (
          <button className="clear-btn" onClick={handleClearWatchlist} title="Clear All">
            <i className="fas fa-trash"></i>
          </button>
        )}
      </div>

      <div className="watchlist-container">
        {watchlist.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-star"></i>
            <p>Your watchlist is empty</p>
            <small>Search for stocks and add them to your watchlist to get started</small>
          </div>
        ) : (
          watchlist.map((item) => (
            <div key={item.symbol} className="watchlist-item">
              <div className="watchlist-item-header">
                <div>
                  <h4>{item.name}</h4>
                  <div className="watchlist-item-symbol">{item.symbol}</div>
                </div>
                <div className="watchlist-item-price">
                  {formatPrice(item.price)}
                  {item.lastUpdated && (
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                      <i className="fas fa-clock"></i> Live
                    </div>
                  )}
                </div>
              </div>

              {item.priceChange !== undefined && (
                <div className={`watchlist-item-performance ${getPerformanceClass(item.priceChange)}`}>
                  {formatPriceChange(item.priceChange)} ({formatPriceChangePercent(item.priceChangePercent || 0)})
                </div>
              )}

              <div className="watchlist-item-actions">
                <button 
                  className="btn btn-small btn-secondary"
                  onClick={() => handleRemoveFromWatchlist(item.symbol)}
                >
                  <i className="fas fa-times"></i>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default WatchlistSection; 
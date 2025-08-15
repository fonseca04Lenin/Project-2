import React, { useState } from 'react';
import { Stock } from '../types/stock';

interface StockCardProps {
  stock: Stock;
}

const StockCard: React.FC<StockCardProps> = ({ stock }) => {
  const [loading, setLoading] = useState(false);

  const handleAddToWatchlist = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          symbol: stock.symbol,
          company_name: stock.name,
        }),
      });

      if (response.ok) {
        // You could add a toast notification here
        console.log('Added to watchlist');
      } else {
        const error = await response.json();
        console.error('Failed to add to watchlist:', error);
      }
    } catch (error) {
      console.error('Failed to add to watchlist:', error);
    } finally {
      setLoading(false);
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

  const getPriceChangeClass = (change: number) => {
    if (change > 0) return 'positive';
    if (change < 0) return 'negative';
    return '';
  };

  return (
    <div className="stock-card">
      <div className="stock-header">
        <div className="stock-info">
          <h3>{stock.name}</h3>
          <div className="stock-symbol">{stock.symbol}</div>
        </div>
        <div className="stock-price">
          <div className="current-price">{formatPrice(stock.price)}</div>
          {stock.priceChange !== undefined && (
            <div className={`price-change ${getPriceChangeClass(stock.priceChange)}`}>
              <i className={`fas fa-arrow-${stock.priceChange >= 0 ? 'up' : 'down'}`}></i>
              {formatPriceChange(stock.priceChange)} ({formatPriceChangePercent(stock.priceChangePercent || 0)})
            </div>
          )}
        </div>
      </div>

      <div className="stock-actions">
        <button 
          className="btn btn-primary"
          onClick={handleAddToWatchlist}
          disabled={loading}
        >
          {loading ? (
            <>
              <i className="fas fa-spinner fa-spin"></i>
              Adding...
            </>
          ) : (
            <>
              <i className="fas fa-star"></i>
              Add to Watchlist
            </>
          )}
        </button>
        
        <button className="btn btn-secondary">
          <i className="fas fa-chart-line"></i>
          View Chart
        </button>
        
        <button className="btn btn-secondary">
          <i className="fas fa-newspaper"></i>
          News
        </button>
      </div>

      {stock.triggeredAlerts && stock.triggeredAlerts.length > 0 && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '0.5rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <h4 style={{ color: '#f59e0b', marginBottom: '0.5rem' }}>
            <i className="fas fa-bell"></i> Triggered Alerts
          </h4>
          {stock.triggeredAlerts.map((alert, index) => (
            <div key={index} style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>
              {alert.alert_type === 'above' ? 'Above' : 'Below'} ${alert.target_price}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StockCard; 
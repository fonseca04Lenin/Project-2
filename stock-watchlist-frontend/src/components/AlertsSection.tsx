import React, { useState, useEffect } from 'react';
import { Alert } from '../types/stock';

const AlertsSection: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    symbol: '',
    target_price: '',
    alert_type: 'above' as 'above' | 'below',
  });

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/alerts', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.symbol || !formData.target_price) {
      return;
    }

    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          symbol: formData.symbol.toUpperCase(),
          target_price: parseFloat(formData.target_price),
          alert_type: formData.alert_type,
        }),
      });

      if (response.ok) {
        const newAlert = await response.json();
        setAlerts(prev => [...prev, newAlert.alert]);
        setFormData({ symbol: '', target_price: '', alert_type: 'above' });
      } else {
        const error = await response.json();
        console.error('Failed to create alert:', error);
      }
    } catch (error) {
      console.error('Failed to create alert:', error);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      }
    } catch (error) {
      console.error('Failed to delete alert:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (loading) {
    return (
      <div className="alerts-container">
        <h2>Price Alerts</h2>
        <div className="loading-state">
          <i className="fas fa-spinner fa-spin"></i>
          <p>Loading alerts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-container">
      <h2>Price Alerts</h2>
      
      <form className="alerts-form" onSubmit={handleSubmit}>
        <input
          type="text"
          name="symbol"
          placeholder="Stock Symbol (e.g., AAPL)"
          value={formData.symbol}
          onChange={handleInputChange}
          required
        />
        
        <input
          type="number"
          name="target_price"
          placeholder="Target Price"
          step="0.01"
          min="0"
          value={formData.target_price}
          onChange={handleInputChange}
          required
        />
        
        <select
          name="alert_type"
          value={formData.alert_type}
          onChange={handleInputChange}
        >
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        
        <button type="submit">
          <i className="fas fa-bell"></i>
          Create Alert
        </button>
      </form>

      <div id="alerts-list">
        {alerts.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-bell"></i>
            <p>No alerts set</p>
            <small>Create price alerts to get notified when stocks hit your target prices</small>
          </div>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className={`alert-item ${alert.triggered ? 'triggered' : ''}`}>
              <div className="alert-info">
                <strong>{alert.symbol}</strong> - {alert.alert_type === 'above' ? 'Above' : 'Below'} ${alert.target_price}
                {alert.triggered && (
                  <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>
                    <i className="fas fa-exclamation-triangle"></i> Triggered
                  </span>
                )}
              </div>
              <div className="alert-actions">
                <button
                  className="alert-delete"
                  onClick={() => handleDeleteAlert(alert.id)}
                >
                  <i className="fas fa-trash"></i>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsSection; 
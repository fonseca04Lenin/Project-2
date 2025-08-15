import React, { useState, useEffect } from 'react';
import { User } from '../types/user';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import SearchSection from './SearchSection';
import WatchlistSection from './WatchlistSection';
import NewsSection from './NewsSection';
import AlertsSection from './AlertsSection';
import MarketIntelligence from './MarketIntelligence';
import { MarketStatus } from '../types/stock';

interface DashboardProps {
  user: User;
  setUser: (user: User | null) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, setUser }) => {
  const { logout } = useAuth();
  const { socket, isConnected } = useWebSocket();
  const [marketStatus, setMarketStatus] = useState<MarketStatus>({
    status: 'unknown',
    message: 'Loading...'
  });

  useEffect(() => {
    fetchMarketStatus();
  }, []);

  // Listen for real-time market status updates
  useEffect(() => {
    if (socket && isConnected) {
      socket.on('market_status_updated', (data: MarketStatus) => {
        console.log('📈 Real-time market status update:', data);
        setMarketStatus(data);
      });

      return () => {
        socket.off('market_status_updated');
      };
    }
  }, [socket, isConnected]);

  const fetchMarketStatus = async () => {
    try {
      const response = await fetch('/api/market-status');
      if (response.ok) {
        const data = await response.json();
        setMarketStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch market status:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div id="main-content" className="main-content">
      {/* Notification Container */}
      <div id="notificationContainer" className="notification-container"></div>
      
      <header className="main-header">
        <div className="header-content">
          <div className="header-center">
            <h1 className="app-title">Stock Watchlist Pro</h1>
            <p className="welcome-message">Track your favorite stocks and stay updated with market news</p>
            <div className="market-status-wrapper">
              <span className="market-status-indicator">
                {marketStatus.message}
                {isConnected && (
                  <span style={{ marginLeft: '0.5rem', color: '#22c55e' }}>
                    <i className="fas fa-circle"></i>
                  </span>
                )}
              </span>
            </div>
          </div>
          
          <div className="user-info">
            <span>Welcome, {user.username}!</span>
            <button className="logout-btn" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt"></i>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div id="username-welcome" className="username-welcome">
        Welcome back, {user.username}! 👋
      </div>

      <main className="main">
        <div className="container">
          <SearchSection />
          
          <div className="dashboard">
            <div className="content-grid">
              <WatchlistSection />
              <NewsSection />
            </div>
            
            <AlertsSection />
            <MarketIntelligence />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard; 
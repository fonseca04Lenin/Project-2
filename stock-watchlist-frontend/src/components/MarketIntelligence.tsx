import React, { useState } from 'react';

const MarketIntelligence: React.FC = () => {
  const [activeTab, setActiveTab] = useState('earnings');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const tabs = [
    { id: 'earnings', label: 'Earnings', icon: 'fas fa-chart-line' },
    { id: 'insider', label: 'Insider Trading', icon: 'fas fa-user-tie' },
    { id: 'analyst', label: 'Analyst Ratings', icon: 'fas fa-chart-bar' },
    { id: 'options', label: 'Options Data', icon: 'fas fa-chart-area' },
  ];

  const fetchData = async (type: string, symbol?: string) => {
    setLoading(true);
    try {
      let endpoint = '';
      switch (type) {
        case 'earnings':
          endpoint = '/api/market/earnings';
          break;
        case 'insider':
          endpoint = `/api/market/insider-trading/${symbol}`;
          break;
        case 'analyst':
          endpoint = `/api/market/analyst-ratings/${symbol}`;
          break;
        case 'options':
          endpoint = `/api/market/options/${symbol}`;
          break;
      }

      const response = await fetch(endpoint);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error(`Failed to fetch ${type} data:`, error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    setData(null);
    
    if (tabId === 'earnings') {
      fetchData('earnings');
    }
  };

  const handleSearch = (e: React.FormEvent, type: string) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const symbol = (form.elements.namedItem('symbol') as HTMLInputElement).value;
    
    if (symbol) {
      fetchData(type, symbol.toUpperCase());
    }
  };

  return (
    <div className="market-intelligence-container">
      <h2>
        <i className="fas fa-brain"></i>
        Market Intelligence
      </h2>

      <div className="intelligence-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            <i className={tab.icon}></i>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content active">
        {activeTab === 'earnings' && (
          <div>
            <h3>Upcoming Earnings</h3>
            {loading ? (
              <div className="loading-state">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Loading earnings data...</p>
              </div>
            ) : data ? (
              <div className="earnings-list">
                {data.earnings?.map((earning: any, index: number) => (
                  <div key={index} className="earnings-item">
                    <div className="earnings-header">
                      <div>
                        <div className="earnings-symbol">{earning.symbol}</div>
                        <div className="earnings-company">{earning.company}</div>
                      </div>
                      <div className="earnings-date">{earning.date}</div>
                    </div>
                    <div className={`earnings-estimate ${earning.estimate > 0 ? 'positive' : 'negative'}`}>
                      <i className="fas fa-dollar-sign"></i>
                      Estimate: ${earning.estimate}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <i className="fas fa-chart-line"></i>
                <p>No earnings data available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'insider' && (
          <div>
            <h3>Insider Trading</h3>
            <form className="insider-search" onSubmit={(e) => handleSearch(e, 'insider')}>
              <input
                type="text"
                name="symbol"
                placeholder="Enter stock symbol (e.g., AAPL)"
                required
              />
              <button type="submit">
                <i className="fas fa-search"></i>
                Search
              </button>
            </form>
            {loading ? (
              <div className="loading-state">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Loading insider trading data...</p>
              </div>
            ) : data ? (
              <div className="insider-list">
                {data.insider_trading?.map((trade: any, index: number) => (
                  <div key={index} className="insider-item">
                    <div className="insider-header">
                      <div className="insider-filer">{trade.filer}</div>
                      <div className="insider-date">{trade.date}</div>
                    </div>
                    <div className="insider-shares">
                      <i className="fas fa-chart-line"></i>
                      Shares: {trade.shares}
                    </div>
                    <div className={`insider-transaction ${trade.transaction_type.toLowerCase()}`}>
                      <i className={`fas fa-arrow-${trade.transaction_type.toLowerCase() === 'buy' ? 'up' : 'down'}`}></i>
                      {trade.transaction_type}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <i className="fas fa-user-tie"></i>
                <p>Search for insider trading data</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analyst' && (
          <div>
            <h3>Analyst Ratings</h3>
            <form className="analyst-search" onSubmit={(e) => handleSearch(e, 'analyst')}>
              <input
                type="text"
                name="symbol"
                placeholder="Enter stock symbol (e.g., AAPL)"
                required
              />
              <button type="submit">
                <i className="fas fa-search"></i>
                Search
              </button>
            </form>
            {loading ? (
              <div className="loading-state">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Loading analyst ratings...</p>
              </div>
            ) : data ? (
              <div className="analyst-list">
                {data.ratings?.map((rating: any, index: number) => (
                  <div key={index} className="analyst-item">
                    <div className="analyst-header">
                      <div className="analyst-firm">{rating.firm}</div>
                      <div className="analyst-date">{rating.date}</div>
                    </div>
                    <div className={`analyst-rating ${rating.rating.toLowerCase()}`}>
                      <i className="fas fa-star"></i>
                      {rating.rating}
                    </div>
                    {rating.target && (
                      <div className="analyst-target">
                        <i className="fas fa-bullseye"></i>
                        Target: ${rating.target}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <i className="fas fa-chart-bar"></i>
                <p>Search for analyst ratings</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'options' && (
          <div>
            <h3>Options Data</h3>
            <form className="options-search" onSubmit={(e) => handleSearch(e, 'options')}>
              <input
                type="text"
                name="symbol"
                placeholder="Enter stock symbol (e.g., AAPL)"
                required
              />
              <button type="submit">
                <i className="fas fa-search"></i>
                Search
              </button>
            </form>
            {loading ? (
              <div className="loading-state">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Loading options data...</p>
              </div>
            ) : data ? (
              <div className="options-list">
                {data.options?.map((option: any, index: number) => (
                  <div key={index} className="options-item">
                    <div className="options-expiration">
                      <i className="fas fa-calendar"></i>
                      Expiration: {option.expiration}
                    </div>
                    <div className="options-strikes">
                      {option.strikes?.map((strike: any, strikeIndex: number) => (
                        <div key={strikeIndex} className={`strike-item ${strike.type.toLowerCase()}-option`}>
                          <div className="strike-price">${strike.strike}</div>
                          <div className="strike-bid">
                            <i className="fas fa-arrow-down"></i>
                            Bid: ${strike.bid}
                          </div>
                          <div className="strike-ask">
                            <i className="fas fa-arrow-up"></i>
                            Ask: ${strike.ask}
                          </div>
                          <div className="strike-volume">
                            <i className="fas fa-chart-bar"></i>
                            Volume: {strike.volume}
                          </div>
                          <div className="strike-interest">
                            <i className="fas fa-eye"></i>
                            OI: {strike.open_interest}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <i className="fas fa-chart-area"></i>
                <p>Search for options data</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketIntelligence; 
// React Market Intelligence Component
const { useState, useEffect } = React;

// Initialize API_BASE_URL once to avoid duplicate declarations
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';
}

// Use window.API_BASE_URL to avoid const redeclaration errors
const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');

const MarketIntelligence = () => {
    const [activeTab, setActiveTab] = useState('earnings');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Load initial data when component mounts
    useEffect(() => {
        if (activeTab === 'earnings') {
            loadEarningsCalendar();
        }
    }, []);

    // Handle tab change
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setData(null);
        setError(null);
        
        // Load appropriate data for the tab
        if (tab === 'earnings') {
            loadEarningsCalendar();
        }
        // Other tabs load data when user enters a search query
    };

    // Load earnings calendar
    const loadEarningsCalendar = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const response = await fetch(`${API_BASE}/api/market/earnings`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const earningsData = await response.json();
            setData(earningsData);
        } catch (err) {
            setError('Failed to load earnings calendar');
            console.error('Error loading earnings:', err);
        } finally {
            setLoading(false);
        }
    };

    // Handle search for insider trading, analyst ratings, and options
    const handleSearch = async (tab) => {
        if (!searchQuery.trim()) {
            setError('Please enter a stock symbol');
            return;
        }

        setLoading(true);
        setError(null);
        setShowSuggestions(false);

        try {
            let endpoint = '';
            if (tab === 'insider') {
                endpoint = `${API_BASE}/api/market/insider-trading/${searchQuery.toUpperCase()}`;
            } else if (tab === 'analyst') {
                endpoint = `${API_BASE}/api/market/analyst-ratings/${searchQuery.toUpperCase()}`;
            } else if (tab === 'options') {
                endpoint = `${API_BASE}/api/market/options/${searchQuery.toUpperCase()}`;
            }

            const response = await fetch(endpoint, {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            setData(result);
        } catch (err) {
            setError(`Failed to load ${tab} data`);
            console.error(`Error loading ${tab}:`, err);
        } finally {
            setLoading(false);
        }
    };

    // Format date helper
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    };

    // Render earnings tab
    const renderEarnings = () => {
        if (loading) {
            return (
                <div className="empty-state">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading earnings calendar...</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="empty-state">
                    <i className="fas fa-exclamation-triangle"></i>
                    <p>{error}</p>
                </div>
            );
        }

        if (!data || data.length === 0) {
            return (
                <div className="empty-state">
                    <i className="fas fa-calendar"></i>
                    <p>No upcoming earnings found</p>
                </div>
            );
        }

        return (
            <div className="earnings-list">
                {data.map((earning, index) => (
                    <div key={index} className="earnings-item">
                        <div className="earnings-header">
                            <div>
                                <h4>{earning.symbol}</h4>
                                <p>{earning.company}</p>
                            </div>
                            <span className="earnings-date">{formatDate(earning.earnings_date)}</span>
                        </div>
                        <div className="earnings-details">
                            <div className="earnings-estimate">
                                <span>Estimate: </span>
                                <strong>${earning.estimate.toFixed(2)}</strong>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // Render insider trading tab
    const renderInsiderTrading = () => {
        return (
            <div className="intelligence-search-tab">
                <div className="intelligence-search-bar">
                    <input
                        type="text"
                        placeholder="Enter stock symbol (e.g., AAPL)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setShowSuggestions(true)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch('insider')}
                    />
                    <button onClick={() => handleSearch('insider')}>
                        <i className="fas fa-search"></i> Search
                    </button>
                </div>

                {loading && (
                    <div className="empty-state">
                        <i className="fas fa-spinner fa-spin"></i>
                        <p>Loading insider trading data...</p>
                    </div>
                )}

                {error && (
                    <div className="empty-state">
                        <i className="fas fa-exclamation-triangle"></i>
                        <p>{error}</p>
                    </div>
                )}

                {data && !loading && (
                    <div className="insider-list">
                        {data.map((trade, index) => (
                            <div key={index} className="insider-item">
                                <div className="insider-header">
                                    <strong>{trade.executive}</strong>
                                    <span>{formatDate(trade.transaction_date)}</span>
                                </div>
                                <div className="insider-details">
                                    <span>{trade.transaction_type}</span>
                                    <strong>{trade.shares}</strong>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!data && !loading && (
                    <div className="empty-state">
                        <i className="fas fa-chart-line"></i>
                        <p>Search for insider trading data</p>
                    </div>
                )}
            </div>
        );
    };

    // Render analyst ratings tab
    const renderAnalystRatings = () => {
        return (
            <div className="intelligence-search-tab">
                <div className="intelligence-search-bar">
                    <input
                        type="text"
                        placeholder="Enter stock symbol (e.g., AAPL)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setShowSuggestions(true)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch('analyst')}
                    />
                    <button onClick={() => handleSearch('analyst')}>
                        <i className="fas fa-search"></i> Search
                    </button>
                </div>

                {loading && (
                    <div className="empty-state">
                        <i className="fas fa-spinner fa-spin"></i>
                        <p>Loading analyst ratings...</p>
                    </div>
                )}

                {error && (
                    <div className="empty-state">
                        <i className="fas fa-exclamation-triangle"></i>
                        <p>{error}</p>
                    </div>
                )}

                {data && !loading && (
                    <div className="analyst-list">
                        {data.map((rating, index) => (
                            <div key={index} className="analyst-item">
                                <div className="analyst-header">
                                    <strong>{rating.firm}</strong>
                                    <span className={`rating-badge ${rating.rating.toLowerCase()}`}>
                                        {rating.rating}
                                    </span>
                                </div>
                                <div className="analyst-details">
                                    <span>{formatDate(rating.date)}</span>
                                    <strong>Target: ${rating.price_target}</strong>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!data && !loading && (
                    <div className="empty-state">
                        <i className="fas fa-chart-area"></i>
                        <p>Search for analyst ratings</p>
                    </div>
                )}
            </div>
        );
    };

    // Render options tab
    const renderOptions = () => {
        return (
            <div className="intelligence-search-tab">
                <div className="intelligence-search-bar">
                    <input
                        type="text"
                        placeholder="Enter stock symbol (e.g., AAPL)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setShowSuggestions(true)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch('options')}
                    />
                    <button onClick={() => handleSearch('options')}>
                        <i className="fas fa-search"></i> Search
                    </button>
                </div>

                {loading && (
                    <div className="empty-state">
                        <i className="fas fa-spinner fa-spin"></i>
                        <p>Loading options data...</p>
                    </div>
                )}

                {error && (
                    <div className="empty-state">
                        <i className="fas fa-exclamation-triangle"></i>
                        <p>{error}</p>
                    </div>
                )}

                {data && !loading && (
                    <div className="options-list">
                        {data.map((option, index) => (
                            <div key={index} className="option-item">
                                <div className="option-header">
                                    <strong>{option.strike_price}</strong>
                                    <span>{option.expiry_date}</span>
                                </div>
                                <div className="option-details">
                                    <span>C: ${option.call_price}</span>
                                    <span>P: ${option.put_price}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!data && !loading && (
                    <div className="empty-state">
                        <i className="fas fa-chart-area"></i>
                        <p>Search for options data</p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="market-intelligence-container">
            <h2>
                <i className="fas fa-brain"></i>
                Market Intelligence
            </h2>
            
            <div className="intelligence-tabs">
                <button 
                    className={`tab-btn ${activeTab === 'earnings' ? 'active' : ''}`}
                    onClick={() => handleTabChange('earnings')}
                >
                    Earnings Calendar
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'insider' ? 'active' : ''}`}
                    onClick={() => handleTabChange('insider')}
                >
                    Insider Trading
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'analyst' ? 'active' : ''}`}
                    onClick={() => handleTabChange('analyst')}
                >
                    Analyst Ratings
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'options' ? 'active' : ''}`}
                    onClick={() => handleTabChange('options')}
                >
                    Options Data
                </button>
            </div>

            <div className="intelligence-content">
                {activeTab === 'earnings' && renderEarnings()}
                {activeTab === 'insider' && renderInsiderTrading()}
                {activeTab === 'analyst' && renderAnalystRatings()}
                {activeTab === 'options' && renderOptions()}
            </div>
        </div>
    );
};

// Initialize Market Intelligence component
window.__initMarketIntelReact = () => {
    const container = document.querySelector('.market-intelligence-container');
    if (!container) {
        console.error('Market Intelligence container not found');
        return;
    }

    // Clear existing content
    container.innerHTML = '';
    
    // Render React component
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(MarketIntelligence));
};

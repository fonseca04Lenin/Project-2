// React Market Intelligence Component
// Sophisticated market intelligence dashboard with elegant design

const { useState, useEffect, useRef } = React;

const MarketIntelligence = () => {
    const [activeTab, setActiveTab] = useState('earnings');
    const [earningsData, setEarningsData] = useState([]);
    const [insiderData, setInsiderData] = useState([]);
    const [analystData, setAnalystData] = useState(null);
    const [optionsData, setOptionsData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchSymbols, setSearchSymbols] = useState({
        insider: '',
        analyst: '',
        options: ''
    });
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';

    // Load earnings data on component mount
    useEffect(() => {
        loadEarningsCalendar();
    }, []);

    // Load earnings calendar data
    const loadEarningsCalendar = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/market/earnings`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setEarningsData(data);
            } else {
                console.error('Failed to load earnings data');
            }
        } catch (error) {
            console.error('Error loading earnings calendar:', error);
        } finally {
            setLoading(false);
        }
    };

    // Load insider trading data
    const loadInsiderTrading = async (symbol) => {
        if (!symbol.trim()) return;
        
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/market/insider-trading/${symbol.toUpperCase()}`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setInsiderData(data);
            } else if (response.status === 404) {
                setInsiderData([]);
            } else {
                console.error('Failed to load insider trading data');
                setInsiderData([]);
            }
        } catch (error) {
            console.error('Error loading insider trading data:', error);
            setInsiderData([]);
        } finally {
            setLoading(false);
        }
    };

    // Load analyst ratings data
    const loadAnalystRatings = async (symbol) => {
        if (!symbol.trim()) return;
        
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/market/analyst-ratings/${symbol.toUpperCase()}`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setAnalystData(data);
            } else if (response.status === 404) {
                setAnalystData(null);
            } else {
                console.error('Failed to load analyst ratings');
                setAnalystData(null);
            }
        } catch (error) {
            console.error('Error loading analyst ratings:', error);
            setAnalystData(null);
        } finally {
            setLoading(false);
        }
    };

    // Load options data
    const loadOptionsData = async (symbol) => {
        if (!symbol.trim()) return;
        
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/market/options/${symbol.toUpperCase()}`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setOptionsData(data);
            } else if (response.status === 404) {
                setOptionsData([]);
            } else {
                console.error('Failed to load options data');
                setOptionsData([]);
            }
        } catch (error) {
            console.error('Error loading options data:', error);
            setOptionsData([]);
        } finally {
            setLoading(false);
        }
    };

    // Handle tab change
    const handleTabChange = (tabName) => {
        setActiveTab(tabName);
        
        // Load data for the selected tab
        if (tabName === 'earnings') {
            loadEarningsCalendar();
        }
    };

    // Handle search input changes
    const handleSearchChange = (type, value) => {
        setSearchSymbols(prev => ({ ...prev, [type]: value }));
        
        // Show suggestions for common stocks
        if (value.length >= 1) {
            const commonStocks = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'AMZN', 'META', 'NFLX', 'AMD', 'INTC'];
            const filtered = commonStocks.filter(stock => 
                stock.toLowerCase().includes(value.toLowerCase())
            );
            setSuggestions(filtered);
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    };

    // Handle search submission
    const handleSearch = (type) => {
        const symbol = searchSymbols[type];
        if (!symbol.trim()) return;

        if (type === 'insider') {
            loadInsiderTrading(symbol);
        } else if (type === 'analyst') {
            loadAnalystRatings(symbol);
        } else if (type === 'options') {
            loadOptionsData(symbol);
        }
    };

    // Handle suggestion click
    const handleSuggestionClick = (suggestion, type) => {
        setSearchSymbols(prev => ({ ...prev, [type]: suggestion }));
        setShowSuggestions(false);
        
        // Auto-search when suggestion is selected
        if (type === 'insider') {
            loadInsiderTrading(suggestion);
        } else if (type === 'analyst') {
            loadAnalystRatings(suggestion);
        } else if (type === 'options') {
            loadOptionsData(suggestion);
        }
    };

    // Format date for display
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const today = new Date();
        const diffTime = date - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Tomorrow';
        if (diffDays > 1) return `in ${diffDays} days`;
        return date.toLocaleDateString();
    };

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount);
    };

    // Format large numbers
    const formatNumber = (num) => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    };

    return (
        <div className="market-intelligence-react">
            {/* Header */}
            <div className="intelligence-header">
                <div className="intelligence-title">
                    <div className="intelligence-icon">
                        <i className="fas fa-brain"></i>
                    </div>
                    <h2>Market Intelligence</h2>
                </div>
            </div>

            {/* Tabs */}
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

            {/* Content */}
            <div className="intelligence-content">
                {/* Earnings Calendar Tab */}
                {activeTab === 'earnings' && (
                    <div className="tab-content active">
                        <div className="content-header">
                            <h3>Upcoming Earnings</h3>
                            <p className="content-subtitle">
                                Showing {earningsData.length} upcoming earnings events
                            </p>
                        </div>
                        
                        {loading ? (
                            <div className="loading-state">
                                <i className="fas fa-spinner fa-spin"></i>
                                <p>Loading earnings data...</p>
                            </div>
                        ) : earningsData.length > 0 ? (
                            <div className="earnings-list">
                                {earningsData.map((earning, index) => (
                                    <div key={index} className="earnings-card">
                                        <div className="earnings-symbol">
                                            <i className="fas fa-chart-line"></i>
                                            <span className="symbol">{earning.symbol}</span>
                                        </div>
                                        <div className="earnings-company">
                                            <i className="fas fa-building"></i>
                                            <span>{earning.company_name}</span>
                                        </div>
                                        <div className="earnings-estimate">
                                            <i className="fas fa-dollar-sign"></i>
                                            <span>Estimate: ${earning.estimate}</span>
                                        </div>
                                        <div className="earnings-date">
                                            <i className="fas fa-calendar"></i>
                                            <span>{formatDate(earning.earnings_date)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <i className="fas fa-calendar"></i>
                                <p>No upcoming earnings found</p>
                                <small>Check back later for new earnings announcements</small>
                            </div>
                        )}
                    </div>
                )}

                {/* Insider Trading Tab */}
                {activeTab === 'insider' && (
                    <div className="tab-content">
                        <div className="content-header">
                            <h3>Insider Trading</h3>
                        </div>
                        
                        <div className="search-container">
                            <div className="search-input-wrapper">
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Enter stock symbol"
                                    value={searchSymbols.insider}
                                    onChange={(e) => handleSearchChange('insider', e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch('insider')}
                                />
                                <button 
                                    className="search-btn"
                                    onClick={() => handleSearch('insider')}
                                    disabled={loading}
                                >
                                    <i className="fas fa-search"></i>
                                </button>
                            </div>
                            
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="search-suggestions">
                                    {suggestions.map((suggestion, index) => (
                                        <div
                                            key={index}
                                            className="suggestion-item"
                                            onClick={() => handleSuggestionClick(suggestion, 'insider')}
                                        >
                                            {suggestion}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {loading ? (
                            <div className="loading-state">
                                <i className="fas fa-spinner fa-spin"></i>
                                <p>Loading insider trading data...</p>
                            </div>
                        ) : insiderData.length > 0 ? (
                            <div className="insider-list">
                                {insiderData.map((transaction, index) => (
                                    <div key={index} className="insider-card">
                                        <div className="insider-header">
                                            <div className="insider-name">
                                                <strong>{transaction.filer_name}</strong>
                                                <span className="insider-title">{transaction.title}</span>
                                            </div>
                                            <div className={`transaction-type ${transaction.transaction_type.toLowerCase()}`}>
                                                {transaction.transaction_type}
                                            </div>
                                        </div>
                                        <div className="insider-details">
                                            <div className="insider-shares">
                                                <i className="fas fa-chart-bar"></i>
                                                <span>{formatNumber(transaction.shares)} shares</span>
                                            </div>
                                            <div className="insider-price">
                                                <i className="fas fa-dollar-sign"></i>
                                                <span>${transaction.price}</span>
                                            </div>
                                            <div className="insider-value">
                                                <i className="fas fa-calculator"></i>
                                                <span>{formatCurrency(transaction.value)}</span>
                                            </div>
                                            <div className="insider-date">
                                                <i className="fas fa-calendar"></i>
                                                <span>{new Date(transaction.date).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : searchSymbols.insider ? (
                            <div className="empty-state">
                                <i className="fas fa-user-secret"></i>
                                <p>No insider trading data found for {searchSymbols.insider}</p>
                                <small>Try searching for a different stock symbol</small>
                            </div>
                        ) : (
                            <div className="empty-state">
                                <i className="fas fa-user-secret"></i>
                                <p>Search for insider trading data</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Analyst Ratings Tab */}
                {activeTab === 'analyst' && (
                    <div className="tab-content">
                        <div className="content-header">
                            <h3>Analyst Ratings</h3>
                        </div>
                        
                        <div className="search-container">
                            <div className="search-input-wrapper">
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Enter stock symbol"
                                    value={searchSymbols.analyst}
                                    onChange={(e) => handleSearchChange('analyst', e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch('analyst')}
                                />
                                <button 
                                    className="search-btn"
                                    onClick={() => handleSearch('analyst')}
                                    disabled={loading}
                                >
                                    <i className="fas fa-search"></i>
                                </button>
                            </div>
                            
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="search-suggestions">
                                    {suggestions.map((suggestion, index) => (
                                        <div
                                            key={index}
                                            className="suggestion-item"
                                            onClick={() => handleSuggestionClick(suggestion, 'analyst')}
                                        >
                                            {suggestion}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {loading ? (
                            <div className="loading-state">
                                <i className="fas fa-spinner fa-spin"></i>
                                <p>Loading analyst ratings...</p>
                            </div>
                        ) : analystData ? (
                            <div className="analyst-content">
                                <div className="analyst-summary">
                                    <div className="summary-item">
                                        <span className="summary-label">Consensus Rating:</span>
                                        <span className={`summary-value rating-${analystData.consensus_rating.toLowerCase()}`}>
                                            {analystData.consensus_rating}
                                        </span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="summary-label">Average Price Target:</span>
                                        <span className="summary-value">${analystData.price_target_avg}</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="summary-label">High Target:</span>
                                        <span className="summary-value">${analystData.price_target_high}</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="summary-label">Low Target:</span>
                                        <span className="summary-value">${analystData.price_target_low}</span>
                                    </div>
                                </div>
                                
                                <div className="analyst-ratings">
                                    {analystData.analysts && analystData.analysts.map((rating, index) => (
                                        <div key={index} className="analyst-card">
                                            <div className="analyst-firm">
                                                <strong>{rating.firm}</strong>
                                            </div>
                                            <div className={`analyst-rating ${rating.rating.toLowerCase()}`}>
                                                {rating.rating}
                                            </div>
                                            <div className="analyst-target">
                                                ${rating.price_target}
                                            </div>
                                            <div className="analyst-date">
                                                {new Date(rating.date).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : searchSymbols.analyst ? (
                            <div className="empty-state">
                                <i className="fas fa-chart-bar"></i>
                                <p>No analyst ratings found for {searchSymbols.analyst}</p>
                                <small>Try searching for a different stock symbol</small>
                            </div>
                        ) : (
                            <div className="empty-state">
                                <i className="fas fa-chart-bar"></i>
                                <p>Search for analyst ratings</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Options Data Tab */}
                {activeTab === 'options' && (
                    <div className="tab-content">
                        <div className="content-header">
                            <h3>Options Data</h3>
                        </div>
                        
                        <div className="search-container">
                            <div className="search-input-wrapper">
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Enter stock symbol"
                                    value={searchSymbols.options}
                                    onChange={(e) => handleSearchChange('options', e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch('options')}
                                />
                                <button 
                                    className="search-btn"
                                    onClick={() => handleSearch('options')}
                                    disabled={loading}
                                >
                                    <i className="fas fa-search"></i>
                                </button>
                            </div>
                            
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="search-suggestions">
                                    {suggestions.map((suggestion, index) => (
                                        <div
                                            key={index}
                                            className="suggestion-item"
                                            onClick={() => handleSuggestionClick(suggestion, 'options')}
                                        >
                                            {suggestion}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {loading ? (
                            <div className="loading-state">
                                <i className="fas fa-spinner fa-spin"></i>
                                <p>Loading options data...</p>
                            </div>
                        ) : optionsData && (optionsData.call_options || optionsData.put_options) ? (
                            <div className="options-content">
                                <div className="options-summary">
                                    <h4>Options Data for {searchSymbols.options}</h4>
                                    <div className="current-price">
                                        <i className="fas fa-dollar-sign"></i>
                                        Current Price: ${optionsData.current_price}
                                    </div>
                                    <div className="expiration-dates">
                                        <i className="fas fa-calendar"></i>
                                        Expirations: {optionsData.expiration_dates ? optionsData.expiration_dates.join(', ') : 'N/A'}
                                    </div>
                                </div>
                                
                                {/* Call Options */}
                                {optionsData.call_options && optionsData.call_options.length > 0 && (
                                    <div className="options-section">
                                        <div className="options-expiration">
                                            <i className="fas fa-arrow-up"></i> Call Options
                                        </div>
                                        <div className="options-strikes">
                                            {optionsData.call_options.map((option, index) => (
                                                <div key={index} className="strike-item call-option">
                                                    <div className="strike-price">${option.strike}</div>
                                                    <div className="strike-bid">
                                                        <i className="fas fa-hand-holding-usd"></i> Bid: ${option.bid}
                                                    </div>
                                                    <div className="strike-ask">
                                                        <i className="fas fa-tag"></i> Ask: ${option.ask}
                                                    </div>
                                                    <div className="strike-volume">
                                                        <i className="fas fa-chart-bar"></i> Volume: {option.volume}
                                                    </div>
                                                    <div className="strike-interest">
                                                        <i className="fas fa-eye"></i> OI: {option.open_interest}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Put Options */}
                                {optionsData.put_options && optionsData.put_options.length > 0 && (
                                    <div className="options-section">
                                        <div className="options-expiration">
                                            <i className="fas fa-arrow-down"></i> Put Options
                                        </div>
                                        <div className="options-strikes">
                                            {optionsData.put_options.map((option, index) => (
                                                <div key={index} className="strike-item put-option">
                                                    <div className="strike-price">${option.strike}</div>
                                                    <div className="strike-bid">
                                                        <i className="fas fa-hand-holding-usd"></i> Bid: ${option.bid}
                                                    </div>
                                                    <div className="strike-ask">
                                                        <i className="fas fa-tag"></i> Ask: ${option.ask}
                                                    </div>
                                                    <div className="strike-volume">
                                                        <i className="fas fa-chart-bar"></i> Volume: {option.volume}
                                                    </div>
                                                    <div className="strike-interest">
                                                        <i className="fas fa-eye"></i> OI: {option.open_interest}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : searchSymbols.options ? (
                            <div className="empty-state">
                                <i className="fas fa-chart-area"></i>
                                <p>No options data found for {searchSymbols.options}</p>
                                <small>Try searching for a different stock symbol</small>
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

// Render the component
const marketIntelligenceContainer = document.getElementById('market-intelligence-root');
if (marketIntelligenceContainer) {
    ReactDOM.render(<MarketIntelligence />, marketIntelligenceContainer);
}

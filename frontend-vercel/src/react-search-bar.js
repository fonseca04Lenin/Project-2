/**
 * React Search Bar Component
 * Converts the vanilla JS search bar to React while maintaining all functionality
 */

const { useState, useEffect, useRef } = React;

// Popular stocks database for instant suggestions
const POPULAR_STOCKS = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'TSLA', name: 'Tesla, Inc.' },
    { symbol: 'AMZN', name: 'Amazon.com, Inc.' },
    { symbol: 'META', name: 'Meta Platforms, Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    { symbol: 'NFLX', name: 'Netflix, Inc.' },
    { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.' },
    { symbol: 'INTC', name: 'Intel Corporation' }
];

function SearchBarComponent() {
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    
    const searchTimeoutRef = useRef(null);
    const suggestionsRef = useRef(null);
    const inputRef = useRef(null);

    // API Base URL
    const API_BASE_URL = 'https://web-production-2e2e.up.railway.app';

    // Wake up backend function
    const wakeUpBackend = async () => {
        try {
            await fetch(`${API_BASE_URL}/api/health`, {
                method: 'GET',
                credentials: 'include'
            });
        } catch (error) {
            console.log('Backend wake up failed:', error);
        }
    };

    // Search function - maintains exact same functionality as original
    const searchStock = async () => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            showToast('Please enter a stock symbol or company name', 'error');
            return;
        }
        
        setIsLoading(true);
        setShowSuggestions(false);
        
        try {
            // Step 1: Wake up backend proactively for faster response
            const wakeUpPromise = wakeUpBackend();
            
            // Step 2: Fast client-side suggestions while backend wakes up
            let symbol = trimmedQuery.toUpperCase();
            let suggestions = [];
            
            // Check our local popular stocks database first for instant feedback
            const directMatch = POPULAR_STOCKS.find(stock => stock.symbol === symbol);
            if (directMatch) {
                symbol = directMatch.symbol;
            } else {
                // Search by company name (partial matching)
                const nameMatch = POPULAR_STOCKS.find(stock => 
                    stock.name.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
                    stock.symbol.toLowerCase().includes(trimmedQuery.toLowerCase())
                );
                if (nameMatch) {
                    symbol = nameMatch.symbol;
                    setQuery(symbol); // Update search box with symbol
                }
            }
            
            // Step 3: Wait for backend to be ready, then search
            await wakeUpPromise;
            
            // Try backend suggestions first for comprehensive results
            try {
                const response = await fetch(`${API_BASE_URL}/api/search/stocks?q=${encodeURIComponent(symbol)}`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.results && data.results.length > 0) {
                        // Use backend results
                        const stock = data.results[0];
                        symbol = stock.symbol;
                        setQuery(symbol);
                    }
                }
            } catch (error) {
                console.log('Backend search failed, using local match:', error);
            }
            
            // Step 4: Get stock data and display
            const stockData = await getStockData(symbol);
            if (stockData) {
                displayStockData(stockData);
            } else {
                showToast(`No data found for ${symbol}`, 'error');
            }
            
        } catch (error) {
            console.error('Search error:', error);
            showToast('Search failed. Please try again.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Get stock data function
    const getStockData = async (symbol) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/stock/${symbol}`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error fetching stock data:', error);
            return null;
        }
    };

    // Display stock data function
    const displayStockData = (stockData) => {
        // Use the existing displayStockData function from the main app
        if (window.displayStockData) {
            window.displayStockData(stockData);
        } else {
            console.error('displayStockData function not found');
        }
    };

    // Show toast function
    const showToast = (message, type = 'info') => {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            console.log(`Toast: ${message}`);
        }
    };

    // Handle input change with debounced search suggestions
    const handleInputChange = (e) => {
        const value = e.target.value;
        setQuery(value);
        
        // Clear previous timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        
        // Hide suggestions if query is too short
        if (value.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        
        // Debounce search
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/search/companies?q=${encodeURIComponent(value)}`);
                const data = await response.json();
                
                if (data.results && data.results.length > 0) {
                    setSuggestions(data.results);
                    setShowSuggestions(true);
                } else {
                    setSuggestions([]);
                    setShowSuggestions(false);
                }
            } catch (error) {
                console.error('Error fetching suggestions:', error);
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 300);
    };

    // Handle suggestion click
    const handleSuggestionClick = (suggestion) => {
        setQuery(suggestion.symbol);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    // Handle key press
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            setShowSuggestions(false);
            searchStock();
        }
    };

    // Handle click outside to close suggestions
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target) &&
                inputRef.current && !inputRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return React.createElement('div', { className: 'search-container' },
        React.createElement('div', { className: 'search-box' },
            React.createElement('i', { className: 'fas fa-search search-icon' }),
            React.createElement('input', {
                ref: inputRef,
                type: 'text',
                value: query,
                onChange: handleInputChange,
                onKeyPress: handleKeyPress,
                placeholder: 'Search stocks... (e.g., AAPL, Tesla, Microsoft)',
                className: 'search-input'
            }),
            React.createElement('button', {
                onClick: searchStock,
                disabled: isLoading,
                className: `search-btn ${isLoading ? 'loading' : ''}`
            },
                React.createElement('span', { className: 'btn-text' }, 'Search'),
                React.createElement('i', { 
                    className: 'fas fa-spinner fa-spin btn-loading',
                    style: { display: isLoading ? 'inline-block' : 'none' }
                })
            )
        ),
        // Suggestions dropdown
        showSuggestions && suggestions.length > 0 && React.createElement('div', {
            ref: suggestionsRef,
            className: 'search-suggestions main-search-suggestions'
        },
            suggestions.map((suggestion, index) =>
                React.createElement('div', {
                    key: index,
                    className: 'suggestion-item',
                    onClick: () => handleSuggestionClick(suggestion)
                },
                    React.createElement('div', { className: 'suggestion-symbol' }, suggestion.symbol),
                    React.createElement('div', { className: 'suggestion-name' }, suggestion.name)
                )
            )
        )
    );
}

// Initialize React Search Bar
function initializeReactSearchBar() {
    console.log('🔍 Initializing React Search Bar...');
    
    const searchSection = document.querySelector('.search-section');
    console.log('🔍 Search section element:', searchSection);
    
    if (searchSection) {
        console.log('🔍 Search section found, replacing with React component...');
        
        // Clear the existing content
        searchSection.innerHTML = '';
        
        try {
            // Create React root
            const root = ReactDOM.createRoot(searchSection);
            root.render(React.createElement(SearchBarComponent));
            
            console.log('✅ React Search Bar component loaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Error rendering React Search Bar:', error);
            return false;
        }
    } else {
        console.warn('⚠️ Search section not found, React Search Bar not loaded');
        console.log('Available sections:', document.querySelectorAll('section'));
        return false;
    }
}

// Initialize when DOM is ready
console.log('🔍 React Search Bar script loaded, attempting initialization...');
if (document.readyState === 'loading') {
    console.log('🔍 Document still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initializeReactSearchBar);
} else {
    console.log('🔍 Document already loaded, initializing immediately...');
    initializeReactSearchBar();
}

// Fallback initialization
setTimeout(() => {
    if (!document.querySelector('.search-section .search-container')) {
        console.log('🔍 Fallback initialization attempt...');
        initializeReactSearchBar();
    }
}, 1000);
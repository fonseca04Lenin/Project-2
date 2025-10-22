// Global variables
console.log('🚀 App.js loaded - Version 20250122-003 with STREAMLINED loading');
let watchlistData = [];
let currentStock = null;
let chart = null; // Add chart variable declaration
let searchTimeout = null; // Add timeout for search debouncing

// Simple test function for watchlist debugging (only when button clicked)
async function testWatchlistFunctionality() {
    console.log('🧪 Testing watchlist functionality...');

    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            showToast('Please log in first to test watchlist', 'error');
            return;
        }

        const watchlist = await loadWatchlistFromFirebase();
        console.log('Watchlist loaded:', watchlist);
        showToast(`Watchlist test completed: ${watchlist.length} items found`, 'success');

    } catch (error) {
        console.error('❌ Watchlist test failed:', error);
        showToast('Watchlist test failed', 'error');
    }
}

// Make test function globally available
window.testWatchlistFunctionality = testWatchlistFunctionality;

// Backend API base URL - Get from config file
const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';

// Force cache busting - deployment timestamp: 2025-09-12-03:25
const DEPLOYMENT_VERSION = '2.4.0-' + Date.now();

// DOM elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const stockResults = document.getElementById('stockResults');
const stockCard = document.getElementById('stockCard');
const watchlistContainer = document.getElementById('watchlistContainer');
const clearWatchlistBtn = document.getElementById('clearWatchlistBtn');
const refreshNewsBtn = document.getElementById('refreshNewsBtn');
const newsContainer = document.getElementById('newsContainer');
const toastContainer = document.getElementById('toastContainer');
const chartSection = document.getElementById('chartSection'); // Add chartSection element

// Market Intelligence search elements
const insiderSymbolInput = document.getElementById('insider-symbol');
const analystSymbolInput = document.getElementById('analyst-symbol');
const optionsSymbolInput = document.getElementById('options-symbol');

// Initialize app
function initializeApp() {
    checkAuthStatus();
    updateMarketStatus();
    
    // Start backend keep-alive mechanism
    startBackendKeepAlive();
    
    // Set up event listeners
    if (searchBtn) {
        searchBtn.addEventListener('click', searchStock);
    }
    if (clearWatchlistBtn) {
        clearWatchlistBtn.addEventListener('click', clearWatchlist);
    }
    if (refreshNewsBtn) {
        refreshNewsBtn.addEventListener('click', loadMarketNews);
    }
    
    // Set up search input event listener for Enter key
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchStock();
            }
        });
        
        // Add company name search suggestions
        setupMainSearchSuggestions();
    }
    
    // Initialize market intelligence search functionality
    initializeMarketIntelligenceSearch();
    
    // Update market status every minute
    setInterval(updateMarketStatus, 60000);
    updateMarketStatusIndicator();
    setInterval(updateMarketStatusIndicator, 60000);
}

function updateMarketStatusIndicator() {
    const indicator = document.getElementById('marketStatusIndicator');
    if (!indicator) return;
    fetch('/api/market-status')
        .then(res => res.json())
        .then(data => {
            if (data.isOpen) {
                indicator.textContent = 'Market Open';
                indicator.style.background = '#22c55e'; // green
                indicator.style.color = '#fff';
            } else {
                indicator.textContent = 'Market Closed';
                indicator.style.background = '#64748b'; // gray
                indicator.style.color = '#fff';
            }
            indicator.style.padding = '0.25em 0.75em';
            indicator.style.borderRadius = '1em';
            indicator.style.marginLeft = '1em';
            indicator.style.fontSize = '1rem';
            indicator.style.fontWeight = '600';
        })
        .catch(() => {
            indicator.textContent = 'Status Unavailable';
            indicator.style.background = '#f87171'; // red
            indicator.style.color = '#fff';
        });
}

// Initialize market intelligence search functionality
function initializeMarketIntelligenceSearch() {
    // Set up insider trading search
    if (insiderSymbolInput) {
        setupIntelligenceSearch(insiderSymbolInput, 'insiderList', getInsiderTrading);
    }
    
    // Set up analyst ratings search
    if (analystSymbolInput) {
        setupIntelligenceSearch(analystSymbolInput, 'analystList', getAnalystRatings);
    }
    
    // Set up options data search
    if (optionsSymbolInput) {
        setupIntelligenceSearch(optionsSymbolInput, 'optionsList', getOptionsData);
    }
}

// Setup search functionality for market intelligence sections
function setupIntelligenceSearch(inputElement, resultsContainerId, searchFunction) {
    // Add search suggestions container
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'search-suggestions';
    suggestionsContainer.style.display = 'none';
    inputElement.parentNode.appendChild(suggestionsContainer);
    
    // Add loading state to input
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'search-loading';
    loadingSpinner.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    loadingSpinner.style.display = 'none';
    inputElement.parentNode.appendChild(loadingSpinner);
    
    // Set data attribute to identify which search function to call
    if (inputElement.id === 'insider-symbol') {
        inputElement.setAttribute('data-search-function', 'insider');
    } else if (inputElement.id === 'analyst-symbol') {
        inputElement.setAttribute('data-search-function', 'analyst');
    } else if (inputElement.id === 'options-symbol') {
        inputElement.setAttribute('data-search-function', 'options');
    }
    
    // Add event listeners
    inputElement.addEventListener('input', function() {
        const query = this.value.trim();
        
        // Clear previous timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        // Hide suggestions if query is too short
        if (query.length < 2) {
            suggestionsContainer.style.display = 'none';
            return;
        }
        
        // Show loading spinner
        loadingSpinner.style.display = 'block';
        
        // Debounce search
        searchTimeout = setTimeout(async () => {
            try {
                        const response = await fetch(`${API_BASE_URL}/api/search/stocks?q=${encodeURIComponent(query)}`, {
                    credentials: 'include'
                });
        const data = await response.json();
                
                if (data.results && data.results.length > 0) {
                    displaySearchSuggestions(suggestionsContainer, data.results, inputElement);
                } else {
                    suggestionsContainer.style.display = 'none';
                }
            } catch (error) {
            } finally {
                loadingSpinner.style.display = 'none';
            }
        }, 300);
    });
    
    // Handle Enter key
    inputElement.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            suggestionsContainer.style.display = 'none';
            searchFunction();
        }
    });
    
    // Handle click outside to close suggestions
    document.addEventListener('click', function(e) {
        if (!inputElement.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.style.display = 'none';
        }
    });
}

// Display search suggestions
function displaySearchSuggestions(container, suggestions, inputElement) {
    container.innerHTML = '';
    
    suggestions.forEach(suggestion => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'suggestion-item';
        suggestionItem.innerHTML = `
            <div class="suggestion-symbol">${suggestion.symbol}</div>
            <div class="suggestion-name">${suggestion.name}</div>
        `;
        
        suggestionItem.addEventListener('click', function() {
            inputElement.value = suggestion.symbol;
            container.style.display = 'none';
            // Trigger the search function
            const searchFunction = inputElement.getAttribute('data-search-function');
            if (searchFunction === 'insider') {
                getInsiderTrading();
            } else if (searchFunction === 'analyst') {
                getAnalystRatings();
            } else if (searchFunction === 'options') {
                getOptionsData();
            }
        });
        
        container.appendChild(suggestionItem);
    });
    
    container.style.display = 'block';
}

// Setup main search suggestions for company names
function setupMainSearchSuggestions() {
    if (!searchInput) return;
    
    // Add search suggestions container
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'search-suggestions main-search-suggestions';
    suggestionsContainer.style.display = 'none';
    searchInput.parentNode.appendChild(suggestionsContainer);
    
    // Add loading state to input
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'search-loading main-search-loading';
    loadingSpinner.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    loadingSpinner.style.display = 'none';
    searchInput.parentNode.appendChild(loadingSpinner);
    
    // Add event listeners
    searchInput.addEventListener('input', function() {
        const query = this.value.trim();
        
        // Clear previous timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        // Hide suggestions if query is too short
        if (query.length < 2) {
            suggestionsContainer.style.display = 'none';
            return;
        }
        
        // Show loading spinner
        loadingSpinner.style.display = 'block';
        
        // Debounce search
        searchTimeout = setTimeout(async () => {
            try {
                const response = await fetch(`/api/search/companies?q=${encodeURIComponent(query)}`);
                const data = await response.json();
                
                if (data.results && data.results.length > 0) {
                    displayMainSearchSuggestions(suggestionsContainer, data.results, searchInput);
                } else {
                    suggestionsContainer.style.display = 'none';
                }
            } catch (error) {
            } finally {
                loadingSpinner.style.display = 'none';
            }
        }, 300);
    });
    
    // Handle click outside to close suggestions
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.style.display = 'none';
        }
    });
}

// Display main search suggestions
function displayMainSearchSuggestions(container, suggestions, inputElement) {
    container.innerHTML = '';
    
    suggestions.forEach(suggestion => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'suggestion-item main-suggestion-item';
        suggestionItem.innerHTML = `
            <div class="suggestion-symbol">${suggestion.symbol}</div>
            <div class="suggestion-name">${suggestion.display_name || suggestion.name}</div>
        `;
        
        suggestionItem.addEventListener('click', function() {
            inputElement.value = suggestion.symbol;
            container.style.display = 'none';
            // Trigger the main search
            searchStock();
        });
        
        container.appendChild(suggestionItem);
    });
    
    container.style.display = 'block';
}

// Make functions globally available
window.showIntelligenceTab = showIntelligenceTab;
window.getInsiderTrading = getInsiderTrading;
window.getAnalystRatings = getAnalystRatings;
window.getOptionsData = getOptionsData;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Wait for Firebase to be initialized before starting the app
    const waitForFirebase = () => {
        if (window.firebaseAuth) {
            initializeApp();
            initializeMarketIntelligence();
            initializeLandingPageInteractions();
        } else {
            setTimeout(waitForFirebase, 100);
        }
    };
    
    waitForFirebase();
});

// Premium Landing Page Interactions
function initializeLandingPageInteractions() {
    // Add hover effects to floating elements
    const floatingElements = document.querySelectorAll('.float-element');
    floatingElements.forEach((element, index) => {
        element.addEventListener('mouseenter', () => {
            element.style.animationPlayState = 'paused';
            element.style.transform += ' scale(1.1)';
            element.style.opacity = '0.2';
        });
        
        element.addEventListener('mouseleave', () => {
            element.style.animationPlayState = 'running';
            element.style.transform = element.style.transform.replace(' scale(1.1)', '');
            element.style.opacity = '0.1';
        });
    });

    // Add parallax effect to orbs
    let mouseMoveHandler;
    if (window.innerWidth > 768) {
        mouseMoveHandler = (e) => {
            const orbs = document.querySelectorAll('.orb');
            const xPos = (e.clientX / window.innerWidth) * 100;
            const yPos = (e.clientY / window.innerHeight) * 100;
            
            orbs.forEach((orb, index) => {
                const speed = (index + 1) * 0.5;
                const x = (xPos - 50) * speed;
                const y = (yPos - 50) * speed;
                orb.style.transform += ` translate(${x}px, ${y}px)`;
            });
        };
        
        document.addEventListener('mousemove', mouseMoveHandler);
    }

    // Add smooth scroll animation for feature pills
    const pills = document.querySelectorAll('.pill');
    pills.forEach((pill, index) => {
        pill.style.animationDelay = `${index * 0.1}s`;
        pill.classList.add('fade-in-up');
    });

    // Enhanced form interactions
    const inputs = document.querySelectorAll('.input-wrapper input');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.closest('.input-wrapper').classList.add('focused');
            addRippleEffect(this);
        });
        
        input.addEventListener('blur', function() {
            this.closest('.input-wrapper').classList.remove('focused');
        });
        
        input.addEventListener('input', function() {
            if (this.value.length > 0) {
                this.closest('.input-wrapper').classList.add('has-value');
            } else {
                this.closest('.input-wrapper').classList.remove('has-value');
            }
        });
    });

    // Enhanced submit button interactions
    const submitButtons = document.querySelectorAll('.premium-submit-btn');
    submitButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            if (!this.classList.contains('loading')) {
                addButtonRipple(this, e);
            }
        });
    });

    // Dynamic ticker updates (simulate real market data)
    setTimeout(() => {
        updateMarketTicker();
        setInterval(updateMarketTicker, 30000); // Update every 30 seconds
    }, 2000);
}

// Add ripple effect to input focus
function addRippleEffect(input) {
    const ripple = document.createElement('div');
    ripple.className = 'input-ripple';
    ripple.style.position = 'absolute';
    ripple.style.borderRadius = '50%';
    ripple.style.background = 'rgba(74, 222, 128, 0.3)';
    ripple.style.transform = 'scale(0)';
    ripple.style.animation = 'ripple 0.6s linear';
    ripple.style.left = '50%';
    ripple.style.top = '50%';
    ripple.style.width = '20px';
    ripple.style.height = '20px';
    ripple.style.marginLeft = '-10px';
    ripple.style.marginTop = '-10px';
    ripple.style.pointerEvents = 'none';
    
    input.parentNode.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Add ripple effect to buttons
function addButtonRipple(button, event) {
    const ripple = document.createElement('div');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.className = 'button-ripple';
    ripple.style.position = 'absolute';
    ripple.style.borderRadius = '50%';
    ripple.style.background = 'rgba(255, 255, 255, 0.3)';
    ripple.style.transform = 'scale(0)';
    ripple.style.animation = 'ripple 0.6s linear';
    ripple.style.pointerEvents = 'none';
    
    button.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Update market ticker with simulated data
function updateMarketTicker() {
    const tickerValues = document.querySelectorAll('.ticker-value');
    const symbols = ['S&P 500', 'NASDAQ', 'DOW'];
    
    tickerValues.forEach((value, index) => {
        const change = (Math.random() - 0.5) * 2; // Random change between -1 and 1
        const currentValue = parseFloat(value.textContent.replace(/[+\-%]/g, '')) || 0;
        const newValue = (currentValue + change).toFixed(1);
        const sign = newValue >= 0 ? '+' : '';
        
        value.textContent = `${sign}${newValue}%`;
        value.className = `ticker-value ${newValue >= 0 ? 'positive' : 'negative'}`;
        
        // Add flash animation
        value.style.animation = 'flash 0.5s ease';
        setTimeout(() => {
            value.style.animation = '';
        }, 500);
    });
}



// Popular stocks database for fast search (Portfolio Version)
const POPULAR_STOCKS = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'META', name: 'Meta Platforms Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    { symbol: 'NFLX', name: 'Netflix Inc.' },
    { symbol: 'AMD', name: 'Advanced Micro Devices Inc.' },
    { symbol: 'INTC', name: 'Intel Corporation' },
    { symbol: 'CRM', name: 'Salesforce Inc.' },
    { symbol: 'ORCL', name: 'Oracle Corporation' },
    { symbol: 'UBER', name: 'Uber Technologies Inc.' },
    { symbol: 'LYFT', name: 'Lyft Inc.' },
    { symbol: 'SNAP', name: 'Snap Inc.' },
    { symbol: 'TWTR', name: 'Twitter Inc.' },
    { symbol: 'PYPL', name: 'PayPal Holdings Inc.' },
    { symbol: 'SQ', name: 'Block Inc.' },
    { symbol: 'SHOP', name: 'Shopify Inc.' },
    { symbol: 'ZM', name: 'Zoom Video Communications Inc.' },
    { symbol: 'ROKU', name: 'Roku Inc.' },
    { symbol: 'SPOT', name: 'Spotify Technology S.A.' },
    { symbol: 'DIS', name: 'The Walt Disney Company' },
    { symbol: 'BA', name: 'The Boeing Company' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
    { symbol: 'V', name: 'Visa Inc.' },
    { symbol: 'MA', name: 'Mastercard Incorporated' },
    { symbol: 'KO', name: 'The Coca-Cola Company' },
    { symbol: 'PEP', name: 'PepsiCo Inc.' },
    { symbol: 'WMT', name: 'Walmart Inc.' }
];

// Direct Yahoo Finance stock data fetch for fast search
async function fetchStockDataDirect(symbol) {
    try {
        
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const result = data?.chart?.result?.[0];
        
        if (!result) {
            return null;
        }
        
        const meta = result.meta;
        const currentPrice = meta.regularMarketPrice;
        const previousClose = meta.previousClose;
        const change = currentPrice - previousClose;
        const changePercent = (change / previousClose) * 100;
        
        const stockData = {
            symbol: symbol,
            companyName: meta.longName || meta.shortName || symbol,
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            volume: meta.regularMarketVolume,
            marketCap: meta.marketCap,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
            currency: meta.currency || 'USD'
        };
        
        return stockData;
        
    } catch (error) {
        
        // Return demo data as fallback
        return {
            symbol: symbol,
            companyName: symbol + ' Corporation',
            price: 150.00 + Math.random() * 100,
            change: (Math.random() - 0.5) * 10,
            changePercent: (Math.random() - 0.5) * 5,
            volume: Math.floor(Math.random() * 1000000),
            marketCap: Math.floor(Math.random() * 1000000000000),
            fiftyTwoWeekHigh: 200.00,
            fiftyTwoWeekLow: 100.00,
            currency: 'USD'
        };
    }
}

// Wake up backend for faster search
async function wakeUpBackend() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
            method: 'GET',
            credentials: 'include',
            signal: AbortSignal.timeout(5000) // 5 second timeout for wake-up
        });
        
        if (response.ok) {
        } else {
        }
    } catch (error) {
    }
}

// Optimized search with backend + fast suggestions
async function searchStock() {
    const query = searchInput.value.trim();
    if (!query) {
        showToast('Please enter a stock symbol or company name', 'error');
        return;
    }
    setLoadingState(true);
    
    try {
        
        // Step 1: Wake up backend proactively for faster response
        const wakeUpPromise = wakeUpBackend();
        
        // Step 2: Fast client-side suggestions while backend wakes up
        let symbol = query.toUpperCase();
        let suggestions = [];
        
        // Check our local popular stocks database first for instant feedback
        const directMatch = POPULAR_STOCKS.find(stock => stock.symbol === symbol);
        if (directMatch) {
            symbol = directMatch.symbol;
        } else {
            // Search by company name (partial matching)
            const nameMatch = POPULAR_STOCKS.find(stock => 
                stock.name.toLowerCase().includes(query.toLowerCase()) ||
                stock.symbol.toLowerCase().includes(query.toLowerCase())
            );
            if (nameMatch) {
                symbol = nameMatch.symbol;
                searchInput.value = symbol; // Update search box with symbol
            }
        }
        
        // Step 3: Wait for backend to be ready, then search
        await wakeUpPromise;
        
        // Try backend suggestions first for comprehensive results
        try {
            const companyResponse = await fetch(`${API_BASE_URL}/api/search/companies?q=${encodeURIComponent(query)}`, {
                credentials: 'include',
                signal: AbortSignal.timeout(8000) // 8 second timeout
            });
            
            if (companyResponse.ok) {
                const companyData = await companyResponse.json();
                if (companyData.results && companyData.results.length > 0) {
                    suggestions = companyData.results;
                    // Use first suggestion if query isn't already a symbol
                    if (!/^[A-Z]{1,5}$/.test(query.toUpperCase()) && suggestions.length > 0) {
                        symbol = suggestions[0].symbol;
                        searchInput.value = symbol;
                    }
                }
            }
        } catch (suggestionError) {
            // Continue with local match
        }
        
        // Step 4: Get detailed stock data from backend
        const response = await fetch(`${API_BASE_URL}/api/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ symbol }),
            signal: AbortSignal.timeout(12000) // 12 second timeout
        });
        
        if (response.ok) {
            const data = await response.json();
            currentStock = data;
            displayStockResult(data);
            stockResults.style.display = 'block';
            
            if (data.triggeredAlerts && data.triggeredAlerts.length > 0) {
                data.triggeredAlerts.forEach(alert => {
                    const message = `Alert triggered for ${symbol}: Price ${alert.alert_type} $${alert.target_price}`;
                    showNotification(message, 'warning');
                });
            }
        } else {
            const errorData = await response.json();
            showToast(errorData.error || 'Stock not found', 'error');
            stockResults.style.display = 'none';
        }
    } catch (error) {
        showToast('Error searching stock. Please try again.', 'error');
        stockResults.style.display = 'none';
    } finally {
        setLoadingState(false);
    }
}

// Display search results
function displayStockResult(stock) {
    const priceChangeClass = stock.priceChange >= 0 ? 'positive' : 'negative';
    const priceChangeIcon = stock.priceChange >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
    const priceChangeSign = stock.priceChange >= 0 ? '+' : '';

    stockCard.innerHTML = `
        <div class="stock-header">
            <div class="stock-info">
                <h3>${stock.name}</h3>
                <span class="stock-symbol">${stock.symbol}</span>
            </div>
            <div class="stock-price">
                <div class="current-price">$${stock.price.toFixed(2)}</div>
                <div class="price-change ${priceChangeClass}">
                    <i class="${priceChangeIcon}"></i>
                    ${priceChangeSign}$${Math.abs(stock.priceChange).toFixed(2)} 
                    (${priceChangeSign}${stock.priceChangePercent.toFixed(2)}%)
                </div>
            </div>
        </div>
        <div class="stock-actions">
            <button class="btn btn-primary" onclick="addToWatchlist('${stock.symbol}', '${stock.name || stock.symbol}')">
                <i class="fas fa-star"></i>
                Add to Watchlist
            </button>
            <button class="btn btn-secondary" onclick="viewChart('${stock.symbol}')">
                <i class="fas fa-chart-line"></i>
                View Chart
            </button>
        </div>
    `;
}

//Watchlist functionality - Reactivated with independent operation
// Global request tracking to prevent concurrent requests
let watchlistRequestInProgress = false;
let watchlistRequestPromise = null;

async function loadWatchlistWithDeduplication() {
    // If request already in progress, return the existing promise
    if (watchlistRequestInProgress && watchlistRequestPromise) {
        console.log('⏸️ Watchlist request already in progress, skipping duplicate call');
        return watchlistRequestPromise;
    }

    // Set flag and create new promise
    watchlistRequestInProgress = true;
    console.log('🚀 Starting new watchlist request');
    watchlistRequestPromise = loadWatchlist();

    try {
        const result = await watchlistRequestPromise;
        console.log('✅ Watchlist request completed successfully');
        return result;
    } finally {
        watchlistRequestInProgress = false;
        watchlistRequestPromise = null;
    }
}

async function loadWatchlist() {
    try {
        console.log('🔄 Loading watchlist...');
        const user = firebase.auth().currentUser;
        if (!user) {
            console.log('❌ No user logged in, showing empty watchlist');
            // User not logged in, show empty watchlist
            displayWatchlist([]);
            return;
        }

        console.log('✅ User logged in, loading from Firebase...');
        // Load from Firebase
        const watchlist = await loadWatchlistFromFirebase();
        console.log('📊 Loaded watchlist from Firebase:', watchlist);
        displayWatchlist(watchlist);
        
        // Also update prices for all stocks (only if not already updating to prevent loops)
        if (watchlist.length > 0 && !window.updatingPrices) {
            console.log('💰 Updating prices for', watchlist.length, 'stocks');
            updateWatchlistPrices();
        }

    } catch (error) {
        console.error('❌ Error loading watchlist:', error);
        displayWatchlist([]);
    }
}

async function loadWatchlistWithRetry(retryCount = 0, maxRetries = 3) {
    try {
        
        // Wake up backend first
        await wakeUpBackendForWatchlist();
        
        // Get authentication headers
        const headers = await getAuthHeaders();
        
        // Make request to backend with cache busting
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_BASE_URL}/api/watchlist?v=2.0&t=${timestamp}`, {
            method: 'GET',
            headers: headers,
            signal: AbortSignal.timeout(30000) // Increased to 30 second timeout
        });
        
        
        if (response.ok) {
            const data = await response.json();
            
            // Save to local storage
            saveLocalWatchlist(data.watchlist || []);
            
            // Update watchlist display
            displayWatchlist(data.watchlist || []);
            return true;
            
        } else if (response.status === 503 && retryCount < maxRetries) {
            // Backend sleeping, retry with exponential backoff
            const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, delay));
            return await loadWatchlistWithRetry(retryCount + 1, maxRetries);
            
        } else if (response.status === 401) {
            return false;
        } else {
            return false;
        }
        
    } catch (error) {
        if (error.name === 'TimeoutError') {
        } else {
        }
        
        if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return await loadWatchlistWithRetry(retryCount + 1, maxRetries);
        }
        
        return false;
    }
}

async function wakeUpBackendForWatchlist() {
    try {
        const response = await fetch(`${API_BASE_URL}/`, {
            method: 'GET',
            cache: 'no-cache',
            signal: AbortSignal.timeout(15000) // Increased to 15 second timeout
        });
        
        if (response.ok) {
            // Additional delay to ensure full readiness
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
    }
}

function displayWatchlist(stocks) {
    console.log('📊 Displaying watchlist with', stocks.length, 'stocks');

    if (stocks.length === 0) {
        // Only show empty state if we're sure there are no stocks
        // and not if this is a race condition clearing
        console.log('📊 Showing empty watchlist state');
        watchlistContainer.innerHTML = `
            <div class="empty-state" id="emptyWatchlist">
                <i class="fas fa-star-o"></i>
                <p>Your watchlist is empty</p>
                <small>Search for stocks and add them to your watchlist</small>
            </div>
        `;
        return;
    }

    const watchlistHTML = stocks.map(stock => {
        // Handle different field names from browser storage
        const stockName = stock.company_name || stock.name || stock.symbol;
        const stockPrice = typeof stock.price === 'number' ? stock.price : 
                          (stock.price === 'Loading...' ? 0 : parseFloat(stock.price) || 0);
        const changePercent = stock.change_percent || stock.priceChangePercent || 0;
        const change = stock.change || 0;
        
        let perfClass = 'watchlist-perf-flat';
        let perfText = 'No change';
        
        if (typeof changePercent === 'number' && changePercent !== 0) {
            if (changePercent > 0) {
                perfClass = 'watchlist-perf-up';
                perfText = `+${changePercent.toFixed(2)}% today`;
            } else {
                perfClass = 'watchlist-perf-down';
                perfText = `${changePercent.toFixed(2)}% today`;
            }
        } else if (stock.price === 'Loading...' || stock.change === 'Loading...') {
            perfText = 'Loading...';
        }
        
        const priceDisplay = stock.price === 'Loading...' ? 'Loading...' : 
                           `$${stockPrice.toFixed(2)}`;
        
        return `
        <div class="watchlist-item">
            <div class="watchlist-item-header">
                <div>
                    <h4>${stockName}</h4>
                    <span class="watchlist-item-symbol">${stock.symbol}</span>
                </div>
                <div class="watchlist-item-price ${perfClass}">${priceDisplay}</div>
            </div>
            <div class="watchlist-item-performance ${perfClass}">${perfText}</div>
            <div class="watchlist-item-actions">
                <button class="btn btn-secondary btn-small" onclick="viewChart('${stock.symbol}')">
                    <i class="fas fa-chart-line"></i>
                    Chart
                </button>
                <button class="btn btn-secondary btn-small" onclick="removeFromWatchlist('${stock.symbol}')">
                    <i class="fas fa-trash"></i>
                    Remove
                </button>
            </div>
        </div>
        `;
    }).join('');

    watchlistContainer.innerHTML = watchlistHTML;
}

// Firebase Watchlist Functions
async function loadWatchlistFromFirebase() {
    try {
        console.log('🔥 Loading watchlist from Firebase...');
        const user = firebase.auth().currentUser;
        if (!user) {
            console.log('❌ No user for Firebase watchlist load');
            return [];
        }

        const token = await user.getIdToken();
        console.log('🔑 Got Firebase token, length:', token.length);
        
        const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-User-ID': user.uid,
                'Content-Type': 'application/json'
            }
        });

        console.log('🌐 Firebase API response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();

            // CRITICAL DEBUG - Version 003 - Let's see what's really happening
            console.log('🔥 FIXED VERSION 003 PARSING - Data received:', data);
            console.log('🔥 Data type:', typeof data, 'IsArray:', Array.isArray(data));

            if (Array.isArray(data)) {
                console.log('🔥 SUCCESS PATH: Data is array with', data.length, 'items');
                console.log('🔥 Sample item:', data[0]);
                const result = data.map(item => ({
                    symbol: item.symbol || item.id,
                    company_name: item.company_name,
                    ...item
                }));
                console.log('🔥 RETURNING RESULT:', result.length, 'items');
                return result;
            } else {
                console.log('🔥 FALLBACK: Not an array, type:', typeof data);
                console.log('🔥 Keys:', Object.keys(data || {}));
                return [];
            }
        } else {
            const errorText = await response.text();
            console.error('❌ Firebase API error:', response.status, errorText);
            return [];
        }
    } catch (error) {
        console.error('❌ Error loading watchlist from Firebase:', error);
        return [];
    }
}

async function addToFirebaseWatchlist(symbol, companyName) {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            return false;
        }

        const token = await user.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-User-ID': user.uid,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                symbol: symbol,
                company_name: companyName || symbol
            })
        });

        return response.ok;
    } catch (error) {
        console.error('Error adding to Firebase watchlist:', error);
        return false;
    }
}

async function removeFromFirebaseWatchlist(symbol) {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            return false;
        }

        const token = await user.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/watchlist/${symbol}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-User-ID': user.uid,
                'Content-Type': 'application/json'
            }
        });

        return response.ok;
    } catch (error) {
        console.error('Error removing from Firebase watchlist:', error);
        return false;
    }
}

// Browser Storage Functions for Watchlist (Portfolio Version)
function getBrowserWatchlist() {
    try {
        const stored = localStorage.getItem('portfolio_watchlist');
        if (!stored) return [];
        
        const watchlistData = JSON.parse(stored);
        return watchlistData || [];
    } catch (error) {
        return [];
    }
}

function saveBrowserWatchlist(watchlist) {
    try {
        localStorage.setItem('portfolio_watchlist', JSON.stringify(watchlist));
    } catch (error) {
    }
}

function addToBrowserWatchlist(symbol, companyName) {
    try {
        const watchlist = getBrowserWatchlist();
        const exists = watchlist.find(stock => stock.symbol === symbol);
        
        if (!exists) {
            const newStock = {
                symbol: symbol,
                company_name: companyName || symbol,
                price: 'Loading...',
                change: 'Loading...',
                change_percent: 'Loading...',
                added_at: new Date().toISOString()
            };
            
            watchlist.push(newStock);
            saveBrowserWatchlist(watchlist);
            displayWatchlist(watchlist);
            
            // Fetch price for the new stock
            fetchStockPrice(symbol, companyName);
        } else {
        }
    } catch (error) {
    }
}

function removeFromBrowserWatchlist(symbol) {
    try {
        const watchlist = getBrowserWatchlist();
        const filtered = watchlist.filter(stock => stock.symbol !== symbol);
        saveBrowserWatchlist(filtered);
        displayWatchlist(filtered);
        showToast(`${symbol} removed from watchlist`, 'success');
    } catch (error) {
    }
}

// Enhanced authentication helper with auth state waiting
async function getAuthHeaders() {

    if (!window.firebaseAuth) {
        throw new Error('Firebase auth not initialized');
    }

    // Wait for auth state if currentUser is null
    if (!window.firebaseAuth.currentUser) {
        
        // Wait up to 5 seconds for auth state to be determined
        const authUser = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Auth state timeout - user not authenticated'));
            }, 5000);

            const unsubscribe = window.firebaseAuth.onAuthStateChanged((user) => {
                clearTimeout(timeout);
                unsubscribe();
                resolve(user);
            });
        });

        if (!authUser) {
            throw new Error('User not authenticated');
        }

    }

    try {

        // Force refresh token to ensure it's valid
        const idToken = await window.firebaseAuth.currentUser.getIdToken(true);

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
            'X-User-ID': window.firebaseAuth.currentUser.uid
        };

        return headers;
    } catch (error) {
        throw new Error('Failed to get authentication token');
    }
}

// Stock Price Fetching Functions (Portfolio Version)
async function fetchStockPrice(symbol, companyName) {
    try {
        
        // Use Yahoo Finance API (free, no auth required)
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const result = data.chart.result[0];
        const meta = result.meta;
        const quote = result.indicators.quote[0];
        
        const currentPrice = meta.regularMarketPrice;
        const previousClose = meta.previousClose;
        const change = currentPrice - previousClose;
        const changePercent = (change / previousClose) * 100;
        
        // Update the watchlist with new price data
        updateStockInWatchlist(symbol, {
            price: currentPrice.toFixed(2),
            change: change.toFixed(2),
            change_percent: changePercent.toFixed(2),
            company_name: companyName || meta.longName || symbol
        });
        
        
    } catch (error) {
        
        // Update with demo data if API fails
        updateStockInWatchlist(symbol, {
            price: (Math.random() * 200 + 50).toFixed(2),
            change: (Math.random() * 10 - 5).toFixed(2),
            change_percent: (Math.random() * 5 - 2.5).toFixed(2),
            company_name: companyName || symbol
        });
    }
}

async function fetchStockPriceFromBackend(symbol) {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            return null;
        }

        const token = await user.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/stock/${symbol}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-User-ID': user.uid,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data;
        } else {
            console.error('Failed to fetch stock price from backend:', response.status);
            return null;
        }
    } catch (error) {
        console.error('Error fetching stock price from backend:', error);
        return null;
    }
}

async function updateWatchlistPrices() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            return;
        }

        // Prevent multiple price updates running simultaneously
        if (window.updatingPrices) {
            console.log('⏸️ Price update already in progress, skipping...');
            return;
        }

        window.updatingPrices = true;
        console.log('💰 Starting price update process...');

        // Load current watchlist from Firebase
        const watchlist = await loadWatchlistFromFirebase();

        // Update prices for each stock using backend
        for (const stock of watchlist) {
            await fetchStockPriceFromBackend(stock.symbol);
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Display updated watchlist directly instead of calling loadWatchlist() again
        // This prevents the race condition that causes stocks to disappear
        const updatedWatchlist = await loadWatchlistFromFirebase();
        displayWatchlist(updatedWatchlist);

        console.log('✅ Price update completed');

    } catch (error) {
        console.error('Error updating watchlist prices:', error);
    } finally {
        window.updatingPrices = false;
    }
}

function updateStockInWatchlist(symbol, priceData) {
    try {
        const watchlist = getBrowserWatchlist();
        const stockIndex = watchlist.findIndex(stock => stock.symbol === symbol);
        
        if (stockIndex !== -1) {
            // Update the stock with new price data
            watchlist[stockIndex] = {
                ...watchlist[stockIndex],
                ...priceData,
                last_updated: new Date().toISOString()
            };
            
            saveBrowserWatchlist(watchlist);
            displayWatchlist(watchlist);
        }
    } catch (error) {
    }
}

// Debouncing mechanism to prevent multiple rapid calls
let addingToWatchlist = new Set();

async function addToWatchlist(symbol, companyName = null) {
    console.log('➕ Adding to watchlist:', symbol, companyName);
    
    // Prevent multiple rapid calls for the same symbol
    if (addingToWatchlist.has(symbol)) {
        console.log('⚠️ Already adding', symbol, 'to watchlist, skipping');
        return;
    }
    
    addingToWatchlist.add(symbol);
    
    try {
        // Check if user is authenticated
        const user = firebase.auth().currentUser;
        if (!user) {
            console.log('❌ No user logged in');
            showToast('Please log in to add stocks to your watchlist', 'warning');
            return;
        }

        console.log('✅ User authenticated:', user.email);
        
        // Check if already exists by loading current watchlist
        const currentWatchlist = await loadWatchlistFromFirebase();
        console.log('📊 Current watchlist:', currentWatchlist);
        const exists = currentWatchlist.find(stock => stock.symbol === symbol);
        
        if (exists) {
            console.log('⚠️ Stock already exists in watchlist');
            showToast(`${symbol} is already in your watchlist`, 'warning');
            return;
        }

        console.log('🔄 Adding to Firebase backend...');
        // Add to Firebase backend
        const success = await addToFirebaseWatchlist(symbol, companyName);
        
        if (success) {
            console.log('✅ Successfully added to Firebase');
            showToast(`${symbol} added to watchlist`, 'success');
            // Reload watchlist to show the new addition
            await loadWatchlistWithDeduplication();
        } else {
            console.log('❌ Failed to add to Firebase');
            showToast('Error adding to watchlist', 'error');
        }
        
    } catch (error) {
        console.error('❌ Error adding to watchlist:', error);
        showToast('Error adding to watchlist', 'error');
    } finally {
        // Always remove from the set when operation completes
        addingToWatchlist.delete(symbol);
    }
}

async function syncWatchlistAddition(symbol, companyName, retryCount = 0, maxRetries = 2) {
    try {
        
        // Wake up backend first
        await wakeUpBackendForWatchlist();
        
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ 
                symbol: symbol,
                company_name: companyName || symbol
            }),
            signal: AbortSignal.timeout(25000) // Increased to 25 second timeout
        });


        if (response.ok) {
            const data = await response.json();
            showToast(`${symbol} synced with backend`, 'success');
            // Refresh from backend to get latest data
            loadWatchlistWithRetry();
            return true;
            
        } else if (response.status === 503 && retryCount < maxRetries) {
            // Backend sleeping, retry with exponential backoff
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return await syncWatchlistAddition(symbol, companyName, retryCount + 1, maxRetries);
            
        } else {
            return false;
        }
        
    } catch (error) {
        if (error.name === 'TimeoutError') {
        } else {
        }
        
        if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return await syncWatchlistAddition(symbol, companyName, retryCount + 1, maxRetries);
        }
        
        return false;
    }
}

async function removeFromWatchlist(symbol) {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            showToast('Please log in to manage your watchlist', 'warning');
            return;
        }

        // Remove from Firebase backend
        const success = await removeFromFirebaseWatchlist(symbol);
        
        if (success) {
            showToast(`${symbol} removed from watchlist`, 'success');
            // Reload watchlist to reflect the change
            await loadWatchlistWithDeduplication();
        } else {
            showToast('Error removing from watchlist', 'error');
        }
        
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        showToast('Error removing from watchlist', 'error');
    }
}

async function clearWatchlist() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            showToast('Please log in to manage your watchlist', 'warning');
            return;
        }

        // Check if watchlist is empty
        const currentWatchlist = await loadWatchlistFromFirebase();
        if (currentWatchlist.length === 0) {
            showToast('Watchlist is already empty', 'info');
            return;
        }

        if (confirm('Are you sure you want to clear your entire watchlist?')) {
            // Clear from Firebase backend
            const token = await user.getIdToken();
            const response = await fetch(`${API_BASE_URL}/api/watchlist/clear`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-User-ID': user.uid,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                showToast('Watchlist cleared successfully', 'success');
                // Reload watchlist to show empty state
                await loadWatchlistWithDeduplication();
            } else {
                showToast('Error clearing watchlist', 'error');
            }
        }
        
    } catch (error) {
        console.error('Error clearing watchlist:', error);
        showToast('Error clearing watchlist', 'error');
    }
}

// Add this function to close the chart section
function closeChartSection() {
    chartSection.style.display = 'none';
    // Remove highlight from all stock cards and watchlist items
    document.querySelectorAll('.stock-card.selected, .watchlist-item.selected').forEach(el => {
        el.classList.remove('selected');
    });
    // Clear selected symbol in chart header
    const chartSelectedSymbol = document.getElementById('chartSelectedSymbol');
    if (chartSelectedSymbol) chartSelectedSymbol.textContent = '';
}

// Modify viewChart to highlight the selected stock and show symbol in chart header
async function viewChart(symbol) {
    try {
        // Remove previous highlights
        document.querySelectorAll('.stock-card.selected, .watchlist-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        // Highlight the selected stock card or watchlist item
        // Try to find in stockCard
        if (stockCard && stockCard.innerHTML.includes(symbol)) {
            stockCard.classList.add('selected');
        }
        // Try to find in watchlist
        document.querySelectorAll('.watchlist-item').forEach(item => {
            if (item.innerHTML.includes(symbol)) {
                item.classList.add('selected');
            }
        });
        // Show selected symbol in chart header
        const chartSelectedSymbol = document.getElementById('chartSelectedSymbol');
        if (chartSelectedSymbol) chartSelectedSymbol.textContent = symbol;

        const response = await fetch(`${API_BASE_URL}/api/chart/${symbol}`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (response.ok) {
            displayChart(data, symbol);
            
            // Debug chart section visibility
            
            chartSection.style.display = 'block';
            
            // Force the chart section to be visible and scroll to it
            chartSection.style.visibility = 'visible';
            chartSection.style.opacity = '1';
            chartSection.style.position = 'relative';
            chartSection.style.zIndex = '10';
            
            // Scroll to the chart section
            chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Check if canvas exists
            const canvas = document.getElementById('stockChart');
            if (canvas) {
            }
            
        } else {
            showToast(data.error || 'Error loading chart data', 'error');
        }
    } catch (error) {
        showToast('Error loading chart data', 'error');
    }
}

function displayChart(chartData, symbol) {
    
    const ctx = document.getElementById('stockChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (chart) {
        chart.destroy();
    }

    const labels = chartData.map(item => item.date);
    const prices = chartData.map(item => item.price);

    try {
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${symbol} Price`,
                    data: prices,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `${symbol} - 30 Day Price History`,
                        color: '#ffffff',
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        labels: {
                            color: '#ffffff'
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#94a3b8',
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#94a3b8',
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
    }
}

// Market status
async function updateMarketStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/market-status`, {
            credentials: 'include'
        });
        const data = await response.json();

        // Find the market status element
        const marketStatusElement = document.getElementById('marketStatusIndicator');
        if (!marketStatusElement) {
            return;
        }

        // Update the text content directly
        marketStatusElement.textContent = data.status;

        // Update styling based on market status
        if (data.isOpen) {
            marketStatusElement.style.background = '#22c55e'; // green
            marketStatusElement.style.color = '#fff';
        } else {
            marketStatusElement.style.background = '#ef4444'; // red
            marketStatusElement.style.color = '#fff';
        }
    } catch (error) {
    }
}

// News functionality
async function loadMarketNews() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/news/market`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (response.ok) {
            displayNews(data);
        } else {
            displayNewsError();
        }
    } catch (error) {
        displayNewsError();
    }
}

function displayNews(newsItems) {
    if (!newsContainer) {
        return;
    }
    
    if (newsItems.length === 0) {
        newsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-newspaper"></i>
                <p>No news available</p>
                <small>Try refreshing later</small>
            </div>
        `;
        return;
    }

    const newsHTML = newsItems.map(news => `
        <div class="news-item">
            <div class="news-item-header">
                <div class="news-item-title">
                    <a href="${news.link}" target="_blank" rel="noopener noreferrer">
                        ${news.title}
                    </a>
                </div>
            </div>
            <div class="news-item-meta">
                <span class="news-item-source">${news.source}</span>
                <span class="news-item-date">${formatDate(news.published_at)}</span>
            </div>
            ${news.summary ? `<div class="news-item-summary">${news.summary}</div>` : ''}
        </div>
    `).join('');

    newsContainer.innerHTML = newsHTML;
}

function displayNewsError() {
    if (!newsContainer) {
        return;
    }
    
    newsContainer.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Failed to load news</p>
            <small>Please try again later</small>
        </div>
    `;
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateString;
    }
}

// Utility functions
function setLoadingState(isLoading) {
    const btnText = searchBtn.querySelector('.btn-text');
    const btnLoading = searchBtn.querySelector('.btn-loading');

    if (isLoading) {
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-block';
        searchBtn.disabled = true;
    } else {
        btnText.style.display = 'inline-block';
        btnLoading.style.display = 'none';
        searchBtn.disabled = false;
    }
}

function showToast(message, type = 'info') {
    if (!toastContainer) {
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-${getToastIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;

    try {
        toastContainer.appendChild(toast);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideInRight 0.3s ease reverse';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toastContainer.removeChild(toast);
                    }
                }, 300);
            }
        }, 4000);
    } catch (error) {
    }
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'info': return 'info-circle';
        default: return 'info-circle';
    }
}

// Alert Management Functions
async function loadAlerts() {
    // Alert system completely disabled for now
    return;
    
    try {

        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE_URL}/api/alerts`, {
            method: 'GET',
            headers: headers
        });


        if (response.status === 401) {
            showToast('Session expired. Please log in again.', 'error');
            handleLogout();
            return;
        }

        const alerts = await response.json();

        displayAlerts(alerts);
    } catch (error) {
        if (error.message === 'User not authenticated') {
            displayAlerts([]);
        } else {
            showToast('Error loading alerts. Please try again.', 'error');
        }
    }
}

function displayAlerts(alerts) {
    const alertsList = document.getElementById('alerts-list');
    alertsList.innerHTML = '';

    alerts.forEach((alert, index) => {
        const alertElement = document.createElement('div');
        alertElement.className = `alert-item ${alert.triggered ? 'triggered' : ''}`;
        
        alertElement.innerHTML = `
            <div class="alert-info">
                <strong>${alert.symbol}</strong> - 
                ${alert.alert_type === 'above' ? 'Above' : 'Below'} $${alert.target_price.toFixed(2)}
                ${alert.triggered ? '(Triggered)' : ''}
            </div>
            <div class="alert-actions">
                <button class="alert-delete" onclick="deleteAlert('${alert.symbol}', ${index})">
                    Delete
                </button>
            </div>
        `;
        
        alertsList.appendChild(alertElement);
    });
}

async function createAlert() {
    const symbol = document.getElementById('alert-symbol').value.toUpperCase();
    const price = parseFloat(document.getElementById('alert-price').value);
    const type = document.getElementById('alert-type').value;

    if (!symbol || !price) {
        showToast('Please enter both symbol and price', 'error');
        return;
    }

    try {

        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE_URL}/api/alerts`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                symbol,
                target_price: price,
                alert_type: type
            })
        });


        if (response.ok) {
            showToast('Alert created successfully', 'success');
            document.getElementById('alert-symbol').value = '';
            document.getElementById('alert-price').value = '';
            // loadAlerts(); // Disabled
        } else if (response.status === 401) {
            showToast('Session expired. Please log in again.', 'error');
            handleLogout();
        } else {
            const error = await response.json();
            showToast(error.error || 'Error creating alert', 'error');
        }
    } catch (error) {
        if (error.message === 'User not authenticated') {
            showToast('Please log in to create alerts', 'error');
        } else {
            showToast('Network error. Please check your connection and try again.', 'error');
        }
    }
}

async function deleteAlert(symbol, index) {
    try {

        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE_URL}/api/alerts/${symbol}/${index}`, {
            method: 'DELETE',
            headers: headers
        });


        if (response.ok) {
            showToast('Alert deleted successfully', 'success');
            // loadAlerts(); // Disabled
        } else if (response.status === 401) {
            showToast('Session expired. Please log in again.', 'error');
            handleLogout();
        } else {
            const error = await response.json();
            showToast(error.error || 'Error deleting alert', 'error');
        }
    } catch (error) {
        if (error.message === 'User not authenticated') {
            showToast('Please log in to delete alerts', 'error');
        } else {
            showToast('Error deleting alert', 'error');
        }
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;

    const notificationContainer = document.getElementById('notificationContainer');
    
    // Check if notification container exists
    if (!notificationContainer) {
        return;
    }
    
    try {
        notificationContainer.appendChild(notification);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideInRight 0.3s ease reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notificationContainer.removeChild(notification);
                    }
                }, 300);
            }
        }, 4000);
    } catch (error) {
    }
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'info': return 'info-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

// Backend Keep-Alive Functions
function startBackendKeepAlive() {
    
    // Make an initial request to wake up the backend
    wakeUpBackend();
    
    // Keep backend alive with periodic requests every 20 seconds
    setInterval(() => {
        wakeUpBackend();
    }, 20000); // 20 seconds
}

async function wakeUpBackend() {
    try {
        const response = await fetch(`${API_BASE_URL}/`, {
            method: 'GET',
            cache: 'no-cache'
        });
        if (response.ok) {
        }
    } catch (error) {
    }
}

// Auth Functions
let authListenerSetup = false; // Guard to prevent multiple listeners
let currentAuthRequest = null; // Guard to prevent parallel auth requests

async function checkAuthStatus() {
    try {
        
        if (window.firebaseAuth && !authListenerSetup) {
            authListenerSetup = true;
            
            // Wait for Firebase Auth state restoration with timeout
            const authUser = await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    resolve(window.firebaseAuth.currentUser);
                }, 3000);
                
                const unsubscribe = window.firebaseAuth.onAuthStateChanged((user) => {
                    clearTimeout(timeout);
                    unsubscribe(); // Only resolve once
                    resolve(user);
                });
            });
            
            // Handle the initial auth state
            await handleAuthStateChange(authUser);
            
            // Set up ongoing listener for future auth state changes
            window.firebaseAuth.onAuthStateChanged(handleAuthStateChange);
        } else {
            showAuthForms();
        }
    } catch (error) {
        showAuthForms();
    }
}

// Authentication persistence helper
function shouldStayLoggedIn() {
    // Check if user has opted for persistent login
    const rememberMe = localStorage.getItem('rememberMe') === 'true';
    return rememberMe;
}

// Save remember me preference
function saveRememberMePreference(remember) {
    localStorage.setItem('rememberMe', remember.toString());
}

async function handleAuthStateChange(user) {
    if (user) {
        console.log('🔐 User authenticated:', user.email);
        
        // Show main content immediately without waiting for backend verification
        const userData = {
            email: user.email,
            id: user.uid,
            name: user.displayName || user.email.split('@')[0]
        };
        
        showMainContent(userData);
        
        // Verify with backend in background (non-blocking)
        verifyWithBackend(user).catch(error => {
            console.log('⚠️ Backend verification failed, but keeping user logged in:', error);
        });
        
    } else {
        // Only show auth forms if user shouldn't stay logged in
        if (!shouldStayLoggedIn()) {
            console.log('🔐 User logged out');
            showAuthForms();
        } else {
            console.log('🔐 User logged out but should stay logged in - keeping session');
        }
    }
}

async function verifyWithBackend(user) {
    try {
        const testHeaders = await getAuthHeaders();
        
        const response = await fetch(`${API_BASE_URL}/api/debug/auth`, {
            method: 'GET',
            headers: testHeaders
        });

        if (!response.ok) {
            console.log('⚠️ Backend verification failed, but keeping user logged in');
        }
        
    } catch (error) {
        console.log('⚠️ Backend verification error, but keeping user logged in:', error);
    }
}

function showMainContent(user) {
    
    // Check if elements exist
    const landingContainer = document.querySelector('.landing-page');
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const usernameDisplay = document.getElementById('username-display');
    const usernameWelcome = document.getElementById('username-welcome');
    
    if (!landingContainer || !authContainer || !mainContent || !usernameDisplay || !usernameWelcome) {
        return;
    }
    
    // Hide auth container and landing container
    landingContainer.style.display = 'none';
    authContainer.style.display = 'none';
    
    // Show main content
    mainContent.style.display = 'block';
    
    // Update username display (footer)
    const displayName = user.name || user.email.split('@')[0];
    usernameDisplay.textContent = `Welcome, ${displayName}!`;
    // Update username welcome at the top
    usernameWelcome.textContent = `Welcome, ${displayName}!`;
    usernameWelcome.style.display = 'block';
    
    // Progressive loading: News first, then search, then intelligence
    showProgressiveLoadingIndicator();
    
    // 1. Load news first (since it's working well)
    loadMarketNews().then(() => {
        updateLoadingIndicator('Search functionality activating...', 1);
        
        // 2. Activate search functionality after news loads (immediate)
        activateSearchFunctionality();
        updateLoadingIndicator('Market intelligence loading...', 2);
        
        // 3. Load intelligence section last (market intelligence)
        loadIntelligenceSection().then(() => {
            hideProgressiveLoadingIndicator();
        });
    });
    
    // Load other non-critical data in background
    updateMarketStatus();
    
    // Prewarm backend for faster search responses
    setTimeout(() => {
        wakeUpBackend();
    }, 1000); // Wake up backend early
    
    // Load watchlist independently in background (non-blocking)
    setTimeout(() => {
        loadWatchlistWithDeduplication().catch(error => {
        });
    }, 2000); // 2 second delay to ensure other features are ready
}

// Progressive loading indicator functions
function showProgressiveLoadingIndicator() {
    // Create or show loading indicator
    let indicator = document.getElementById('progressive-loading');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'progressive-loading';
        indicator.innerHTML = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 10px; 
                        z-index: 9999; text-align: center; min-width: 300px;">
                <div style="margin-bottom: 10px;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>
                </div>
                <div id="loading-message">Loading news...</div>
                <div style="margin-top: 10px; font-size: 12px; opacity: 0.7;">
                    Step <span id="loading-step">1</span> of 3
                </div>
            </div>
        `;
        document.body.appendChild(indicator);
    }
    indicator.style.display = 'block';
}

function updateLoadingIndicator(message, step) {
    const messageEl = document.getElementById('loading-message');
    const stepEl = document.getElementById('loading-step');
    if (messageEl) messageEl.textContent = message;
    if (stepEl) stepEl.textContent = step;
}

function hideProgressiveLoadingIndicator() {
    const indicator = document.getElementById('progressive-loading');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Progressive loading functions
function activateSearchFunctionality() {
    
    try {
        // Ensure search input is enabled and visible
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.getElementById('search-btn');
        
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = 'Search stocks...';
            searchInput.style.opacity = '1';
            
            // Add visual feedback that search is ready
            searchInput.style.borderColor = '#4CAF50';
            searchInput.style.boxShadow = '0 0 5px rgba(76, 175, 80, 0.3)';
        }
        
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.style.opacity = '1';
            
            // Add visual feedback that button is ready
            searchBtn.style.backgroundColor = '#4CAF50';
        }
        
        // Watchlist loading is handled by showMainContent - no need for duplicate call
        
    } catch (error) {
    }
}

// Independent watchlist loading function
function loadWatchlistIndependently() {
    
    // Load watchlist in background without blocking other operations
    setTimeout(async () => {
        try {
            // Check if watchlist request is already in progress
            if (watchlistRequestInProgress) {
                return;
            }
            
            // Small delay to let other initialization finish
            await new Promise(resolve => setTimeout(resolve, 1000));

            await loadWatchlistWithDeduplication();
        } catch (error) {
        }
    }, 3000); // Increased to 3 second delay to avoid conflicts
}

async function loadIntelligenceSection() {
    
    return new Promise((resolve) => {
        try {
            // Initialize market intelligence features
            initializeMarketIntelligence();
            
            // Show intelligence section with loading indicator
            const intelligenceSection = document.querySelector('.market-intelligence');
            if (intelligenceSection) {
                intelligenceSection.style.opacity = '1';
            }
            
            // Resolve after a short delay
            setTimeout(resolve, 1000);
            
        } catch (error) {
            resolve(); // Continue anyway
        }
    });
}

function showAuthForms() {
    
    // Check if elements exist
    const landingContainer = document.querySelector('.landing-page');
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    
    if (!landingContainer || !authContainer || !mainContent) {
        return;
    }
    
    // Show landing container and auth container
    landingContainer.style.display = 'block';
    authContainer.style.display = 'block';
    
    // Hide main content
    mainContent.style.display = 'none';
    
    // Reset to login form
    switchAuthTab('login');
}

function toggleAuthForm(form) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    if (form === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    } else {
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    }
}

// Modern auth tab switching
function switchAuthTab(form) {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    if (form === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    } else {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    }
}

// Make switchAuthTab globally available
window.switchAuthTab = switchAuthTab;

async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me') ? document.getElementById('remember-me').checked : false;
    const submitBtn = event.target.querySelector('.cta-button') || event.target.closest('form').querySelector('.cta-button');
    
    
    // Enhanced input validation
    if (!email || !password) {
        showNotification('📝 Please enter both email and password to continue', 'error');
        return;
    }

    if (!email.includes('@')) {
        showNotification('❌ Please enter a valid email address', 'error');
        return;
    }

    if (password.length < 6) {
        showNotification('🔒 Password must be at least 6 characters long', 'error');
        return;
    }
    
    // Add loading state
    if (submitBtn) {
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
    }

    try {
        // Try Firebase Authentication first
        if (window.firebaseAuth) {
            try {
                // Set persistence based on remember me checkbox
                const persistence = rememberMe ? 
                    firebase.auth.Auth.Persistence.LOCAL : 
                    firebase.auth.Auth.Persistence.SESSION;
                
                await window.firebaseAuth.setPersistence(persistence);
                
                // Save remember me preference
                saveRememberMePreference(rememberMe);

                // Use Firebase v9 compatibility mode API
                const userCredential = await window.firebaseAuth.signInWithEmailAndPassword(email, password);

                const user = userCredential.user;

                // Firebase v9: getIdToken(forceRefresh)
                const idToken = await user.getIdToken(true);

                
                // Send the ID token to the backend for session creation
                
                const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ idToken }),
                    credentials: 'include'
                });
                

                const data = await response.json();
                
                if (response.ok) {
                    showNotification('Login successful', 'success');
                    document.getElementById('login-email').value = '';
                    document.getElementById('login-password').value = '';
                    showMainContent(data.user);
                    watchlistData = [];
                    currentStock = null;
                } else {
                    showNotification(data.error || 'Authentication failed', 'error');
                    if (window.firebaseAuth) {
                        await window.firebaseAuth.signOut(); // Sign out from Firebase if backend rejects
                    }
                }
                return;
            } catch (firebaseError) {
                // Enhanced error handling with specific user-friendly messages
                switch (firebaseError.code) {
                    case 'auth/user-not-found':
                        showNotification('❌ No account found with this email address. Please check your email or create a new account.', 'error');
                        break;
                    case 'auth/wrong-password':
                        showNotification('❌ Incorrect password. Please check your password and try again.', 'error');
                        break;
                    case 'auth/invalid-email':
                        showNotification('❌ Please enter a valid email address.', 'error');
                        break;
                    case 'auth/user-disabled':
                        showNotification('❌ This account has been disabled. Please contact support.', 'error');
                        break;
                    case 'auth/too-many-requests':
                        showNotification('⚠️ Too many failed login attempts. Please wait a few minutes and try again.', 'error');
                        break;
                    case 'auth/network-request-failed':
                        showNotification('❌ Network error. Please check your internet connection and try again.', 'error');
                        break;
                    case 'auth/invalid-credential':
                    case 'auth/invalid-login-credentials':
                        showNotification('❌ Incorrect email or password. Please double-check your login details and try again.', 'error');
                        break;
                    default:
                        showNotification(`❌ Login failed: ${firebaseError.message || 'Please try again.'}`, 'error');
                        break;
                }
                return;
            }
        }
        
        // No fallback authentication - Firebase is required
        showNotification('Firebase authentication is required. Please check your internet connection and try again.', 'error');
    } catch (error) {
        showNotification('Error during login', 'error');
    } finally {
        // Remove loading state
        if (submitBtn) {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }
}

async function handleRegister(event) {
    event.preventDefault();
    
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const submitBtn = event.target.querySelector('.cta-button') || event.target.closest('form').querySelector('.cta-button');

    // Enhanced registration input validation
    if (!name || !email || !password) {
        showNotification('📝 Please fill in all required fields', 'error');
        return;
    }

    if (name.length < 2) {
        showNotification('👤 Please enter your full name (at least 2 characters)', 'error');
        return;
    }

    if (!email.includes('@') || !email.includes('.')) {
        showNotification('❌ Please enter a valid email address', 'error');
        return;
    }

    if (password.length < 6) {
        showNotification('🔒 Password must be at least 6 characters long', 'error');
        return;
    }

    // Add loading state
    if (submitBtn) {
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
    }

    try {
        // Try Firebase Authentication first
        if (window.firebaseAuth) {
            try {
                const userCredential = await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;
                
                
                // Update the user's display name
                await user.updateProfile({
                    displayName: name
                });
                
                const idToken = await user.getIdToken();
                
                // Send user info to backend to create profile
                const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, email, password, idToken }),
                    credentials: 'include'
                });

                const data = await response.json();
                
                if (response.ok) {
                    showNotification('Registration successful', 'success');
                    document.getElementById('register-name').value = '';
                    document.getElementById('register-email').value = '';
                    document.getElementById('register-password').value = '';
                    showMainContent(data.user);
                    watchlistData = [];
                    currentStock = null;
                } else {
                    showNotification(data.error || 'Registration failed', 'error');
                    // Delete the user from Firebase if backend registration fails
                    try {
                        await user.delete();
                    } catch (deleteError) {
                    }
                }
                return;
            } catch (firebaseError) {
                // Enhanced registration error handling with specific user-friendly messages
                switch (firebaseError.code) {
                    case 'auth/email-already-in-use':
                        showNotification('⚠️ This email is already registered. Please try logging in instead.', 'error');
                        break;
                    case 'auth/weak-password':
                        showNotification('🔒 Password is too weak. Please use at least 6 characters with a mix of letters, numbers, and symbols.', 'error');
                        break;
                    case 'auth/invalid-email':
                        showNotification('❌ Please enter a valid email address.', 'error');
                        break;
                    case 'auth/operation-not-allowed':
                        showNotification('❌ Email registration is not enabled. Please contact support.', 'error');
                        break;
                    case 'auth/network-request-failed':
                        showNotification('❌ Network error. Please check your internet connection and try again.', 'error');
                        break;
                    default:
                        showNotification(`❌ Registration failed: ${firebaseError.message || 'Please try again.'}`, 'error');
                        break;
                }
                return;
            }
        }
        
        // No fallback registration - Firebase is required
        showNotification('Firebase authentication is required. Please check your internet connection and try again.', 'error');
    } catch (error) {
        showNotification('Error during registration', 'error');
    } finally {
        // Remove loading state
        if (submitBtn) {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }
}

// Make authentication functions globally available for HTML form handlers
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;

// Add event listeners for form submissions and tab buttons
document.addEventListener('DOMContentLoaded', function() {
    
    // Form event listeners
    const loginForm = document.getElementById('login-form-element');
    const registerForm = document.getElementById('register-form-element');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(event) {
            event.preventDefault();
            handleLogin(event);
        });
    } else {
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', function(event) {
            event.preventDefault();
            handleRegister(event);
        });
    } else {
    }
    
    // Tab button event listeners
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    
    if (loginTab) {
        loginTab.addEventListener('click', function(event) {
            event.preventDefault();
            switchAuthTab('login');
        });
    } else {
    }
    
    if (registerTab) {
        registerTab.addEventListener('click', function(event) {
            event.preventDefault();
            switchAuthTab('register');
        });
    } else {
    }
});

async function handleLogout() {
    try {
        // Sign out from Firebase if authenticated
        if (window.firebaseAuth && window.firebaseAuth.currentUser) {
            await window.firebaseAuth.signOut();
        }
        
        // Also sign out from backend
        const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
            credentials: 'include'
        });
        
        // Always treat logout as successful to clear frontend state
        showNotification('Logout successful', 'success');
        
        // Clear all user data and forms
        watchlistData = [];
        currentStock = null;
        
        // Force UI update
        showAuthForms();
        
        // Clear any cached data
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('register-name').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        
        // Clear any search results
        const stockResults = document.getElementById('stockResults');
        if (stockResults) {
            stockResults.style.display = 'none';
        }
        
        // Clear watchlist display
        const watchlistContainer = document.getElementById('watchlistContainer');
        if (watchlistContainer) {
            watchlistContainer.innerHTML = `
                <div class="empty-state" id="emptyWatchlist">
                    <i class="fas fa-star-o"></i>
                    <p>Your watchlist is empty</p>
                    <small>Search for stocks and add them to your watchlist</small>
                </div>
            `;
        }
        
        
    } catch (error) {
        // Even if there's an error, still clear the UI
        showAuthForms();
        showNotification('Logout completed', 'info');
    }
} 

// --- Stock Details Modal Logic ---
async function loadStockDetails(symbol) {
    // Show loading state
    document.getElementById('detailsCompanyName').textContent = 'Loading...';
    document.getElementById('detailsSymbol').textContent = symbol;
    document.getElementById('detailsCEO').textContent = '-';
    document.getElementById('detailsDescription').textContent = '-';
    document.getElementById('detailsPrice').textContent = '-';
    const chartContainer = document.getElementById('detailsChartContainer');
    if (chartContainer) chartContainer.innerHTML = '<div class="spinner"></div>';
    const newsContainer = document.getElementById('detailsNewsContainer');
    if (newsContainer) newsContainer.innerHTML = '<div class="spinner"></div>';

    // Scroll modal to top and focus close button for accessibility
    const modalContent = document.querySelector('.stock-details-content');
    if (modalContent) modalContent.scrollTop = 0;
    const closeBtn = document.getElementById('closeDetailsBtn');
    if (closeBtn) closeBtn.focus();

    try {
        // Fetch company info from backend
        const response = await fetch(`${API_BASE_URL}/api/company/${symbol}`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (response.ok) {
            document.getElementById('detailsCompanyName').textContent = data.name || symbol;
            document.getElementById('detailsSymbol').textContent = data.symbol || symbol;
            document.getElementById('detailsCEO').textContent = data.ceo || '-';
            document.getElementById('detailsDescription').textContent = data.description || '-';
            document.getElementById('detailsPrice').textContent = data.price !== undefined ? data.price : '-';
            document.getElementById('detailsMarketCap').textContent = data.marketCap && data.marketCap !== '-' ? formatMarketCap(data.marketCap) : '-';
            document.getElementById('detailsPERatio').textContent = data.peRatio && data.peRatio !== '-' ? data.peRatio : '-';
            document.getElementById('detailsDividendYield').textContent = data.dividendYield && data.dividendYield !== '-' ? (data.dividendYield * 100).toFixed(2) + '%' : '-';
            const websiteElem = document.getElementById('detailsWebsite');
            if (websiteElem) {
                if (data.website && data.website !== '-') {
                    websiteElem.textContent = data.website.replace(/^https?:\/\//, '');
                    websiteElem.href = data.website;
                } else {
                    websiteElem.textContent = '-';
                    websiteElem.href = '#';
                }
            }
            document.getElementById('detailsHeadquarters').textContent = data.headquarters && data.headquarters !== '-' ? data.headquarters : '-';
        } else {
            document.getElementById('detailsCompanyName').textContent = 'Not found';
        }
    } catch (err) {
        document.getElementById('detailsCompanyName').textContent = 'Error loading data';
    }

    // Fetch and display chart in modal
    try {
        const chartResp = await fetch(`${API_BASE_URL}/api/chart/${symbol}`, {
            credentials: 'include'
        });
        const chartData = await chartResp.json();
        if (chartResp.ok && chartContainer) {
            chartContainer.innerHTML = '<canvas id="detailsStockChart"></canvas>';
            const ctx = document.getElementById('detailsStockChart').getContext('2d');
            if (window.detailsChart) window.detailsChart.destroy();
            window.detailsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartData.map(item => item.date),
                    datasets: [{
                        label: `${symbol} Price`,
                        data: chartData.map(item => item.price),
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { ticks: { color: '#a1a1aa' } },
                        y: { ticks: { color: '#a1a1aa' } }
                    }
                }
            });
        } else if (chartContainer) {
            chartContainer.innerHTML = '<div class="error">Chart unavailable</div>';
        }
    } catch (err) {
        if (chartContainer) chartContainer.innerHTML = '<div class="error">Chart unavailable</div>';
    }

    // Fetch and display company news using main site style
    try {
        const newsRes = await fetch(`${API_BASE_URL}/api/news/company/${symbol}`, {
            credentials: 'include'
        });
        let newsData = await newsRes.json();
        if (newsRes.ok && Array.isArray(newsData)) {
            // Filter out news with missing title or link
            newsData = newsData.filter(n => n.title && n.link);
            // Limit to 6 news items
            newsData = newsData.slice(0, 6);
            if (newsData.length > 0) {
                let newsHTML = `<h3>Latest News</h3>` + newsData.map(news => `
                    <div class="news-item">
                        <div class="news-item-title">
                            <a href="${news.link}" target="_blank" rel="noopener noreferrer">
                                ${news.title}
                            </a>
                        </div>
                        <div class="news-item-meta">
                            <span class="news-item-source">${news.source}</span>
                            <span class="news-item-date">${formatDate(news.published_at)}</span>
                        </div>
                        ${news.summary ? `<div class="news-item-summary">${news.summary}</div>` : ''}
                    </div>
                `).join('');
                newsContainer.innerHTML = newsHTML;
            } else {
                newsContainer.innerHTML = `
                    <h3>Latest News</h3>
                    <div class="news-item news-item-placeholder">
                        <div class="news-item-title">
                            <span style="color:var(--text-muted);">No news available for this company</span>
                        </div>
                        <div class="news-item-meta">
                            <span class="news-item-source">-</span>
                            <span class="news-item-date">-</span>
                        </div>
                        <div class="news-item-summary" style="color:var(--text-muted);">
                            When news is available for this company, it will appear here as a preview card.
                        </div>
                    </div>
                `;
            }
        } else {
            newsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-newspaper"></i>
                    <p>No news available</p>
                    <small>Try refreshing later</small>
                </div>
            `;
        }
    } catch (err) {
        newsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load news</p>
                <small>Please try again later</small>
            </div>
        `;
    }
}

// Helper to display chart in modal
function displayDetailsChart(chartData, symbol) {
    const ctx = document.getElementById('detailsStockChart').getContext('2d');
    if (window.detailsChart) window.detailsChart.destroy();
    const labels = chartData.map(item => item.date);
    const prices = chartData.map(item => item.price);
    window.detailsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${symbol} Price`,
                data: prices,
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34,197,94,0.08)',
                tension: 0.2,
                pointRadius: 2,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { display: true, title: { display: false } },
                y: { display: true, title: { display: false } }
            }
        }
    });
}

// Add helper for formatting market cap
function formatMarketCap(value) {
    if (typeof value !== 'number') return value;
    if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
    if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
    if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
    return value.toString();
}

// Add event delegation for stock card and watchlist items
function setupStockCardListeners() {
    // Stock card (search result)
    if (stockCard) {
        stockCard.onclick = function(e) {
            // Only trigger if not clicking a button
            if (!e.target.closest('button')) {
                const symbol = stockCard.querySelector('.stock-symbol')?.textContent;
                if (symbol) openStockDetailsModal(symbol);
            }
        };
    }
}

function setupWatchlistListeners() {
    if (watchlistContainer) {
        watchlistContainer.onclick = function(e) {
            const item = e.target.closest('.watchlist-item');
            if (item && !e.target.closest('button')) {
                const symbol = item.querySelector('.watchlist-item-symbol')?.textContent;
                if (symbol) openStockDetailsModal(symbol);
            }
        };
    }
}

// Patch displayStockResult and displayWatchlist to call these after rendering
const origDisplayStockResult = displayStockResult;
displayStockResult = function(stock) {
    origDisplayStockResult(stock);
    setupStockCardListeners();
};
const origDisplayWatchlist = displayWatchlist;
displayWatchlist = function(stocks) {
    origDisplayWatchlist(stocks);
    setupWatchlistListeners();
}; 

// Define the modal functions
function openStockDetailsModal(symbol) {
    // Hide search bar
    const searchSection = document.querySelector('.search-section');
    if (searchSection) searchSection.style.display = 'none';

    // Show modal
    document.getElementById('stockDetailsModal').style.display = 'flex';
    // Fetch and display details
    loadStockDetails(symbol);
}

function closeStockDetailsModal() {
    // Show search bar again
    const searchSection = document.querySelector('.search-section');
    if (searchSection) searchSection.style.display = 'block';

    document.getElementById('stockDetailsModal').style.display = 'none';
    // Optionally clear modal content
}

// Expose modal functions globally for event handlers (must be at the end)
window.openStockDetailsModal = openStockDetailsModal;
window.closeStockDetailsModal = closeStockDetailsModal; 

// Market Intelligence Functions
function showIntelligenceTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab content
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Load data for the selected tab
    if (tabName === 'earnings') {
        loadEarningsCalendar();
    }
}

async function loadEarningsCalendar() {
    const earningsContainer = document.getElementById('earningsList');
    
    // Show loading state
    earningsContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading earnings calendar...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/api/market/earnings`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const earnings = await response.json();

        if (!earnings || earnings.length === 0) {
            earningsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar"></i>
                    <p>No upcoming earnings found</p>
                    <small>Check back later for new earnings announcements</small>
                </div>
            `;
            return;
        }

        let earningsHTML = `
            <div class="earnings-summary">
                <h4>Upcoming Earnings Calendar</h4>
                <p>Showing ${earnings.length} upcoming earnings events</p>
            </div>
        `;
        
        earnings.forEach(earning => {
            const date = new Date(earning.earnings_date).toLocaleDateString();
            const estimateClass = earning.estimate > 0 ? 'positive' : 'negative';
            const daysUntil = Math.ceil((new Date(earning.earnings_date) - new Date()) / (1000 * 60 * 60 * 24));
            const daysText = daysUntil === 1 ? 'Tomorrow' : daysUntil === 0 ? 'Today' : `in ${daysUntil} days`;
            
            earningsHTML += `
                <div class="earnings-item">
                    <div class="earnings-header">
                        <div class="earnings-symbol">
                            <i class="fas fa-chart-line"></i>
                            ${earning.symbol}
                        </div>
                        <div class="earnings-date">
                            <i class="fas fa-calendar-alt"></i>
                            ${date} (${daysText})
                        </div>
                    </div>
                    <div class="earnings-company">
                        <i class="fas fa-building"></i>
                        ${earning.company_name}
                    </div>
                    <div class="earnings-estimate ${estimateClass}">
                        <i class="fas fa-dollar-sign"></i>
                        Estimate: $${earning.estimate}
                    </div>
                </div>
            `;
        });

        earningsContainer.innerHTML = earningsHTML;
    } catch (error) {
        earningsContainer.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load earnings calendar</p>
                <small>Please try again later or check your connection</small>
            </div>
        `;
        showNotification('Failed to load earnings calendar', 'error');
    }
}

async function getInsiderTrading() {
    const symbol = document.getElementById('insider-symbol').value.trim().toUpperCase();
    
    if (!symbol) {
        showNotification('Please enter a stock symbol', 'error');
        return;
    }

    const insiderContainer = document.getElementById('insiderList');
    
    // Show loading state
    insiderContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading insider trading data for ${symbol}...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/api/market/insider-trading/${symbol}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                insiderContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-user-secret"></i>
                        <p>No insider trading data found for ${symbol}</p>
                        <small>Try searching for a different stock symbol</small>
                    </div>
                `;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return;
        }
        
        const insiderData = await response.json();

        if (!insiderData || insiderData.length === 0) {
            insiderContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-secret"></i>
                    <p>No insider trading data found for ${symbol}</p>
                    <small>This stock may not have recent insider trading activity</small>
                </div>
            `;
            return;
        }

        let insiderHTML = `
            <div class="insider-summary">
                <h4>Recent Insider Trading for ${symbol}</h4>
                <p>Showing ${insiderData.length} recent transactions</p>
            </div>
        `;
        
        insiderData.forEach(insider => {
            const date = new Date(insider.date).toLocaleDateString();
            const transactionClass = insider.transaction_type.toLowerCase();
            const valueFormatted = insider.value ? `$${insider.value.toLocaleString()}` : 'N/A';
            
            insiderHTML += `
                <div class="insider-item">
                    <div class="insider-header">
                        <div class="insider-filer">${insider.filer_name}</div>
                        <div class="insider-date">${date}</div>
                    </div>
                    <div class="insider-title">${insider.title}</div>
                    <div class="insider-transaction ${transactionClass}">
                        <i class="fas fa-${transactionClass === 'buy' ? 'arrow-up' : 'arrow-down'}"></i>
                        ${insider.transaction_type} ${insider.shares.toLocaleString()} shares
                    </div>
                    <div class="insider-shares">
                        Price: $${insider.price} | Value: ${valueFormatted}
                    </div>
                </div>
            `;
        });

        insiderContainer.innerHTML = insiderHTML;
    } catch (error) {
        insiderContainer.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load insider trading data</p>
                <small>Please try again later or check your connection</small>
            </div>
        `;
        showNotification('Failed to load insider trading data', 'error');
    }
}

async function getAnalystRatings() {
    const symbol = document.getElementById('analyst-symbol').value.trim().toUpperCase();
    
    if (!symbol) {
        showNotification('Please enter a stock symbol', 'error');
        return;
    }

    const analystContainer = document.getElementById('analystList');
    
    // Show loading state
    analystContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading analyst ratings for ${symbol}...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/api/market/analyst-ratings/${symbol}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                analystContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-chart-bar"></i>
                        <p>No analyst ratings found for ${symbol}</p>
                        <small>Try searching for a different stock symbol</small>
                    </div>
                `;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return;
        }
        
        const ratingsData = await response.json();

        if (!ratingsData.analysts || ratingsData.analysts.length === 0) {
            analystContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-bar"></i>
                    <p>No analyst ratings found for ${symbol}</p>
                    <small>This stock may not have recent analyst coverage</small>
                </div>
            `;
            return;
        }

        let analystHTML = `
            <div class="analyst-summary">
                <h4>Analyst Ratings for ${symbol}</h4>
                <div class="consensus-rating ${ratingsData.consensus_rating.toLowerCase()}">
                    <i class="fas fa-star"></i>
                    Consensus: ${ratingsData.consensus_rating}
                </div>
                <div class="price-targets">
                    <span><i class="fas fa-chart-line"></i> Avg Target: $${ratingsData.price_target_avg}</span>
                    <span><i class="fas fa-arrow-up"></i> High: $${ratingsData.price_target_high}</span>
                    <span><i class="fas fa-arrow-down"></i> Low: $${ratingsData.price_target_low}</span>
                </div>
            </div>
        `;

        ratingsData.analysts.forEach(analyst => {
            const date = new Date(analyst.date).toLocaleDateString();
            const ratingClass = analyst.rating.toLowerCase();
            
            analystHTML += `
                <div class="analyst-item">
                    <div class="analyst-header">
                        <div class="analyst-firm">${analyst.firm}</div>
                        <div class="analyst-date">${date}</div>
                    </div>
                    <div class="analyst-rating ${ratingClass}">
                        <i class="fas fa-${ratingClass === 'buy' ? 'thumbs-up' : ratingClass === 'sell' ? 'thumbs-down' : 'minus'}"></i>
                        ${analyst.rating}
                    </div>
                    <div class="analyst-target">
                        <i class="fas fa-bullseye"></i>
                        Price Target: $${analyst.price_target}
                    </div>
                </div>
            `;
        });

        analystContainer.innerHTML = analystHTML;
    } catch (error) {
        analystContainer.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load analyst ratings</p>
                <small>Please try again later or check your connection</small>
            </div>
        `;
        showNotification('Failed to load analyst ratings', 'error');
    }
}

async function getOptionsData() {
    const symbol = document.getElementById('options-symbol').value.trim().toUpperCase();
    
    if (!symbol) {
        showNotification('Please enter a stock symbol', 'error');
        return;
    }

    const optionsContainer = document.getElementById('optionsList');
    
    // Show loading state
    optionsContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading options data for ${symbol}...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/api/market/options/${symbol}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                optionsContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-chart-area"></i>
                        <p>No options data found for ${symbol}</p>
                        <small>Try searching for a different stock symbol</small>
                    </div>
                `;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return;
        }
        
        const optionsData = await response.json();

        if (!optionsData.call_options || optionsData.call_options.length === 0) {
            optionsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-area"></i>
                    <p>No options data found for ${symbol}</p>
                    <small>This stock may not have active options trading</small>
                </div>
            `;
            return;
        }

        let optionsHTML = `
            <div class="options-summary">
                <h4>Options Data for ${symbol}</h4>
                <div class="current-price">
                    <i class="fas fa-dollar-sign"></i>
                    Current Price: $${optionsData.current_price}
                </div>
                <div class="expiration-dates">
                    <i class="fas fa-calendar"></i>
                    Expirations: ${optionsData.expiration_dates.join(', ')}
                </div>
            </div>
        `;

        // Display call options
        optionsHTML += '<div class="options-expiration"><i class="fas fa-arrow-up"></i> Call Options</div>';
        optionsHTML += '<div class="options-strikes">';
        optionsData.call_options.forEach(option => {
            optionsHTML += `
                <div class="strike-item call-option">
                    <div class="strike-price">$${option.strike}</div>
                    <div class="strike-bid"><i class="fas fa-hand-holding-usd"></i> Bid: $${option.bid}</div>
                    <div class="strike-ask"><i class="fas fa-tag"></i> Ask: $${option.ask}</div>
                    <div class="strike-volume"><i class="fas fa-chart-bar"></i> Volume: ${option.volume}</div>
                    <div class="strike-interest"><i class="fas fa-eye"></i> OI: ${option.open_interest}</div>
                </div>
            `;
        });
        optionsHTML += '</div>';

        // Display put options
        optionsHTML += '<div class="options-expiration"><i class="fas fa-arrow-down"></i> Put Options</div>';
        optionsHTML += '<div class="options-strikes">';
        optionsData.put_options.forEach(option => {
            optionsHTML += `
                <div class="strike-item put-option">
                    <div class="strike-price">$${option.strike}</div>
                    <div class="strike-bid"><i class="fas fa-hand-holding-usd"></i> Bid: $${option.bid}</div>
                    <div class="strike-ask"><i class="fas fa-tag"></i> Ask: $${option.ask}</div>
                    <div class="strike-volume"><i class="fas fa-chart-bar"></i> Volume: ${option.volume}</div>
                    <div class="strike-interest"><i class="fas fa-eye"></i> OI: ${option.open_interest}</div>
                </div>
            `;
        });
        optionsHTML += '</div>';

        optionsContainer.innerHTML = optionsHTML;
    } catch (error) {
        optionsContainer.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load options data</p>
                <small>Please try again later or check your connection</small>
            </div>
        `;
        showNotification('Failed to load options data', 'error');
    }
}

// Initialize market intelligence data when user is authenticated
function initializeMarketIntelligence() {
    // Check if user is authenticated by checking if Firebase auth user exists
    if (window.firebaseAuth && window.firebaseAuth.currentUser) {
        loadEarningsCalendar();
    }
} 
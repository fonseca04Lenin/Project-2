// Global variables
let watchlistData = [];
let currentStock = null;
let chart = null; // Add chart variable declaration
let searchTimeout = null; // Add timeout for search debouncing

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
    console.log('🚀 App initialized');
    checkAuthStatus();
    updateMarketStatus();
    
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
                const response = await fetch(`/api/search/stocks?q=${encodeURIComponent(query)}`);
                const data = await response.json();
                
                if (data.results && data.results.length > 0) {
                    displaySearchSuggestions(suggestionsContainer, data.results, inputElement);
                } else {
                    suggestionsContainer.style.display = 'none';
                }
            } catch (error) {
                console.error('Error fetching suggestions:', error);
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
                console.error('Error fetching company suggestions:', error);
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
    initializeApp();
    initializeMarketIntelligence();
});



// Search functionality
async function searchStock() {
    const query = searchInput.value.trim();
    if (!query) {
        showToast('Please enter a stock symbol or company name', 'error');
        return;
    }
    setLoadingState(true);
    try {
        // Check for suggestions
        let suggestions = [];
        if (window.mainSearchSuggestions && window.mainSearchSuggestions.length > 0) {
            suggestions = window.mainSearchSuggestions;
        } else {
            // Fetch suggestions if not already loaded
            const companyResponse = await fetch(`/api/search/companies?q=${encodeURIComponent(query)}`);
            if (companyResponse.ok) {
                const companyData = await companyResponse.json();
                if (companyData.results && companyData.results.length > 0) {
                    suggestions = companyData.results;
                }
            }
        }
        // If query is not a symbol and suggestions exist, use the first suggestion
        if (suggestions.length > 0 && !/^[A-Z]{1,5}$/.test(query.toUpperCase())) {
            searchInput.value = suggestions[0].symbol;
            document.getElementById('mainSearchSuggestions').style.display = 'none';
        } else if (suggestions.length === 0 && !/^[A-Z]{1,5}$/.test(query.toUpperCase())) {
            showToast('Stock not found', 'error');
            document.getElementById('mainSearchSuggestions').style.display = 'none';
            stockResults.style.display = 'none';
            setLoadingState(false);
            return;
        }
        // Search by symbol
        const symbol = searchInput.value.trim().toUpperCase();
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ symbol })
        });
        const data = await response.json();
        if (response.ok) {
            currentStock = data;
            displayStockResult(data);
            stockResults.style.display = 'block';
            if (data.triggeredAlerts && data.triggeredAlerts.length > 0) {
                data.triggeredAlerts.forEach(alert => {
                    const message = `Alert triggered for ${symbol}: Price ${alert.alert_type} $${alert.target_price}`;
                    showNotification(message, 'warning');
                });
                loadAlerts();
            }
        } else {
            showToast(data.error || 'Stock not found', 'error');
            stockResults.style.display = 'none';
        }
    } catch (error) {
        console.error('Error searching stock:', error);
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
            <button class="btn btn-primary" onclick="addToWatchlist('${stock.symbol}')">
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

//Watchlist functionality
async function loadWatchlist() {
    try {
        const response = await fetch('/api/watchlist');
        const data = await response.json();
        
        watchlistData = data;
        displayWatchlist(data);
    } catch (error) {
        console.error('Error loading watchlist:', error);
    }
}

function displayWatchlist(stocks) {
    if (stocks.length === 0) {
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
        const perf = stock.priceChangePercent;
        let perfClass = 'watchlist-perf-flat';
        let perfText = 'No change this month';
        if (perf > 0.01) {
            perfClass = 'watchlist-perf-up';
            perfText = `Up ${perf.toFixed(2)}% this month`;
        } else if (perf < -0.01) {
            perfClass = 'watchlist-perf-down';
            perfText = `Down ${Math.abs(perf).toFixed(2)}% this month`;
        }
        return `
        <div class="watchlist-item">
            <div class="watchlist-item-header">
                <div>
                    <h4>${stock.name}</h4>
                    <span class="watchlist-item-symbol">${stock.symbol}</span>
                </div>
                <div class="watchlist-item-price ${perfClass}">$${stock.price.toFixed(2)}</div>
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

async function addToWatchlist(symbol) {
    try {
        const response = await fetch('/api/watchlist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ symbol: symbol })
        });

        const data = await response.json();

        if (response.ok) {
            showToast(data.message, 'success');
            loadWatchlist();
        } else {
            showToast(data.error || 'Error adding to watchlist', 'error');
        }
    } catch (error) {
        console.error('Error adding to watchlist:', error);
        showToast('Error adding to watchlist', 'error');
    }
}

async function removeFromWatchlist(symbol) {
    try {
        const response = await fetch(`/api/watchlist/${symbol}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            showToast(data.message, 'success');
            loadWatchlist();
        } else {
            showToast(data.error || 'Error removing from watchlist', 'error');
        }
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        showToast('Error removing from watchlist', 'error');
    }
}

async function clearWatchlist() {
    if (watchlistData.length === 0) {
        showToast('Watchlist is already empty', 'info');
        return;
    }

    if (confirm('Are you sure you want to clear your entire watchlist?')) {
        try {
            // Remove each stock individually
            for (const stock of watchlistData) {
                await removeFromWatchlist(stock.symbol);
            }
            showToast('Watchlist cleared successfully', 'success');
        } catch (error) {
            console.error('Error clearing watchlist:', error);
            showToast('Error clearing watchlist', 'error');
        }
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
    console.log('🔍 viewChart called with symbol:', symbol);
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

        console.log('📡 Fetching chart data for:', symbol);
        const response = await fetch(`/api/chart/${symbol}`);
        const data = await response.json();
        console.log('📊 Chart data received:', data);

        if (response.ok) {
            console.log('✅ Chart data is valid, displaying chart...');
            displayChart(data, symbol);
            console.log('📈 Chart displayed, showing chart section...');
            
            // Debug chart section visibility
            console.log('🔍 Chart section element:', chartSection);
            console.log('🔍 Chart section current display:', chartSection.style.display);
            console.log('🔍 Chart section computed style:', window.getComputedStyle(chartSection).display);
            
            chartSection.style.display = 'block';
            console.log('✅ Chart section display set to block');
            console.log('🔍 Chart section new display:', chartSection.style.display);
            console.log('🔍 Chart section computed style after:', window.getComputedStyle(chartSection).display);
            
            // Force the chart section to be visible and scroll to it
            chartSection.style.visibility = 'visible';
            chartSection.style.opacity = '1';
            chartSection.style.position = 'relative';
            chartSection.style.zIndex = '10';
            
            // Scroll to the chart section
            chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Check if canvas exists
            const canvas = document.getElementById('stockChart');
            console.log('🔍 Canvas element:', canvas);
            if (canvas) {
                console.log('🔍 Canvas dimensions:', canvas.width, 'x', canvas.height);
                console.log('🔍 Canvas style dimensions:', canvas.style.width, 'x', canvas.style.height);
            }
            
            console.log('✅ Chart section should now be visible');
        } else {
            console.error('❌ Chart data error:', data.error);
            showToast(data.error || 'Error loading chart data', 'error');
        }
    } catch (error) {
        console.error('❌ Error in viewChart:', error);
        showToast('Error loading chart data', 'error');
    }
}

function displayChart(chartData, symbol) {
    console.log('🎨 displayChart called with:', { chartData, symbol });
    
    const ctx = document.getElementById('stockChart').getContext('2d');
    console.log('🔍 Canvas context:', ctx);
    
    // Destroy existing chart if it exists
    if (chart) {
        console.log('🗑️ Destroying existing chart');
        chart.destroy();
    }

    const labels = chartData.map(item => item.date);
    const prices = chartData.map(item => item.price);
    console.log('📊 Chart data processed:', { labels, prices });

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
        console.log('✅ Chart created successfully:', chart);
    } catch (error) {
        console.error('❌ Error creating chart:', error);
    }
}

// Market status
async function updateMarketStatus() {
    try {
        const response = await fetch('/api/market-status');
        const data = await response.json();

        // Find the market status element
        const marketStatusElement = document.querySelector('.market-status');
        if (!marketStatusElement) {
            console.warn('⚠️ Market status element not found');
            return;
        }

        const statusElement = marketStatusElement.querySelector('.status-text');
        if (statusElement) {
            statusElement.textContent = data.status;
        }

        // Update styling based on market status
        marketStatusElement.className = `market-status ${data.isOpen ? 'open' : 'closed'}`;
    } catch (error) {
        console.error('Error updating market status:', error);
    }
}

// News functionality
async function loadMarketNews() {
    try {
        const response = await fetch('/api/news/market');
        const data = await response.json();
        
        if (response.ok) {
            displayNews(data);
        } else {
            displayNewsError();
        }
    } catch (error) {
        console.error('Error loading news:', error);
        displayNewsError();
    }
}

function displayNews(newsItems) {
    if (!newsContainer) {
        console.warn('⚠️ newsContainer not found');
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
        console.warn('⚠️ newsContainer not found');
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
        console.warn('⚠️ toastContainer not found, using console.log instead');
        console.log(`[${type.toUpperCase()}] ${message}`);
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
        console.error('Error showing toast:', error);
        console.log(`[${type.toUpperCase()}] ${message}`);
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
    try {
        const response = await fetch('/api/alerts');
        const alerts = await response.json();
        displayAlerts(alerts);
    } catch (error) {
        console.error('Error loading alerts:', error);
        showNotification('Error loading alerts', 'error');
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
        showNotification('Please enter both symbol and price', 'error');
        return;
    }

    try {
        const response = await fetch('/api/alerts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                symbol,
                target_price: price,
                alert_type: type
            })
        });

        if (response.ok) {
            showNotification('Alert created successfully', 'success');
            document.getElementById('alert-symbol').value = '';
            document.getElementById('alert-price').value = '';
            loadAlerts();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Error creating alert', 'error');
        }
    } catch (error) {
        console.error('Error creating alert:', error);
        showNotification('Error creating alert', 'error');
    }
}

async function deleteAlert(symbol, index) {
    try {
        const response = await fetch(`/api/alerts/${symbol}/${index}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification('Alert deleted successfully', 'success');
            loadAlerts();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Error deleting alert', 'error');
        }
    } catch (error) {
        console.error('Error deleting alert:', error);
        showNotification('Error deleting alert', 'error');
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
        console.warn(' notificationContainer not found, using console.log instead');
        console.log(`[${type.toUpperCase()}] ${message}`);
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
        console.error('Error showing notification:', error);
        console.log(`[${type.toUpperCase()}] ${message}`);
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

// Auth Functions
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/user');
        if (response.ok) {
            const data = await response.json();
            showMainContent(data.user);
        } else {
            showAuthForms();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        showAuthForms();
    }
}

function showMainContent(user) {
    console.log('🎯 showMainContent called with user:', user);
    
    // Check if elements exist
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const usernameDisplay = document.getElementById('username-display');
    
    if (!authContainer || !mainContent || !usernameDisplay) {
        console.error('❌ Required elements not found:', {
            authContainer: !!authContainer,
            mainContent: !!mainContent,
            usernameDisplay: !!usernameDisplay
        });
        return;
    }
    
    // Hide auth container
    authContainer.style.display = 'none';
    console.log('✅ Auth container hidden');
    
    // Show main content
    mainContent.style.display = 'block';
    console.log('✅ Main content shown');
    
    // Update username display
    usernameDisplay.textContent = `Welcome, ${user.username}!`;
    console.log('✅ Username updated:', user.username);
    
    // Load fresh data
    loadWatchlist();
    loadAlerts();
    updateMarketStatus();
    loadMarketNews();
    console.log('✅ Main content should now be visible');
}

function showAuthForms() {
    console.log('🎯 showAuthForms called');
    
    // Check if elements exist
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    
    if (!authContainer || !mainContent) {
        console.error('❌ Required elements not found:', {
            authContainer: !!authContainer,
            mainContent: !!mainContent
        });
        return;
    }
    
    // Show auth container
    authContainer.style.display = 'block';
    console.log('✅ Auth container shown');
    
    // Hide main content
    mainContent.style.display = 'none';
    console.log('✅ Main content hidden');
    
    // Reset to login form
    toggleAuthForm('login');
    console.log('✅ Auth forms should now be visible');
}

function toggleAuthForm(form) {
    document.getElementById('login-form').style.display = form === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = form === 'register' ? 'block' : 'none';
}

async function handleLogin(event) {
    event.preventDefault();
    console.log('🔐 Login attempt started');
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        console.log('🔐 Login response:', response.status, data);
        
        if (response.ok) {
            showNotification('Login successful', 'success');
            // Clear login form
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
            // Force UI update
            console.log('🔄 Switching to main content...');
            showMainContent(data.user);
            // Clear any cached data
            watchlistData = [];
            currentStock = null;
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error during login:', error);
        showNotification('Error during login', 'error');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    console.log('📝 Register attempt started');
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        console.log('📝 Register response:', response.status, data);
        
        if (response.ok) {
            showNotification('Registration successful', 'success');
            // Clear register form
            document.getElementById('register-username').value = '';
            document.getElementById('register-email').value = '';
            document.getElementById('register-password').value = '';
            // Force UI update
            console.log('🔄 Switching to main content...');
            showMainContent(data.user);
            // Clear any cached data
            watchlistData = [];
            currentStock = null;
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error during registration:', error);
        showNotification('Error during registration', 'error');
    }
}

async function handleLogout() {
    console.log('🚪 Logout attempt started');
    try {
        const response = await fetch('/api/auth/logout');
        console.log('🚪 Logout response:', response.status);
        
        // Always treat logout as successful to clear frontend state
        showNotification('Logout successful', 'success');
        
        // Clear all user data and forms
        watchlistData = [];
        currentStock = null;
        
        // Force UI update
        console.log('🔄 Switching to auth forms...');
        showAuthForms();
        
        // Clear any cached data
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('register-username').value = '';
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
        
        console.log('✅ Logout completed, UI should be reset');
        
    } catch (error) {
        console.error('Error during logout:', error);
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
        const response = await fetch(`/api/company/${symbol}`);
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
        const chartResp = await fetch(`/api/chart/${symbol}`);
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
        const newsRes = await fetch(`/api/news/company/${symbol}`);
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
    // Show modal
    document.getElementById('stockDetailsModal').style.display = 'flex';
    // Fetch and display details
    loadStockDetails(symbol);
}

function closeStockDetailsModal() {
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
        const response = await fetch('/api/market/earnings');
        
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
        console.error('Error loading earnings:', error);
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
        const response = await fetch(`/api/market/insider-trading/${symbol}`);
        
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
        console.error('Error loading insider trading:', error);
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
        const response = await fetch(`/api/market/analyst-ratings/${symbol}`);
        
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
        console.error('Error loading analyst ratings:', error);
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
        const response = await fetch(`/api/market/options/${symbol}`);
        
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
        console.error('Error loading options data:', error);
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
    if (isAuthenticated) {
        loadEarningsCalendar();
    }
} 
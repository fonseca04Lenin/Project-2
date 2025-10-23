/**
 * Vanilla JavaScript Search Bar
 * Exact same functionality as the original, but with updated styling
 */

console.log('🚀 Vanilla Search Bar script starting to load...');

// Popular stocks database for instant suggestions
const VANILLA_POPULAR_STOCKS = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'META', name: 'Meta Platforms Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    { symbol: 'NFLX', name: 'Netflix Inc.' },
    { symbol: 'AMD', name: 'Advanced Micro Devices Inc.' },
    { symbol: 'CRM', name: 'Salesforce Inc.' }
];

// Wake up backend function
async function wakeUpBackend() {
    try {
        await fetch(`${window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app'}/api/health`, {
            method: 'GET',
            credentials: 'include',
            signal: AbortSignal.timeout(3000)
        });
        console.log('Backend wake up successful');
    } catch (error) {
        console.log('Backend wake up failed:', error);
    }
}

// Set loading state function
function setLoadingState(isLoading) {
    const searchBtn = document.getElementById('vanillaSearchBtn');
    const btnText = searchBtn.querySelector('.btn-text');
    const btnLoading = searchBtn.querySelector('.btn-loading');
    
    if (isLoading) {
        searchBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-block';
    } else {
        searchBtn.disabled = false;
        btnText.style.display = 'inline-block';
        btnLoading.style.display = 'none';
    }
}

// Main search function - exact same as original
async function searchStock() {
    const searchInput = document.getElementById('vanillaSearchInput');
    const query = searchInput.value.trim();
    
    if (!query) {
        if (window.showToast) {
            window.showToast('Please enter a stock symbol or company name', 'error');
        }
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
        const directMatch = VANILLA_POPULAR_STOCKS.find(stock => stock.symbol === symbol);
        if (directMatch) {
            symbol = directMatch.symbol;
        } else {
            // Search by company name (partial matching)
            const nameMatch = VANILLA_POPULAR_STOCKS.find(stock => 
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
            const companyResponse = await fetch(`${window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app'}/api/search/companies?q=${encodeURIComponent(query)}`, {
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
        const response = await fetch(`${window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app'}/api/search`, {
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
            if (window.displayStockResult) {
                window.displayStockResult(data);
            }
            
            if (data.triggeredAlerts && data.triggeredAlerts.length > 0) {
                data.triggeredAlerts.forEach(alert => {
                    const message = `Alert triggered for ${symbol}: Price ${alert.alert_type} $${alert.target_price}`;
                    if (window.showNotification) {
                        window.showNotification(message, 'warning');
                    }
                });
            }
        } else {
            throw new Error(`Search failed: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Search error:', error);
        if (window.showToast) {
            window.showToast('Search failed. Please try again.', 'error');
        }
    } finally {
        setLoadingState(false);
    }
}

// Setup search suggestions
function setupSearchSuggestions() {
    const searchInput = document.getElementById('vanillaSearchInput');
    if (!searchInput) return;
    
    // Add search suggestions container
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'search-suggestions main-search-suggestions';
    suggestionsContainer.style.display = 'none';
    searchInput.parentNode.appendChild(suggestionsContainer);
    
    let searchTimeout;
    
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
        
        // Debounce search
        searchTimeout = setTimeout(async () => {
            try {
                const response = await fetch(`${window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app'}/api/search/companies?q=${encodeURIComponent(query)}`);
                const data = await response.json();
                
                if (data.results && data.results.length > 0) {
                    displaySearchSuggestions(suggestionsContainer, data.results, searchInput);
                } else {
                    suggestionsContainer.style.display = 'none';
                }
            } catch (error) {
                suggestionsContainer.style.display = 'none';
            }
        }, 300);
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.style.display = 'none';
        }
    });
}

// Display search suggestions
function displaySearchSuggestions(container, suggestions, inputElement) {
    container.innerHTML = '';
    
    suggestions.slice(0, 5).forEach(suggestion => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'suggestion-item';
        suggestionItem.innerHTML = `
            <div class="suggestion-symbol">${suggestion.symbol}</div>
            <div class="suggestion-name">${suggestion.name}</div>
        `;
        
        suggestionItem.addEventListener('click', function() {
            inputElement.value = suggestion.symbol;
            container.style.display = 'none';
            searchStock(); // Trigger search immediately
        });
        
        container.appendChild(suggestionItem);
    });
    
    container.style.display = 'block';
}

// Initialize vanilla search bar
function initializeVanillaSearchBar() {
    console.log('🔍 Initializing Vanilla Search Bar...');
    
    const searchSection = document.querySelector('.search-section');
    if (!searchSection) {
        console.error('❌ Search section not found');
        return false;
    }
    
    // Create the search bar HTML
    searchSection.innerHTML = `
        <div class="search-container">
            <div class="search-box">
                <i class="fas fa-search search-icon"></i>
                <input type="text" id="vanillaSearchInput" placeholder="Search stocks... (e.g., AAPL, Tesla, Microsoft)" class="search-input">
                <button id="vanillaSearchBtn" class="search-btn">
                    <span class="btn-text">Search</span>
                    <i class="fas fa-spinner fa-spin btn-loading" style="display: none;"></i>
                </button>
            </div>
        </div>
    `;
    
    // Set up event listeners
    const searchInput = document.getElementById('vanillaSearchInput');
    const searchBtn = document.getElementById('vanillaSearchBtn');
    
    if (searchBtn) {
        searchBtn.addEventListener('click', searchStock);
    }
    
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchStock();
            }
        });
        
        // Set up search suggestions
        setupSearchSuggestions();
    }
    
    console.log('✅ Vanilla Search Bar initialized successfully');
    return true;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeVanillaSearchBar);
} else {
    initializeVanillaSearchBar();
}

console.log('✅ Vanilla Search Bar script loaded');

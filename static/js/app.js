let currentStock = null;
let watchlistData = [];
let chart = null;

// DOM elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const stockResults = document.getElementById('stockResults');
const stockCard = document.getElementById('stockCard');
const watchlistContainer = document.getElementById('watchlistContainer');
const emptyWatchlist = document.getElementById('emptyWatchlist');
const clearWatchlistBtn = document.getElementById('clearWatchlistBtn');
const chartSection = document.getElementById('chartSection');
const marketStatus = document.getElementById('marketStatus');
const toastContainer = document.getElementById('toastContainer');
const newsContainer = document.getElementById('newsContainer');
const refreshNewsBtn = document.getElementById('refreshNewsBtn');

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    loadWatchlist();
    updateMarketStatus();
    loadMarketNews();
    
    // Update market status every minute
    setInterval(updateMarketStatus, 60000);
    
    // Update watchlist every 30 seconds
    setInterval(loadWatchlist, 30000);
    
    // Update news every 5 minutes
    setInterval(loadMarketNews, 300000);
});

searchBtn.addEventListener('click', searchStock);
searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchStock();
    }
});

clearWatchlistBtn.addEventListener('click', clearWatchlist);
refreshNewsBtn.addEventListener('click', loadMarketNews);

// Search functionality
async function searchStock() {
    const symbol = searchInput.value.trim().toUpperCase();
    
    if (!symbol) {
        showToast('Please enter a stock symbol', 'error');
        return;
    }

    setLoadingState(true);

    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ symbol: symbol })
        });

        const data = await response.json();

        if (response.ok) {
            currentStock = data;
            displayStockResult(data);
            stockResults.style.display = 'block';
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

    const watchlistHTML = stocks.map(stock => `
        <div class="watchlist-item">
            <div class="watchlist-item-header">
                <div>
                    <h4>${stock.name}</h4>
                    <span class="watchlist-item-symbol">${stock.symbol}</span>
                </div>
                <div class="watchlist-item-price">$${stock.price.toFixed(2)}</div>
            </div>
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
    `).join('');

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

// Chart functionality
async function viewChart(symbol) {
    try {
        const response = await fetch(`/api/chart/${symbol}`);
        const data = await response.json();

        if (response.ok) {
            displayChart(data, symbol);
            chartSection.style.display = 'block';
        } else {
            showToast(data.error || 'Error loading chart data', 'error');
        }
    } catch (error) {
        console.error('Error loading chart:', error);
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
}

// Market status
async function updateMarketStatus() {
    try {
        const response = await fetch('/api/market-status');
        const data = await response.json();

        const statusElement = marketStatus.querySelector('.status-text');
        statusElement.textContent = data.status;

        // Update styling based on market status
        marketStatus.className = `market-status ${data.isOpen ? 'open' : 'closed'}`;
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
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-${getToastIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;

    toastContainer.appendChild(toast);

    //suto remove after 4 seconds
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
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'info': return 'info-circle';
        default: return 'info-circle';
    }
} 
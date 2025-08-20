// Configuration file for Stock Watchlist Pro Frontend
// Update this URL to point to your Render backend

const CONFIG = {
    // Backend API base URL - UPDATE THIS WITH YOUR RENDER BACKEND URL
    API_BASE_URL: 'https://stock-watchlist-77bq.onrender.com',
    
    // App settings
    APP_NAME: 'Stock Watchlist Pro',
    VERSION: '1.0.0'
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}

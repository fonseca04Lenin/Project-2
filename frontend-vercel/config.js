// Configuration file for Stock Watchlist Pro Frontend
// Backend now deployed on Heroku

const CONFIG = {
    // Backend API base URL - Updated to use Heroku backend
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

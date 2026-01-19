// Configuration file for AI Stock Sage Frontend
// Backend now deployed on Railway

const CONFIG = {
    // Backend API base URL - Railway deployment
    API_BASE_URL: 'https://web-production-2e2e.up.railway.app',

    // App settings
    APP_NAME: 'AI Stock Sage',
    VERSION: '1.0.0'
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}

// Configuration file for AI Stock Sage Frontend
// Backend now deployed on Railway

const _isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const CONFIG = {
    API_BASE_URL: _isLocal ? 'http://localhost:5000' : 'https://web-production-2e2e.up.railway.app',

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

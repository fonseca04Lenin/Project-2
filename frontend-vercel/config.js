// Configuration file for Stock Watchlist Pro Frontend
// Supports both production and testing environments

const CONFIG = {
    // Environment configurations
    environments: {
        production: {
            API_BASE_URL: 'https://stock-watchlist-backend-8bea295dd646.herokuapp.com',
            FIREBASE_CONFIG: 'firebase-config.js',
            NAME: 'Production'
        },
        testing: {
            API_BASE_URL: 'https://stock-watchlist-backend-test.herokuapp.com',
            FIREBASE_CONFIG: 'firebase-config-test.js',
            NAME: 'Testing'
        }
    },

    // App settings
    APP_NAME: 'Stock Watchlist Pro',
    VERSION: '2.3.0-test'
};

// Environment detection
function detectEnvironment() {
    const hostname = window.location.hostname;
    const searchParams = new URLSearchParams(window.location.search);

    // Check for test indicators
    if (hostname.includes('test') ||
        hostname.includes('localhost') ||
        searchParams.get('env') === 'test' ||
        searchParams.get('testing') === 'true' ||
        window.location.port === '3000') {  // Common dev port
        return 'testing';
    }

    return 'production';
}

// Get current environment configuration
function getCurrentEnvironment() {
    const env = detectEnvironment();
    const envConfig = CONFIG.environments[env];

    console.log(`🌍 Environment: ${envConfig.NAME} (${env})`);
    console.log(`🔗 API Base URL: ${envConfig.API_BASE_URL}`);
    console.log(`🔥 Firebase Config: ${envConfig.FIREBASE_CONFIG}`);

    return {
        ...envConfig,
        key: env,
        VERSION: CONFIG.VERSION,
        APP_NAME: CONFIG.APP_NAME
    };
}

// Set up current configuration
const currentConfig = getCurrentEnvironment();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = currentConfig;
} else {
    window.CONFIG = currentConfig;
    window.API_BASE_URL = currentConfig.API_BASE_URL;
}

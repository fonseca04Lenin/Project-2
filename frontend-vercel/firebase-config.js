// Firebase configuration for Stock Watchlist Pro
// You need to replace these with your actual Firebase project config

const firebaseConfig = {
    apiKey: "AIzaSyCB_8dEiQH0AxqUq7qXneOWOdXeJw-GFOQ",
    authDomain: "stock-watcher-bbb20.firebaseapp.com",
    projectId: "stock-watcher-bbb20",
    storageBucket: "stock-watcher-bbb20.firebasestorage.app",
    messagingSenderId: "745996753351",
    appId: "1:745996753351:web:c4506624bb8dc058ffe1e2",
    measurementId: "G-MSV396NJ1V"
};

// Initialize Firebase
let app, auth;

try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
    // Fallback mode - will use backend authentication
    auth = null;
}

// Export for use in other scripts
window.firebaseAuth = auth;
window.firebaseApp = app;

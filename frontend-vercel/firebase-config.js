// Firebase configuration for Stock Watchlist Pro
// This file is now secondary - main initialization is in index.html

// Fallback configuration in case module loading fails
const firebaseConfig = {
    apiKey: "AIzaSyCB_8dEiQH0AxqUq7qXneOWOdXeJw-GFOQ",
    authDomain: "stock-watcher-bbb20.firebaseapp.com",
    projectId: "stock-watcher-bbb20",
    storageBucket: "stock-watcher-bbb20.firebasestorage.app",
    messagingSenderId: "745996753351",
    appId: "1:745996753351:web:c4506624bb8dc058ffe1e2",
    measurementId: "G-MSV396NJ1V"
};

// Fallback initialization (only if module loading fails)
if (!window.firebaseAuth) {
    console.log('🔄 Firebase module loading failed, using fallback...');

    // Load Firebase v9 compat for fallback
    if (!document.querySelector('script[src*="firebase-app"]')) {
        const script1 = document.createElement('script');
        script1.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
        document.head.appendChild(script1);

        const script2 = document.createElement('script');
        script2.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js';
        document.head.appendChild(script2);

        script2.onload = () => {
            try {
                const app = firebase.initializeApp(firebaseConfig);
                const auth = firebase.auth();
                window.firebaseAuth = auth;
                window.firebaseApp = app;
                console.log('✅ Firebase fallback initialized successfully');
            } catch (error) {
                console.error('❌ Firebase fallback initialization error:', error);
                window.firebaseAuth = null;
                window.firebaseApp = null;
            }
        };
    }
} else {
    console.log('✅ Firebase v10 already initialized');
}

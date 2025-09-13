// Firebase configuration for Stock Watchlist Pro
// Using Firebase v9 with compatibility mode for maximum reliability

const firebaseConfig = {
    apiKey: "AIzaSyCB_8dEiQH0AxqUq7qXneOWOdXeJw-GFOQ",
    authDomain: "stock-watcher-bbb20.firebaseapp.com",
    projectId: "stock-watcher-bbb20",
    storageBucket: "stock-watcher-bbb20.firebasestorage.app",
    messagingSenderId: "745996753351",
    appId: "1:745996753351:web:c4506624bb8dc058ffe1e2",
    measurementId: "G-MSV396NJ1V"
};

// Initialize Firebase with error handling
try {

    // Initialize Firebase App
    const app = firebase.initializeApp(firebaseConfig);

    // Initialize Firebase Auth
    const auth = firebase.auth();

    // Set persistence to browser local storage for better reliability
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            // Persistence set successfully
        })
        .catch((error) => {
            // Could not set persistence
        });

    // Enhanced auth state listener
    auth.onAuthStateChanged((user) => {
        if (user) {
            // User signed in
        } else {
            // User signed out
        }
    }, (error) => {
        // Auth state error
    });

    // Make auth globally available
    window.firebaseAuth = auth;
    window.firebaseApp = app;


} catch (error) {

    // Fallback: Set null values to prevent undefined errors
    window.firebaseAuth = null;
    window.firebaseApp = null;

    // Show user-friendly error (only if showNotification function is available)
    setTimeout(() => {
        if (document.readyState === 'complete' && typeof showNotification === 'function') {
            showNotification('Firebase authentication unavailable. Please refresh the page.', 'error');
        }
    }, 1000);
}

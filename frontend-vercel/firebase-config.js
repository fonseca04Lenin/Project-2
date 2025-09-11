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
    console.log('🔥 Initializing Firebase v9...');

    // Initialize Firebase App
    const app = firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase App initialized');

    // Initialize Firebase Auth
    const auth = firebase.auth();
    console.log('✅ Firebase Auth initialized');

    // Set persistence to browser local storage for better reliability
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            console.log('✅ Firebase persistence set to LOCAL');
        })
        .catch((error) => {
            console.warn('⚠️ Could not set persistence:', error);
        });

    // Enhanced auth state listener
    auth.onAuthStateChanged((user) => {
        if (user) {
            console.log('🔥 Firebase user signed in:', user.uid);
            console.log('📧 User email:', user.email);
            console.log('🏷️ User display name:', user.displayName);
        } else {
            console.log('🔥 Firebase user signed out');
        }
    }, (error) => {
        console.error('❌ Firebase auth state error:', error);
    });

    // Make auth globally available
    window.firebaseAuth = auth;
    window.firebaseApp = app;

    console.log('✅ Firebase v9 with compat mode initialized successfully');

} catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    console.error('❌ Error details:', error.message);

    // Fallback: Set null values to prevent undefined errors
    window.firebaseAuth = null;
    window.firebaseApp = null;

    // Show user-friendly error (only if showNotification function is available)
    setTimeout(() => {
        if (document.readyState === 'complete' && typeof showNotification === 'function') {
            showNotification('Firebase authentication unavailable. Please refresh the page.', 'error');
        } else {
            console.error('Firebase authentication unavailable. Please refresh the page.');
        }
    }, 1000);
}

// Firebase configuration for Stock Watchlist Pro
// You need to replace these with your actual Firebase project config

const firebaseConfig = {
    // TODO: Replace with your actual Firebase project configuration
    // Get this from Firebase Console > Project Settings > General > Your apps
    apiKey: "your-api-key-here",
    authDomain: "your-project-id.firebaseapp.com", 
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
    
    // ⚠️ IMPORTANT: You need to replace these values with your actual Firebase config!
    // Instructions:
    // 1. Go to Firebase Console > Project Settings
    // 2. Scroll to "Your apps" section  
    // 3. Click "Add app" > Web (if not done already)
    // 4. Copy the config object and replace the values above
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

// Firebase configuration for TESTING environment
// This file is for testing - separate from production

const firebaseTestConfig = {
    apiKey: "test-api-key",
    authDomain: "test-stock-watcher.firebaseapp.com",
    projectId: "test-stock-watcher",
    storageBucket: "test-stock-watcher.firebasestorage.app",
    messagingSenderId: "test-messaging-sender-id",
    appId: "test-app-id",
    measurementId: "G-TEST-MEASUREMENT-ID"
};

// Initialize Firebase for testing
let testApp, testAuth;

try {
    testApp = firebase.initializeApp(firebaseTestConfig, 'test');
    testAuth = firebase.auth(testApp);
    console.log('🧪 Firebase TEST initialized successfully');

    // Set persistence for testing
    testAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            console.log('✅ Test Firebase persistence set to LOCAL');
        })
        .catch((error) => {
            console.warn('⚠️ Could not set test persistence:', error);
        });

    // Test auth state listener
    testAuth.onAuthStateChanged((user) => {
        if (user) {
            console.log('🧪 Test Firebase user signed in:', user.uid);
        } else {
            console.log('🧪 Test Firebase user signed out');
        }
    });

} catch (error) {
    console.error('❌ Test Firebase initialization failed:', error);
    testAuth = null;
    testApp = null;
}

// Export for use in test environment
window.testFirebaseAuth = testAuth;
window.testFirebaseApp = testApp;

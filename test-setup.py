#!/usr/bin/env python3
"""
Test Environment Setup Script for Stock Watchlist Pro

This script helps set up a complete testing environment including:
- Test Firebase project configuration
- Test database setup
- Test API keys configuration
- Environment variables setup
"""

import os
import sys
import json
from pathlib import Path

def create_test_firebase_config():
    """Create test Firebase configuration"""
    test_config = {
        "type": "service_account",
        "project_id": "test-stock-watcher",
        "private_key_id": "test-key-id",
        "private_key": "-----BEGIN PRIVATE KEY-----\ntest-private-key\n-----END PRIVATE KEY-----\n",
        "client_email": "firebase-adminsdk@test-stock-watcher.iam.gserviceaccount.com",
        "client_id": "test-client-id",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk%40test-stock-watcher.iam.gserviceaccount.com"
    }

    with open('firebase-credentials-test.json', 'w') as f:
        json.dump(test_config, f, indent=2)

    print("✅ Created test Firebase credentials: firebase-credentials-test.json")

def create_test_env_file():
    """Create test environment file"""
    env_content = """# Test Environment Configuration
FLASK_ENV=testing
SECRET_KEY=test-secret-key-12345

# Test Firebase Configuration
TEST_FIREBASE_PROJECT_ID=test-stock-watcher
TEST_FIREBASE_API_KEY=test-api-key
TEST_FIREBASE_AUTH_DOMAIN=test-stock-watcher.firebaseapp.com

# Test API Keys
TEST_NEWS_API_KEY=test-news-api-key
TEST_FINNHUB_API_KEY=test-finnhub-api-key

# Test Database (SQLite for simplicity)
TEST_DATABASE_URL=sqlite:///test_stock_watcher.db

# Test Redis (memory for testing)
REDIS_URL=memory://

# Test Settings
DEBUG=true
PORT=5001
"""

    with open('test-config.env', 'w') as f:
        f.write(env_content)

    print("✅ Created test environment file: test-config.env")

def update_frontend_test_config():
    """Update frontend test configuration with actual test values"""
    test_config = """// Firebase configuration for TESTING environment
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
"""

    frontend_test_config = Path('frontend-vercel/firebase-config-test.js')
    with open(frontend_test_config, 'w') as f:
        f.write(test_config)

    print("✅ Updated frontend test Firebase config")

def create_heroku_test_app():
    """Instructions for creating Heroku test app"""
    print("\n📋 Heroku Test App Setup Instructions:")
    print("1. Create a new Heroku app: https://dashboard.heroku.com/new-app")
    print("2. Name it: stock-watchlist-backend-test")
    print("3. Connect it to your GitHub repository")
    print("4. Enable automatic deploys from the 'testing' branch")
    print("5. Set environment variables from test-config.env")
    print("\n🔧 Required Heroku Environment Variables:")
    print("- HEROKU_APP_NAME=stock-watchlist-backend-test")
    print("- FLASK_ENV=testing")
    print("- SECRET_KEY=test-secret-key-12345")
    print("- TEST_FIREBASE_PROJECT_ID=test-stock-watcher")
    print("- TEST_NEWS_API_KEY=test-news-api-key")
    print("- TEST_FINNHUB_API_KEY=test-finnhub-api-key")

def create_vercel_test_deployment():
    """Instructions for creating Vercel test deployment"""
    print("\n🌐 Vercel Test Deployment Instructions:")
    print("1. Go to Vercel dashboard: https://vercel.com/dashboard")
    print("2. Import your GitHub repository")
    print("3. Create a new deployment from the 'testing' branch")
    print("4. Set build command: npm run build")
    print("5. Add environment variable: VERCEL_ENV=test")

def print_test_urls():
    """Print test environment URLs"""
    print("\n🔗 Test Environment URLs:")
    print("Backend: https://stock-watchlist-backend-test.herokuapp.com")
    print("Frontend: https://stock-watchlist-frontend-test.vercel.app")
    print("\nTo test locally:")
    print("Frontend: http://localhost:3000?testing=true")
    print("Backend: http://localhost:5001")

def main():
    """Main setup function"""
    print("🧪 Setting up Stock Watchlist Pro Testing Environment")
    print("=" * 60)

    try:
        # Create test configurations
        create_test_firebase_config()
        create_test_env_file()
        update_frontend_test_config()

        # Print setup instructions
        create_heroku_test_app()
        create_vercel_test_deployment()
        print_test_urls()

        print("\n✅ Test environment setup complete!")
        print("\n🚀 Next steps:")
        print("1. Commit and push the testing branch")
        print("2. Create Heroku test app")
        print("3. Create Vercel test deployment")
        print("4. Test the CORS and Firebase fixes")

    except Exception as e:
        print(f"❌ Setup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

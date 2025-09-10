# 🧪 Stock Watchlist Pro - Testing Environment

This document provides complete instructions for setting up and using the testing environment for Stock Watchlist Pro.

## 📋 Overview

The testing environment allows you to:
- ✅ Test the latest CORS and Firebase fixes
- ✅ Experiment with new features without affecting production
- ✅ Debug issues in isolation
- ✅ Validate API integrations safely

## 🌍 Environment Architecture

```
Production Environment          Testing Environment
├── Frontend: Vercel            ├── Frontend: Vercel (test deployment)
├── Backend: Heroku             ├── Backend: Heroku (test app)
├── Firebase: Production        ├── Firebase: Test project
├── Database: Production        └── Database: Test database
└── APIs: Production keys       └── APIs: Test/sandbox keys
```

## 🚀 Quick Setup

### 1. Run Test Setup Script
```bash
python3 test-setup.py
```
This creates all necessary test configurations automatically.

### 2. Create Heroku Test App
1. Go to [Heroku Dashboard](https://dashboard.heroku.com/new-app)
2. Create app named: `stock-watchlist-backend-test`
3. Connect to your GitHub repository
4. Enable auto-deploy from `testing` branch
5. Set environment variables from `test-config.env`

### 3. Create Vercel Test Deployment
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Import your GitHub repository
3. Create deployment from `testing` branch
4. Add environment variable: `VERCEL_ENV=test`

## 🔧 Environment Variables

### Backend (Heroku) Variables:
```bash
HEROKU_APP_NAME=stock-watchlist-backend-test
FLASK_ENV=testing
SECRET_KEY=test-secret-key-12345
TEST_FIREBASE_PROJECT_ID=test-stock-watcher
TEST_NEWS_API_KEY=test-news-api-key
TEST_FINNHUB_API_KEY=test-finnhub-api-key
```

### Frontend (Vercel) Variables:
```bash
VERCEL_ENV=test
```

## 🔗 Test URLs

### Production:
- Frontend: https://stock-watchlist-frontend.vercel.app
- Backend: https://stock-watchlist-backend-8bea295dd646.herokuapp.com

### Testing:
- Frontend: https://stock-watchlist-frontend-test.vercel.app
- Backend: https://stock-watchlist-backend-test.herokuapp.com

### Local Development:
- Frontend: http://localhost:3000?testing=true
- Backend: http://localhost:5001

## 🧪 Testing Features

### Environment Detection
The app automatically detects the environment based on:
- URL hostname containing "test"
- Query parameter `?testing=true`
- Port 3000 (development)
- Environment variables

### Test Data Isolation
- Separate Firebase project for test users
- Isolated database for test data
- Test API keys (won't consume production quotas)

### Enhanced Logging
Test environment includes detailed logging:
```
🧪 TESTING ENVIRONMENT DETECTED
🔧 Test Firebase Project: test-stock-watcher
🧪 Test Firebase user signed in: vRmBgLyGo5Z3K3r8xnyou5LSELh2
```

## 🐛 Debugging Tools

### Console Logging
Test environment provides extensive logging for:
- Environment detection
- Firebase initialization
- API calls and responses
- Authentication flow
- CORS headers

### Error Handling
- Detailed error messages in test mode
- Fallback mechanisms for failed operations
- Clear indication of test vs production data

## ✅ Testing Checklist

### Firebase & Authentication
- [ ] Login works without "signInWithEmailAndPassword is not a function"
- [ ] Token generation successful
- [ ] User sessions persist correctly

### CORS & API Calls
- [ ] Watchlist loads without CORS errors
- [ ] Adding stocks works (no "X-User-ID not allowed")
- [ ] Alerts load successfully
- [ ] News feed displays properly

### Environment Switching
- [ ] Production and test environments are separate
- [ ] Test data doesn't affect production
- [ ] Environment detection works correctly

## 🔄 Switching Between Environments

### To Test Environment:
```javascript
// URL parameter
https://your-frontend-url.vercel.app?testing=true

// Or use test deployment
https://stock-watchlist-frontend-test.vercel.app
```

### To Production Environment:
```javascript
// Remove testing parameter
https://stock-watchlist-frontend.vercel.app
```

## 🛠 Troubleshooting

### Common Issues:

#### 1. "Firebase not initialized"
- Check if test Firebase config is loaded
- Verify environment detection is working
- Check console for Firebase initialization logs

#### 2. "CORS errors still occur"
- Verify Heroku test app has correct environment variables
- Check if CORS fix was deployed
- Confirm test backend URL is being used

#### 3. "Environment not detected"
- Check URL parameters
- Verify hostname detection
- Check console for environment logs

### Debug Commands:
```javascript
// Check current configuration
console.log(window.CONFIG);

// Check Firebase status
console.log(window.firebaseAuth);
console.log(window.firebaseApp);

// Check API endpoint
console.log(window.API_BASE_URL);
```

## 📊 Test Results

After setup, test these scenarios:

### ✅ Expected Success Cases:
1. **Login Flow**: Firebase v9 should initialize without errors
2. **API Calls**: CORS should allow X-User-ID header
3. **Watchlist**: Should load and allow adding stocks
4. **Alerts**: Should work without authentication errors

### 📈 Performance Metrics:
- Firebase initialization time
- API response times
- CORS header validation
- Token refresh timing

## 🎯 Next Steps

1. **Deploy test environment** following the setup instructions
2. **Test the CORS and Firebase fixes** that were previously deployed
3. **Validate API integrations** with test keys
4. **Document any issues** found during testing
5. **Merge successful fixes** back to main branch

## 📞 Support

If you encounter issues:
1. Check the console logs for detailed error messages
2. Verify environment variables are set correctly
3. Ensure test deployments are using the `testing` branch
4. Review the troubleshooting section above

---

**Happy Testing! 🧪✨**

The testing environment is now ready to validate all your recent fixes and ensure everything works perfectly before deploying to production.

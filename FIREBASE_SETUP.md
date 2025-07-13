# Firebase Setup Guide for Stock Watchlist App

## 🚀 Why Firebase?

Firebase provides:
- **Authentication**: Built-in user management
- **Firestore Database**: NoSQL, real-time database
- **Hosting**: Easy deployment
- **Scalability**: Handles traffic automatically
- **Real-time updates**: Perfect for stock data

## 📋 Setup Steps

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: `stock-watchlist-app`
4. Enable Google Analytics (optional)
5. Click "Create project"

### 2. Enable Authentication

1. In Firebase Console, go to "Authentication"
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" provider
5. Click "Save"

### 3. Create Firestore Database

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (for development)
4. Select a location (choose closest to your users)
5. Click "Done"

### 4. Get Service Account Key

1. In Firebase Console, go to "Project settings" (gear icon)
2. Go to "Service accounts" tab
3. Click "Generate new private key"
4. Save the JSON file as `firebase-credentials.json` in your project root

### 5. Set Environment Variables

Create a `.env` file in your project root:

```env
SECRET_KEY=your-secret-key-here
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CREDENTIALS_PATH=firebase-credentials.json
NEWS_API_KEY=your-news-api-key
DEBUG=True
PORT=5001
```

### 6. Install Dependencies

```bash
pip install -r requirements.txt
```

### 7. Run the App

```bash
python app.py
```

## 🔧 Firebase Security Rules

Add these Firestore security rules in Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Watchlist subcollection
      match /watchlist/{document} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      // Alerts subcollection
      match /alerts/{document} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

## 📊 Database Structure

### Users Collection
```
users/{userId}
├── uid: string
├── username: string
├── email: string
├── created_at: timestamp
└── last_login: timestamp
```

### Watchlist Subcollection
```
users/{userId}/watchlist/{symbol}
├── symbol: string
├── company_name: string
├── added_at: timestamp
└── last_updated: timestamp
```

### Alerts Subcollection
```
users/{userId}/alerts/{alertId}
├── symbol: string
├── target_price: number
├── alert_type: string (above/below)
├── is_active: boolean
├── triggered: boolean
├── triggered_at: timestamp
├── created_at: timestamp
└── updated_at: timestamp
```

## 🚀 Deployment Options

### Option 1: Firebase Hosting (Recommended)
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init hosting`
4. Deploy: `firebase deploy`

### Option 2: Render.com
1. Connect your GitHub repo
2. Set environment variables
3. Deploy automatically

### Option 3: Heroku
1. Create Heroku app
2. Set environment variables
3. Deploy with Git

## 💰 Firebase Pricing

**Free Tier (Spark Plan):**
- 50,000 reads/day
- 20,000 writes/day
- 20,000 deletes/day
- 1GB stored data
- 10GB/month transfer

**Paid Tier (Blaze Plan):**
- Pay as you go
- $0.18 per 100,000 reads
- $0.18 per 100,000 writes
- $0.18 per 100,000 deletes
- $0.18 per GB stored
- $0.15 per GB transferred

## 🔒 Security Best Practices

1. **Environment Variables**: Never commit credentials
2. **Firestore Rules**: Always restrict access
3. **Authentication**: Use Firebase Auth
4. **Rate Limiting**: Implement in your app
5. **Input Validation**: Validate all user inputs

## 🐛 Troubleshooting

### Common Issues:

1. **"Firebase credentials not found"**
   - Ensure `firebase-credentials.json` exists
   - Check file path in `.env`

2. **"Permission denied"**
   - Check Firestore security rules
   - Verify authentication

3. **"User not found"**
   - Check if user exists in Firestore
   - Verify user ID format

4. **"Database connection failed"**
   - Check Firebase project ID
   - Verify service account permissions

## 📈 Monitoring

1. **Firebase Console**: Monitor usage and errors
2. **Firestore**: View database activity
3. **Authentication**: Track user sign-ins
4. **Analytics**: Monitor app performance

## 🔄 Migration from PostgreSQL

The app is now fully migrated to Firebase:
- ✅ Authentication using Firebase Auth
- ✅ Data storage using Firestore
- ✅ Real-time updates
- ✅ Scalable architecture
- ✅ No database setup required

Your app is now ready for production with Firebase! 🎉 
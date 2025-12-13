# How to Deploy Firestore Security Rules

## ✅ Rules File Ready
The secure Firestore rules have been created in `firestore.rules` and committed to the repository.

## 🚀 Deployment Methods

### Method 1: Firebase Console (Easiest - Recommended)

1. **Go to Firebase Console:**
   - Visit: https://console.firebase.google.com
   - Select your project

2. **Navigate to Firestore Rules:**
   - Click on **Firestore Database** in the left sidebar
   - Click on the **Rules** tab

3. **Deploy the Rules:**
   - Copy the contents of `firestore.rules` file
   - Paste into the rules editor
   - Click **Publish**

4. **Verify Deployment:**
   - You should see a success message
   - Rules are now active

### Method 2: Firebase CLI

```bash
# 1. Login to Firebase
firebase login

# 2. Initialize project (if not already done)
firebase init firestore

# 3. Deploy rules
firebase deploy --only firestore:rules
```

## 🧪 Testing the Rules

After deployment, test that rules are working:

### Test 1: Authenticated Access (Should Work)
- Log into your app
- Try to access your watchlist
- Try to add a stock
- ✅ Should work - you're authenticated and accessing your own data

### Test 2: Unauthenticated Access (Should Fail)
- Open browser console
- Try to access Firestore directly without auth token
- ❌ Should be denied

### Test 3: Cross-User Access (Should Fail)
- Try to access another user's data
- ❌ Should be denied - you can only access your own data

## 📋 What the Rules Protect

✅ **Users Collection:** `users/{userId}`
- Users can only read/write their own profile

✅ **Watchlist:** `users/{userId}/watchlist/{stockId}`
- Users can only access their own watchlist items

✅ **Alerts:** `users/{userId}/alerts/{alertId}`
- Users can only access their own alerts

✅ **Metadata:** `users/{userId}/metadata/{docId}`
- Users can only access their own metadata

✅ **Chat:** `chat_conversations/{userId}`
- Users can only access their own chat history

## ⚠️ Important Notes

1. **Backend Still Works:** The backend uses Firebase Admin SDK which bypasses these rules. This is expected and correct.

2. **Client SDK Affected:** These rules only apply to direct client-side Firestore access. Your backend API endpoints are not affected.

3. **Test After Deployment:** Always test your app after deploying rules to ensure nothing breaks.

## 🔍 Verifying Rules Are Active

After deployment, you can verify rules are active by:

1. **Firebase Console:**
   - Go to Firestore Database → Rules
   - You should see your new rules displayed

2. **Test in App:**
   - Try accessing data while logged in (should work)
   - Try accessing data while logged out (should fail)

## 🐛 Troubleshooting

If rules cause issues:

1. **Check Rules Syntax:**
   - Rules must be valid Firestore rules syntax
   - Use Firebase Console rules simulator to test

2. **Check Authentication:**
   - Ensure users are properly authenticated
   - Verify Firebase Auth tokens are being sent

3. **Check User IDs:**
   - Ensure `request.auth.uid` matches document `userId`
   - Verify user IDs are consistent

## 📝 Rules Summary

```javascript
// Key security checks:
- isAuthenticated() → request.auth != null
- isOwner(userId) → request.auth.uid == userId
- All paths require authentication
- All paths require ownership
```

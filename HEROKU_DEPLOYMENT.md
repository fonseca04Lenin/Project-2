# Heroku Deployment Guide

## 🚀 Deploy Backend to Heroku

### Prerequisites
1. [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed
2. Heroku account created
3. Firebase credentials and project set up

### Step 1: Initialize Heroku App
```bash
# Login to Heroku
heroku login

# Create new Heroku app (replace with your preferred name)
heroku create your-app-name-backend

# Add to git remotes
git remote add heroku https://git.heroku.com/your-app-name-backend.git
```

### Step 2: Set Environment Variables
```bash
# Set Flask secret key (generate a strong random key)
heroku config:set SECRET_KEY="your-super-secret-key-here"

# Set Firebase configuration
heroku config:set FIREBASE_PROJECT_ID="your-firebase-project-id"

# Set News API key (if you have one)
heroku config:set NEWS_API_KEY="your-news-api-key"

# Set production environment
heroku config:set FLASK_ENV="production"
heroku config:set DEBUG="False"

# Set your Vercel frontend URL for CORS
heroku config:set FRONTEND_URL="https://your-vercel-app.vercel.app"
```

### Step 3: Upload Firebase Credentials
```bash
# Create a config var with your Firebase credentials
# First, convert your firebase-credentials.json to base64
base64 -i firebase-credentials.json | pbcopy

# Then set it as an environment variable
heroku config:set FIREBASE_CREDENTIALS_BASE64="paste-base64-content-here"
```

### Step 4: Update Firebase Service (if needed)
If you use base64 credentials, update `firebase_service.py` to decode them:

```python
import base64
import json
import os

# In your Firebase initialization
credentials_base64 = os.environ.get('FIREBASE_CREDENTIALS_BASE64')
if credentials_base64:
    # Decode base64 credentials
    credentials_json = base64.b64decode(credentials_base64).decode('utf-8')
    credentials_dict = json.loads(credentials_json)
    cred = credentials.Certificate(credentials_dict)
else:
    # Use file-based credentials (local development)
    cred = credentials.Certificate('firebase-credentials.json')
```

### Step 5: Deploy
```bash
# Add and commit all changes
git add .
git commit -m "Prepare for Heroku deployment"

# Deploy to Heroku
git push heroku main
```

### Step 6: Monitor Deployment
```bash
# Check logs
heroku logs --tail

# Open your app
heroku open
```

## 🔧 Post-Deployment Configuration

### Update Frontend Config
1. Note your Heroku app URL (e.g., `https://your-app-name-backend.herokuapp.com`)
2. Update `frontend-vercel/config.js`:
   ```javascript
   const CONFIG = {
       API_BASE_URL: 'https://your-app-name-backend.herokuapp.com',
       // ... other config
   };
   ```
3. Redeploy your Vercel frontend

### Verify CORS Settings
Make sure your Heroku backend accepts requests from your Vercel frontend:
```bash
heroku config:set FRONTEND_URL="https://your-actual-vercel-url.vercel.app"
```

## 🛠️ Troubleshooting

### Common Issues

#### Port Issues
- Heroku automatically sets the `PORT` environment variable
- Your app should use `os.environ.get('PORT', 5000)`

#### Firebase Credentials
- Ensure Firebase credentials are properly set
- Check that `FIREBASE_PROJECT_ID` matches your project

#### CORS Errors
- Verify `FRONTEND_URL` is set correctly
- Check that frontend URL matches exactly (no trailing slash)

#### SocketIO Issues
- Make sure `eventlet` is in requirements.txt
- Procfile should use `--worker-class eventlet`

### Useful Commands
```bash
# Check environment variables
heroku config

# View logs
heroku logs --tail

# Restart dyno
heroku restart

# Run one-off commands
heroku run python -c "import app; print('App works!')"
```

## 📊 Monitoring

### Health Check
Your app includes a health check endpoint at `/`:
```bash
curl https://your-app-name-backend.herokuapp.com/
```

### Logs
Monitor your app logs:
```bash
heroku logs --tail
```

## 💰 Cost Management

### Free Tier Limitations
- Apps sleep after 30 minutes of inactivity
- 550-1000 free dyno hours per month
- No custom domain on free tier

### Upgrading
For production use, consider upgrading to paid tiers for:
- Always-on dynos
- Better performance
- Custom domains
- SSL certificates

## 🔄 Updates

### Deploy Updates
```bash
git add .
git commit -m "Update description"
git push heroku main
```

### Environment Variables
```bash
heroku config:set NEW_VAR="value"
```

Your backend is now ready for production on Heroku! 🎉

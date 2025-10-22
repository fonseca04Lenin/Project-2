# Railway Deployment Guide

## 🚀 Deploy Backend to Railway

### Prerequisites
1. [Railway account](https://railway.app) created
2. GitHub repository connected to Railway
3. Environment variables ready

### Step 1: Connect Repository
1. Go to [Railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository: `fonseca04Lenin/Project-2`

### Step 2: Configure Environment Variables
In Railway dashboard, go to Variables tab and add:

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-client-email

# API Keys
NEWS_API_KEY=your-news-api-key
GROQ_API_KEY=your-groq-api-key-here
FINNHUB_API_KEY=your-finnhub-api-key

# Flask Configuration
FLASK_ENV=production
SECRET_KEY=your-secret-key-here
FRONTEND_URL=https://stock-watchlist-frontend.vercel.app
```

### Step 3: Deploy
1. Railway will automatically detect your Flask app
2. It will use the `railway.toml` configuration
3. Deployment will start automatically
4. Wait for deployment to complete

### Step 4: Get Your Railway URL
1. Go to your project dashboard
2. Click on your service
3. Copy the generated URL (e.g., `https://stock-watchlist-backend-production.up.railway.app`)

### Step 5: Update Frontend
1. Go to your Vercel dashboard
2. Update environment variables:
   - `RAILWAY_BACKEND_URL`: Your Railway URL
3. Redeploy frontend

### Step 6: Test Deployment
1. Visit your Railway URL + `/api/health`
2. Should return: `{"status": "healthy"}`
3. Test the AI chatbot functionality

## 🔧 Railway Configuration

The `railway.toml` file configures:
- **Builder**: NIXPACKS (auto-detects Python/Flask)
- **Start Command**: Gunicorn with eventlet workers
- **Health Check**: `/api/health` endpoint
- **Restart Policy**: Automatic restart on failure

## 📊 Monitoring

Railway provides:
- **Real-time logs**: View in dashboard
- **Metrics**: CPU, memory, network usage
- **Health checks**: Automatic monitoring
- **Custom domains**: Add your own domain

## 🚀 Benefits Over Heroku

- ✅ **Always-on**: No sleeping after inactivity
- ✅ **Faster deployments**: Better build times
- ✅ **Better pricing**: More generous free tier
- ✅ **Built-in databases**: PostgreSQL, Redis available
- ✅ **Custom domains**: Free SSL certificates

## 🔍 Troubleshooting

### Common Issues:
1. **Build fails**: Check environment variables
2. **Health check fails**: Verify Firebase credentials
3. **API errors**: Check GROQ_API_KEY is set
4. **CORS issues**: Verify FRONTEND_URL is correct

### Debug Commands:
```bash
# View logs
railway logs

# Check environment
railway variables

# Restart service
railway redeploy
```

Your backend is now ready for 24/7 production on Railway! 🎉

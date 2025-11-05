# 🚀 Gemini API Deployment Guide

## ✅ Code Changes Complete

All code has been updated to use Google Gemini API instead of Groq:
- ✅ `chat_service.py` - Updated to use Gemini API
- ✅ `requirements.txt` - Replaced `groq` with `google-generativeai`
- ✅ `app.py` - Updated health checks and test endpoints
- ✅ Frontend - Updated to test Gemini endpoint
- ✅ All environment variable references updated

## 🔑 Production API Key Setup

### Your Gemini API Key
```
AIzaSyBA5oETUK-i5mbDZvTTssMeHv1bXrSzYEw
```

### Backend (Railway) Setup

1. **Go to Railway Dashboard**
   - Visit: https://railway.app
   - Select your backend project

2. **Add Environment Variable**
   - Click on your service
   - Go to **Variables** tab
   - Click **+ New Variable**
   - Add:
     - **Variable Name**: `GEMINI_API_KEY`
     - **Value**: `AIzaSyBA5oETUK-i5mbDZvTTssMeHv1bXrSzYEw`
   - Click **Add**

3. **Remove Old Groq Key (if exists)**
   - If you see `GROQ_API_KEY` in variables, delete it

4. **Redeploy**
   - Railway will automatically redeploy when you add the variable
   - Or click **Deploy** to trigger a new deployment

5. **Verify Deployment**
   - Check logs for: `✅ Gemini API client initialized successfully`
   - Test health endpoint: `https://your-railway-url.railway.app/api/health`
   - Should show: `"gemini_api": true`

### Frontend (Vercel) Setup

✅ **No changes needed!** 
- The frontend doesn't use API keys directly
- It calls your backend API which handles the Gemini integration
- Vercel will auto-deploy when you push to GitHub

## 🧪 Testing After Deployment

### 1. Test Backend Health
```bash
curl https://your-railway-url.railway.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "firebase": true,
    "gemini_api": true
  }
}
```

### 2. Test Chat Endpoint
```bash
curl -X POST https://your-railway-url.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "X-User-ID: YOUR_USER_ID" \
  -d '{"message": "Hello, test the chatbot"}'
```

### 3. Test Frontend
- Open your Vercel frontend URL
- Log in and try the AI chat feature
- Should work with Gemini API now

## 📝 Quick Railway CLI Setup (Alternative)

If you prefer CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Set environment variable
railway variables set GEMINI_API_KEY=AIzaSyBA5oETUK-i5mbDZvTTssMeHv1bXrSzYEw

# Deploy
railway up
```

## 🔒 Security Notes

- ✅ API key is stored securely in Railway environment variables
- ✅ Never commit API keys to git (already in .gitignore)
- ✅ Frontend doesn't need the key (backend handles it)
- ✅ Key is only used server-side

## 🐛 Troubleshooting

### If chatbot doesn't work:

1. **Check Railway logs**:
   - Look for: `❌ Failed to initialize Gemini API`
   - Verify API key is set correctly

2. **Test API key directly**:
   ```bash
   curl https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_KEY
   ```

3. **Check health endpoint**:
   - Should show `gemini_api: true`

4. **Verify requirements installed**:
   - Railway should auto-install `google-generativeai` from `requirements.txt`

## ✨ Next Steps

1. ✅ Add `GEMINI_API_KEY` to Railway
2. ✅ Wait for deployment to complete
3. ✅ Test the chatbot in your app
4. ✅ Monitor Railway logs for any errors

---
**Status**: Ready to deploy! 🚀


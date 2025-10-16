# Railway.app Deployment for Portfolio

## Why Railway for Portfolio Projects?
- ✅ No cold starts (always responsive for recruiters)
- ✅ $5/month (worth it for portfolio impression)
- ✅ GitHub integration (automatic deployments)
- ✅ Keep all your existing code
- ✅ Professional custom domain support

## Step-by-Step Deployment

### Step 1: Prepare Your Project (2 minutes)
```bash
# Create requirements.txt if not exists
echo "flask
flask-cors
flask-socketio
python-socketio
firebase-admin
requests
python-dotenv
gunicorn" > requirements.txt

# Create Procfile for Railway
echo "web: gunicorn app:app" > Procfile

# Ensure PORT environment variable is used
# In app.py, change this line:
# port = int(os.environ.get('PORT', 5000))
```

### Step 2: Deploy to Railway (5 minutes)
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "Deploy from GitHub repo"
4. Select your `Project-2` repository
5. Railway auto-detects Python and deploys

### Step 3: Environment Variables (3 minutes)
In Railway dashboard:
- Add `FIREBASE_CREDENTIALS` (your Firebase service account JSON)
- Add `FRONTEND_URL` = `https://stock-watchlist-frontend.vercel.app`
- All other environment variables from Heroku

### Step 4: Update Frontend Config (2 minutes)
```javascript
// In frontend-vercel/config.js
const CONFIG = {
    API_BASE_URL: 'https://your-app-name.railway.app', // New Railway URL
    APP_NAME: 'Stock Watchlist Pro',
    VERSION: '1.0.0'
};
```

### Step 5: Custom Domain (3 minutes) - Optional but Professional
1. Railway dashboard → Settings → Domains
2. Add your custom domain (buy from Namecheap for $12/year)
3. Update DNS settings as shown
4. SSL certificate auto-generated

## Total Cost for Professional Portfolio:
- **Railway**: $5/month = $60/year
- **Custom Domain**: $12/year (optional)
- **Total**: $72/year for always-working portfolio project

## Portfolio Benefits:
1. **Always Responsive**: Recruiters never see loading/timeout errors
2. **Professional Domain**: `yourname-stockwatchlist.com`
3. **Full-Stack Showcase**: Backend + Frontend + Database + Auth
4. **Live Demo**: Works perfectly in interviews
5. **GitHub Integration**: Shows DevOps skills
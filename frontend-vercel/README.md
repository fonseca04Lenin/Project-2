# Stock Watchlist Pro - Frontend

This is the frontend for Stock Watchlist Pro, designed to be deployed on Vercel.

## 🚀 Quick Deploy to Vercel

### Option 1: Deploy via Vercel CLI
1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. **IMPORTANT: Update your backend URL first!**
   - Edit `config.js` and change `API_BASE_URL` to your Render backend URL
   - Example: `API_BASE_URL: 'https://your-app-name.onrender.com'`

3. Deploy:
   ```bash
   vercel
   ```

### Option 2: Deploy via Vercel Dashboard
1. **Update backend URL in `config.js` first**
2. Push this code to a GitHub repository
3. Go to [vercel.com](https://vercel.com)
4. Click "New Project"
5. Import your GitHub repository
6. Deploy!

## 📁 Project Structure
```
frontend-vercel/
├── index.html          # Main HTML file
├── config.js           # Configuration file (update backend URL here!)
├── static/
│   ├── css/
│   │   └── style.css   # Styles
│   └── js/
│       └── app.js      # JavaScript functionality
├── vercel.json         # Vercel configuration
├── package.json        # Project dependencies
└── README.md           # This file
```

## ⚠️ Important Notes

- **Backend Required**: This frontend needs your Flask backend to be running (hosted on Render)
- **API Endpoints**: All API calls now use the URL from `config.js`
- **CORS**: Ensure your backend has CORS enabled for your Vercel domain
- **Update Backend URL**: Before deploying, edit `config.js` and change `API_BASE_URL` to your actual Render backend URL

## 🔧 Configuration

### Backend URL Setup
1. Open `config.js`
2. Change `API_BASE_URL` to your Render backend URL:
   ```javascript
   API_BASE_URL: 'https://your-actual-app-name.onrender.com'
   ```

The `vercel.json` file configures:
- Static file serving
- SPA routing (all routes serve index.html)
- Cache headers for static assets

## 📱 Features

- Responsive design
- Real-time stock data
- User authentication
- Watchlist management
- Price alerts
- Market intelligence
- Interactive charts

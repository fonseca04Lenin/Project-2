# Stock Watchlist Pro - Frontend

This is the frontend for Stock Watchlist Pro, designed to be deployed on Vercel.

## 🚀 Quick Deploy to Vercel

### Option 1: Deploy via Vercel CLI
1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

### Option 2: Deploy via Vercel Dashboard
1. Push this code to a GitHub repository
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repository
5. Deploy!

## 📁 Project Structure
```
frontend-vercel/
├── index.html          # Main HTML file
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
- **API Endpoints**: Update the API URLs in `app.js` to point to your backend
- **CORS**: Ensure your backend has CORS enabled for your Vercel domain

## 🔧 Configuration

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

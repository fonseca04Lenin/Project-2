# Stock Watchlist App

A real-time stock tracking application with user authentication, watchlists, and price alerts.

## Features

- 🔐 User authentication (login/register)
- 📊 Real-time stock data from Yahoo Finance
- 📈 Historical price charts
- 🔔 Price alerts (above/below target)
- 📰 Market and company news
- 💾 Persistent user data with SQLite database

## Quick Start

### Option 1: Automatic Setup (Recommended)
```bash
python setup.py
python app.py
```

### Option 2: Manual Setup

1. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

2. **Run the application:**
```bash
python app.py
```

3. **Open your browser:**
Navigate to `http://localhost:5000`

4. **Create an account:**
- Click "Register" to create a new account
- Or use the demo login if available

## Usage

1. **Search Stocks:** Enter a stock symbol (e.g., AAPL, GOOGL, TSLA)
2. **Add to Watchlist:** Click "Add to Watchlist" for stocks you want to track
3. **Set Alerts:** Create price alerts to get notified when stocks hit target prices
4. **View News:** Check market and company-specific news
5. **Monitor:** Your watchlist and alerts are saved and persist between sessions

## Requirements

- Python 3.7 or higher
- Internet connection (for stock data and news)

## Project Structure

```
Project-2/
├── app.py              # Main Flask application
├── models.py           # Database models
├── auth.py             # Authentication handlers
├── stock.py            # Stock data API
├── requirements.txt    # Python dependencies
├── setup.py           # Setup script
├── templates/         # HTML templates
├── static/           # CSS, JS, and static files
└── stockwatchlist.db # SQLite database (created automatically)
```

## API Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/user` - Get current user
- `POST /api/search` - Search for stocks
- `GET /api/watchlist` - Get user's watchlist
- `POST /api/watchlist` - Add stock to watchlist
- `DELETE /api/watchlist/<symbol>` - Remove stock from watchlist
- `GET /api/alerts` - Get user's alerts
- `POST /api/alerts` - Create price alert
- `DELETE /api/alerts/<id>` - Delete alert

## Troubleshooting

1. **Port already in use:** Change the port in `app.py` or kill the process using the port
2. **Database errors:** Delete `stockwatchlist.db` and restart the app
3. **Import errors:** Make sure all requirements are installed with `pip install -r requirements.txt`

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- User-specific data isolation
- Protected API endpoints

Happy trading! 📈

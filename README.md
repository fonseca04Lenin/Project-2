# Stock Watchlist App

A real-time stock tracking application with user authentication, watchlists, and price alerts.

## Features

- User authentication (login/register)
- Real-time stock data from Yahoo Finance & Alpaca
- Historical price charts
- Price alerts (above/below target)
- Market and company news
- AI-powered stock advisor (Gemini)
- Persistent user data with Firebase Firestore

## Quick Start

1. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

2. **Configure environment variables:**
```bash
cp env.example .env
# Edit .env with your actual values
```

3. **Run the application:**
```bash
python wsgi.py
```

4. **Open your browser:**
Navigate to `http://localhost:5000`

## Project Structure

```
Project-2/
├── wsgi.py                        # Entry point (gunicorn wsgi:app)
├── app/
│   ├── __init__.py                # create_app() factory
│   ├── config.py                  # App configuration
│   ├── extensions.py              # Flask extensions (SocketIO, LoginManager)
│   ├── auth.py                    # Authentication blueprint
│   ├── socketio_events.py         # WebSocket event handlers
│   ├── services/
│   │   ├── firebase_service.py    # Firebase/Firestore integration
│   │   ├── watchlist_service.py   # Watchlist CRUD operations
│   │   ├── chat_service.py        # AI chat (Gemini) integration
│   │   ├── stock.py               # Stock data APIs (Yahoo, Alpaca, etc.)
│   │   └── services.py            # Shared service instances & helpers
│   ├── routes/
│   │   ├── core.py                # Health check, debug endpoints
│   │   ├── watchlist.py           # Watchlist API
│   │   ├── stock_data.py          # Stock search & data API
│   │   ├── market.py              # Market overview & movers
│   │   ├── news_social.py         # News & Stocktwits
│   │   ├── chat.py                # AI chat API
│   │   ├── alpaca.py              # Alpaca brokerage integration
│   │   ├── alerts_routes.py       # Price alerts API
│   │   ├── map_companies.py       # Company location map
│   │   └── youtube.py             # YouTube search API
│   └── utils/
│       ├── validation.py          # Input sanitization & validation
│       └── crypto.py              # Encryption utilities
├── frontend-vercel/               # Frontend application (Vercel)
├── requirements.txt               # Python dependencies
├── railway.toml                   # Railway deployment config
├── nixpacks.toml                  # Nixpacks build config
├── firestore.rules                # Firestore security rules
└── firestore.indexes.json         # Firestore database indexes
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

1. **Port already in use:** Change the port in `.env` or kill the process using the port
2. **Firebase errors:** Check your Firebase credentials configuration
3. **Import errors:** Make sure all requirements are installed with `pip install -r requirements.txt`
4. **Authentication issues:** Verify Firebase Authentication is enabled in your Firebase console

## Security Features

- Firebase Authentication with secure token verification
- Session-based user management
- User-specific data isolation in Firestore
- Protected API endpoints with login requirements
- Firestore security rules for data access control
- Input sanitization on all user-facing endpoints

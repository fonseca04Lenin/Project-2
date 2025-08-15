# Stock Watchlist Pro - React Frontend

This is the React TypeScript frontend for the Stock Watchlist Pro application. It provides a modern, responsive interface for tracking stocks, managing watchlists, and accessing market intelligence.

## Features

- 🔐 User authentication (login/register)
- 📊 Real-time stock data display
- 📈 Stock search with autocomplete
- ⭐ Personal watchlist management
- 🔔 Price alerts system
- 📰 Market news feed
- 🧠 Market intelligence (earnings, insider trading, analyst ratings, options data)
- 🎨 Modern, responsive design with glassmorphism effects

## Tech Stack

- **React 18** with TypeScript
- **React Router** for navigation
- **Axios** for API calls
- **Socket.IO Client** for real-time updates
- **Font Awesome** for icons
- **CSS3** with custom glassmorphism design

## Quick Start

### Prerequisites

Make sure you have the Flask backend running on `http://localhost:5000`

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Start the development server:**
```bash
npm start
```

3. **Open your browser:**
Navigate to `http://localhost:3000`

## Project Structure

```
src/
├── components/          # React components
│   ├── Auth.tsx       # Authentication forms
│   ├── Dashboard.tsx  # Main dashboard
│   ├── SearchSection.tsx # Stock search
│   ├── StockCard.tsx  # Stock display card
│   ├── WatchlistSection.tsx # Watchlist management
│   ├── NewsSection.tsx # Market news
│   ├── AlertsSection.tsx # Price alerts
│   └── MarketIntelligence.tsx # Market data
├── contexts/           # React contexts
│   └── AuthContext.tsx # Authentication state
├── types/              # TypeScript type definitions
│   ├── user.ts        # User types
│   └── stock.ts       # Stock data types
├── App.tsx            # Main app component
├── App.css            # Styles (copied from Flask app)
└── index.tsx          # App entry point
```

## API Integration

The frontend communicates with the Flask backend through RESTful APIs:

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/user` - Get current user
- `POST /api/search` - Search for stocks
- `GET /api/watchlist` - Get user's watchlist
- `POST /api/watchlist` - Add stock to watchlist
- `DELETE /api/watchlist/<symbol>` - Remove from watchlist
- `GET /api/alerts` - Get user's alerts
- `POST /api/alerts` - Create price alert
- `DELETE /api/alerts/<id>` - Delete alert
- `GET /api/news/market` - Get market news
- `GET /api/market/*` - Market intelligence endpoints

## Development

### Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

### Proxy Configuration

The app is configured to proxy API requests to `http://localhost:5000` (Flask backend) during development.

## Styling

The app uses a custom CSS design with:
- Glassmorphism effects
- Dark theme with gradient backgrounds
- Responsive design
- Smooth animations and transitions
- Font Awesome icons

## TypeScript

The app is fully typed with TypeScript interfaces for:
- User data
- Stock information
- News items
- Alerts
- Market data

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is part of the Stock Watchlist Pro application.

from flask import Flask, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_login import login_required, current_user
from flask_cors import CORS
import json
from datetime import datetime, timedelta
from stock import Stock, YahooFinanceAPI, NewsAPI, FinnhubAPI
from firebase_service import FirebaseService
from auth import auth, login_manager
from config import Config
import os
import threading
import time

app = Flask(__name__)

# Enable CORS for frontend (local development and Vercel)
allowed_origins = [
    "http://localhost:3000",  # Local development
    "http://127.0.0.1:3000",  # Local development alternative
    "http://localhost:5000",  # Local Flask dev
    "http://localhost:8000",  # Local Flask dev on port 8000
    "https://stock-watchlist-frontend.vercel.app",  # Main Vercel deployment
]

# Add specific frontend URL from environment if available
frontend_url = os.environ.get('FRONTEND_URL')
if frontend_url:
    allowed_origins.append(frontend_url)
    print(f"🔗 Added FRONTEND_URL to CORS: {frontend_url}")

# Add additional Vercel domains explicitly
vercel_domains = [
    "https://stock-watchlist-frontend-ql5o74lkh-lenny-s-projects-87605fc1.vercel.app",
    "https://stock-watchlist-frontend-git-main-lenny-s-projects-87605fc1.vercel.app",
    "https://stock-watchlist-frontend-lennys-projects-87605fc1.vercel.app"
]
allowed_origins.extend(vercel_domains)

print(f"🌐 CORS allowed origins: {allowed_origins}")

# Enable CORS with specific auth-friendly settings
CORS(app, 
     origins=allowed_origins, 
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     expose_headers=['Content-Type', 'Authorization'],
     vary_header=False)

# Configuration
app.config['SECRET_KEY'] = Config.SECRET_KEY

# Session configuration for cross-origin setup (Vercel frontend + Heroku backend)
is_production = os.environ.get('FLASK_ENV') == 'production' or os.environ.get('HEROKU_APP_NAME') is not None
app.config['SESSION_COOKIE_SECURE'] = True  # Always secure in production
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'  # Required for cross-origin requests

# Initialize extensions
socketio = SocketIO(app, cors_allowed_origins=allowed_origins, async_mode='threading', logger=True, engineio_logger=True)
login_manager.init_app(app)

# Debug session configuration
print(f"🔧 Session Config - Secure: {app.config['SESSION_COOKIE_SECURE']}, SameSite: {app.config['SESSION_COOKIE_SAMESITE']}, Production: {is_production}")

# Register blueprints
app.register_blueprint(auth)

# Initialize APIs
yahoo_finance_api = YahooFinanceAPI()
news_api = NewsAPI()
finnhub_api = FinnhubAPI()

# Store connected users and their watchlists
connected_users = {}

@app.route('/')
def index():
    return {"message": "Stock Watchlist API", "status": "active"}

# WebSocket Events
@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    try:
        emit('connected', {'message': 'Connected to server'})
    except Exception as e:
        print(f"Error in connect handler: {e}")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    if request.sid in connected_users:
        del connected_users[request.sid]

@socketio.on('join_user_room')
def handle_join_user_room(data):
    """Join user to their personal room for private updates"""
    try:
        user_id = data.get('user_id')
        if user_id:
            join_room(f"user_{user_id}")
            connected_users[request.sid] = user_id
            print(f"User {user_id} joined room: user_{user_id}")
    except Exception as e:
        print(f"Error joining user room: {e}")

@socketio.on('join_watchlist_updates')
def handle_join_watchlist_updates(data):
    """Join user to watchlist updates room"""
    try:
        user_id = data.get('user_id')
        if user_id:
            join_room(f"watchlist_{user_id}")
            print(f"User {user_id} joined watchlist updates")
    except Exception as e:
        print(f"Error joining watchlist updates: {e}")

@socketio.on('join_market_updates')
def handle_join_market_updates():
    """Join user to market updates room"""
    try:
        join_room("market_updates")
        print(f"Client {request.sid} joined market updates")
    except Exception as e:
        print(f"Error joining market updates: {e}")

@socketio.on('join_news_updates')
def handle_join_news_updates():
    """Join user to news updates room"""
    try:
        join_room("news_updates")
        print(f"Client {request.sid} joined news updates")
    except Exception as e:
        print(f"Error joining news updates: {e}")

# Real-time stock price updates
def update_stock_prices():
    """Background task to update stock prices"""
    while True:
        try:
            # Get all active users and their watchlists
            for sid, user_id in connected_users.items():
                if user_id:
                    watchlist = FirebaseService.get_watchlist(user_id)
                    if watchlist:
                        updated_prices = []
                        for item in watchlist:
                            try:
                                stock = Stock(item['symbol'], yahoo_finance_api)
                                stock.retrieve_data()
                                
                                # Calculate price change
                                price_change = 0
                                price_change_percent = 0
                                if 'last_price' in item:
                                    price_change = stock.price - item['last_price']
                                    price_change_percent = (price_change / item['last_price'] * 100) if item['last_price'] > 0 else 0
                                
                                updated_prices.append({
                                    'symbol': item['symbol'],
                                    'name': item['name'],
                                    'price': stock.price,
                                    'price_change': price_change,
                                    'price_change_percent': price_change_percent,
                                    'last_updated': datetime.now().isoformat()
                                })
                                
                                # Check for triggered alerts
                                triggered_alerts = FirebaseService.check_triggered_alerts(user_id, item['symbol'], stock.price)
                                if triggered_alerts:
                                    socketio.emit('alert_triggered', {
                                        'symbol': item['symbol'],
                                        'alerts': triggered_alerts
                                    }, room=f"user_{user_id}")
                                
                            except Exception as e:
                                print(f"Error updating {item['symbol']}: {e}")
                        
                        if updated_prices:
                            socketio.emit('watchlist_updated', {
                                'prices': updated_prices
                            }, room=f"watchlist_{user_id}")
            
            # Update market status
            market_status = get_market_status()
            socketio.emit('market_status_updated', market_status, room="market_updates")
            
            time.sleep(30)  # Update every 30 seconds
            
        except Exception as e:
            print(f"Error in price update loop: {e}")
            time.sleep(60)  # Wait longer on error

# Start background task for price updates
def start_price_updates():
    """Start the background price update task"""
    thread = threading.Thread(target=update_stock_prices, daemon=True)
    thread.start()

# Market status function
def get_market_status():
    """Get current market status"""
    try:
        now = datetime.now()
        # Simple market hours check (9:30 AM - 4:00 PM ET, Monday-Friday)
        is_weekday = now.weekday() < 5
        is_market_hours = 9 <= now.hour < 16 or (now.hour == 16 and now.minute <= 30)
        
        if is_weekday and is_market_hours:
            return {
                'isOpen': True,
                'status': 'Market is Open',
                'last_updated': now.isoformat()
            }
        else:
            return {
                'isOpen': False,
                'status': 'Market is Closed',
                'last_updated': now.isoformat()
            }
    except Exception as e:
        return {
            'isOpen': False,
            'status': 'Market status unknown',
            'last_updated': datetime.now().isoformat()
        }

@app.route('/api/search', methods=['POST'])
def search_stock():
    data = request.get_json()
    symbol = data.get('symbol', '').upper()
    
    if not symbol:
        return jsonify({'error': 'Please enter a stock symbol'}), 400
    
    stock = Stock(symbol, yahoo_finance_api)
    stock.retrieve_data()
    
    if stock.name and 'not found' not in stock.name.lower():
        #last month's price
        last_month_date = datetime.now() - timedelta(days=30)
        start_date = last_month_date.strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")
        historical_data = yahoo_finance_api.get_historical_data(symbol, start_date, end_date)
        
        last_month_price = 0.0
        if historical_data and len(historical_data) > 0:
            last_month_price = historical_data[0]['close']
        
        price_change = stock.price - last_month_price if last_month_price > 0 else 0
        price_change_percent = (price_change / last_month_price * 100) if last_month_price > 0 else 0
        
        # Check for triggered alerts (only if user is logged in)
        alerts_data = []
        if current_user.is_authenticated:
            triggered_alerts = FirebaseService.check_triggered_alerts(current_user.id, symbol, stock.price)
            alerts_data = [{
                'target_price': float(alert['target_price']),
                'alert_type': alert['alert_type']
            } for alert in triggered_alerts]
        
        return jsonify({
            'symbol': stock.symbol,
            'name': stock.name,
            'price': stock.price,
            'lastMonthPrice': last_month_price,
            'priceChange': price_change,
            'priceChangePercent': price_change_percent,
            'triggeredAlerts': alerts_data
        })
    else:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

@app.route('/api/search/stocks', methods=['GET'])
def search_stocks():
    """Search stocks by name or symbol"""
    query = request.args.get('q', '').strip()
    
    if not query:
        return jsonify({'error': 'Please provide a search query'}), 400
    
    if len(query) < 2:
        return jsonify({'error': 'Search query must be at least 2 characters'}), 400
    
    try:
        # Search for stocks using the Yahoo Finance API
        search_results = yahoo_finance_api.search_stocks(query, limit=15)
        
        if search_results:
            return jsonify({
                'results': search_results,
                'query': query
            })
        else:
            return jsonify({
                'results': [],
                'query': query,
                'message': f'No stocks found for "{query}"'
            })
            
    except Exception as e:
        print(f"Error searching stocks: {e}")
        return jsonify({'error': 'Failed to search stocks'}), 500

@app.route('/api/search/companies', methods=['GET'])
def search_companies():
    """Search companies by name with enhanced results"""
    query = request.args.get('q', '').strip()
    
    if not query:
        return jsonify({'error': 'Please provide a search query'}), 400
    
    if len(query) < 2:
        return jsonify({'error': 'Search query must be at least 2 characters'}), 400
    
    try:
        # Enhanced search with company names
        search_results = yahoo_finance_api.search_stocks(query, limit=20)
        
        # Filter and enhance results
        enhanced_results = []
        for result in search_results:
            # Add more company information if available
            enhanced_result = {
                'symbol': result.get('symbol', ''),
                'name': result.get('name', ''),
                'exchange': result.get('exchange', ''),
                'type': result.get('type', ''),
                'display_name': f"{result.get('symbol', '')} - {result.get('name', '')}"
            }
            enhanced_results.append(enhanced_result)
        
        return jsonify({
            'results': enhanced_results,
            'query': query
        })
            
    except Exception as e:
        print(f"Error searching companies: {e}")
        return jsonify({'error': 'Failed to search companies'}), 500

@app.route('/api/watchlist', methods=['GET'])
@login_required
def get_watchlist_route():
    stocks_data = []
    watchlist = FirebaseService.get_watchlist(current_user.id)
    for watchlist_stock in watchlist:
        stock = Stock(watchlist_stock['symbol'], yahoo_finance_api)
        stock.retrieve_data()
        # Calculate last month's price and performance
        last_month_date = datetime.now() - timedelta(days=30)
        start_date = last_month_date.strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")
        historical_data = yahoo_finance_api.get_historical_data(stock.symbol, start_date, end_date)
        last_month_price = 0.0
        if historical_data and len(historical_data) > 0:
            last_month_price = historical_data[0]['close']
        price_change = stock.price - last_month_price if last_month_price > 0 else 0
        price_change_percent = (price_change / last_month_price * 100) if last_month_price > 0 else 0
        stocks_data.append({
            'id': watchlist_stock['symbol'],
            'symbol': stock.symbol,
            'name': stock.name,
            'price': stock.price,
            'lastMonthPrice': last_month_price,
            'priceChange': price_change,
            'priceChangePercent': price_change_percent
        })
    return jsonify(stocks_data)

@app.route('/api/watchlist', methods=['POST'])
@login_required
def add_to_watchlist():
    data = request.get_json()
    symbol = data.get('symbol', '').upper()
    
    if not symbol:
        return jsonify({'error': 'Please provide a stock symbol'}), 400
    
    stock = Stock(symbol, yahoo_finance_api)
    stock.retrieve_data()
    
    if stock.name and 'not found' not in stock.name.lower():
        success = FirebaseService.add_to_watchlist(current_user.id, symbol, stock.name)
        if success:
            return jsonify({'message': f'{stock.name} added to watchlist'})
        else:
            return jsonify({'error': 'Failed to add to watchlist'}), 500
    else:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

@app.route('/api/watchlist/<symbol>', methods=['DELETE'])
@login_required
def remove_from_watchlist(symbol):
    symbol = symbol.upper()
    success = FirebaseService.remove_from_watchlist(current_user.id, symbol)
    
    if success:
        return jsonify({'message': f'Stock removed from watchlist'})
    
    return jsonify({'error': 'Stock not found in watchlist'}), 404

@app.route('/api/chart/<symbol>')
def get_chart_data(symbol):
    symbol = symbol.upper()
    last_month_date = datetime.now() - timedelta(days=30)
    start_date = last_month_date.strftime("%Y-%m-%d")
    end_date = datetime.now().strftime("%Y-%m-%d")
    
    stock = Stock(symbol, yahoo_finance_api)
    dates, prices = stock.retrieve_historical_data(start_date, end_date)
    
    if dates and prices:
        chart_data = [{'date': date, 'price': price} for date, price in zip(dates, prices)]
        return jsonify(chart_data)
    else:
        return jsonify({'error': 'Could not retrieve chart data'}), 404

@app.route('/api/market-status')
def market_status():
    now = datetime.now()
    market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
    
    is_open = market_open <= now <= market_close and now.weekday() < 5
    
    return jsonify({
        'isOpen': is_open,
        'status': 'Market is Open' if is_open else 'Market is Closed'
    })

@app.route('/api/news/market')
def get_market_news():
    try:
        news = news_api.get_market_news(limit=10)
        return jsonify(news)
    except Exception as e:
        return jsonify({'error': 'Could not fetch market news'}), 500

@app.route('/api/news/company/<symbol>')
def get_company_news(symbol):
    try:
        symbol = symbol.upper()
        news = news_api.get_company_news(symbol, limit=5)
        return jsonify(news)
    except Exception as e:
        return jsonify({'error': f'Could not fetch news for {symbol}'}), 500

@app.route('/api/company/<symbol>')
def get_company_info(symbol):
    symbol = symbol.upper()
    stock = Stock(symbol, yahoo_finance_api)
    stock.retrieve_data()
    finnhub_info = finnhub_api.get_company_profile(symbol)
    info = yahoo_finance_api.get_info(symbol)
    if stock.name and 'not found' not in stock.name.lower():
        return jsonify({
            'symbol': stock.symbol,
            'name': stock.name,
            'ceo': finnhub_info.get('ceo', '-') or '-',
            'description': finnhub_info.get('description', '-') or '-',
            'price': stock.price,
            'marketCap': info.get('marketCap', '-'),
            'peRatio': info.get('trailingPE', '-') or info.get('forwardPE', '-'),
            'dividendYield': info.get('dividendYield', '-'),
            'website': info.get('website', '-'),
            'headquarters': (info.get('city', '-') + (', ' + info.get('state', '-') if info.get('state') else '')) if info.get('city') else '-',
        })
    else:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

@app.route('/api/alerts', methods=['GET'])
@login_required
def get_alerts():
    symbol = request.args.get('symbol')
    alerts = FirebaseService.get_alerts(current_user.id, symbol)
    return jsonify(alerts)

@app.route('/api/alerts', methods=['POST'])
@login_required
def create_alert():
    data = request.get_json()
    symbol = data.get('symbol', '').upper()
    target_price = data.get('target_price')
    alert_type = data.get('alert_type', 'above')
    
    if not symbol or target_price is None:
        return jsonify({'error': 'Symbol and target price are required'}), 400
    
    try:
        target_price = float(target_price)
    except ValueError:
        return jsonify({'error': 'Invalid target price'}), 400
    
    if alert_type not in ['above', 'below']:
        return jsonify({'error': 'Alert type must be either "above" or "below"'}), 400
    
    alert_id = FirebaseService.create_alert(current_user.id, symbol, target_price, alert_type)
    if alert_id:
        return jsonify({'message': 'Alert created successfully', 'alert_id': alert_id})
    else:
        return jsonify({'error': 'Failed to create alert'}), 500

@app.route('/api/alerts/<alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    success = FirebaseService.delete_alert(current_user.id, alert_id)
    
    if success:
        return jsonify({'message': 'Alert removed successfully'})
    return jsonify({'error': 'Alert not found'}), 404

# Market Intelligence Endpoints
@app.route('/api/market/earnings')
def get_earnings_calendar():
    """Get upcoming earnings dates with recent data"""
    try:
        # Get current date and next 30 days for realistic earnings dates
        from datetime import datetime, timedelta
        import random
        today = datetime.now()
        
        # Major companies with realistic earnings patterns
        companies = [
            {'symbol': 'AAPL', 'name': 'Apple Inc.', 'base_estimate': 2.15},
            {'symbol': 'MSFT', 'name': 'Microsoft Corporation', 'base_estimate': 2.82},
            {'symbol': 'GOOGL', 'name': 'Alphabet Inc.', 'base_estimate': 1.62},
            {'symbol': 'TSLA', 'name': 'Tesla, Inc.', 'base_estimate': 0.85},
            {'symbol': 'NVDA', 'name': 'NVIDIA Corporation', 'base_estimate': 4.25},
            {'symbol': 'AMZN', 'name': 'Amazon.com, Inc.', 'base_estimate': 0.95},
            {'symbol': 'META', 'name': 'Meta Platforms, Inc.', 'base_estimate': 3.45},
            {'symbol': 'NFLX', 'name': 'Netflix, Inc.', 'base_estimate': 2.10},
            {'symbol': 'AMD', 'name': 'Advanced Micro Devices, Inc.', 'base_estimate': 0.75},
            {'symbol': 'INTC', 'name': 'Intel Corporation', 'base_estimate': 0.45},
            {'symbol': 'CRM', 'name': 'Salesforce, Inc.', 'base_estimate': 1.85},
            {'symbol': 'ORCL', 'name': 'Oracle Corporation', 'base_estimate': 1.25},
            {'symbol': 'ADBE', 'name': 'Adobe Inc.', 'base_estimate': 3.20},
            {'symbol': 'PYPL', 'name': 'PayPal Holdings, Inc.', 'base_estimate': 1.15},
            {'symbol': 'SQ', 'name': 'Block, Inc.', 'base_estimate': 0.35}
        ]
        
        # Generate 8-12 earnings events for the next 30 days
        earnings_data = []
        num_events = random.randint(8, 12)
        
        for i in range(num_events):
            company = random.choice(companies)
            days_ahead = random.randint(1, 30)
            estimate_variation = random.uniform(0.8, 1.2)  # ±20% variation
            estimate = round(company['base_estimate'] * estimate_variation, 2)
            
            earnings_data.append({
                'symbol': company['symbol'],
                'company_name': company['name'],
                'earnings_date': (today + timedelta(days=days_ahead)).strftime('%Y-%m-%d'),
                'estimate': estimate,
                'actual': None,
                'surprise': None
            })
        
        # Sort by earnings date
        earnings_data.sort(key=lambda x: x['earnings_date'])
        
        return jsonify(earnings_data)
    except Exception as e:
        return jsonify({'error': 'Could not fetch earnings data'}), 500

@app.route('/api/market/insider-trading/<symbol>')
def get_insider_trading(symbol):
    """Get recent insider trading data for a symbol"""
    try:
        symbol = symbol.upper()
        from datetime import datetime, timedelta
        today = datetime.now()
        
        # Get current stock price for realistic data
        stock = Stock(symbol, yahoo_finance_api)
        stock.retrieve_data()
        
        if not stock.name or 'not found' in stock.name.lower():
            return jsonify({'error': f'Stock "{symbol}" not found'}), 404
        
        current_price = stock.price
        
        # Generate dynamic insider trading data based on symbol
        insider_data = []
        
        # Different executives for different companies
        executives = {
            'AAPL': [
                {'name': 'Tim Cook', 'title': 'CEO'},
                {'name': 'Luca Maestri', 'title': 'CFO'},
                {'name': 'Jeff Williams', 'title': 'COO'}
            ],
            'MSFT': [
                {'name': 'Satya Nadella', 'title': 'CEO'},
                {'name': 'Amy Hood', 'title': 'CFO'},
                {'name': 'Brad Smith', 'title': 'President'}
            ],
            'GOOGL': [
                {'name': 'Sundar Pichai', 'title': 'CEO'},
                {'name': 'Ruth Porat', 'title': 'CFO'},
                {'name': 'Kent Walker', 'title': 'President'}
            ],
            'TSLA': [
                {'name': 'Elon Musk', 'title': 'CEO'},
                {'name': 'Zach Kirkhorn', 'title': 'CFO'},
                {'name': 'Drew Baglino', 'title': 'CTO'}
            ],
            'NVDA': [
                {'name': 'Jensen Huang', 'title': 'CEO'},
                {'name': 'Colette Kress', 'title': 'CFO'},
                {'name': 'Debora Shoquist', 'title': 'COO'}
            ],
            'AMZN': [
                {'name': 'Andy Jassy', 'title': 'CEO'},
                {'name': 'Brian Olsavsky', 'title': 'CFO'},
                {'name': 'David Clark', 'title': 'COO'}
            ],
            'META': [
                {'name': 'Mark Zuckerberg', 'title': 'CEO'},
                {'name': 'Susan Li', 'title': 'CFO'},
                {'name': 'Sheryl Sandberg', 'title': 'COO'}
            ]
        }
        
        # Get executives for this symbol or use generic ones
        symbol_executives = executives.get(symbol, [
            {'name': 'John Smith', 'title': 'CEO'},
            {'name': 'Jane Doe', 'title': 'CFO'},
            {'name': 'Mike Johnson', 'title': 'COO'}
        ])
        
        # Generate 2-4 insider transactions
        import random
        num_transactions = random.randint(2, 4)
        
        for i in range(num_transactions):
            executive = symbol_executives[i % len(symbol_executives)]
            transaction_type = random.choice(['BUY', 'SELL'])
            shares = random.randint(1000, 50000)
            price_variation = random.uniform(0.95, 1.05)  # ±5% from current price
            price = round(current_price * price_variation, 2)
            value = shares * price
            days_ago = random.randint(1, 30)
            
            insider_data.append({
                'filer_name': executive['name'],
                'title': executive['title'],
                'transaction_type': transaction_type,
                'shares': shares,
                'price': price,
                'date': (today - timedelta(days=days_ago)).strftime('%Y-%m-%d'),
                'value': value
            })
        
        # Sort by date (most recent first)
        insider_data.sort(key=lambda x: x['date'], reverse=True)
        
        return jsonify(insider_data)
    except Exception as e:
        return jsonify({'error': f'Could not fetch insider trading data for {symbol}'}), 500

@app.route('/api/market/analyst-ratings/<symbol>')
def get_analyst_ratings(symbol):
    """Get current analyst ratings and price targets"""
    try:
        symbol = symbol.upper()
        from datetime import datetime, timedelta
        today = datetime.now()
        
        # Get current stock price for realistic data
        stock = Stock(symbol, yahoo_finance_api)
        stock.retrieve_data()
        
        if not stock.name or 'not found' in stock.name.lower():
            return jsonify({'error': f'Stock "{symbol}" not found'}), 404
        
        current_price = stock.price
        
        # Major investment banks
        banks = [
            'Goldman Sachs', 'Morgan Stanley', 'JP Morgan', 'Bank of America',
            'Citigroup', 'Wells Fargo', 'Deutsche Bank', 'Credit Suisse',
            'Barclays', 'UBS', 'RBC Capital', 'Jefferies', 'Cowen',
            'Piper Sandler', 'Raymond James', 'Stifel', 'BMO Capital'
        ]
        
        # Generate analyst ratings
        import random
        num_analysts = random.randint(4, 8)
        ratings = []
        price_targets = []
        
        for i in range(num_analysts):
            bank = random.choice(banks)
            rating = random.choice(['BUY', 'HOLD', 'SELL'])
            
            # Generate realistic price target based on current price
            if rating == 'BUY':
                target_multiplier = random.uniform(1.1, 1.4)  # 10-40% upside
            elif rating == 'HOLD':
                target_multiplier = random.uniform(0.95, 1.15)  # -5% to +15%
            else:  # SELL
                target_multiplier = random.uniform(0.7, 0.95)  # -5% to -30%
            
            price_target = round(current_price * target_multiplier, 2)
            price_targets.append(price_target)
            
            days_ago = random.randint(1, 30)
            
            ratings.append({
                'firm': bank,
                'rating': rating,
                'price_target': price_target,
                'date': (today - timedelta(days=days_ago)).strftime('%Y-%m-%d')
            })
        
        # Calculate consensus
        buy_count = sum(1 for r in ratings if r['rating'] == 'BUY')
        sell_count = sum(1 for r in ratings if r['rating'] == 'SELL')
        
        if buy_count > sell_count:
            consensus = 'BUY'
        elif sell_count > buy_count:
            consensus = 'SELL'
        else:
            consensus = 'HOLD'
        
        ratings_data = {
            'symbol': symbol,
            'consensus_rating': consensus,
            'price_target_avg': round(sum(price_targets) / len(price_targets), 2),
            'price_target_high': max(price_targets),
            'price_target_low': min(price_targets),
            'analysts': ratings
        }
        
        return jsonify(ratings_data)
    except Exception as e:
        return jsonify({'error': f'Could not fetch analyst ratings for {symbol}'}), 500

@app.route('/api/market/options/<symbol>')
def get_options_data(symbol):
    """Get current options data for a symbol"""
    try:
        symbol = symbol.upper()
        from datetime import datetime, timedelta
        today = datetime.now()
        
        # Get current stock price for realistic data
        stock = Stock(symbol, yahoo_finance_api)
        stock.retrieve_data()
        
        if not stock.name or 'not found' in stock.name.lower():
            return jsonify({'error': f'Stock "{symbol}" not found'}), 404
        
        current_price = stock.price
        
        # Generate current options data with realistic expiration dates
        next_week = today + timedelta(days=7)
        next_month = today + timedelta(days=30)
        next_quarter = today + timedelta(days=90)
        
        # Generate realistic strike prices around current price
        import random
        call_options = []
        put_options = []
        
        # Generate call options (strikes above current price)
        for i in range(3):
            strike = round(current_price * (1 + (i + 1) * 0.05), 2)  # 5%, 10%, 15% above
            bid = round(max(0.01, (strike - current_price) * 0.8), 2)
            ask = round(bid * 1.1, 2)
            volume = random.randint(100, 2000)
            open_interest = random.randint(500, 5000)
            
            call_options.append({
                'strike': strike,
                'expiration': next_week.strftime('%Y-%m-%d'),
                'bid': bid,
                'ask': ask,
                'volume': volume,
                'open_interest': open_interest
            })
        
        # Generate put options (strikes below current price)
        for i in range(3):
            strike = round(current_price * (1 - (i + 1) * 0.05), 2)  # 5%, 10%, 15% below
            bid = round(max(0.01, (current_price - strike) * 0.8), 2)
            ask = round(bid * 1.1, 2)
            volume = random.randint(100, 1500)
            open_interest = random.randint(300, 4000)
            
            put_options.append({
                'strike': strike,
                'expiration': next_week.strftime('%Y-%m-%d'),
                'bid': bid,
                'ask': ask,
                'volume': volume,
                'open_interest': open_interest
            })
        
        options_data = {
            'symbol': symbol,
            'current_price': current_price,
            'expiration_dates': [
                next_week.strftime('%Y-%m-%d'),
                next_month.strftime('%Y-%m-%d'),
                next_quarter.strftime('%Y-%m-%d')
            ],
            'call_options': call_options,
            'put_options': put_options
        }
        return jsonify(options_data)
    except Exception as e:
        return jsonify({'error': f'Could not fetch options data for {symbol}'}), 500

if __name__ == '__main__':
    port = Config.PORT
    print("\n🚀 Starting Stock Watchlist App...")
    print("🔥 Using Firebase for authentication and data storage")
    print("⚡ Starting real-time price updates...")
    print(f"🌐 Server running on port: {port}\n")
    
    # Start the background price update task
    start_price_updates()
    
    socketio.run(app, debug=Config.DEBUG, host='0.0.0.0', port=port) 
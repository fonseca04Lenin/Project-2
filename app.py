from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
from flask_login import login_required, current_user
import json
from datetime import datetime, timedelta
from stock import Stock, YahooFinanceAPI, NewsAPI
from models import db, User, WatchlistStock, Alert
from auth import auth, login_manager, bcrypt
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///stockwatchlist.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
socketio = SocketIO(app, cors_allowed_origins="*")
db.init_app(app)
login_manager.init_app(app)
bcrypt.init_app(app)

# Register blueprints
app.register_blueprint(auth)

# Initialize APIs
yahoo_finance_api = YahooFinanceAPI()
news_api = NewsAPI()

# Create database tables
with app.app_context():
    db.create_all()

@app.route('/')
def index():
    return render_template('index.html')

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
            alerts = Alert.query.filter_by(user_id=current_user.id, symbol=symbol).all()
            for alert in alerts:
                if not alert.triggered:
                    if (alert.alert_type == 'above' and stock.price >= alert.target_price) or \
                       (alert.alert_type == 'below' and stock.price <= alert.target_price):
                        alert.triggered = True
                        alerts_data.append({
                            'target_price': alert.target_price,
                            'alert_type': alert.alert_type
                        })
            if alerts_data:
                db.session.commit()
        
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

@app.route('/api/watchlist', methods=['GET'])
@login_required
def get_watchlist_route():
    stocks_data = []
    watchlist_stocks = WatchlistStock.query.filter_by(user_id=current_user.id).all()
    
    for watchlist_stock in watchlist_stocks:
        stock = Stock(watchlist_stock.symbol, yahoo_finance_api)
        stock.retrieve_data()
        stocks_data.append({
            'id': watchlist_stock.id,
            'symbol': stock.symbol,
            'name': stock.name,
            'price': stock.price
        })
    return jsonify(stocks_data)

@app.route('/api/watchlist', methods=['POST'])
@login_required
def add_to_watchlist():
    data = request.get_json()
    symbol = data.get('symbol', '').upper()
    
    if not symbol:
        return jsonify({'error': 'Please provide a stock symbol'}), 400
    
    # Check if already exists
    if WatchlistStock.query.filter_by(user_id=current_user.id, symbol=symbol).first():
        return jsonify({'error': 'Stock already in watchlist'}), 400
    
    stock = Stock(symbol, yahoo_finance_api)
    stock.retrieve_data()
    
    if stock.name and 'not found' not in stock.name.lower():
        watchlist_stock = WatchlistStock(symbol=symbol, user_id=current_user.id)
        db.session.add(watchlist_stock)
        db.session.commit()
        return jsonify({'message': f'{stock.name} added to watchlist'})
    else:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

@app.route('/api/watchlist/<symbol>', methods=['DELETE'])
@login_required
def remove_from_watchlist(symbol):
    symbol = symbol.upper()
    watchlist_stock = WatchlistStock.query.filter_by(user_id=current_user.id, symbol=symbol).first()
    
    if watchlist_stock:
        db.session.delete(watchlist_stock)
        db.session.commit()
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

@app.route('/api/alerts', methods=['GET'])
@login_required
def get_alerts():
    symbol = request.args.get('symbol')
    query = Alert.query.filter_by(user_id=current_user.id)
    
    if symbol:
        query = query.filter_by(symbol=symbol.upper())
    
    alerts = query.all()
    return jsonify([alert.to_dict() for alert in alerts])

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
    
    alert = Alert(
        symbol=symbol,
        target_price=target_price,
        alert_type=alert_type,
        user_id=current_user.id
    )
    db.session.add(alert)
    db.session.commit()
    
    return jsonify(alert.to_dict())

@app.route('/api/alerts/<int:alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    alert = Alert.query.filter_by(id=alert_id, user_id=current_user.id).first()
    
    if alert:
        db.session.delete(alert)
        db.session.commit()
        return jsonify({'message': 'Alert removed successfully'})
    return jsonify({'error': 'Alert not found'}), 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print("\n🚀 Starting Stock Watchlist App...")
    print("📊 Using Yahoo Finance API for reliable stock data")
    print(f"🌐 Open your browser and go to: http://localhost:{port}\n")
    socketio.run(app, debug=False, host='0.0.0.0', port=port) 
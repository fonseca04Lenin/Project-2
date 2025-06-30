from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
import json
from datetime import datetime, timedelta
from stock import Stock, YahooFinanceAPI, NewsAPI
from watchlist import WatchList
from alerts import AlertManager
import uuid
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here')
socketio = SocketIO(app, cors_allowed_origins="*")

# initialize Yahoo Finance API
yahoo_finance_api = YahooFinanceAPI()

# initialize News API
news_api = NewsAPI()

#initialize watchlist
watchlist = WatchList()

#initialize alert manager
alert_manager = AlertManager()

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
        
        # Check for triggered alerts
        triggered_alerts = alert_manager.check_price_alerts(symbol, stock.price)
        alerts_data = [{
            'target_price': alert.target_price,
            'alert_type': alert.alert_type
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

@app.route('/api/watchlist', methods=['GET'])
def get_watchlist():
    stocks_data = []
    for stock in watchlist.get_watchlist():
        stock.retrieve_data()  # update with latest data
        stocks_data.append({
            'symbol': stock.symbol,
            'name': stock.name,
            'price': stock.price
        })
    return jsonify(stocks_data)

@app.route('/api/watchlist', methods=['POST'])
def add_to_watchlist():
    data = request.get_json()
    symbol = data.get('symbol', '').upper()
    
    if not symbol:
        return jsonify({'error': 'Please provide a stock symbol'}), 400
    
    # check if already exists
    if any(s.symbol == symbol for s in watchlist.get_watchlist()):
        return jsonify({'error': 'Stock already in watchlist'}), 400
    
    stock = Stock(symbol, yahoo_finance_api)
    stock.retrieve_data()
    
    if stock.name and 'not found' not in stock.name.lower():
        watchlist.add_to_watchlist(stock)
        return jsonify({'message': f'{stock.name} added to watchlist'})
    else:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

@app.route('/api/watchlist/<symbol>', methods=['DELETE'])
def remove_from_watchlist(symbol):
    symbol = symbol.upper()
    stocks = watchlist.get_watchlist()
    
    for stock in stocks:
        if stock.symbol == symbol:
            watchlist.remove_from_watchlist(stock)
            return jsonify({'message': f'{stock.name} removed from watchlist'})
    
    return jsonify({'error': 'Stock not found in watchldist'}), 404

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
def get_alerts():
    symbol = request.args.get('symbol')
    alerts = alert_manager.get_alerts(symbol)
    
    if symbol:
        return jsonify([{
            'symbol': alert.symbol,
            'target_price': alert.target_price,
            'alert_type': alert.alert_type,
            'created_at': alert.created_at.isoformat(),
            'triggered': alert.triggered
        } for alert in alerts])
    
    # If no symbol provided, return all alerts
    all_alerts = []
    for symbol_alerts in alerts.values():
        for alert in symbol_alerts:
            all_alerts.append({
                'symbol': alert.symbol,
                'target_price': alert.target_price,
                'alert_type': alert.alert_type,
                'created_at': alert.created_at.isoformat(),
                'triggered': alert.triggered
            })
    return jsonify(all_alerts)

@app.route('/api/alerts', methods=['POST'])
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
    
    alert = alert_manager.add_alert(symbol, target_price, alert_type)
    return jsonify({
        'symbol': alert.symbol,
        'target_price': alert.target_price,
        'alert_type': alert.alert_type,
        'created_at': alert.created_at.isoformat(),
        'triggered': alert.triggered
    })

@app.route('/api/alerts/<symbol>/<int:alert_index>', methods=['DELETE'])
def delete_alert(symbol, alert_index):
    symbol = symbol.upper()
    if alert_manager.remove_alert(symbol, alert_index):
        return jsonify({'message': f'Alert removed successfully'})
    return jsonify({'error': 'Alert not found'}), 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("\n🚀 Starting Stock Watchlist App...")
    print("📊 Using Yahoo Finance API for reliable stock data")
    print(f"🌐 Open your browser and go to: http://localhost:{port}\n")
    socketio.run(app, debug=False, host='0.0.0.0', port=port) 
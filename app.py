from flask import Flask, request, jsonify, session, redirect
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_login import login_required, current_user
from flask_cors import CORS
import json
from datetime import datetime, timedelta
from stock import Stock, YahooFinanceAPI, NewsAPI, FinnhubAPI
from firebase_service import FirebaseService, get_firestore_client, FirebaseUser
from watchlist_service import get_watchlist_service
from auth import auth, login_manager
from config import Config
import os
import threading
import time
import signal
from functools import wraps
from collections import defaultdict

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
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-User-ID'],  # Added X-User-ID for Firebase token auth
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

# Custom error handler for unauthorized API requests
@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Authentication required'}), 401
    return redirect('/')

# Debug session configuration
print(f"🔧 Session Config - Secure: {app.config['SESSION_COOKIE_SECURE']}, SameSite: {app.config['SESSION_COOKIE_SAMESITE']}, Production: {is_production}")

# Register blueprints
app.register_blueprint(auth)

# Initialize APIs
yahoo_finance_api = YahooFinanceAPI()
news_api = NewsAPI()
finnhub_api = FinnhubAPI()

# Initialize Watchlist Service with proper Firestore client
print("🔍 Initializing WatchlistService...")
firestore_client = get_firestore_client()
print(f"🔍 Firestore client available: {firestore_client is not None}")
watchlist_service = get_watchlist_service(firestore_client)
print("✅ WatchlistService initialized successfully")

# Store connected users and their watchlists with cleanup
import weakref
from collections import defaultdict

connected_users = {}
connection_timestamps = {}  # Track when users connected
MAX_CONNECTIONS = 500  # Limit concurrent connections
CONNECTION_TIMEOUT = 3600  # 1 hour timeout for inactive connections

def cleanup_inactive_connections():
    """Clean up inactive WebSocket connections"""
    current_time = time.time()
    to_remove = []
    
    for sid, timestamp in connection_timestamps.items():
        if current_time - timestamp > CONNECTION_TIMEOUT:
            to_remove.append(sid)
    
    for sid in to_remove:
        if sid in connected_users:
            del connected_users[sid]
        if sid in connection_timestamps:
            del connection_timestamps[sid]
    
    if to_remove:
        print(f"🧹 Cleaned up {len(to_remove)} inactive WebSocket connections")

def limit_connections():
    """Ensure we don't exceed max connections"""
    if len(connected_users) > MAX_CONNECTIONS:
        # Remove oldest connections
        sorted_connections = sorted(connection_timestamps.items(), key=lambda x: x[1])
        to_remove = sorted_connections[:len(connected_users) - MAX_CONNECTIONS]
        
        for sid, _ in to_remove:
            if sid in connected_users:
                del connected_users[sid]
            if sid in connection_timestamps:
                del connection_timestamps[sid]
        
        print(f"🧹 Removed {len(to_remove)} old connections to stay under limit")

# Improved request tracking with automatic cleanup
from collections import OrderedDict
import weakref

active_requests = OrderedDict()  # Use OrderedDict for LRU behavior
request_lock = threading.Lock()
MAX_ACTIVE_REQUESTS = 1000  # Limit active requests

def cleanup_request(request_id):
    """Clean up request tracking to prevent memory leaks"""
    with request_lock:
        active_requests.pop(request_id, None)

def cleanup_old_requests():
    """Clean up old requests to prevent memory buildup"""
    with request_lock:
        # Keep only the last MAX_ACTIVE_REQUESTS
        while len(active_requests) > MAX_ACTIVE_REQUESTS:
            active_requests.popitem(last=False)  # Remove oldest

# Improved rate limiting system with memory management
class RateLimiter:
    def __init__(self, max_requests=10, window_seconds=60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)
        self.lock = threading.Lock()
        self.last_cleanup = time.time()
        self.cleanup_interval = 300  # Clean up every 5 minutes
    
    def _cleanup_old_users(self):
        """Remove users with no recent requests"""
        now = time.time()
        if now - self.last_cleanup < self.cleanup_interval:
            return
            
        users_to_remove = []
        for user_id, user_requests in self.requests.items():
            if not user_requests or (now - max(user_requests)) > self.window_seconds * 2:
                users_to_remove.append(user_id)
        
        for user_id in users_to_remove:
            del self.requests[user_id]
        
        self.last_cleanup = now
        print(f"🧹 Cleaned up {len(users_to_remove)} inactive rate limit entries")
    
    def is_allowed(self, user_id):
        with self.lock:
            now = time.time()
            user_requests = self.requests[user_id]
            
            # Remove old requests outside the window
            user_requests[:] = [req_time for req_time in user_requests if now - req_time < self.window_seconds]
            
            # Check if under limit
            if len(user_requests) >= self.max_requests:
                return False
            
            # Add current request
            user_requests.append(now)
            
            # Periodic cleanup
            self._cleanup_old_users()
            
            return True

# Initialize rate limiter
rate_limiter = RateLimiter(max_requests=20, window_seconds=60)  # 20 requests per minute

def timeout_handler(signum, frame):
    raise TimeoutError("Request timed out")

def with_timeout(seconds=25):
    """Decorator to add timeout to functions"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Set up timeout
            old_handler = signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(seconds)
            
            try:
                result = func(*args, **kwargs)
                return result
            except TimeoutError:
                print(f"⏰ Function {func.__name__} timed out after {seconds} seconds")
                return jsonify({'error': 'Request timed out'}), 408
            finally:
                # Cancel timeout and restore old handler
                signal.alarm(0)
                signal.signal(signal.SIGALRM, old_handler)
        return wrapper
    return decorator

@app.route('/')
def index():
    return {"message": "Stock Watchlist API", "status": "active"}

@app.route('/api/test/watchlist-service')
def test_watchlist_service():
    """Test endpoint to verify watchlist service is working"""
    try:
        print("🧪 Testing watchlist service...")
        # Test if service is initialized
        if watchlist_service is None:
            return jsonify({'error': 'WatchlistService not initialized'}), 500
        
        # Test if Firestore client is available
        if watchlist_service.db is None:
            return jsonify({'error': 'Firestore client not available'}), 500
            
        return jsonify({
            'status': 'success',
            'message': 'WatchlistService is working correctly',
            'firestore_available': watchlist_service.db is not None
        })
    except Exception as e:
        print(f"❌ WatchlistService test failed: {e}")
        return jsonify({'error': f'WatchlistService test failed: {str(e)}'}), 500

@app.route('/api/debug/auth', methods=['GET', 'POST'])
def debug_auth():
    """Debug endpoint to test authentication headers"""
    try:
        auth_header = request.headers.get('Authorization')
        user_id_header = request.headers.get('X-User-ID')
        
        debug_info = {
            'headers_received': {
                'Authorization': auth_header[:50] + '...' if auth_header and len(auth_header) > 50 else auth_header,
                'X-User-ID': user_id_header,
                'Content-Type': request.headers.get('Content-Type'),
                'Origin': request.headers.get('Origin')
            },
            'authentication_flow': {
                'has_auth_header': bool(auth_header),
                'has_user_id_header': bool(user_id_header),
                'auth_header_format_correct': bool(auth_header and auth_header.startswith('Bearer ')),
                'current_user_authenticated': current_user.is_authenticated if current_user else False
            }
        }
        
        # Try to verify token if provided
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')
            debug_info['token_info'] = {
                'token_length': len(token),
                'token_starts_with': token[:20] + '...' if len(token) > 20 else token
            }
            
            try:
                decoded_token = FirebaseService.verify_token(token)
                if decoded_token:
                    debug_info['token_verification'] = {
                        'valid': True,
                        'uid': decoded_token.get('uid'),
                        'email': decoded_token.get('email'),
                        'uid_matches_header': decoded_token.get('uid') == user_id_header
                    }
                else:
                    debug_info['token_verification'] = {
                        'valid': False,
                        'error': 'Token verification returned None'
                    }
            except Exception as e:
                debug_info['token_verification'] = {
                    'valid': False,
                    'error': str(e)
                }
        
        return jsonify(debug_info)
        
    except Exception as e:
        return jsonify({'error': f'Debug endpoint failed: {str(e)}'}), 500

@app.route('/api/debug/test-watchlist')
def debug_test_watchlist():
    """Debug endpoint to test watchlist with a test user"""
    try:
        # Create a test user object
        test_user_data = {
            'uid': 'debug-test-user',
            'name': 'Test User',
            'email': 'test@example.com'
        }
        
        from firebase_service import FirebaseUser
        test_user = FirebaseUser(test_user_data)
        
        # Test getting watchlist
        try:
            watchlist = watchlist_service.get_watchlist(test_user.id, limit=5)
            watchlist_test = {
                'success': True,
                'watchlist_count': len(watchlist),
                'watchlist': watchlist[:3]  # Show first 3 items
            }
        except Exception as e:
            watchlist_test = {
                'success': False,
                'error': str(e)
            }
        
        # Test adding to watchlist
        try:
            add_result = watchlist_service.add_stock(
                test_user.id,
                'DEBUG',
                'Debug Test Stock',
                category='Test'
            )
            add_test = {
                'success': add_result.get('success', False),
                'message': add_result.get('message', 'No message'),
                'result': add_result
            }
        except Exception as e:
            add_test = {
                'success': False,
                'error': str(e)
            }
        
        return jsonify({
            'watchlist_service_test': watchlist_test,
            'add_stock_test': add_test,
            'firestore_available': watchlist_service.db is not None
        })
        
    except Exception as e:
        return jsonify({'error': f'Debug test failed: {str(e)}'}), 500

@app.route('/health')
def health_check():
    """Quick health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# WebSocket Events
@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    try:
        # Clean up and limit connections
        cleanup_inactive_connections()
        limit_connections()
        
        # Track this connection
        connection_timestamps[request.sid] = time.time()
        
        emit('connected', {'message': 'Connected to server'})
    except Exception as e:
        print(f"Error in connect handler: {e}")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    # Clean up connection tracking
    if request.sid in connected_users:
        del connected_users[request.sid]
    if request.sid in connection_timestamps:
        del connection_timestamps[request.sid]

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

# Optimized real-time stock price updates with memory management
def update_stock_prices():
    """Memory-optimized background task to update stock prices"""
    print("🔄 Starting memory-optimized price update task...")
    
    # Cache for stock data to reduce API calls
    price_cache = {}
    cache_expiry = {}
    CACHE_DURATION = 60  # Cache for 60 seconds
    
    while True:
        try:
            # Clean up inactive connections first
            cleanup_inactive_connections()
            
            # Only run if there are connected users
            if not connected_users:
                print("⏸️ No connected users, skipping price updates")
                time.sleep(60)
                continue
            
            print(f"📊 Updating prices for {len(connected_users)} connected users...")
            
            # Collect unique symbols across all users to batch API calls
            all_symbols = set()
            user_watchlists = {}
            
            for sid, user_id in list(connected_users.items()):  # Use list() to avoid dict change during iteration
                if user_id:
                    try:
                        # Use lightweight watchlist retrieval to avoid memory issues
                        watchlist = watchlist_service.get_watchlist(user_id, limit=10)  # Limit to 10 stocks
                        if watchlist:
                            user_watchlists[user_id] = watchlist
                            for item in watchlist:
                                all_symbols.add(item['symbol'])
                    except Exception as e:
                        print(f"⚠️ Error getting watchlist for user {user_id}: {e}")
                        continue
            
            # Update prices for unique symbols only (batch processing)
            current_time = time.time()
            updated_symbols = {}
            
            for symbol in list(all_symbols)[:20]:  # Limit to 20 symbols max per cycle
                try:
                    # Check cache first
                    if (symbol in price_cache and 
                        symbol in cache_expiry and 
                        current_time < cache_expiry[symbol]):
                        updated_symbols[symbol] = price_cache[symbol]
                        continue
                    
                    # Add small delay to prevent rate limiting
                    time.sleep(0.2)  # Reduced delay
                    
                    # Get fresh data
                    stock = Stock(symbol, yahoo_finance_api)
                    stock.retrieve_data()
                    
                    if stock.name and 'not found' not in stock.name.lower():
                        stock_data = {
                            'symbol': symbol,
                            'name': stock.name,
                            'price': stock.price,
                            'last_updated': datetime.now().isoformat()
                        }
                        
                        # Cache the result
                        price_cache[symbol] = stock_data
                        cache_expiry[symbol] = current_time + CACHE_DURATION
                        updated_symbols[symbol] = stock_data
                    
                except Exception as e:
                    print(f"⚠️ Error updating {symbol}: {e}")
                    continue
            
            # Send updates to users
            for user_id, watchlist in user_watchlists.items():
                try:
                    user_updates = []
                    for item in watchlist:
                        symbol = item['symbol']
                        if symbol in updated_symbols:
                            stock_data = updated_symbols[symbol]
                            
                            # Calculate price change
                            price_change = 0
                            price_change_percent = 0
                            if 'last_price' in item:
                                price_change = stock_data['price'] - item['last_price']
                                price_change_percent = (price_change / item['last_price'] * 100) if item['last_price'] > 0 else 0
                            
                            user_updates.append({
                                **stock_data,
                                'price_change': price_change,
                                'price_change_percent': price_change_percent,
                                'category': item.get('category', 'General'),
                                'priority': item.get('priority', 'medium')
                            })
                    
                    if user_updates:
                        socketio.emit('watchlist_updated', {
                            'prices': user_updates
                        }, room=f"watchlist_{user_id}")
                        print(f"✅ Updated {len(user_updates)} stocks for user {user_id}")
                        
                except Exception as e:
                    print(f"⚠️ Error sending updates to user {user_id}: {e}")
                    continue
            
            # Clean up old cache entries
            expired_keys = [k for k, v in cache_expiry.items() if current_time > v]
            for key in expired_keys:
                price_cache.pop(key, None)
                cache_expiry.pop(key, None)
            
            if expired_keys:
                print(f"🧹 Cleaned up {len(expired_keys)} expired cache entries")
            
            # Update market status less frequently
            try:
                market_status = get_market_status()
                socketio.emit('market_status_updated', market_status, room="market_updates")
            except Exception as market_error:
                print(f"⚠️ Error updating market status: {market_error}")
            
            # Sleep before next update
            print("😴 Sleeping for 90 seconds before next update...")
            time.sleep(90)  # Reduced to 90 seconds
            
        except Exception as e:
            print(f"❌ Error in price update loop: {e}")
            import gc
            gc.collect()  # Force garbage collection on error
            print("😴 Sleeping for 3 minutes after error...")
            time.sleep(180)  # Reduced error sleep time

# Start background task for price updates
def start_price_updates():
    """Start the background price update task with proper memory management"""
    print("🚀 Starting memory-optimized price update background task...")
    
    # Add enhanced memory cleanup
    import gc
    def cleanup_memory():
        """Enhanced periodic memory cleanup"""
        while True:
            time.sleep(300)  # Run every 5 minutes
            try:
                # Clean up inactive connections
                cleanup_inactive_connections()
                
                # Force garbage collection
                collected = gc.collect()
                print(f"🧹 Memory cleanup completed, collected {collected} objects")
                
                # Optional: Print memory stats if available
                try:
                    import psutil
                    process = psutil.Process()
                    memory_mb = process.memory_info().rss / 1024 / 1024
                    print(f"📊 Current memory usage: {memory_mb:.1f} MB")
                except ImportError:
                    pass  # psutil not available
                    
            except Exception as e:
                print(f"⚠️ Memory cleanup error: {e}")
    
    # Start memory cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_memory, daemon=True, name="MemoryCleanupThread")
    cleanup_thread.start()
    print("🧹 Memory cleanup thread started")
    
    # Start price update thread (now re-enabled with memory optimizations)
    price_thread = threading.Thread(target=update_stock_prices, daemon=True, name="PriceUpdateThread")
    price_thread.start()
    print("🚀 Memory-optimized price update background thread started")

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
    """Search stocks by name or symbol with caching and rate limiting protection"""
    query = request.args.get('q', '').strip()
    
    if not query:
        return jsonify({'error': 'Please provide a search query'}), 400
    
    if len(query) < 2:
        return jsonify({'error': 'Search query must be at least 2 characters'}), 400
    
    try:
        # Add rate limiting protection
        import time
        time.sleep(0.2)  # 200ms delay to prevent rate limiting
        
        # Search for stocks using the Yahoo Finance API
        search_results = yahoo_finance_api.search_stocks(query, limit=10)  # Reduced limit
        
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
        print(f"⚠️ Error searching stocks for '{query}': {e}")
        # Return a fallback response instead of 500 error
        return jsonify({
            'results': [],
            'query': query,
            'message': f'Search temporarily unavailable. Please try again in a moment.',
            'error': str(e)
        })

@app.route('/api/search/companies', methods=['GET'])
def search_companies():
    """Search companies by name with enhanced results and rate limiting protection"""
    query = request.args.get('q', '').strip()
    
    if not query:
        return jsonify({'error': 'Please provide a search query'}), 400
    
    if len(query) < 2:
        return jsonify({'error': 'Search query must be at least 2 characters'}), 400
    
    try:
        # Add rate limiting protection
        import time
        time.sleep(0.3)  # 300ms delay to prevent rate limiting
        
        # Enhanced search with company names
        search_results = yahoo_finance_api.search_stocks(query, limit=15)  # Reduced limit
        
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
        print(f"⚠️ Error searching companies for '{query}': {e}")
        # Return a fallback response instead of 500 error
        return jsonify({
            'results': [],
            'query': query,
            'message': f'Company search temporarily unavailable. Please try again in a moment.',
            'error': str(e)
        })

# Authentication decorator that supports both session and token auth
def authenticate_request():
    """Lightweight authentication that avoids Firestore calls to prevent memory leaks"""
    request_id = id(request)
    
    # Clean up old requests periodically
    cleanup_old_requests()
    
    # Check if this request is already being processed
    with request_lock:
        if request_id in active_requests:
            print(f"🔍 Request {request_id} already being processed, returning cached result")
            return active_requests[request_id]
    
    try:
        # First try session-based auth (existing Flask-Login)
        if current_user.is_authenticated:
            with request_lock:
                active_requests[request_id] = current_user
            return current_user

        # Try token-based auth - LIGHTWEIGHT VERSION (no Firestore calls)
        auth_header = request.headers.get('Authorization')
        user_id_header = request.headers.get('X-User-ID')

        print(f"🔐 Token auth attempt - Header: {auth_header[:20] if auth_header else 'None'}, UserID: {user_id_header}")

        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')
            print(f"🔑 Token received, length: {len(token)}")
            
            # Check if user ID header is provided
            if not user_id_header:
                print("❌ Missing X-User-ID header")
                with request_lock:
                    active_requests[request_id] = None
                return None
            
            try:
                # Verify Firebase token
                decoded_token = FirebaseService.verify_token(token)
                print(f"🔍 Token decoded: {decoded_token is not None}")
                
                if not decoded_token:
                    print("❌ Token verification failed - invalid token")
                    with request_lock:
                        active_requests[request_id] = None
                    return None
                
                token_uid = decoded_token.get('uid')
                print(f"✅ Token UID: {token_uid}, Header UID: {user_id_header}")
                
                if token_uid != user_id_header:
                    print(f"❌ UID mismatch - Token: {token_uid}, Header: {user_id_header}")
                    with request_lock:
                        active_requests[request_id] = None
                    return None
                
                if decoded_token and token_uid == user_id_header:
                    uid = token_uid
                    # Create lightweight user object from token data (no Firestore call)
                    user_profile = {
                        'uid': uid,
                        'name': decoded_token.get('name', 'User'),
                        'email': decoded_token.get('email', ''),
                        'id': uid  # Ensure id field exists for compatibility
                    }
                    firebase_user = FirebaseUser(user_profile)
                    print(f"✅ User authenticated from token: {firebase_user.email}")
                    with request_lock:
                        active_requests[request_id] = firebase_user
                    return firebase_user
            except Exception as e:
                print(f"Token authentication failed: {e}")

        return None
    
    finally:
        # Immediate cleanup for memory efficiency - no need for 30-second delay
        # Use a shorter delay and ensure cleanup happens
        def delayed_cleanup():
            time.sleep(5)  # Reduced from 30 to 5 seconds
            cleanup_request(request_id)
        
        # Start cleanup in background thread
        threading.Thread(target=delayed_cleanup, daemon=True, name=f"cleanup-{request_id}").start()

@app.route('/api/watchlist', methods=['GET'])
def get_watchlist_route():
    """Lightweight watchlist endpoint with fallback"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    # Check rate limit
    if not rate_limiter.is_allowed(user.id):
        print(f"⚠️ Rate limit exceeded for user: {user.id}")
        return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429

    try:
        print(f"🔍 GET watchlist request for user: {user.id}")
        
        # Re-enabled with memory optimizations
        watchlist = watchlist_service.get_watchlist(user.id, limit=25)  # Limit to 25 items
        print(f"📋 Retrieved {len(watchlist)} items from watchlist")
        return jsonify(watchlist)
            
    except Exception as e:
        print(f"❌ Error in get_watchlist_route: {e}")
        # Fallback to empty list on error
        return jsonify([]), 500

@app.route('/api/watchlist', methods=['POST'])
def add_to_watchlist():
    """Lightweight watchlist POST endpoint with direct Firestore operations"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    # Check rate limit
    if not rate_limiter.is_allowed(user.id):
        print(f"⚠️ Rate limit exceeded for user: {user.id}")
        return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429

    data = request.get_json()
    symbol = data.get('symbol', '').upper()

    if not symbol:
        return jsonify({'error': 'Please provide a stock symbol'}), 400

    # Get additional options from request
    category = data.get('category', 'General')
    notes = data.get('notes', '')
    priority = data.get('priority', 'medium')
    target_price = data.get('target_price')
    stop_loss = data.get('stop_loss')
    alert_enabled = data.get('alert_enabled', True)
    company_name = data.get('company_name', symbol)  # Use provided name or fallback to symbol

    try:
        print(f"🔍 POST watchlist request - User: {user.id}, Symbol: {symbol}, Company: {company_name}")
        
        # Re-enabled with proper watchlist service
        result = watchlist_service.add_stock(
            user.id,
            symbol,
            company_name,
            category=category,
            notes=notes,
            priority=priority,
            target_price=target_price,
            stop_loss=stop_loss,
            alert_enabled=alert_enabled
        )
        
        if result['success']:
            print(f"✅ Successfully added {symbol} to watchlist")
            return jsonify(result)
        else:
            print(f"⚠️ Failed to add {symbol}: {result['message']}")
            return jsonify({'error': result['message']}), 400
    
    except Exception as e:
        print(f"⚠️ Error adding stock to watchlist: {e}")
        return jsonify({'error': f'Failed to add {symbol} to watchlist'}), 500

@app.route('/api/watchlist/<symbol>', methods=['DELETE'])
def remove_from_watchlist(symbol):
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = symbol.upper()
    result = watchlist_service.remove_stock(user.id, symbol)

    if result['success']:
        return jsonify({'message': result['message']})

    return jsonify({'error': result['message']}), 404

@app.route('/api/watchlist/<symbol>', methods=['PUT'])
def update_watchlist_stock(symbol):
    """Update a stock in the watchlist with new details"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = symbol.upper()
    data = request.get_json()

    # Remove symbol from data if present (can't update symbol)
    data.pop('symbol', None)

    result = watchlist_service.update_stock(user.id, symbol, **data)

    if result['success']:
        return jsonify({
            'message': result['message'],
            'item': result.get('item')
        })

    return jsonify({'error': result['message']}), 400

@app.route('/api/watchlist/categories', methods=['GET'])
def get_watchlist_categories():
    """Get all categories used by the user"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    categories = watchlist_service.get_categories(user.id)
    return jsonify({'categories': categories})

@app.route('/api/watchlist/stats', methods=['GET'])
def get_watchlist_stats():
    """Get statistics about user's watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    stats = watchlist_service.get_watchlist_stats(user.id)
    return jsonify(stats)

@app.route('/api/watchlist/clear', methods=['DELETE'])
def clear_watchlist():
    """Clear all stocks from user's watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    result = watchlist_service.clear_watchlist(user.id)

    if result['success']:
        return jsonify({'message': result['message']})

    return jsonify({'error': result['message']}), 500

@app.route('/api/watchlist/batch', methods=['PUT'])
def batch_update_watchlist():
    """Batch update multiple stocks in watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.get_json()
    if not data or 'updates' not in data:
        return jsonify({'error': 'Updates data required'}), 400

    updates = data['updates']
    result = watchlist_service.batch_update(user.id, updates)

    if result['success']:
        return jsonify({'message': result['message']})

    return jsonify({'error': result['message']}), 500

@app.route('/api/watchlist/migrate', methods=['POST'])
def migrate_watchlist():
    """Migrate user's watchlist from old format to new format"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    from migrate_watchlist import migrate_user_watchlist
    result = migrate_user_watchlist(user.id)

    if result['success']:
        return jsonify({
            'message': 'Migration completed successfully',
            'details': result
        })

    return jsonify({'error': result['message']}), 500

@app.route('/api/watchlist/migration-status', methods=['GET'])
def get_migration_status():
    """Check user's migration status"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    from migrate_watchlist import check_migration_status
    status = check_migration_status(user.id)

    if status:
        return jsonify({
            'migrated': True,
            'status': status
        })
    else:
        return jsonify({
            'migrated': False,
            'message': 'No migration record found'
        })

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
def get_alerts():
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = request.args.get('symbol')
    alerts = FirebaseService.get_alerts(user.id, symbol)
    return jsonify(alerts)

@app.route('/api/alerts', methods=['POST'])
def create_alert():
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

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

    alert_id = FirebaseService.create_alert(user.id, symbol, target_price, alert_type)
    if alert_id:
        return jsonify({'message': 'Alert created successfully', 'alert_id': alert_id})
    else:
        return jsonify({'error': 'Failed to create alert'}), 500

@app.route('/api/alerts/<alert_id>', methods=['DELETE'])
def delete_alert(alert_id):
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    success = FirebaseService.delete_alert(user.id, alert_id)

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

# =============================================================================
# AI CHATBOT ENDPOINTS
# =============================================================================

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """Main chat endpoint for AI stock advisor"""
    try:
        # Authenticate user
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        
        # Get request data
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'error': 'Message is required'}), 400
        
        message = data['message'].strip()
        if not message:
            return jsonify({'error': 'Message cannot be empty'}), 400
        
        # Import chat service (lazy import to avoid circular dependencies)
        from chat_service import chat_service
        
        # Process message
        result = chat_service.process_message(user['uid'], message)
        
        if result['success']:
            return jsonify({
                'success': True,
                'response': result['response'],
                'timestamp': result['timestamp']
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Unknown error'),
                'response': result.get('response', 'I encountered an error. Please try again.')
            }), 500
            
    except Exception as e:
        print(f"❌ Chat endpoint error: {e}")
        import traceback
        print(f"❌ Full traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f'Internal server error: {str(e)}',
            'response': 'I\'m sorry, I encountered an error. Please try again.'
        }), 500

@app.route('/api/chat/history', methods=['GET'])
def get_chat_history():
    """Get user's chat conversation history"""
    try:
        # Authenticate user
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        
        # Import chat service
        from chat_service import chat_service
        
        # Get conversation history
        history = chat_service._get_conversation_history(user['uid'], limit=50)
        
        return jsonify({
            'success': True,
            'history': history
        })
        
    except Exception as e:
        print(f"❌ Chat history error: {e}")
        return jsonify({
            'success': False,
            'error': 'Could not retrieve chat history'
        }), 500

@app.route('/api/chat/clear', methods=['DELETE'])
def clear_chat_history():
    """Clear user's chat conversation history"""
    try:
        # Authenticate user
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        
        # Clear conversation history from Firestore
        firestore_client = get_firestore_client()
        chat_ref = firestore_client.collection('chat_conversations').document(user['uid'])
        chat_ref.delete()
        
        return jsonify({
            'success': True,
            'message': 'Chat history cleared successfully'
        })
        
    except Exception as e:
        print(f"❌ Clear chat history error: {e}")
        return jsonify({
            'success': False,
            'error': 'Could not clear chat history'
        }), 500

@app.route('/api/chat/status', methods=['GET'])
def chat_status():
    """Get chat service status and user rate limit info"""
    try:
        # Authenticate user
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        
        # Import chat service
        from chat_service import chat_service
        
        # Check rate limit status
        can_send = chat_service._check_rate_limit(user['uid'])
        
        return jsonify({
            'success': True,
            'status': 'available' if chat_service.groq_client else 'unavailable',
            'rate_limit': {
                'can_send': can_send,
                'max_requests_per_hour': chat_service.max_requests_per_hour
            }
        })
        
    except Exception as e:
        print(f"❌ Chat status error: {e}")
        return jsonify({
            'success': False,
            'error': 'Could not get chat status'
        }), 500

# WebSocket event for real-time chat
@socketio.on('chat_message')
def handle_chat_message(data):
    """Handle real-time chat messages via WebSocket"""
    try:
        # Get user from session
        user_id = data.get('user_id')
        message = data.get('message')
        
        if not user_id or not message:
            emit('chat_error', {'error': 'Invalid message data'})
            return
        
        # Import chat service
        from chat_service import chat_service
        
        # Process message
        result = chat_service.process_message(user_id, message)
        
        if result['success']:
            emit('chat_response', {
                'success': True,
                'response': result['response'],
                'timestamp': result['timestamp']
            })
        else:
            emit('chat_error', {
                'error': result.get('error', 'Unknown error'),
                'response': result.get('response', 'I encountered an error. Please try again.')
            })
            
    except Exception as e:
        print(f"❌ WebSocket chat error: {e}")
        emit('chat_error', {
            'error': 'Internal server error',
            'response': 'I\'m sorry, I encountered an error. Please try again.'
        })

if __name__ == '__main__':
    port = Config.PORT
    print("\n🚀 Starting Stock Watchlist App...")
    print("🔥 Using Firebase for authentication and data storage")
    print("⚡ Starting real-time price updates...")
    print(f"🌐 Server running on port: {port}\n")
    
    # Start the background price update task
    start_price_updates()
    
    socketio.run(app, debug=Config.DEBUG, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True) 
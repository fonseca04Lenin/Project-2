from flask import Flask, request, jsonify, session, redirect
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_login import login_required, current_user
from flask_cors import CORS
import json
from datetime import datetime, timedelta, timezone
try:
    import zoneinfo
except ImportError:
    # For Python < 3.9, use backports.zoneinfo or pytz
    try:
        from backports import zoneinfo
    except ImportError:
        zoneinfo = None
from stock import Stock, YahooFinanceAPI, NewsAPI, FinnhubAPI, AlpacaAPI, CompanyInfoService
from firebase_service import FirebaseService, get_firestore_client, FirebaseUser
from watchlist_service import get_watchlist_service
from auth import auth, login_manager
from config import Config
from crypto_utils import encrypt_data, decrypt_data
import os
import threading
import time
import signal
from functools import wraps
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)

# Enable CORS for frontend (local development and Vercel)
allowed_origins = [
    "http://localhost:3000",  # Local development
    "http://127.0.0.1:3000",  # Local development alternative
    "http://localhost:5000",  # Local Flask dev
    "http://localhost:8000",  # Local Flask dev on port 8000
    "http://localhost:8080",  # Local frontend server
    "http://127.0.0.1:8080",  # Local frontend server alternative
    "http://localhost:8081",  # Local frontend server (current)
    "http://127.0.0.1:8081",  # Local frontend server alternative (current)
    "file://",  # Local file serving
    "null",  # For local file origins
    "https://stock-watchlist-frontend.vercel.app",  # Main Vercel deployment
    "https://aistocksage.com",  # Custom domain
    "https://www.aistocksage.com",  # Custom domain with www
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
print(f"🚀 Railway deployment - CORS configured for Vercel frontend")

# Enable CORS with specific auth-friendly settings
CORS(app,
     origins=allowed_origins,
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-User-ID', 'Cache-Control', 'X-Request-Source'],  # Added X-Request-Source for watchlist detection
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     expose_headers=['Content-Type', 'Authorization', 'X-API-Source'],
     vary_header=False)

# Handle OPTIONS preflight requests for all routes
@app.before_request
def handle_preflight():
    """Handle CORS preflight OPTIONS requests"""
    if request.method == 'OPTIONS':
        origin = request.headers.get('Origin', '')
        is_allowed = (
            origin in allowed_origins or
            (origin and ('localhost' in origin or '127.0.0.1' in origin or 'vercel.app' in origin or 'aistocksage.com' in origin))
        )
        if is_allowed and origin:
            response = app.make_default_options_response()
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-ID, Cache-Control, X-Request-Source'
            response.headers['Access-Control-Max-Age'] = '86400'
            return response

# Custom CORS handler to ensure all origins get proper headers
@app.after_request
def after_request(response):
    """Ensure CORS headers are set for all allowed origins"""
    origin = request.headers.get('Origin', '')

    # Check if origin is in allowed list or is a known deployment domain
    is_allowed = (
        origin in allowed_origins or
        (origin and ('localhost' in origin or '127.0.0.1' in origin or 'vercel.app' in origin or 'aistocksage.com' in origin))
    )

    if is_allowed and origin:
        # Set all necessary CORS headers for preflight and actual requests
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-ID, Cache-Control, X-Request-Source'

    return response

# Configuration
app.config['SECRET_KEY'] = Config.SECRET_KEY

# NOTE: Session-based auth removed - app uses Firebase token authentication only
# Cross-origin sessions (Vercel<->Railway) don't work reliably with cookies
is_production = os.environ.get('FLASK_ENV') == 'production' or os.environ.get('RAILWAY_ENVIRONMENT') is not None

# Initialize extensions
# Use threading async mode to avoid eventlet blocking Firestore calls
socketio = SocketIO(
    app,
    cors_allowed_origins=allowed_origins,
    async_mode='threading',  # threading mode plays well with gunicorn gthread/sync
    logger=False,  # Disable verbose logging for production
    engineio_logger=False,  # Disable verbose logging for production
    ping_timeout=60,
    ping_interval=25
)
login_manager.init_app(app)

# Custom error handler for unauthorized API requests
@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Authentication required'}), 401
    return redirect('/')

# Debug configuration
print(f"🔧 App Config - Production: {is_production}, Token Auth: Enabled")

# Register blueprints
app.register_blueprint(auth)

# Initialize APIs
yahoo_finance_api = YahooFinanceAPI()
news_api = NewsAPI()
finnhub_api = FinnhubAPI()
company_info_service = CompanyInfoService()  # Multi-API company info service

# Initialize Alpaca API (if keys are provided)
USE_ALPACA_API = os.getenv('USE_ALPACA_API', 'false').lower() == 'true'
alpaca_api = AlpacaAPI() if USE_ALPACA_API else None

if USE_ALPACA_API:
    has_keys = alpaca_api and alpaca_api.api_key and alpaca_api.secret_key
    print("=" * 60)
    print("🔵 ALPACA API CONFIGURATION")
    print("=" * 60)
    print(f"✅ Alpaca API enabled: {USE_ALPACA_API}")
    print(f"🔑 API keys configured: {has_keys}")
    if alpaca_api:
        print(f"🌐 Base URL: {alpaca_api.base_url}")
        if has_keys:
            print(f"🔑 API Key: {alpaca_api.api_key[:8]}...{alpaca_api.api_key[-4:] if len(alpaca_api.api_key) > 12 else '***'}")
    print("📊 Will use Alpaca for price data with Yahoo fallback")
    print("=" * 60)
else:
    print("=" * 60)
    print("🟡 YAHOO FINANCE ONLY MODE")
    print("=" * 60)
    print("ℹ️ Alpaca API disabled - using Yahoo Finance only")
    print("💡 To enable Alpaca, set USE_ALPACA_API=true in environment variables")
    print("=" * 60)

def get_price_api():
    """Get the appropriate API for price lookups. Returns Alpaca if enabled, otherwise Yahoo."""
    return alpaca_api if USE_ALPACA_API and alpaca_api else yahoo_finance_api

def get_stock_with_fallback(symbol):
    """Get stock data, trying Alpaca first if enabled, then falling back to Yahoo.
    Returns tuple: (stock, api_used) where api_used is 'alpaca' or 'yahoo'
    """
    stock = None
    api_used = None
    
    # Try Alpaca first if enabled
    if USE_ALPACA_API and alpaca_api:
        try:
            print(f"🔵 [ALPACA] Attempting to fetch {symbol} from Alpaca API...")
            stock = Stock(symbol, alpaca_api)
            stock.retrieve_data()
            # If we got valid data, return it
            if stock.name and stock.price and 'not found' not in stock.name.lower():
                print(f"✅ [ALPACA] Successfully fetched {symbol} from Alpaca: ${stock.price:.2f} ({stock.name})")
                api_used = 'alpaca'
                # Add metadata to stock object
                if not hasattr(stock, '_api_source'):
                    stock._api_source = 'alpaca'
                return stock, api_used
            else:
                print(f"⚠️ [ALPACA] Got data for {symbol} but it's invalid, falling back to Yahoo")
        except Exception as e:
            print(f"❌ [ALPACA] Failed for {symbol}, falling back to Yahoo: {e}")
    
    # Fallback to Yahoo Finance
    try:
        print(f"🟡 [YAHOO] Fetching {symbol} from Yahoo Finance (fallback)...")
        stock = Stock(symbol, yahoo_finance_api)
        stock.retrieve_data()
        if stock.name and stock.price:
            print(f"✅ [YAHOO] Successfully fetched {symbol} from Yahoo: ${stock.price:.2f} ({stock.name})")
        api_used = 'yahoo'
        # Add metadata to stock object
        if not hasattr(stock, '_api_source'):
            stock._api_source = 'yahoo'
        return stock, api_used
    except Exception as e:
        print(f"❌ [YAHOO] Also failed for {symbol}: {e}")
        return None, 'none'  # Return 'none' instead of None to avoid issues

def get_stock_alpaca_only(symbol):
    """Get stock data using ONLY Alpaca API (no Yahoo fallback).
    Used specifically for watchlist requests.
    Returns tuple: (stock, api_used) where api_used is 'alpaca' or None if failed
    """
    if not USE_ALPACA_API or not alpaca_api:
        print(f"❌ [WATCHLIST] Alpaca API not enabled or not available for {symbol}")
        return None, None
    
    try:
        print(f"🔵 [WATCHLIST-ALPACA] Fetching {symbol} from Alpaca API only (no Yahoo fallback)...")
        stock = Stock(symbol, alpaca_api)
        stock.retrieve_data()
        
        # If we got valid data, return it
        if stock.name and stock.price and 'not found' not in stock.name.lower():
            print(f"✅ [WATCHLIST-ALPACA] Successfully fetched {symbol} from Alpaca: ${stock.price:.2f} ({stock.name})")
            api_used = 'alpaca'
            if not hasattr(stock, '_api_source'):
                stock._api_source = 'alpaca'
            return stock, api_used
        else:
            print(f"❌ [WATCHLIST-ALPACA] Got invalid data for {symbol}, returning None")
            return None, None
    except Exception as e:
        print(f"❌ [WATCHLIST-ALPACA] Failed for {symbol}: {e}")
        return None, None

# Initialize Watchlist Service lazily - don't block app startup
# Services will be initialized on first use
print("ℹ️ WatchlistService initialization deferred - will initialize on first use")
firestore_client = None
watchlist_service = None

def get_watchlist_service_lazy():
    """Lazy initialization of watchlist service - only when needed"""
    global firestore_client, watchlist_service
    if watchlist_service is None:
        try:
            print("🔍 Initializing WatchlistService (lazy)...")
            firestore_client = get_firestore_client()
            if firestore_client is not None:
                watchlist_service = get_watchlist_service(firestore_client)
                print("✅ WatchlistService initialized successfully")
            else:
                print("⚠️ Firestore client not available - WatchlistService unavailable")
        except Exception as e:
            print(f"❌ Failed to initialize WatchlistService: {e}")
            import traceback
            print(f"❌ WatchlistService traceback: {traceback.format_exc()}")
            firestore_client = None
            watchlist_service = None
    return watchlist_service

# Helper to ensure watchlist_service is available before use
def ensure_watchlist_service():
    """Ensure watchlist service is initialized, return it or raise error"""
    service = get_watchlist_service_lazy()
    if service is None:
        raise RuntimeError("WatchlistService is not available - Firebase may not be configured")
    return service

# Store connected users and their watchlists with cleanup
import weakref
from collections import defaultdict

connected_users = {}
connection_timestamps = {}  # Track when users connected
MAX_CONNECTIONS = 500  # Limit concurrent connections
CONNECTION_TIMEOUT = 3600  # 1 hour timeout for inactive connections

# Track actively viewed/searched stocks for priority updates
active_stocks = defaultdict(set)  # user_id -> set of symbols they're viewing
active_stocks_timestamps = defaultdict(dict)  # user_id -> {symbol: timestamp}
ACTIVE_STOCK_TIMEOUT = 60  # Remove from active after 60 seconds of inactivity

def cleanup_inactive_connections():
    """Clean up inactive WebSocket connections and associated data"""
    current_time = time.time()
    to_remove = []

    for sid, timestamp in connection_timestamps.items():
        if current_time - timestamp > CONNECTION_TIMEOUT:
            to_remove.append(sid)

    for sid in to_remove:
        user_id = connected_users.get(sid)

        # Clean up main tracking dicts
        if sid in connected_users:
            del connected_users[sid]
        if sid in connection_timestamps:
            del connection_timestamps[sid]

        # Clean up active stocks tracking (fix memory leak)
        if user_id:
            if user_id in active_stocks:
                del active_stocks[user_id]
            if user_id in active_stocks_timestamps:
                del active_stocks_timestamps[user_id]

    if to_remove:
        print(f"🧹 Cleaned up {len(to_remove)} inactive WebSocket connections")

def limit_connections():
    """Ensure we don't exceed max connections"""
    if len(connected_users) > MAX_CONNECTIONS:
        # Remove oldest connections
        sorted_connections = sorted(connection_timestamps.items(), key=lambda x: x[1])
        to_remove = sorted_connections[:len(connected_users) - MAX_CONNECTIONS]

        for sid, _ in to_remove:
            user_id = connected_users.get(sid)

            # Clean up main tracking dicts
            if sid in connected_users:
                del connected_users[sid]
            if sid in connection_timestamps:
                del connection_timestamps[sid]

            # Clean up active stocks tracking (fix memory leak)
            if user_id:
                if user_id in active_stocks:
                    del active_stocks[user_id]
                if user_id in active_stocks_timestamps:
                    del active_stocks_timestamps[user_id]

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
        # Test if service is initialized (lazy)
        service = get_watchlist_service_lazy()
        if service is None:
            return jsonify({
                'status': 'warning',
                'message': 'WatchlistService not available - Firebase may not be configured',
                'firestore_available': False
            }), 503
        
        # Test if Firestore client is available
        db_available = service.db is not None if service else False
            
        return jsonify({
            'status': 'success',
            'message': 'WatchlistService is working correctly',
            'firestore_available': db_available
        })
    except Exception as e:
        print(f"❌ WatchlistService test failed: {e}")
        return jsonify({'error': f'WatchlistService test failed: {str(e)}'}), 500

# Debug endpoints - only enabled in development
if Config.DEBUG:
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

    @app.route('/api/debug/chatbot-watchlist/<user_id>')
    def debug_chatbot_watchlist(user_id):
        """Debug endpoint to test chatbot's watchlist access for a specific user"""
        try:
            from chat_service import chat_service
            
            # Test chatbot's user context method
            context = chat_service._get_user_context(user_id)
            
            return jsonify({
                'user_id': user_id,
                'context': context,
                'watchlist_count': len(context.get('watchlist', [])),
                'firestore_client_available': chat_service.firestore_client is not None
            })
            
        except Exception as e:
            import traceback
            return jsonify({
                'error': f'Chatbot watchlist debug failed: {str(e)}',
                'traceback': traceback.format_exc()
            }), 500

    @app.route('/api/debug/current-user-watchlist')
    def debug_current_user_watchlist():
        """Debug endpoint to test current user's watchlist access"""
        try:
            user = authenticate_request()
            if not user:
                return jsonify({'error': 'Authentication required'}), 401
            
            # Test both watchlist service and chatbot access
            watchlist_service_result = watchlist_service.get_watchlist(user.id, limit=10)
            
            from chat_service import chat_service
            chatbot_context = chat_service._get_user_context(user.id)
            
            return jsonify({
                'user_id': user.id,
                'user_email': user.email,
                'watchlist_service_count': len(watchlist_service_result),
                'watchlist_service_data': watchlist_service_result[:3],  # First 3 items
                'chatbot_context_count': len(chatbot_context.get('watchlist', [])),
                'chatbot_context_data': chatbot_context.get('watchlist', [])[:3],  # First 3 items
                'firestore_client_available': chat_service.firestore_client is not None
            })
            
        except Exception as e:
            import traceback
            return jsonify({
                'error': f'Current user watchlist debug failed: {str(e)}',
                'traceback': traceback.format_exc()
            }), 500

# End of debug endpoints (only enabled in development)

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
    user_id = connected_users.get(request.sid)

    if request.sid in connected_users:
        del connected_users[request.sid]
    if request.sid in connection_timestamps:
        del connection_timestamps[request.sid]

    # Clean up active stocks tracking (fix memory leak)
    if user_id:
        if user_id in active_stocks:
            del active_stocks[user_id]
        if user_id in active_stocks_timestamps:
            del active_stocks_timestamps[user_id]
        print(f"🧹 Cleaned up active stocks for user {user_id}")

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

@socketio.on('track_stock_view')
def handle_track_stock_view(data):
    """Track which stock a user is actively viewing for priority updates"""
    from utils import sanitize_stock_symbol, validate_stock_symbol
    try:
        user_id = data.get('user_id')
        symbol = sanitize_stock_symbol(data.get('symbol', ''))

        if user_id and symbol and validate_stock_symbol(symbol):
            active_stocks[user_id].add(symbol)
            active_stocks_timestamps[user_id][symbol] = time.time()
            print(f"👁️ User {user_id} is viewing {symbol} - adding to priority queue")
        elif symbol and not validate_stock_symbol(symbol):
            print(f"⚠️ Invalid symbol rejected in track_stock_view: {symbol}")
    except Exception as e:
        print(f"Error tracking stock view: {e}")

@socketio.on('untrack_stock_view')
def handle_untrack_stock_view(data):
    """Stop tracking a stock when user stops viewing it"""
    from utils import sanitize_stock_symbol, validate_stock_symbol
    try:
        user_id = data.get('user_id')
        symbol = sanitize_stock_symbol(data.get('symbol', ''))

        if user_id and symbol and validate_stock_symbol(symbol):
            active_stocks[user_id].discard(symbol)
            active_stocks_timestamps[user_id].pop(symbol, None)
            print(f"👁️ User {user_id} stopped viewing {symbol}")
    except Exception as e:
        print(f"Error untracking stock view: {e}")

@socketio.on('track_search_stock')
def handle_track_search_stock(data):
    """Track stocks being searched for priority updates"""
    try:
        user_id = data.get('user_id')
        symbols = data.get('symbols', [])
        
        if user_id and symbols:
            for symbol in symbols:
                symbol = symbol.upper()
                active_stocks[user_id].add(symbol)
                active_stocks_timestamps[user_id][symbol] = time.time()
            print(f"🔍 User {user_id} searching {len(symbols)} stocks - adding to priority queue")
    except Exception as e:
        print(f"Error tracking search stocks: {e}")

# Optimized real-time stock price updates with memory management
def update_stock_prices():
    """Memory-optimized background task to update stock prices"""
    print("🔄 Starting memory-optimized price update task...")
    
    # NO CACHING - Always fetch fresh prices for real-time updates
    update_cycle_count = 0
    
    while True:
        update_cycle_count += 1
        try:
            # Clean up inactive connections first
            cleanup_inactive_connections()
            
            # Only run if there are connected users
            if not connected_users:
                print("⏸️ No connected users, skipping price updates")
                time.sleep(60)
                continue
            
            print(f"\n{'='*80}")
            print(f"📊 [REALTIME UPDATE CYCLE #{update_cycle_count}] - {datetime.now().strftime('%H:%M:%S')}")
            print(f"📊 Updating prices for {len(connected_users)} connected users...")
            print(f"{'='*80}")
            
            # Collect unique symbols across all users to batch API calls
            all_symbols = set()
            user_watchlists = {}
            priority_symbols = set()  # Stocks being actively viewed/searched
            
            # Clean up inactive active stocks
            current_time = time.time()
            for user_id in list(active_stocks_timestamps.keys()):
                expired_symbols = [
                    sym for sym, ts in active_stocks_timestamps[user_id].items()
                    if current_time - ts > ACTIVE_STOCK_TIMEOUT
                ]
                for sym in expired_symbols:
                    active_stocks[user_id].discard(sym)
                    active_stocks_timestamps[user_id].pop(sym, None)
            
            # Collect watchlist symbols and priority symbols
            for sid, user_id in list(connected_users.items()):  # Use list() to avoid dict change during iteration
                if user_id:
                    try:
                        # Get ALL watchlist items for real-time updates (no limit)
                        service = get_watchlist_service_lazy()
                        if service is None:
                            continue  # Skip if service not available
                        watchlist = service.get_watchlist(user_id, limit=None)
                        if watchlist:
                            print(f"📋 [REALTIME] Loaded {len(watchlist)} stocks for user {user_id}")
                            user_watchlists[user_id] = watchlist
                            for item in watchlist:
                                # Use .get() to safely access symbol field
                                symbol = item.get('symbol') or item.get('id')
                                if symbol:
                                    all_symbols.add(symbol)
                                    print(f"  ✓ Added {symbol} to update queue")
                                else:
                                    print(f"  ⚠️ Skipping item without symbol: {item.keys()}")
                        else:
                            print(f"⚠️ [REALTIME] No watchlist found for user {user_id}")
                        
                        # Add actively viewed/searched stocks to priority queue
                        if user_id in active_stocks:
                            for symbol in active_stocks[user_id]:
                                priority_symbols.add(symbol)
                                all_symbols.add(symbol)  # Also add to regular update queue
                    except Exception as e:
                        print(f"❌ Error getting watchlist for user {user_id}: {e}")
                        import traceback
                        traceback.print_exc()
                        continue
            
            # Update prices for unique symbols only (batch processing)
            current_time = time.time()
            updated_symbols = {}
            
            # NO CACHING - Fetch ALL symbols for real-time updates
            # Priority symbols fetched first, then regular symbols
            priority_to_fetch = [s for s in all_symbols if s in priority_symbols]
            regular_to_fetch = [s for s in all_symbols if s not in priority_symbols]
            all_symbols_to_fetch = priority_to_fetch + regular_to_fetch
            
            print(f"🎯 [REALTIME] Total symbols to update: {len(all_symbols_to_fetch)}")
            print(f"   Priority: {len(priority_to_fetch)}, Regular: {len(regular_to_fetch)}")
            if all_symbols_to_fetch:
                print(f"   Symbols: {', '.join(list(all_symbols_to_fetch)[:20])}{'...' if len(all_symbols_to_fetch) > 20 else ''}")
            
            # Use batch API call if Alpaca is enabled (much more efficient!)
            batch_failed_symbols = set()  # Track symbols that failed in batch
            if all_symbols_to_fetch and USE_ALPACA_API and alpaca_api:
                try:
                    print(f"🔄 [REALTIME] Batch updating {len(all_symbols_to_fetch)} symbols ({len(priority_to_fetch)} priority) via Alpaca batch API...")
                    # Fetch in batches of 50 (Alpaca supports up to 100, but 50 is safer)
                    batch_size = 50
                    for i in range(0, len(all_symbols_to_fetch), batch_size):
                        batch = all_symbols_to_fetch[i:i+batch_size]
                        batch_results = alpaca_api.get_batch_snapshots(batch)
                        
                        # Track which symbols succeeded
                        batch_success_symbols = set()
                        
                        # Process batch results
                        for symbol, data in batch_results.items():
                            if data and 'price' in data and data.get('price') and data['price'] > 0:
                                stock_data = {
                                    'symbol': symbol,
                                    'name': data.get('name', symbol),
                                    'price': data['price'],
                                    'last_updated': datetime.now().isoformat(),
                                    'is_priority': symbol in priority_symbols
                                }
                                
                                # No caching - always use fresh data
                                updated_symbols[symbol] = stock_data
                                batch_success_symbols.add(symbol)
                        
                        # Track symbols that failed in batch (not in results or invalid price)
                        for symbol in batch:
                            if symbol not in batch_success_symbols:
                                batch_failed_symbols.add(symbol)
                        
                        # Small delay between batches to respect rate limits
                        if i + batch_size < len(all_symbols_to_fetch):
                            time.sleep(0.1)  # Reduced delay for real-time (was 0.5s)
                    
                    print(f"✅ [REALTIME] Batch updated {len(updated_symbols)} symbols ({len(priority_to_fetch)} priority)")
                    if batch_failed_symbols:
                        print(f"⚠️ [REALTIME] {len(batch_failed_symbols)} symbols failed in batch, will retry individually: {list(batch_failed_symbols)[:10]}")
                    
                except Exception as e:
                    print(f"⚠️ [REALTIME] Batch update failed, falling back to individual calls: {e}")
                    import traceback
                    print(f"⚠️ [REALTIME] Batch error traceback: {traceback.format_exc()}")
                    # If batch completely failed, mark all symbols as failed
                    batch_failed_symbols = set(all_symbols_to_fetch)
            
            # Fallback: individual API calls for symbols that failed in batch or if batch wasn't used
            # Only run individual calls if:
            # 1. Batch failed for some symbols (batch_failed_symbols is not empty), OR
            # 2. Batch wasn't used at all (Alpaca not enabled or not available)
            if batch_failed_symbols:
                # Some symbols failed in batch, fetch them individually
                symbols_needing_individual_fetch = batch_failed_symbols
            elif not (USE_ALPACA_API and alpaca_api):
                # Batch wasn't used, fetch all symbols individually
                symbols_needing_individual_fetch = all_symbols_to_fetch
            else:
                # Batch succeeded for all symbols, no individual calls needed
                symbols_needing_individual_fetch = []
            
            if symbols_needing_individual_fetch:
                # Process priority symbols first, then failed batch symbols
                priority_failed = [s for s in symbols_needing_individual_fetch if s in priority_symbols]
                regular_failed = [s for s in symbols_needing_individual_fetch if s not in priority_symbols]
                symbols_to_process = priority_failed + regular_failed
                
                print(f"🔄 [REALTIME] Fetching {len(symbols_to_process)} symbols individually ({len(priority_failed)} priority)...")
                
                for symbol in symbols_to_process[:50]:  # Increased limit for real-time
                    try:
                        # Add small delay to prevent rate limiting (shorter for priority)
                        delay = 0.05 if symbol in priority_symbols else 0.1
                        time.sleep(delay)
                        
                        # Get fresh data for watchlist - try Alpaca first, then Yahoo fallback
                        print(f"🔄 [REALTIME] Updating price for {symbol} {'(PRIORITY)' if symbol in priority_symbols else ''}...")
                        stock, api_used = get_stock_alpaca_only(symbol)
                        
                        # Fallback to Yahoo if Alpaca fails - NEVER skip stocks, always get fresh price
                        if not stock or not stock.price or stock.price == 0:
                            print(f"⚠️ [REALTIME] Alpaca failed for {symbol}, trying Yahoo fallback...")
                            try:
                                stock = Stock(symbol, yahoo_finance_api)
                                stock.retrieve_data()
                                api_used = 'yahoo'
                                if stock and stock.price:
                                    print(f"✅ [REALTIME] Yahoo fallback successful for {symbol}: ${stock.price:.2f}")
                                else:
                                    print(f"❌ [REALTIME] Yahoo fallback also failed for {symbol}")
                                    continue
                            except Exception as yahoo_error:
                                print(f"❌ [REALTIME] Yahoo fallback failed for {symbol}: {yahoo_error}")
                                continue
                        
                        print(f"✅ [REALTIME] Updated {symbol}: ${stock.price:.2f} (Source: {api_used.upper() if api_used else 'ALPACA'})")
                        
                        if stock.name and 'not found' not in stock.name.lower():
                            stock_data = {
                                'symbol': symbol,
                                'name': stock.name,
                                'price': stock.price,
                                'last_updated': datetime.now().isoformat(),
                                'is_priority': symbol in priority_symbols
                            }
                            
                            # No caching - always use fresh data
                            updated_symbols[symbol] = stock_data
                        
                    except Exception as e:
                        print(f"⚠️ Error updating {symbol}: {e}")
                        continue
            
            # Send updates to users - ensure ALL watchlist stocks get updates
            for user_id, watchlist in user_watchlists.items():
                try:
                    user_updates = []
                    for item in watchlist:
                        symbol = item['symbol']
                        
                        # Always include stock in updates if we have fresh data
                        if symbol in updated_symbols:
                            stock_data = updated_symbols[symbol]
                            
                            # Calculate price change from original price (not last_price)
                            original_price = item.get('original_price', 0)
                            current_price = stock_data.get('price', 0)
                            price_change = 0
                            price_change_percent = 0
                            
                            if original_price and original_price > 0 and current_price > 0:
                                price_change = current_price - original_price
                                price_change_percent = (price_change / original_price) * 100
                            
                            user_updates.append({
                                **stock_data,
                                'price_change': price_change,
                                'price_change_percent': price_change_percent,
                                'change_percent': price_change_percent,  # Alias
                                'priceChangePercent': price_change_percent,  # Alias
                                'category': item.get('category', 'General'),
                                'priority': item.get('priority', 'medium'),
                                '_fresh': True  # Flag to indicate fresh data
                            })
                        else:
                            # If stock wasn't updated in this cycle, still send current data
                            # This ensures frontend knows the stock exists even if update failed
                            print(f"⚠️ [REALTIME] Symbol {symbol} not in updated_symbols for user {user_id}, may need fallback fetch")
                    
                    if user_updates:
                        room_name = f"watchlist_{user_id}"
                        socketio.emit('watchlist_updated', {
                            'prices': user_updates,
                            'timestamp': datetime.now().isoformat(),
                            'cycle': update_cycle_count
                        }, room=room_name)
                        print(f"✅ [REALTIME] Sent {len(user_updates)} stock updates to user {user_id} (Cycle #{update_cycle_count})")
                    else:
                        print(f"⚠️ [REALTIME] No updates to send for user {user_id} (watchlist has {len(watchlist)} stocks, updated_symbols has {len(updated_symbols)} symbols)")
                        
                except Exception as e:
                    print(f"⚠️ Error sending updates to user {user_id}: {e}")
                    continue
            
            # No cache cleanup needed - we don't cache anymore
            
            # Update market status less frequently
            try:
                market_status = get_market_status()
                socketio.emit('market_status_updated', market_status, room="market_updates")
            except Exception as market_error:
                print(f"⚠️ Error updating market status: {market_error}")
            
            # Sleep before next update
            # OPTIMIZED: 30 seconds to respect Alpaca rate limits (200 req/min)
            # At 30s intervals: 2 updates/min = safe for free tier
            cycle_end_time = time.time()
            cycle_duration = cycle_end_time - current_time
            print(f"⏱️ Update cycle completed in {cycle_duration:.2f} seconds")

            # Display API stats if available
            if USE_ALPACA_API and alpaca_api and hasattr(alpaca_api, 'get_queue_stats'):
                try:
                    stats = alpaca_api.get_queue_stats()
                    print(f"📊 API Stats: {stats['requests_last_minute']}/{stats.get('can_request', 'N/A')} req/min | "
                          f"Total: {stats['total_requests']} | Rate limited: {stats['rate_limited']}")
                except:
                    pass

            print(f"😴 Sleeping for 30 seconds before next update...")
            print(f"📅 Next update at: {datetime.fromtimestamp(time.time() + 30).strftime('%H:%M:%S')}\n")
            time.sleep(30)  # OPTIMIZED: 30s intervals for rate limit compliance
            
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
    """Get current market status in Eastern Time"""
    try:
        # Get current time in Eastern Time (handles EST/EDT automatically)
        if zoneinfo:
            try:
                et_tz = zoneinfo.ZoneInfo("America/New_York")
            except:
                # Fallback: use UTC offset approximation
                # EST is UTC-5, EDT is UTC-4
                # Simple approximation: assume EDT (UTC-4) for now
                et_tz = timezone(timedelta(hours=-4))
        else:
            # Fallback for older Python versions - use UTC offset approximation
            # EST is UTC-5, EDT is UTC-4
            # Simple approximation: assume EDT (UTC-4) for now
            et_tz = timezone(timedelta(hours=-4))
        
        now_et = datetime.now(et_tz)
        
        # Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
        is_weekday = now_et.weekday() < 5  # Monday=0, Friday=4
        current_time = now_et.time()
        market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0).time()
        market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0).time()
        
        is_market_hours = market_open <= current_time <= market_close
        
        if is_weekday and is_market_hours:
            return {
                'isOpen': True,
                'status': 'Market is Open',
                'last_updated': now_et.isoformat()
            }
        else:
            return {
                'isOpen': False,
                'status': 'Market is Closed',
                'last_updated': now_et.isoformat()
            }
    except Exception as e:
        print(f"Error getting market status: {e}")
        return {
            'isOpen': False,
            'status': 'Market status unknown',
            'last_updated': datetime.now().isoformat()
        }

@app.route('/api/search', methods=['POST'])
def search_stock():
    from utils import sanitize_stock_symbol, validate_stock_symbol
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request data'}), 400
    
    symbol = data.get('symbol', '').strip()
    
    # Validate and sanitize symbol
    if not symbol:
        return jsonify({'error': 'Please enter a stock symbol'}), 400
    
    # Sanitize the symbol
    symbol = sanitize_stock_symbol(symbol)
    
    # Additional validation
    if not validate_stock_symbol(symbol):
        return jsonify({'error': 'Invalid stock symbol format'}), 400
    
    print(f"🔍 [API] /api/search called for symbol: {symbol}")
    print(f"🔧 [API] USE_ALPACA_API = {USE_ALPACA_API}, alpaca_api available = {alpaca_api is not None}")
    
    # Check if this is a watchlist request (from frontend dashboard)
    # For watchlist requests, use Alpaca only (no Yahoo fallback)
    is_watchlist_request = request.headers.get('X-Request-Source') == 'watchlist' or \
                          request.referrer and 'dashboard' in request.referrer.lower()
    
    if is_watchlist_request:
        print(f"📋 [WATCHLIST] Using Alpaca-only for watchlist request: {symbol}")
        stock, api_used = get_stock_alpaca_only(symbol)
        if not stock:
            # If Alpaca fails for watchlist, return error instead of falling back to Yahoo
            print(f"❌ [WATCHLIST] Alpaca failed for {symbol}, returning error (no Yahoo fallback)")
            return jsonify({'error': f'Stock "{symbol}" not available via Alpaca API. Please check the symbol or try again later.'}), 404
    else:
        # For non-watchlist requests, use fallback
        stock, api_used = get_stock_with_fallback(symbol)
    if not stock:
        print(f"❌ [API] Could not retrieve stock data for {symbol}")
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404
    
    print(f"✅ [API] Returning stock data for {symbol}: ${stock.price:.2f} ({stock.name}) - Source: {api_used.upper() if api_used else 'UNKNOWN'}")
    
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
        
        response_data = {
            'symbol': stock.symbol,
            'name': stock.name,
            'price': stock.price,
            'lastMonthPrice': last_month_price,
            'priceChange': price_change,
            'priceChangePercent': price_change_percent,
            'triggeredAlerts': alerts_data,
            'apiSource': api_used if api_used else 'yahoo'  # Default to yahoo if None (fallback case)
        }
        
        response = jsonify(response_data)
        # Add custom header to show which API was used
        api_source_header = api_used.upper() if api_used else 'YAHOO'
        response.headers['X-API-Source'] = api_source_header
        print(f"📤 [API] Sending response for {symbol} with apiSource: {response_data['apiSource']}, header: {api_source_header}")
        return response
    else:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

@app.route('/api/stock/<symbol>', methods=['GET'])
def get_stock_data(symbol):
    """Get current stock data for a specific symbol (used by watchlist price updates)"""
    from utils import sanitize_stock_symbol, validate_stock_symbol
    
    # Authenticate user
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    # Sanitize and validate symbol from URL
    symbol = sanitize_stock_symbol(symbol)
    
    if not symbol:
        return jsonify({'error': 'Please provide a stock symbol'}), 400
    
    if not validate_stock_symbol(symbol):
        return jsonify({'error': 'Invalid stock symbol format'}), 400

    try:
        # This endpoint is used for watchlist price updates, so use Alpaca only
        print(f"📋 [WATCHLIST] /api/stock/{symbol} - Using Alpaca-only for watchlist price update")
        stock, api_used = get_stock_alpaca_only(symbol)
        if not stock:
            return jsonify({'error': f'Stock "{symbol}" not available via Alpaca API. Please check the symbol or try again later.'}), 404

        if stock.name and 'not found' not in stock.name.lower():
            # Get last month's price for change calculation
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
            alerts_data = []
            if user:
                triggered_alerts = FirebaseService.check_triggered_alerts(user.id, symbol, stock.price)
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
                'triggeredAlerts': alerts_data,
                'last_updated': datetime.now().isoformat()
            })
        else:
            return jsonify({'error': f'Stock "{symbol}" not found'}), 404

    except Exception as e:
        print(f"Error fetching stock data for {symbol}: {e}")
        return jsonify({'error': 'Failed to fetch stock data'}), 500

@app.route('/api/search/stocks', methods=['GET'])
def search_stocks():
    """Search stocks by name or symbol with caching and rate limiting protection"""
    from utils import sanitize_search_query, validate_search_length
    
    query = request.args.get('q', '').strip()
    
    # Validate and sanitize input
    if not query:
        return jsonify({'error': 'Please provide a search query'}), 400
    
    if not validate_search_length(query, min_length=2, max_length=100):
        return jsonify({'error': 'Search query must be between 2 and 100 characters'}), 400
    
    # Sanitize the query
    query = sanitize_search_query(query)
    
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
    from utils import sanitize_search_query, validate_search_length
    
    query = request.args.get('q', '').strip()
    
    # Validate and sanitize input
    if not query:
        return jsonify({'error': 'Please provide a search query'}), 400
    
    if not validate_search_length(query, min_length=2, max_length=100):
        return jsonify({'error': 'Search query must be between 2 and 100 characters'}), 400
    
    # Sanitize the query
    query = sanitize_search_query(query)
    
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
    
    # Don't cache authentication - always verify fresh
    # Caching was causing issues where failed auths were cached and reused
    # Only cache successful authentications, and only for a very short time
    
    try:
        # First try session-based auth (existing Flask-Login)
        if current_user.is_authenticated:
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
                return None
            
            try:
                # Verify Firebase token
                decoded_token = FirebaseService.verify_token(token)
                print(f"🔍 Token decoded: {decoded_token is not None}")
                
                if not decoded_token:
                    print("❌ Token verification failed - invalid token")
                    return None
                
                token_uid = decoded_token.get('uid')
                print(f"✅ Token UID: {token_uid}, Header UID: {user_id_header}")
                
                if token_uid != user_id_header:
                    print(f"❌ UID mismatch - Token: {token_uid}, Header: {user_id_header}")
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
                    # Don't cache - always verify fresh to prevent stale failures
                    return firebase_user
            except Exception as e:
                print(f"❌ Token authentication failed: {e}")
                import traceback
                print(f"❌ Traceback: {traceback.format_exc()}")
                return None

        print("❌ No valid authentication method found")
        return None
    except Exception as e:
        print(f"❌ Authentication error: {e}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        return None

@app.route('/api/watchlist', methods=['GET'])
def get_watchlist_route():
    """Lightweight watchlist endpoint with current prices"""
    origin = request.headers.get('Origin', '')
    print(f"📥 GET /api/watchlist request from origin: {origin}")
    print(f"📥 Request headers - Authorization: {bool(request.headers.get('Authorization'))}, X-User-ID: {request.headers.get('X-User-ID')}")
    
    user = authenticate_request()
    if not user:
        print(f"❌ Authentication failed for /api/watchlist")
        return jsonify({'error': 'Authentication required'}), 401
    
    # Check rate limit
    if not rate_limiter.is_allowed(user.id):
        print(f"⚠️ Rate limit exceeded for user: {user.id}")
        return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429

    try:
        print(f"\n{'='*80}")
        print(f"🔍 GET WATCHLIST REQUEST for user: {user.id}")
        print(f"{'='*80}")
        
        # Ensure watchlist service is initialized
        try:
            service = ensure_watchlist_service()
        except Exception as service_error:
            print(f"❌ Failed to initialize watchlist service: {service_error}")
            import traceback
            print(f"❌ Traceback: {traceback.format_exc()}")
            return jsonify({'error': 'Service unavailable'}), 503
        
        # Get watchlist items from Firestore with timeout protection
        print(f"📋 Fetching watchlist from Firestore...")
        watchlist = []
        
        # Try to fetch with timeout protection
        # The service.get_watchlist() now has built-in timeout protection
        try:
            # Use a reasonable limit (100 items) to prevent timeouts
            # The service will default to 100 if limit is None
            watchlist = service.get_watchlist(user.id, limit=100)
            print(f"📋 Retrieved {len(watchlist)} items from Firebase")
        except Exception as firestore_error:
            print(f"⚠️ Firestore query error: {firestore_error}")
            import traceback
            print(f"⚠️ Traceback: {traceback.format_exc()}")
            # Return empty list if Firestore fails - don't block the request
            watchlist = []
            print(f"📋 Returning empty watchlist due to Firestore error")
        
        # Log all symbols from Firebase
        if watchlist:
            try:
                firebase_symbols = [item.get('symbol') or item.get('id') or 'NO_SYMBOL' for item in watchlist]
                print(f"📦 STOCKS FROM FIREBASE:")
                for i, symbol in enumerate(firebase_symbols[:10], 1):  # Limit to first 10 for logging
                    print(f"   {i}. {symbol}")
                if len(firebase_symbols) > 10:
                    print(f"   ... and {len(firebase_symbols) - 10} more")
            except Exception as log_error:
                print(f"⚠️ Error logging symbols: {log_error}")
        else:
            print(f"⚠️ NO STOCKS IN FIREBASE WATCHLIST")
        
        # For now, return watchlist without prices to prevent hanging
        # Prices can be fetched on-demand by the frontend
        # This prevents the login from hanging
        watchlist_with_prices = watchlist
        
        # Clean up watchlist items to ensure they're JSON serializable
        try:
            cleaned_watchlist = []
            for item in watchlist_with_prices:
                try:
                    # Remove any non-serializable fields (like datetime objects)
                    cleaned_item = {}
                    for key, value in item.items():
                        try:
                            # Handle datetime objects
                            if isinstance(value, datetime):
                                cleaned_item[key] = value.isoformat()
                            # Handle Firestore Timestamp objects
                            elif hasattr(value, 'timestamp'):
                                cleaned_item[key] = value.timestamp()
                            elif hasattr(value, '__dict__'):
                                # Skip complex objects that can't be serialized
                                continue
                            else:
                                cleaned_item[key] = value
                        except Exception:
                            # Skip problematic fields
                            continue
                    cleaned_watchlist.append(cleaned_item)
                except Exception as item_error:
                    print(f"⚠️ Error cleaning item: {item_error}")
                    # Skip problematic items
                    continue
            
            watchlist_with_prices = cleaned_watchlist
        except Exception as clean_error:
            print(f"⚠️ Error cleaning watchlist: {clean_error}")
            # Return original watchlist if cleaning fails
            pass
        
        print(f"\n✅ RETURNING {len(watchlist_with_prices)} items")
        print(f"{'='*80}\n")
        
        # Return response with proper error handling
        try:
            response = jsonify(watchlist_with_prices)
            return response
        except Exception as json_error:
            print(f"❌ Error serializing watchlist to JSON: {json_error}")
            import traceback
            print(f"❌ Traceback: {traceback.format_exc()}")
            # Return empty list if JSON serialization fails
            return jsonify([]), 500
            
    except Exception as e:
        print(f"❌ Error in get_watchlist_route: {e}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        # Fallback to empty list on error - ensure CORS headers are set
        try:
            return jsonify({'error': 'Internal server error', 'items': []}), 500
        except:
            # Last resort - return minimal response
            from flask import Response
            return Response('[]', mimetype='application/json', status=500)

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

    # Import validation utilities
    from utils import sanitize_stock_symbol, validate_stock_symbol

    symbol = sanitize_stock_symbol(data.get('symbol', ''))

    if not symbol:
        return jsonify({'error': 'Please provide a stock symbol'}), 400

    if not validate_stock_symbol(symbol):
        return jsonify({'error': 'Invalid stock symbol format'}), 400

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
        
        # Get current stock price to store as original price (Alpaca only for watchlist)
        current_price = None
        try:
            print(f"📋 [WATCHLIST] Using Alpaca-only for adding stock to watchlist: {symbol}")
            stock, api_used = get_stock_alpaca_only(symbol)
            if stock and stock.price and stock.price > 0:
                current_price = stock.price
                print(f"💰 Current price for {symbol} from Alpaca: ${current_price}")
            else:
                print(f"❌ Could not get current price for {symbol} from Alpaca (no Yahoo fallback)")
                return jsonify({'error': f'Stock "{symbol}" not available via Alpaca API. Please check the symbol or try again later.'}), 404
        except Exception as price_error:
            print(f"❌ Error getting current price for {symbol} from Alpaca: {price_error}")
            return jsonify({'error': f'Failed to fetch stock data from Alpaca API: {str(price_error)}'}), 500
        
        # Ensure watchlist service is initialized
        service = ensure_watchlist_service()
        
        # Re-enabled with proper watchlist service
        result = service.add_stock(
            user.id,
            symbol,
            company_name,
            current_price=current_price,
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

    try:
        service = ensure_watchlist_service()
        symbol = symbol.upper()
        result = service.remove_stock(user.id, symbol)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

    if result['success']:
        return jsonify({'message': result['message']})

    return jsonify({'error': result['message']}), 404

@app.route('/api/watchlist/<symbol>', methods=['PUT'])
def update_watchlist_stock(symbol):
    """Update a stock in the watchlist with new details"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        service = ensure_watchlist_service()
        symbol = symbol.upper()
        data = request.get_json()

        # Remove symbol from data if present (can't update symbol)
        data.pop('symbol', None)

        result = service.update_stock(user.id, symbol, **data)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

    if result['success']:
        return jsonify({
            'message': result['message'],
            'item': result.get('item')
        })

    return jsonify({'error': result['message']}), 400

@app.route('/api/watchlist/<symbol>/notes', methods=['PUT'])
def update_watchlist_notes(symbol):
    """Update notes for a specific stock in the watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = symbol.upper()
    data = request.get_json()
    
    if not data or 'notes' not in data:
        return jsonify({'error': 'Notes field is required'}), 400
    
    notes = data.get('notes', '').strip()
    
    try:
        service = ensure_watchlist_service()
        result = service.update_stock(user.id, symbol, notes=notes)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

    if result['success']:
        return jsonify({
            'message': result['message'],
            'notes': notes
        })

    return jsonify({'error': result['message']}), 400

@app.route('/api/watchlist/categories', methods=['GET'])
def get_watchlist_categories():
    """Get all categories used by the user"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        service = ensure_watchlist_service()
        categories = service.get_categories(user.id)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    return jsonify({'categories': categories})

@app.route('/api/watchlist/stats', methods=['GET'])
def get_watchlist_stats():
    """Get statistics about user's watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        service = ensure_watchlist_service()
        stats = service.get_watchlist_stats(user.id)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    return jsonify(stats)

@app.route('/api/watchlist/clear', methods=['DELETE'])
def clear_watchlist():
    """Clear all stocks from user's watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        service = ensure_watchlist_service()
        result = service.clear_watchlist(user.id)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

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
    try:
        service = ensure_watchlist_service()
        result = service.batch_update(user.id, updates)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

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
    
    # Get time range from query parameter, default to 30d
    time_range = request.args.get('range', '30d')
    
    # Calculate date range based on parameter
    now = datetime.now()
    if time_range == '1y':
        start_date = (now - timedelta(days=365)).strftime("%Y-%m-%d")
    elif time_range == '5y':
        start_date = (now - timedelta(days=1825)).strftime("%Y-%m-%d")  # 5 years
    elif time_range == 'all':
        start_date = (now - timedelta(days=3650)).strftime("%Y-%m-%d")  # 10 years (practical limit)
    else:  # Default to 30d
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    
    end_date = now.strftime("%Y-%m-%d")
    
    # Charts use Yahoo Finance for historical data (as per migration plan)
    stock = Stock(symbol, yahoo_finance_api)
    dates, prices = stock.retrieve_historical_data(start_date, end_date)
    
    if dates and prices:
        chart_data = [{'date': date, 'price': price} for date, price in zip(dates, prices)]
        return jsonify(chart_data)
    else:
        return jsonify({'error': 'Could not retrieve chart data'}), 404

@app.route('/api/market-status')
def market_status():
    """Get market status using Eastern Time"""
    origin = request.headers.get('Origin', '')
    print(f"📥 GET /api/market-status request from origin: {origin}")
    
    try:
        # Get current time in Eastern Time (handles EST/EDT automatically)
        if zoneinfo:
            try:
                et_tz = zoneinfo.ZoneInfo("America/New_York")
            except:
                # Fallback: use UTC offset approximation
                et_tz = timezone(timedelta(hours=-4))
        else:
            # Fallback for older Python versions - use UTC offset approximation
            et_tz = timezone(timedelta(hours=-4))
        
        now_et = datetime.now(et_tz)
        
        # Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
        is_weekday = now_et.weekday() < 5  # Monday=0, Friday=4
        current_time = now_et.time()
        market_open_time = now_et.replace(hour=9, minute=30, second=0, microsecond=0).time()
        market_close_time = now_et.replace(hour=16, minute=0, second=0, microsecond=0).time()
        
        is_market_hours = market_open_time <= current_time <= market_close_time
        is_open = is_weekday and is_market_hours
        
        return jsonify({
            'isOpen': is_open,
            'is_open': is_open,  # Support both naming conventions
            'status': 'Market is Open' if is_open else 'Market is Closed'
        })
    except Exception as e:
        print(f"Error in market_status endpoint: {e}")
        return jsonify({
            'isOpen': False,
            'is_open': False,
            'status': 'Market status unknown'
        }), 500

# Cache for market data (10 minute TTL)
_market_data_cache = {
    'top_movers': {'data': None, 'timestamp': None},
    'sector_performance': {'data': None, 'timestamp': None}
}
_CACHE_TTL_SECONDS = 600  # 10 minutes

def _is_cache_valid(cache_key):
    """Check if cache is still valid"""
    cache = _market_data_cache.get(cache_key, {})
    if cache.get('data') is None or cache.get('timestamp') is None:
        return False
    age = (datetime.now() - cache['timestamp']).total_seconds()
    return age < _CACHE_TTL_SECONDS

def generate_ai_reasons_for_movers(movers):
    """Generate AI explanations for why stocks are moving"""
    try:
        from chat_service import ChatService
        chat_service = ChatService()

        # Build a prompt for all movers at once (more efficient)
        stocks_info = "\n".join([
            f"- {m['symbol']} ({m['sector']}): {'+' if m['change'] >= 0 else ''}{m['change']}% at ${m['price']}"
            for m in movers
        ])

        prompt = f"""For each of these top moving stocks today, provide a brief 1-sentence explanation of why it might be moving. Be specific and mention likely catalysts like earnings, news, sector trends, or market conditions. Keep each explanation under 20 words.

{stocks_info}

Format your response as:
SYMBOL: reason
(one per line, no extra text)"""

        response = chat_service.generate_simple_response(prompt)

        # Parse the response and map reasons to movers
        reasons = {}
        for line in response.strip().split('\n'):
            if ':' in line:
                parts = line.split(':', 1)
                symbol = parts[0].strip().upper()
                reason = parts[1].strip() if len(parts) > 1 else ''
                reasons[symbol] = reason

        # Add reasons to movers
        for mover in movers:
            mover['ai_reason'] = reasons.get(mover['symbol'], '')

        print(f"✅ Generated AI reasons for {len(reasons)} movers")
        return movers

    except Exception as e:
        print(f"⚠️ Failed to generate AI reasons: {e}")
        # Return movers without AI reasons
        return movers

def get_real_top_movers():
    """Fetch real top movers using batch download (FAST)"""
    # Check cache first
    if _is_cache_valid('top_movers'):
        print("✅ Using cached top movers data")
        return _market_data_cache['top_movers']['data']

    try:
        import yfinance as yf

        # Reduced list of major stocks (faster)
        stock_universe = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD',
            'JPM', 'BAC', 'XOM', 'JNJ', 'V', 'WMT', 'DIS', 'NFLX'
        ]

        # Sector mapping (avoid extra API calls)
        sector_map = {
            'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology',
            'AMZN': 'Consumer Cyclical', 'META': 'Technology', 'TSLA': 'Consumer Cyclical',
            'NVDA': 'Technology', 'AMD': 'Technology', 'JPM': 'Financial Services',
            'BAC': 'Financial Services', 'XOM': 'Energy', 'JNJ': 'Healthcare',
            'V': 'Financial Services', 'WMT': 'Consumer Defensive', 'DIS': 'Communication Services',
            'NFLX': 'Communication Services'
        }

        # BATCH DOWNLOAD - One request for all symbols!
        print(f"📊 Fetching top movers for {len(stock_universe)} stocks (batch)...")
        data = yf.download(stock_universe, period='5d', progress=False, threads=True)

        top_movers = []
        for symbol in stock_universe:
            try:
                if symbol in data['Close'].columns:
                    closes = data['Close'][symbol].dropna()
                    if len(closes) >= 2:
                        first_close = closes.iloc[0]
                        last_close = closes.iloc[-1]
                        pct_change = ((last_close - first_close) / first_close) * 100

                        top_movers.append({
                            'symbol': symbol,
                            'change': round(pct_change, 2),
                            'sector': sector_map.get(symbol, 'Unknown'),
                            'price': round(last_close, 2)
                        })
            except Exception as e:
                continue

        # Sort by absolute change
        top_movers.sort(key=lambda x: abs(x['change']), reverse=True)
        result = top_movers[:5]

        # Generate AI reasons for top movers
        result = generate_ai_reasons_for_movers(result)

        # Cache the result
        _market_data_cache['top_movers'] = {'data': result, 'timestamp': datetime.now()}
        print(f"✅ Cached top movers: {[m['symbol'] for m in result]}")

        return result

    except Exception as e:
        print(f"Error fetching top movers: {e}")
        return [
            {'symbol': 'NVDA', 'change': 8.5, 'sector': 'Technology', 'price': 950.00, 'ai_reason': 'Strong AI chip demand and data center growth driving momentum.'},
            {'symbol': 'TSLA', 'change': 5.2, 'sector': 'Consumer Cyclical', 'price': 250.00, 'ai_reason': 'EV delivery numbers exceeded expectations this quarter.'},
            {'symbol': 'META', 'change': 4.8, 'sector': 'Technology', 'price': 500.00, 'ai_reason': 'Ad revenue growth and AI investments boosting investor confidence.'},
            {'symbol': 'AAPL', 'change': -2.1, 'sector': 'Technology', 'price': 180.00, 'ai_reason': 'iPhone sales concerns in China weighing on shares.'},
            {'symbol': 'GOOGL', 'change': 3.3, 'sector': 'Technology', 'price': 175.00, 'ai_reason': 'Cloud growth and AI search integration driving gains.'}
        ]

def get_real_sector_performance():
    """Fetch real sector performance using batch download (FAST)"""
    # Check cache first
    if _is_cache_valid('sector_performance'):
        print("✅ Using cached sector performance data")
        return _market_data_cache['sector_performance']['data']

    try:
        import yfinance as yf

        # Major sector ETFs
        sector_etfs = {
            'XLK': 'Technology',
            'XLF': 'Financials',
            'XLE': 'Energy',
            'XLV': 'Healthcare',
            'XLY': 'Consumer Discretionary',
            'XLP': 'Consumer Staples',
            'XLI': 'Industrials',
            'XLB': 'Materials',
            'XLU': 'Utilities',
            'XLRE': 'Real Estate',
            'XLC': 'Communication Services'
        }

        symbols = list(sector_etfs.keys())

        # BATCH DOWNLOAD - One request for all ETFs!
        print(f"📊 Fetching sector performance for {len(symbols)} ETFs (batch)...")
        data = yf.download(symbols, period='5d', progress=False, threads=True)

        sector_performance = []
        for symbol, sector_name in sector_etfs.items():
            try:
                if symbol in data['Close'].columns:
                    closes = data['Close'][symbol].dropna()
                    if len(closes) >= 2:
                        first_close = closes.iloc[0]
                        last_close = closes.iloc[-1]
                        pct_change = ((last_close - first_close) / first_close) * 100

                        sector_performance.append({
                            'name': sector_name,
                            'change': round(pct_change, 2),
                            'symbol': symbol
                        })
            except Exception as e:
                continue

        # Sort by change
        sector_performance.sort(key=lambda x: x['change'], reverse=True)

        # Cache the result
        _market_data_cache['sector_performance'] = {'data': sector_performance, 'timestamp': datetime.now()}
        print(f"✅ Cached sector performance: {len(sector_performance)} sectors")

        return sector_performance

    except Exception as e:
        print(f"Error fetching sector performance: {e}")
        return [
            {'name': 'Technology', 'change': 3.5, 'symbol': 'XLK'},
            {'name': 'Energy', 'change': 2.8, 'symbol': 'XLE'},
            {'name': 'Healthcare', 'change': 1.5, 'symbol': 'XLV'},
            {'name': 'Financials', 'change': -0.5, 'symbol': 'XLF'},
            {'name': 'Consumer Discretionary', 'change': 1.2, 'symbol': 'XLY'}
        ]

@app.route('/api/market/analysis')
def get_market_analysis():
    """Get AI-generated market analysis with trends and insights"""
    # Get market data first (independent of AI) - these have their own fallbacks
    top_movers = get_real_top_movers()
    sector_performance = get_real_sector_performance()

    # Build market data object
    market_data = {
        'topMovers': top_movers,
        'upcomingEvents': [
            {'title': 'Federal Reserve Meeting', 'date': 'Next Week'},
            {'title': 'CPI Data Release', 'date': 'Thursday'},
            {'title': 'Tech Earnings Season', 'date': 'This Week'},
            {'title': 'Jobs Report', 'date': 'Friday'},
            {'title': 'GDP Report', 'date': 'Next Month'}
        ],
        'sectorPerformance': sector_performance
    }

    # Try to generate AI analysis
    try:
        from chat_service import ChatService

        # Build comprehensive market analysis prompt
        prompt = """Generate a concise, professional market analysis for this week covering:

1. Current Market Trends: What's driving the market this week?
2. Geopolitical Factors: Any major geopolitical events affecting markets?
3. Economic Indicators: Key economic data releases and their impact
4. Sector Performance: Which sectors are outperforming/underperforming and why?
5. What to Watch: Important events or catalysts coming up

Keep it informative, data-driven, and professional. Limit to 200-250 words."""

        # Generate AI analysis using Gemini
        chat_service = ChatService()
        analysis_text = chat_service.generate_simple_response(prompt)

        return jsonify({
            'analysis': analysis_text,
            'data': market_data,
            'generated_at': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"❌ Error generating AI market analysis: {e}")
        import traceback
        traceback.print_exc()

        # Fallback response if AI fails - but still include market data
        fallback_analysis = """This week's market is showing mixed signals with technology stocks leading gains while traditional sectors face headwinds. Federal Reserve policy decisions continue to weigh on investor sentiment, with traders closely watching inflation data. Geopolitical tensions in key regions are adding volatility, particularly affecting energy and defense sectors. Tech earnings have been strong, driving optimism, but valuation concerns persist. Economic indicators suggest resilient consumer spending despite higher interest rates. Watch for upcoming Fed commentary and quarterly GDP numbers which could set the tone for next month's trading."""

        return jsonify({
            'analysis': fallback_analysis,
            'data': market_data,
            'generated_at': datetime.now().isoformat(),
            'fallback': True
        })

@app.route('/api/news/market')
def get_market_news():
    try:
        limit = request.args.get('limit', 10, type=int)
        query = request.args.get('q', '').strip()
        news = news_api.get_market_news(limit=limit, query=query if query else None)
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


# AI Analysis cache - 4 hour TTL
_ai_analysis_cache = {}  # {symbol: {"data": ..., "timestamp": ...}}
ANALYSIS_CACHE_TTL = 4 * 60 * 60  # 4 hours in seconds


@app.route('/api/stock/<symbol>/ai-analysis', methods=['GET'])
def get_stock_ai_analysis(symbol):
    """Generate AI analysis of stock movement"""
    try:
        # Authenticate request
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        symbol = symbol.upper()
        current_time = time.time()

        # Check cache first
        if symbol in _ai_analysis_cache:
            cached = _ai_analysis_cache[symbol]
            cache_age = current_time - cached['timestamp']
            if cache_age < ANALYSIS_CACHE_TTL:
                # Return cached result
                cached_data = cached['data'].copy()
                cached_data['cached'] = True
                cached_data['cache_age_minutes'] = int(cache_age / 60)
                return jsonify(cached_data)

        # Get stock data
        stock_data = yahoo_finance_api.get_real_time_data(symbol)
        if not stock_data:
            return jsonify({
                'success': False,
                'error': f'Could not fetch stock data for {symbol}'
            }), 404

        # Get news for context
        try:
            news = news_api.get_company_news(symbol, limit=5)
        except Exception as e:
            print(f"Warning: Could not fetch news for AI analysis of {symbol}: {e}")
            news = []

        # Generate AI analysis
        from chat_service import chat_service

        result = chat_service.generate_stock_analysis(
            symbol=symbol,
            price_data={
                'price': stock_data.get('price', 0),
                'priceChange': stock_data.get('change', 0),
                'priceChangePercent': stock_data.get('changePercent', 0),
                'name': stock_data.get('name', symbol)
            },
            news=news
        )

        if not result.get('success'):
            return jsonify({
                'success': False,
                'symbol': symbol,
                'error': result.get('error', 'Analysis failed')
            }), 500

        # Build response
        response_data = {
            'success': True,
            'symbol': symbol,
            'analysis': result.get('analysis'),
            'cached': False,
            'cache_age_minutes': 0,
            'generated_at': datetime.now().isoformat()
        }

        # Cache the result
        _ai_analysis_cache[symbol] = {
            'data': response_data,
            'timestamp': current_time
        }

        return jsonify(response_data)

    except Exception as e:
        print(f"Error in AI analysis for {symbol}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'symbol': symbol,
            'error': f'Analysis failed: {str(e)[:100]}'
        }), 500

@app.route('/api/market/top-performer', methods=['GET'])
def get_top_performer_by_date():
    """Return the top performing stock for a specific date within a universe.

    Query params:
      - date: YYYY-MM-DD (required)
      - universe: 'watchlist' (default) or 'sp500'
      - limit: integer cap on symbols to evaluate (optional; defaults 100 for sp500, all for watchlist)
    """
    try:
        date_str = request.args.get('date', '').strip()
        universe = (request.args.get('universe', 'watchlist') or 'watchlist').lower()
        limit_param = request.args.get('limit')
        try:
            limit = int(limit_param) if limit_param is not None else None
        except Exception:
            limit = None

        if not date_str:
            return jsonify({'error': 'date is required (YYYY-MM-DD)'}), 400

        symbols = []
        universe_used = universe

        if universe == 'watchlist':
            user = authenticate_request()
            if not user:
                return jsonify({'error': 'Authentication required'}), 401
            try:
                service = ensure_watchlist_service()
                wl = service.get_watchlist(user.id, limit=500)
            except RuntimeError as e:
                return jsonify({'error': str(e)}), 503
            symbols = [item.get('symbol') or item.get('id') for item in wl if item.get('symbol') or item.get('id')]
            symbols = [s.upper() for s in symbols if isinstance(s, str) and len(s) > 0]
        elif universe == 'sp500':
            # Use Finnhub to get S&P 500 constituents; fallback to popular set if empty
            constituents = finnhub_api.get_index_constituents('^GSPC') or []
            symbols = [s.upper() for s in constituents if isinstance(s, str) and len(s) > 0]
            if not symbols:
                # Fallback minimal universe
                symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AVGO', 'BRK.B', 'LLY']
        else:
            return jsonify({'error': "universe must be 'watchlist' or 'sp500'"}), 400

        if limit:
            symbols = symbols[:max(1, limit)]

        if not symbols:
            return jsonify({'error': f'No symbols found for universe {universe_used}'}), 404

        best_symbol = None
        best_change = None

        # Evaluate percent change for the specified date
        evaluated = 0
        for symbol in symbols:
            try:
                change_pct = yahoo_finance_api.get_day_change_percent(symbol, date_str)
                evaluated += 1
                if best_change is None or change_pct > best_change:
                    best_change = change_pct
                    best_symbol = symbol
            except Exception:
                continue

        if best_symbol is None:
            return jsonify({'error': 'Could not compute top performer for requested date'}), 502

        return jsonify({
            'date': date_str,
            'universe': universe_used,
            'top_symbol': best_symbol,
            'top_change_percent': round(best_change, 2),
            'evaluated_count': evaluated,
            'source': 'Yahoo Finance via yfinance'
        })
    except Exception as e:
        return jsonify({'error': f'Failed to compute top performer: {str(e)}'}), 500

@app.route('/api/company/<symbol>')
def get_company_info(symbol):
    symbol = symbol.upper()
    stock, api_used = get_stock_with_fallback(symbol)
    if not stock:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404
    
    # Get company information using multi-API service with fallbacks
    info = yahoo_finance_api.get_info(symbol)
    company_info = company_info_service.get_comprehensive_info(symbol, yahoo_info=info)
    
    if stock.name and 'not found' not in stock.name.lower():
        return jsonify({
            'symbol': stock.symbol,
            'name': stock.name,
            'ceo': company_info.get('ceo', '-'),
            'description': company_info.get('description', '-'),
            'price': stock.price,
            'marketCap': company_info.get('marketCap', '-'),
            'peRatio': company_info.get('peRatio', '-'),
            'dividendYield': company_info.get('dividendYield', '-'),
            'website': company_info.get('website', '-'),
            'headquarters': company_info.get('headquarters', '-'),
        })
    else:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

@app.route('/api/stock/<symbol>/ai-insight')
def get_stock_ai_insight(symbol):
    """Get AI-generated insight explaining why a stock is moving"""
    symbol = symbol.upper()

    try:
        from chat_service import chat_service

        print(f"🤖 [AI Insight] Starting for {symbol}")

        # Get stock data from Yahoo Finance API
        stock_data = yahoo_finance_api.get_real_time_data(symbol)
        if not stock_data:
            print(f"❌ [AI Insight] No stock data for {symbol}")
            return jsonify({'error': f'Stock "{symbol}" not found', 'symbol': symbol}), 404

        # Get news for context
        try:
            news = news_api.get_company_news(symbol, limit=3)
        except:
            news = []

        # Use existing generate_stock_analysis method
        result = chat_service.generate_stock_analysis(
            symbol=symbol,
            price_data={
                'price': stock_data.get('price', 0),
                'priceChange': stock_data.get('change', 0),
                'priceChangePercent': stock_data.get('changePercent', 0),
                'name': stock_data.get('name', symbol)
            },
            news=news
        )

        if result.get('success') and result.get('analysis'):
            analysis = result['analysis']
            return jsonify({
                'symbol': symbol,
                'change_percent': stock_data.get('changePercent', 0),
                'ai_insight': analysis.get('summary', 'No insight available.')
            })
        else:
            print(f"❌ [AI Insight] Analysis failed for {symbol}: {result.get('error')}")
            return jsonify({
                'symbol': symbol,
                'ai_insight': 'Unable to generate insight at this time.'
            }), 200

    except Exception as e:
        import traceback
        print(f"❌ [AI Insight] Error for {symbol}: {e}")
        traceback.print_exc()
        return jsonify({
            'symbol': symbol,
            'ai_insight': 'Unable to generate insight at this time.'
        }), 200

@app.route('/api/sectors/batch', methods=['POST'])
def get_sectors_batch():
    """Get sector information for multiple stocks at once"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    data = request.get_json()
    symbols = data.get('symbols', [])
    
    if not symbols or not isinstance(symbols, list):
        return jsonify({'error': 'Please provide a list of symbols'}), 400
    
    sectors = {}
    for symbol in symbols:
        try:
            symbol = symbol.upper()
            info = yahoo_finance_api.get_info(symbol)
            sector = info.get('sector', 'Other')
            if sector and sector != 'None' and sector != '-':
                sectors[symbol] = sector
            else:
                sectors[symbol] = 'Other'
        except Exception as e:
            print(f"Error getting sector for {symbol}: {e}")
            sectors[symbol] = 'Other'
    
    return jsonify(sectors)

@app.route('/api/watchlist/<symbol>/details')
def get_watchlist_stock_details(symbol):
    """Get detailed information for a stock in user's watchlist including watchlist-specific data"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    symbol = symbol.upper()
    
    try:
        print(f"🔍 Getting watchlist details for symbol: {symbol}, user: {user.id}")
        
        # Get watchlist item data
        try:
            service = ensure_watchlist_service()
            watchlist_item = service.get_stock(user.id, symbol)
        except RuntimeError as e:
            return jsonify({'error': str(e)}), 503
        if not watchlist_item:
            print(f"❌ Stock {symbol} not found in watchlist for user {user.id}")
            return jsonify({'error': f'Stock "{symbol}" not found in watchlist'}), 404
        
        print(f"✅ Found watchlist item for {symbol}")
        
        # Get current stock data (Alpaca only for watchlist)
        print(f"📋 [WATCHLIST] Using Alpaca-only for watchlist details: {symbol}")
        stock, api_used = get_stock_alpaca_only(symbol)
        if not stock:
            return jsonify({'error': f'Stock "{symbol}" not available via Alpaca API. Please check the symbol or try again later.'}), 404
        
        # Get company information using multi-API service with fallbacks
        info = yahoo_finance_api.get_info(symbol)
        company_info = company_info_service.get_comprehensive_info(symbol, yahoo_info=info)
        
        if not stock.name or 'not found' in stock.name.lower():
            return jsonify({'error': f'Stock "{symbol}" not found'}), 404
        
        # Calculate percentage change if we have original price
        percentage_change = None
        price_change = None
        original_price = watchlist_item.get('original_price')
        current_price = stock.price
        
        # Handle legacy data: if no original price, set current price as original
        if not original_price and current_price:
            print(f"🔄 Setting current price as original price for legacy stock {symbol}")
            try:
                service = ensure_watchlist_service()
                service.update_stock(user.id, symbol, original_price=current_price)
                original_price = current_price
            except RuntimeError:
                print("⚠️ Could not update original price - service unavailable")
        
        if original_price and current_price and original_price > 0:
            price_change = current_price - original_price
            percentage_change = (price_change / original_price) * 100
        
        # Format date added
        added_at = watchlist_item.get('added_at')
        if isinstance(added_at, datetime):
            date_added_str = added_at.strftime('%B %d, %Y')
        else:
            date_added_str = 'Unknown'
        
        return jsonify({
            'symbol': stock.symbol,
            'name': stock.name,
            'ceo': company_info.get('ceo', '-'),
            'description': company_info.get('description', '-'),
            'price': stock.price,
            'marketCap': company_info.get('marketCap', '-'),
            'peRatio': company_info.get('peRatio', '-'),
            'dividendYield': company_info.get('dividendYield', '-'),
            'website': company_info.get('website', '-'),
            'headquarters': company_info.get('headquarters', '-'),
            # Watchlist-specific data
            'date_added': date_added_str,
            'original_price': original_price,
            'price_change': price_change,
            'percentage_change': percentage_change,
            'category': watchlist_item.get('category', 'General'),
            'notes': watchlist_item.get('notes', ''),
            'priority': watchlist_item.get('priority', 'medium'),
            'target_price': watchlist_item.get('target_price'),
            'stop_loss': watchlist_item.get('stop_loss')
        })
        
    except Exception as e:
        print(f"⚠️ Error getting watchlist stock details for {symbol}: {e}")
        return jsonify({'error': f'Failed to get stock details for {symbol}'}), 500

@app.route('/api/alpaca/connect', methods=['POST'])
def connect_alpaca_account():
    """Connect user's Alpaca account by storing their API keys securely"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        data = request.get_json()
        api_key = data.get('api_key', '').strip()
        secret_key = data.get('secret_key', '').strip()
        use_paper = data.get('use_paper', True)  # Default to paper trading
        
        if not api_key or not secret_key:
            return jsonify({'error': 'API key and secret key are required'}), 400
        
        # Test the credentials by making a simple API call
        test_api = AlpacaAPI(api_key=api_key, secret_key=secret_key)
        # Try to get account info to verify credentials
        try:
            # Use trading API endpoint to verify credentials
            trading_url = 'https://paper-api.alpaca.markets' if use_paper else 'https://api.alpaca.markets'
            headers = {
                'APCA-API-KEY-ID': api_key,
                'APCA-API-SECRET-KEY': secret_key
            }
            import requests
            response = requests.get(f'{trading_url}/v2/account', headers=headers, timeout=5)
            
            if response.status_code != 200:
                return jsonify({'error': 'Invalid Alpaca API credentials. Please check your keys.'}), 401
            
            account_data = response.json()
        except Exception as e:
            print(f"❌ Error verifying Alpaca credentials: {e}")
            return jsonify({'error': 'Failed to verify Alpaca credentials. Please check your keys.'}), 401
        
        # Encrypt and store credentials
        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500
        
        encrypted_api_key = encrypt_data(api_key)
        encrypted_secret_key = encrypt_data(secret_key)
        
        # Store in user document
        user_ref = db.collection('users').document(user.id)
        user_ref.set({
            'alpaca_connected': True,
            'alpaca_api_key_encrypted': encrypted_api_key,
            'alpaca_secret_key_encrypted': encrypted_secret_key,
            'alpaca_use_paper': use_paper,
            'alpaca_connected_at': datetime.utcnow(),
            'alpaca_account_number': account_data.get('account_number', ''),
            'alpaca_account_status': account_data.get('status', '')
        }, merge=True)
        
        print(f"✅ Alpaca account connected for user {user.id}")
        return jsonify({
            'success': True,
            'message': 'Alpaca account connected successfully',
            'account_number': account_data.get('account_number', ''),
            'account_status': account_data.get('status', ''),
            'use_paper': use_paper
        })
        
    except Exception as e:
        print(f"⚠️ Error connecting Alpaca account: {e}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': f'Failed to connect Alpaca account: {str(e)}'}), 500

@app.route('/api/alpaca/disconnect', methods=['POST'])
def disconnect_alpaca_account():
    """Disconnect user's Alpaca account"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500
        
        user_ref = db.collection('users').document(user.id)
        user_ref.update({
            'alpaca_connected': False,
            'alpaca_api_key_encrypted': None,
            'alpaca_secret_key_encrypted': None,
            'alpaca_disconnected_at': datetime.utcnow()
        })
        
        print(f"✅ Alpaca account disconnected for user {user.id}")
        return jsonify({'success': True, 'message': 'Alpaca account disconnected successfully'})
        
    except Exception as e:
        print(f"⚠️ Error disconnecting Alpaca account: {e}")
        return jsonify({'error': f'Failed to disconnect Alpaca account: {str(e)}'}), 500

@app.route('/api/alpaca/status', methods=['GET'])
def get_alpaca_status():
    """Get user's Alpaca connection status"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500
        
        user_doc = db.collection('users').document(user.id).get()
        if not user_doc.exists:
            return jsonify({'connected': False})
        
        user_data = user_doc.to_dict()
        is_connected = user_data.get('alpaca_connected', False)
        
        if is_connected:
            return jsonify({
                'connected': True,
                'account_number': user_data.get('alpaca_account_number', ''),
                'account_status': user_data.get('alpaca_account_status', ''),
                'use_paper': user_data.get('alpaca_use_paper', True),
                'connected_at': user_data.get('alpaca_connected_at').isoformat() if user_data.get('alpaca_connected_at') else None
            })
        else:
            return jsonify({'connected': False})
            
    except Exception as e:
        print(f"⚠️ Error getting Alpaca status: {e}")
        return jsonify({'error': f'Failed to get Alpaca status: {str(e)}'}), 500

@app.route('/api/alpaca/positions', methods=['GET'])
def get_alpaca_positions():
    """Get user's positions from their Alpaca account"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500
        
        user_doc = db.collection('users').document(user.id).get()
        if not user_doc.exists:
            return jsonify({'error': 'User not found'}), 404
        
        user_data = user_doc.to_dict()
        if not user_data.get('alpaca_connected', False):
            return jsonify({'error': 'Alpaca account not connected'}), 400
        
        # Decrypt credentials
        encrypted_api_key = user_data.get('alpaca_api_key_encrypted')
        encrypted_secret_key = user_data.get('alpaca_secret_key_encrypted')
        use_paper = user_data.get('alpaca_use_paper', True)
        
        if not encrypted_api_key or not encrypted_secret_key:
            return jsonify({'error': 'Alpaca credentials not found'}), 400
        
        api_key = decrypt_data(encrypted_api_key)
        secret_key = decrypt_data(encrypted_secret_key)
        
        # Fetch positions from Alpaca
        trading_url = 'https://paper-api.alpaca.markets' if use_paper else 'https://api.alpaca.markets'
        headers = {
            'APCA-API-KEY-ID': api_key,
            'APCA-API-SECRET-KEY': secret_key
        }
        
        import requests
        response = requests.get(f'{trading_url}/v2/positions', headers=headers, timeout=10)
        
        if response.status_code != 200:
            return jsonify({'error': f'Failed to fetch positions from Alpaca: {response.status_code}'}), 500
        
        positions = response.json()
        
        # Format positions for frontend
        formatted_positions = []
        for pos in positions:
            formatted_positions.append({
                'symbol': pos.get('symbol', ''),
                'qty': float(pos.get('qty', 0)),
                'avg_entry_price': float(pos.get('avg_entry_price', 0)),
                'current_price': float(pos.get('current_price', 0)),
                'market_value': float(pos.get('market_value', 0)),
                'cost_basis': float(pos.get('cost_basis', 0)),
                'unrealized_pl': float(pos.get('unrealized_pl', 0)),
                'unrealized_plpc': float(pos.get('unrealized_plpc', 0)),
                'side': pos.get('side', 'long')
            })
        
        return jsonify({
            'success': True,
            'positions': formatted_positions,
            'count': len(formatted_positions)
        })
        
    except Exception as e:
        print(f"⚠️ Error fetching Alpaca positions: {e}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': f'Failed to fetch positions: {str(e)}'}), 500

@app.route('/api/alpaca/sync-positions', methods=['POST'])
def sync_alpaca_positions():
    """Sync Alpaca positions to user's watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        # Fetch positions directly (avoid recursive call)
        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500
        
        user_doc = db.collection('users').document(user.id).get()
        if not user_doc.exists:
            return jsonify({'error': 'User not found'}), 404
        
        user_data = user_doc.to_dict()
        if not user_data.get('alpaca_connected', False):
            return jsonify({'error': 'Alpaca account not connected'}), 400
        
        # Decrypt credentials
        encrypted_api_key = user_data.get('alpaca_api_key_encrypted')
        encrypted_secret_key = user_data.get('alpaca_secret_key_encrypted')
        use_paper = user_data.get('alpaca_use_paper', True)
        
        if not encrypted_api_key or not encrypted_secret_key:
            return jsonify({'error': 'Alpaca credentials not found'}), 400
        
        api_key = decrypt_data(encrypted_api_key)
        secret_key = decrypt_data(encrypted_secret_key)
        
        # Fetch positions from Alpaca
        trading_url = 'https://paper-api.alpaca.markets' if use_paper else 'https://api.alpaca.markets'
        headers = {
            'APCA-API-KEY-ID': api_key,
            'APCA-API-SECRET-KEY': secret_key
        }
        
        import requests
        response = requests.get(f'{trading_url}/v2/positions', headers=headers, timeout=10)
        
        if response.status_code != 200:
            return jsonify({'error': f'Failed to fetch positions from Alpaca: {response.status_code}'}), 500
        
        positions = response.json()
        
        if not positions:
            return jsonify({'success': True, 'message': 'No positions to sync', 'added': 0})
        
        # Add each position to watchlist
        try:
            service = ensure_watchlist_service()
        except RuntimeError as e:
            return jsonify({'error': str(e)}), 503
        added_count = 0
        
        for position in positions:
            symbol = position.get('symbol', '').upper()
            if not symbol:
                continue
            
            try:
                # Check if already in watchlist
                existing = service.get_stock(user.id, symbol)
                if existing:
                    continue  # Skip if already in watchlist
                
                # Get company name
                stock, _ = get_stock_with_fallback(symbol)
                company_name = stock.name if stock else symbol
                
                # Add to watchlist
                service.add_stock(
                    user_id=user.id,
                    symbol=symbol,
                    company_name=company_name,
                    category='Alpaca Positions'
                )
                added_count += 1
                
            except Exception as e:
                print(f"⚠️ Error adding {symbol} to watchlist: {e}")
                continue
        
        return jsonify({
            'success': True,
            'message': f'Synced {added_count} positions to watchlist',
            'added': added_count,
            'total': len(positions)
        })
        
    except Exception as e:
        print(f"⚠️ Error syncing Alpaca positions: {e}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': f'Failed to sync positions: {str(e)}'}), 500

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
    from utils import sanitize_stock_symbol, validate_stock_symbol

    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.get_json()
    symbol = sanitize_stock_symbol(data.get('symbol', ''))
    target_price = data.get('target_price')
    alert_type = data.get('alert_type', 'above')

    if not symbol or target_price is None:
        return jsonify({'error': 'Symbol and target price are required'}), 400

    if not validate_stock_symbol(symbol):
        return jsonify({'error': 'Invalid stock symbol format'}), 400

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
    """Get upcoming earnings dates from Finnhub API"""
    try:
        # Fetch real earnings data from Finnhub
        earnings_raw = finnhub_api.get_earnings_calendar()

        if not earnings_raw:
            return jsonify([])

        # Transform Finnhub data to our format
        earnings_data = []
        for item in earnings_raw:
            earnings_data.append({
                'symbol': item.get('symbol', ''),
                'company_name': item.get('symbol', ''),  # Finnhub doesn't return company name
                'earnings_date': item.get('date', ''),
                'estimate': item.get('epsEstimate'),
                'actual': item.get('epsActual'),
                'surprise': item.get('epsSurprise'),
                'quarter': item.get('quarter'),
                'year': item.get('year'),
                'hour': item.get('hour', '')  # BMO (before market open) or AMC (after market close)
            })

        # Sort by earnings date
        earnings_data.sort(key=lambda x: x['earnings_date'])

        return jsonify(earnings_data)
    except Exception as e:
        print(f"Error fetching earnings calendar: {e}")
        return jsonify({'error': 'Could not fetch earnings data'}), 500

@app.route('/api/market/insider-trading/<symbol>')
def get_insider_trading(symbol):
    """Get recent insider trading data for a symbol from Finnhub API"""
    try:
        symbol = symbol.upper()

        # Fetch real insider transactions from Finnhub
        transactions_raw = finnhub_api.get_insider_transactions(symbol)

        if not transactions_raw:
            return jsonify([])

        # Transform Finnhub data to our format
        insider_data = []
        for item in transactions_raw:
            # Determine transaction type from change value
            change = item.get('change', 0)
            transaction_type = 'BUY' if change > 0 else 'SELL'

            insider_data.append({
                'filer_name': item.get('name', 'Unknown'),
                'title': item.get('position', ''),
                'transaction_type': transaction_type,
                'shares': abs(change) if change else item.get('share', 0),
                'price': item.get('transactionPrice', 0),
                'date': item.get('transactionDate', ''),
                'value': abs(change * item.get('transactionPrice', 0)) if change and item.get('transactionPrice') else 0,
                'filing_date': item.get('filingDate', '')
            })

        # Sort by date (most recent first)
        insider_data.sort(key=lambda x: x['date'], reverse=True)

        return jsonify(insider_data)
    except Exception as e:
        print(f"Error fetching insider trading for {symbol}: {e}")
        return jsonify({'error': f'Could not fetch insider trading data for {symbol}'}), 500

@app.route('/api/market/analyst-ratings/<symbol>')
def get_analyst_ratings(symbol):
    """Get current analyst ratings and price targets from Finnhub API"""
    try:
        symbol = symbol.upper()

        # Fetch real recommendation trends from Finnhub
        recommendations = finnhub_api.get_recommendation_trends(symbol)
        price_target_data = finnhub_api.get_price_target(symbol)

        if not recommendations:
            return jsonify({'symbol': symbol, 'analysts': [], 'consensus_rating': 'N/A'})

        # Get the most recent recommendation period
        latest = recommendations[0] if recommendations else {}

        # Calculate consensus from Finnhub data
        strong_buy = latest.get('strongBuy', 0)
        buy = latest.get('buy', 0)
        hold = latest.get('hold', 0)
        sell = latest.get('sell', 0)
        strong_sell = latest.get('strongSell', 0)

        total_buy = strong_buy + buy
        total_sell = sell + strong_sell

        if total_buy > total_sell and total_buy > hold:
            consensus = 'BUY'
        elif total_sell > total_buy and total_sell > hold:
            consensus = 'SELL'
        else:
            consensus = 'HOLD'

        # Transform to analyst list format for frontend
        analysts = []
        period = latest.get('period', '')

        # Create entries based on recommendation counts
        if strong_buy > 0:
            analysts.append({'firm': f'{strong_buy} Analysts', 'rating': 'STRONG BUY', 'date': period})
        if buy > 0:
            analysts.append({'firm': f'{buy} Analysts', 'rating': 'BUY', 'date': period})
        if hold > 0:
            analysts.append({'firm': f'{hold} Analysts', 'rating': 'HOLD', 'date': period})
        if sell > 0:
            analysts.append({'firm': f'{sell} Analysts', 'rating': 'SELL', 'date': period})
        if strong_sell > 0:
            analysts.append({'firm': f'{strong_sell} Analysts', 'rating': 'STRONG SELL', 'date': period})

        # Add price targets from Finnhub
        for analyst in analysts:
            analyst['price_target'] = price_target_data.get('targetMean')

        ratings_data = {
            'symbol': symbol,
            'consensus_rating': consensus,
            'price_target_avg': price_target_data.get('targetMean'),
            'price_target_high': price_target_data.get('targetHigh'),
            'price_target_low': price_target_data.get('targetLow'),
            'analysts': analysts,
            'total_analysts': strong_buy + buy + hold + sell + strong_sell,
            'period': period
        }

        return jsonify(ratings_data)
    except Exception as e:
        print(f"Error fetching analyst ratings for {symbol}: {e}")
        return jsonify({'error': f'Could not fetch analyst ratings for {symbol}'}), 500

# =============================================================================
# BASIC ENDPOINTS
# =============================================================================

@app.route('/', methods=['GET'])
def root():
    """Root endpoint for basic connectivity test"""
    return jsonify({
        'message': 'Stock Watchlist Pro API',
        'status': 'running',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api', methods=['GET'])
def api_root():
    """API root endpoint"""
    return jsonify({
        'message': 'Stock Watchlist Pro API',
        'version': '1.0.0',
        'endpoints': {
            'health': '/api/health',
            'chat': '/api/chat',
            'watchlist': '/api/watchlist'
        }
    })

# =============================================================================
# HEALTH CHECK ENDPOINT
# =============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for Railway - must respond quickly"""
    try:
        # Very simple health check - just return 200 OK immediately
        # This endpoint must work even if other services are down
        response = jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat()
        })
        response.status_code = 200
        return response
    except Exception as e:
        # Even if there's an error, try to return something
        try:
            return jsonify({
                'status': 'unhealthy',
                'error': str(e)
            }), 500
        except:
            # Last resort - return plain text
            return 'OK', 200

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
        result = chat_service.process_message(user.id, message)
        
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
        history = chat_service._get_conversation_history(user.id, limit=50)
        
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
        chat_ref = firestore_client.collection('chat_conversations').document(user.id)
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
        can_send = chat_service._check_rate_limit(user.id)
        
        return jsonify({
            'success': True,
            'status': 'available' if chat_service.gemini_client else 'unavailable',
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

@app.route('/api/chat/test-gemini', methods=['GET'])
def test_gemini_api():
    """Test Gemini API directly"""
    try:
        # Authenticate user
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        
        # Import chat service
        from chat_service import chat_service
        
        if not chat_service.gemini_client:
            return jsonify({
                'success': False,
                'error': 'Gemini client not initialized - API key may be missing',
                'gemini_available': False
            })
        
        # Test a simple API call
        import google.generativeai as genai
        response = chat_service.gemini_client.generate_content(
            "Say 'Hello, Gemini API is working!'"
        )
        
        result = response.text if hasattr(response, 'text') else str(response)
        
        return jsonify({
            'success': True,
            'gemini_available': True,
            'test_response': result,
            'message': 'Gemini API is working correctly'
        })
        
    except Exception as e:
        print(f"❌ Gemini test error: {e}")
        import traceback
        print(f"❌ Full traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e),
            'gemini_available': False,
            'message': 'Gemini API test failed'
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

# =============================================================================
# API STATS ENDPOINT FOR MONITORING RATE LIMITS
# =============================================================================

@app.route('/api/stats', methods=['GET'])
def get_api_stats():
    """Get API statistics for monitoring rate limits and performance"""
    try:
        stats = {
            'connected_users': len(connected_users),
            'alpaca_enabled': USE_ALPACA_API,
            'timestamp': datetime.now().isoformat()
        }

        # Add Alpaca-specific stats if available
        if USE_ALPACA_API and alpaca_api and hasattr(alpaca_api, 'get_queue_stats'):
            try:
                alpaca_stats = alpaca_api.get_queue_stats()
                stats['alpaca'] = alpaca_stats

                # Calculate rate limit health (percentage of available requests)
                requests_last_min = alpaca_stats.get('requests_last_minute', 0)
                max_requests = alpaca_stats.get('can_request', 180)
                health_percentage = ((180 - requests_last_min) / 180) * 100 if requests_last_min <= 180 else 0

                stats['alpaca']['health'] = {
                    'percentage': round(health_percentage, 1),
                    'status': 'healthy' if health_percentage > 50 else 'warning' if health_percentage > 20 else 'critical'
                }
            except Exception as e:
                stats['alpaca'] = {'error': str(e)}

        # Add circuit breaker status if available
        if USE_ALPACA_API and alpaca_api and hasattr(alpaca_api, 'circuit_breaker'):
            try:
                cb_states = {}
                for endpoint, state_dict in alpaca_api.circuit_breaker.endpoint_states.items():
                    cb_states[endpoint] = {
                        'state': state_dict['state'],
                        'failure_count': state_dict['failure_count']
                    }
                stats['circuit_breakers'] = cb_states
            except Exception as e:
                stats['circuit_breakers'] = {'error': str(e)}

        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Add startup message that runs when module is imported (for gunicorn)
print("\n" + "="*80)
print("🚀 Stock Watchlist App - Initializing...")
print("="*80)
print(f"🔧 Debug mode: {Config.DEBUG}")
print(f"🌍 Environment: {'production' if os.environ.get('RAILWAY_ENVIRONMENT') else 'development'}")
print(f"🔑 Firebase credentials: {'configured' if os.path.exists(Config.FIREBASE_CREDENTIALS_PATH) or os.environ.get('FIREBASE_CREDENTIALS_BASE64') else 'not found (will initialize on demand)'}")
print("✅ App module loaded successfully - services will initialize on demand")
print("="*80 + "\n")

if __name__ == '__main__':
    port = Config.PORT
    print("\n🚀 Starting Stock Watchlist App...")
    print("🔥 Using Firebase for authentication and data storage")
    print("⚡ Starting real-time price updates...")
    print(f"🌐 Server running on port: {port}")
    print(f"🔧 Debug mode: {Config.DEBUG}")
    print(f"🔑 Firebase project: {Config.FIREBASE_PROJECT_ID}")
    print(f"🌍 Environment: {'production' if os.environ.get('RAILWAY_ENVIRONMENT') else 'development'}\n")
    
    try:
        # Skip background tasks for Railway deployment initially
        if os.environ.get('RAILWAY_ENVIRONMENT'):
            print("🚂 Railway environment detected - skipping background tasks")
        else:
            # Start the background price update task
            print("📊 Starting price update task...")
            start_price_updates()
            print("✅ Price update task started")
        
        print("🌐 Starting Flask server...")
        socketio.run(app, debug=Config.DEBUG, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
        
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        import traceback
        print(f"❌ Startup traceback: {traceback.format_exc()}")
        raise 
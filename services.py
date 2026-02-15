import logging
import os
import threading
import time
import signal
from functools import wraps
from collections import defaultdict, OrderedDict
from datetime import datetime, timedelta, timezone

try:
    import zoneinfo
except ImportError:
    try:
        from backports import zoneinfo
    except ImportError:
        zoneinfo = None

from flask import request, jsonify
from flask_login import current_user

from stock import Stock, YahooFinanceAPI, NewsAPI, FinnhubAPI, AlpacaAPI, CompanyInfoService, StocktwitsAPI
from firebase_service import FirebaseService, get_firestore_client, FirebaseUser
from watchlist_service import get_watchlist_service
from config import Config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# API instances
# ---------------------------------------------------------------------------
yahoo_finance_api = YahooFinanceAPI()
news_api = NewsAPI()
stocktwits_api = StocktwitsAPI()
finnhub_api = FinnhubAPI()
company_info_service = CompanyInfoService()

USE_ALPACA_API = os.getenv('USE_ALPACA_API', 'false').lower() == 'true'
alpaca_api = AlpacaAPI() if USE_ALPACA_API else None

if USE_ALPACA_API:
    has_keys = alpaca_api and alpaca_api.api_key and alpaca_api.secret_key
    logger.info("=" * 60)
    logger.info("ALPACA API CONFIGURATION")
    logger.info("=" * 60)
    logger.info("Alpaca API enabled: %s", USE_ALPACA_API)
    logger.info("API keys configured: %s", has_keys)
    if alpaca_api:
        logger.info("Base URL: %s", alpaca_api.base_url)
        if has_keys:
            logger.info("API Key: %s...%s", alpaca_api.api_key[:8], alpaca_api.api_key[-4:] if len(alpaca_api.api_key) > 12 else '***')
    logger.info("Will use Alpaca for price data with Yahoo fallback")
    logger.info("=" * 60)
else:
    logger.info("=" * 60)
    logger.info("YAHOO FINANCE ONLY MODE")
    logger.info("=" * 60)
    logger.info("Alpaca API disabled - using Yahoo Finance only")
    logger.info("To enable Alpaca, set USE_ALPACA_API=true in environment variables")
    logger.info("=" * 60)

# ---------------------------------------------------------------------------
# Stock helpers
# ---------------------------------------------------------------------------

def get_price_api():
    """Get the appropriate API for price lookups. Returns Alpaca if enabled, otherwise Yahoo."""
    return alpaca_api if USE_ALPACA_API and alpaca_api else yahoo_finance_api


def get_stock_with_fallback(symbol):
    """Get stock data, trying Alpaca first if enabled, then falling back to Yahoo.
    Returns tuple: (stock, api_used) where api_used is 'alpaca' or 'yahoo'
    """
    stock = None
    api_used = None

    if USE_ALPACA_API and alpaca_api:
        try:
            logger.debug("[ALPACA] Attempting to fetch %s from Alpaca API...", symbol)
            stock = Stock(symbol, alpaca_api)
            stock.retrieve_data()
            if stock.name and stock.price and 'not found' not in stock.name.lower():
                logger.info("[ALPACA] Successfully fetched %s from Alpaca: $%.2f (%s)", symbol, stock.price, stock.name)
                api_used = 'alpaca'
                if not hasattr(stock, '_api_source'):
                    stock._api_source = 'alpaca'
                return stock, api_used
            else:
                logger.warning("[ALPACA] Got data for %s but it's invalid, falling back to Yahoo", symbol)
        except Exception as e:
            logger.error("[ALPACA] Failed for %s, falling back to Yahoo: %s", symbol, e)

    try:
        logger.debug("[YAHOO] Fetching %s from Yahoo Finance (fallback)...", symbol)
        stock = Stock(symbol, yahoo_finance_api)
        stock.retrieve_data()
        if stock.name and stock.price:
            logger.info("[YAHOO] Successfully fetched %s from Yahoo: $%.2f (%s)", symbol, stock.price, stock.name)
        api_used = 'yahoo'
        if not hasattr(stock, '_api_source'):
            stock._api_source = 'yahoo'
        return stock, api_used
    except Exception as e:
        logger.error("[YAHOO] Also failed for %s: %s", symbol, e)
        return None, 'none'


def get_stock_alpaca_only(symbol):
    """Get stock data using ONLY Alpaca API (no Yahoo fallback).
    Used specifically for watchlist requests.
    Returns tuple: (stock, api_used) where api_used is 'alpaca' or None if failed
    """
    if not USE_ALPACA_API or not alpaca_api:
        logger.warning("[WATCHLIST] Alpaca API not enabled or not available for %s", symbol)
        return None, None

    try:
        logger.debug("[WATCHLIST-ALPACA] Fetching %s from Alpaca API only (no Yahoo fallback)...", symbol)
        stock = Stock(symbol, alpaca_api)
        stock.retrieve_data()
        if stock.name and stock.price and 'not found' not in stock.name.lower():
            logger.info("[WATCHLIST-ALPACA] Successfully fetched %s from Alpaca: $%.2f (%s)", symbol, stock.price, stock.name)
            api_used = 'alpaca'
            if not hasattr(stock, '_api_source'):
                stock._api_source = 'alpaca'
            return stock, api_used
        else:
            logger.warning("[WATCHLIST-ALPACA] Got invalid data for %s, returning None", symbol)
            return None, None
    except Exception as e:
        logger.error("[WATCHLIST-ALPACA] Failed for %s: %s", symbol, e)
        return None, None

# ---------------------------------------------------------------------------
# Watchlist service (lazy)
# ---------------------------------------------------------------------------
logger.info("WatchlistService initialization deferred - will initialize on first use")
firestore_client = None
watchlist_service = None


def get_watchlist_service_lazy():
    """Lazy initialization of watchlist service - only when needed"""
    global firestore_client, watchlist_service
    if watchlist_service is None:
        try:
            logger.info("Initializing WatchlistService (lazy)...")
            firestore_client = get_firestore_client()
            if firestore_client is not None:
                watchlist_service = get_watchlist_service(firestore_client)
                logger.info("WatchlistService initialized successfully")
            else:
                logger.warning("Firestore client not available - WatchlistService unavailable")
        except Exception as e:
            logger.error("Failed to initialize WatchlistService: %s", e)
            import traceback
            logger.error("WatchlistService traceback: %s", traceback.format_exc())
            firestore_client = None
            watchlist_service = None
    return watchlist_service


def ensure_watchlist_service():
    """Ensure watchlist service is initialized, return it or raise error"""
    service = get_watchlist_service_lazy()
    if service is None:
        raise RuntimeError("WatchlistService is not available - Firebase may not be configured")
    return service

# ---------------------------------------------------------------------------
# WebSocket connection state
# ---------------------------------------------------------------------------
connected_users = {}
connection_timestamps = {}
MAX_CONNECTIONS = 500
CONNECTION_TIMEOUT = 3600  # 1 hour

active_stocks = defaultdict(set)
active_stocks_timestamps = defaultdict(dict)
ACTIVE_STOCK_TIMEOUT = 60


def cleanup_inactive_connections():
    """Clean up inactive WebSocket connections and associated data"""
    current_time = time.time()
    to_remove = []

    for sid, timestamp in connection_timestamps.items():
        if current_time - timestamp > CONNECTION_TIMEOUT:
            to_remove.append(sid)

    for sid in to_remove:
        user_id = connected_users.get(sid)
        if sid in connected_users:
            del connected_users[sid]
        if sid in connection_timestamps:
            del connection_timestamps[sid]
        if user_id:
            if user_id in active_stocks:
                del active_stocks[user_id]
            if user_id in active_stocks_timestamps:
                del active_stocks_timestamps[user_id]

    if to_remove:
        logger.info("Cleaned up %s inactive WebSocket connections", len(to_remove))


def limit_connections():
    """Ensure we don't exceed max connections"""
    if len(connected_users) > MAX_CONNECTIONS:
        sorted_connections = sorted(connection_timestamps.items(), key=lambda x: x[1])
        to_remove = sorted_connections[:len(connected_users) - MAX_CONNECTIONS]

        for sid, _ in to_remove:
            user_id = connected_users.get(sid)
            if sid in connected_users:
                del connected_users[sid]
            if sid in connection_timestamps:
                del connection_timestamps[sid]
            if user_id:
                if user_id in active_stocks:
                    del active_stocks[user_id]
                if user_id in active_stocks_timestamps:
                    del active_stocks_timestamps[user_id]

        logger.info("Removed %s old connections to stay under limit", len(to_remove))

# ---------------------------------------------------------------------------
# Request tracking
# ---------------------------------------------------------------------------
active_requests = OrderedDict()
request_lock = threading.Lock()
MAX_ACTIVE_REQUESTS = 1000


def cleanup_request(request_id):
    """Clean up request tracking to prevent memory leaks"""
    with request_lock:
        active_requests.pop(request_id, None)


def cleanup_old_requests():
    """Clean up old requests to prevent memory buildup"""
    with request_lock:
        while len(active_requests) > MAX_ACTIVE_REQUESTS:
            active_requests.popitem(last=False)

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

class RateLimiter:
    def __init__(self, max_requests=10, window_seconds=60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)
        self.lock = threading.Lock()
        self.last_cleanup = time.time()
        self.cleanup_interval = 300

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
        logger.info("Cleaned up %s inactive rate limit entries", len(users_to_remove))

    def is_allowed(self, user_id):
        with self.lock:
            now = time.time()
            user_requests = self.requests[user_id]
            user_requests[:] = [req_time for req_time in user_requests if now - req_time < self.window_seconds]
            if len(user_requests) >= self.max_requests:
                return False
            user_requests.append(now)
            self._cleanup_old_users()
            return True


rate_limiter = RateLimiter(max_requests=20, window_seconds=60)

# ---------------------------------------------------------------------------
# Timeout decorator
# ---------------------------------------------------------------------------

def timeout_handler(signum, frame):
    raise TimeoutError("Request timed out")


def with_timeout(seconds=25):
    """Decorator to add timeout to functions"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            old_handler = signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(seconds)
            try:
                result = func(*args, **kwargs)
                return result
            except TimeoutError:
                logger.warning("Function %s timed out after %s seconds", func.__name__, seconds)
                return jsonify({'error': 'Request timed out'}), 408
            finally:
                signal.alarm(0)
                signal.signal(signal.SIGALRM, old_handler)
        return wrapper
    return decorator

# ---------------------------------------------------------------------------
# Authentication helper
# ---------------------------------------------------------------------------

def authenticate_request():
    """Lightweight authentication that avoids Firestore calls to prevent memory leaks"""
    request_id = id(request)

    cleanup_old_requests()

    try:
        if current_user.is_authenticated:
            return current_user

        auth_header = request.headers.get('Authorization')

        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')

            try:
                decoded_token = FirebaseService.verify_token(token)

                if not decoded_token:
                    return None

                uid = decoded_token.get('uid')
                if not uid:
                    return None

                user_profile = {
                    'uid': uid,
                    'name': decoded_token.get('name', 'User'),
                    'email': decoded_token.get('email', ''),
                    'id': uid
                }
                firebase_user = FirebaseUser(user_profile)
                return firebase_user
            except Exception as e:
                logger.error("Token authentication failed: %s", e)
                return None

        return None
    except Exception as e:
        logger.error("Authentication error: %s", e)
        return None

# ---------------------------------------------------------------------------
# Market status helper
# ---------------------------------------------------------------------------

def get_market_status():
    """Get current market status in Eastern Time"""
    try:
        if zoneinfo:
            try:
                et_tz = zoneinfo.ZoneInfo("America/New_York")
            except:
                et_tz = timezone(timedelta(hours=-4))
        else:
            et_tz = timezone(timedelta(hours=-4))

        now_et = datetime.now(et_tz)

        is_weekday = now_et.weekday() < 5
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
        logger.error("Error getting market status: %s", e)
        return {
            'isOpen': False,
            'status': 'Market status unknown',
            'last_updated': datetime.now().isoformat()
        }

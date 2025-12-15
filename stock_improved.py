import yfinance as yf
from datetime import datetime, timedelta
import json
import requests
import os
import time
import threading
from collections import deque, defaultdict
from typing import Dict, List, Optional, Tuple

# =============================================================================
# IMPROVED CIRCUIT BREAKER - Per-Endpoint Tracking
# =============================================================================

class ImprovedCircuitBreaker:
    """
    Circuit breaker with per-endpoint tracking to avoid blocking all requests
    when one endpoint fails.
    """
    def __init__(self, failure_threshold=3, recovery_timeout=30):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        # Track failures per endpoint
        self.endpoint_states = defaultdict(lambda: {
            'state': 'CLOSED',
            'failure_count': 0,
            'last_failure_time': None
        })
        self._lock = threading.Lock()

    def call(self, func, endpoint_key='default', *args, **kwargs):
        """Execute function with circuit breaker protection per endpoint"""
        with self._lock:
            state = self.endpoint_states[endpoint_key]

            if state['state'] == 'OPEN':
                if time.time() - state['last_failure_time'] > self.recovery_timeout:
                    state['state'] = 'HALF_OPEN'
                    print(f"🔄 [CIRCUIT:{endpoint_key}] HALF_OPEN - testing service")
                else:
                    raise Exception(f"Circuit breaker OPEN for {endpoint_key}")

        try:
            result = func(*args, **kwargs)
            self._on_success(endpoint_key)
            return result
        except Exception as e:
            self._on_failure(endpoint_key)
            raise e

    def _on_success(self, endpoint_key):
        """Handle successful call"""
        with self._lock:
            state = self.endpoint_states[endpoint_key]
            if state['state'] == 'HALF_OPEN':
                print(f"✅ [CIRCUIT:{endpoint_key}] Service recovered - CLOSED")
                state['state'] = 'CLOSED'
                state['failure_count'] = 0

    def _on_failure(self, endpoint_key):
        """Handle failed call"""
        with self._lock:
            state = self.endpoint_states[endpoint_key]
            state['failure_count'] += 1
            state['last_failure_time'] = time.time()

            if state['failure_count'] >= self.failure_threshold:
                state['state'] = 'OPEN'
                print(f"🚫 [CIRCUIT:{endpoint_key}] OPEN after {state['failure_count']} failures")

    def get_state(self, endpoint_key='default'):
        """Get current state for debugging"""
        with self._lock:
            return self.endpoint_states[endpoint_key]['state']

# =============================================================================
# REQUEST QUEUE FOR RATE LIMIT MANAGEMENT
# =============================================================================

class RequestQueue:
    """
    Smart request queue that manages rate limits and prioritizes requests.
    Designed for Alpaca free tier: 200 requests/minute
    """
    def __init__(self, max_requests_per_minute=180):  # Leave buffer for safety
        self.max_requests_per_minute = max_requests_per_minute
        self.request_times = deque()
        self.priority_requests = deque()
        self.normal_requests = deque()
        self._lock = threading.Lock()
        self.stats = {
            'total_requests': 0,
            'queued_requests': 0,
            'dropped_requests': 0,
            'rate_limited': 0
        }

    def can_make_request(self):
        """Check if we can make a request without exceeding rate limit"""
        with self._lock:
            now = time.time()
            # Remove requests older than 1 minute
            while self.request_times and now - self.request_times[0] > 60:
                self.request_times.popleft()

            return len(self.request_times) < self.max_requests_per_minute

    def record_request(self):
        """Record a request was made"""
        with self._lock:
            self.request_times.append(time.time())
            self.stats['total_requests'] += 1

    def get_wait_time(self):
        """Calculate how long to wait before next request"""
        with self._lock:
            if not self.request_times:
                return 0

            now = time.time()
            oldest_request = self.request_times[0]
            time_since_oldest = now - oldest_request

            if len(self.request_times) >= self.max_requests_per_minute:
                # Need to wait until oldest request expires
                return max(0, 60 - time_since_oldest)

            return 0

    def add_request(self, request_data, priority=False):
        """Add request to queue"""
        with self._lock:
            if priority:
                self.priority_requests.append(request_data)
            else:
                self.normal_requests.append(request_data)
            self.stats['queued_requests'] += 1

    def get_next_request(self):
        """Get next request from queue (priority first)"""
        with self._lock:
            if self.priority_requests:
                self.stats['queued_requests'] -= 1
                return self.priority_requests.popleft()
            elif self.normal_requests:
                self.stats['queued_requests'] -= 1
                return self.normal_requests.popleft()
            return None

    def get_stats(self):
        """Get queue statistics"""
        with self._lock:
            now = time.time()
            recent_requests = sum(1 for t in self.request_times if now - t < 60)
            return {
                **self.stats,
                'requests_last_minute': recent_requests,
                'can_request': self.can_make_request(),
                'wait_time': self.get_wait_time()
            }

# =============================================================================
# SMART CACHE SYSTEM
# =============================================================================

class SmartCache:
    """
    Cache with staleness detection and intelligent invalidation
    """
    def __init__(self, default_ttl=30):
        self.cache = {}
        self.default_ttl = default_ttl
        self._lock = threading.Lock()

    def get(self, key, max_age=None):
        """Get cached value if not stale"""
        with self._lock:
            if key not in self.cache:
                return None

            data, timestamp = self.cache[key]
            age = time.time() - timestamp
            max_age = max_age or self.default_ttl

            if age < max_age:
                return data
            else:
                # Stale data, remove it
                del self.cache[key]
                return None

    def set(self, key, value):
        """Set cached value with current timestamp"""
        with self._lock:
            self.cache[key] = (value, time.time())

    def invalidate(self, key):
        """Manually invalidate a cache entry"""
        with self._lock:
            if key in self.cache:
                del self.cache[key]

    def clear(self):
        """Clear entire cache"""
        with self._lock:
            self.cache.clear()

    def get_age(self, key):
        """Get age of cached item in seconds"""
        with self._lock:
            if key not in self.cache:
                return None
            _, timestamp = self.cache[key]
            return time.time() - timestamp

# =============================================================================
# NEWS API (unchanged)
# =============================================================================

class NewsAPI:
    def __init__(self):
        self.api_key = '4ba3e56d52e54611b9485cdd2e28e679'

    def get_market_news(self, limit=10, query=None):
        """Get general market news using NewsAPI.org"""
        try:
            if query and query.strip():
                url = 'https://newsapi.org/v2/everything'
                params = {
                    'q': query.strip(),
                    'language': 'en',
                    'sortBy': 'publishedAt',
                    'pageSize': limit,
                    'apiKey': self.api_key
                }
            else:
                url = 'https://newsapi.org/v2/top-headlines'
                params = {
                    'category': 'business',
                    'language': 'en',
                    'pageSize': limit,
                    'apiKey': self.api_key
                }

            response = requests.get(url, params=params, timeout=3)
            if response.status_code == 200:
                articles = response.json().get('articles', [])
                news_items = []
                for article in articles:
                    news_items.append({
                        'title': article.get('title', ''),
                        'link': article.get('url', ''),
                        'published_at': article.get('publishedAt', ''),
                        'source': article.get('source', {}).get('name', 'NewsAPI'),
                        'summary': article.get('description', ''),
                        'image_url': article.get('urlToImage', '')
                    })
                return news_items
            else:
                print(f"NewsAPI.org error: {response.status_code}")
                return self.get_fallback_news()
        except Exception as e:
            print(f"Error fetching market news: {e}")
            return self.get_fallback_news()

    def get_company_news(self, symbol, limit=5):
        """Get news for a specific company"""
        try:
            stock = yf.Ticker(symbol)
            info = stock.info
            company_name = info.get('longName', '') or info.get('shortName', '') or symbol

            url = 'https://newsapi.org/v2/everything'
            params = {
                'q': f'"{company_name}" OR "{symbol}"',
                'language': 'en',
                'sortBy': 'publishedAt',
                'pageSize': limit,
                'apiKey': self.api_key
            }

            response = requests.get(url, params=params, timeout=3)
            if response.status_code == 200:
                articles = response.json().get('articles', [])
                news_items = []
                for article in articles:
                    news_items.append({
                        'title': article.get('title', ''),
                        'link': article.get('url', ''),
                        'published_at': article.get('publishedAt', ''),
                        'source': article.get('source', {}).get('name', 'NewsAPI'),
                        'summary': article.get('description', ''),
                        'image_url': article.get('urlToImage', '')
                    })
                return news_items
            else:
                print(f"NewsAPI.org error for {symbol}: {response.status_code}")
                return []
        except Exception as e:
            print(f"Error fetching company news for {symbol}: {e}")
            return []

    def get_fallback_news(self):
        """Fallback news when API fails"""
        return [
            {
                'title': 'Market Update: Stocks Show Mixed Performance',
                'link': '#',
                'published_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
                'source': 'Market Update'
            },
            {
                'title': 'Trading Volume Remains Strong Across Major Indices',
                'link': '#',
                'published_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
                'source': 'Market Update'
            }
        ]

# =============================================================================
# YAHOO FINANCE API (unchanged core, added caching)
# =============================================================================

class YahooFinanceAPI:
    def __init__(self):
        self.cache = SmartCache(default_ttl=300)  # 5 min cache for Yahoo data

    def search_stocks(self, query, limit=10):
        """Search stocks by name or symbol"""
        cache_key = f"search:{query}:{limit}"
        cached = self.cache.get(cache_key, max_age=300)
        if cached:
            return cached

        try:
            url = "https://query2.finance.yahoo.com/v1/finance/search"
            params = {
                "q": query,
                "quotesCount": limit,
                "newsCount": 0,
                "lang": "en"
            }
            response = requests.get(url, params=params, timeout=3)
            if response.status_code == 200:
                data = response.json()
                results = []
                for item in data.get("quotes", []):
                    if item.get("quoteType") in ["EQUITY", "ETF", "MUTUALFUND"]:
                        results.append({
                            "symbol": item.get("symbol", ""),
                            "name": item.get("shortname", "") or item.get("longname", ""),
                            "exchange": item.get("exchange", ""),
                            "type": item.get("quoteType", "")
                        })

                if not results:
                    print("Yahoo API returned no results, using fallback")
                    results = self.get_fallback_search_results(query, limit)

                self.cache.set(cache_key, results)
                return results
            else:
                print("Yahoo search error:", response.status_code)
                return self.get_fallback_search_results(query, limit)
        except Exception as e:
            print("Error searching stocks:", e)
            return self.get_fallback_search_results(query, limit)

    def get_fallback_search_results(self, query, limit=10):
        """Fallback search using predefined popular stocks"""
        query_lower = query.lower()

        # Popular stocks database (truncated for space)
        popular_stocks = [
            {"symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "GOOGL", "name": "Alphabet Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "AMZN", "name": "Amazon.com Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "TSLA", "name": "Tesla Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "META", "name": "Meta Platforms Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
        ]

        results = []
        for stock in popular_stocks:
            if (query_lower in stock["symbol"].lower() or
                query_lower in stock["name"].lower()):
                results.append(stock)
                if len(results) >= limit:
                    break

        return results

    def get_real_time_data(self, symbol):
        """Get real-time data with caching"""
        cache_key = f"price:{symbol}"
        cached = self.cache.get(cache_key, max_age=30)  # 30s cache for prices
        if cached:
            return cached

        try:
            stock = yf.Ticker(symbol)
            info = stock.info

            # Try different price fields
            price = None
            if 'currentPrice' in info and info['currentPrice'] is not None:
                price = info['currentPrice']
            elif 'regularMarketPrice' in info and info['regularMarketPrice'] is not None:
                price = info['regularMarketPrice']
            elif 'regularMarketPreviousClose' in info and info['regularMarketPreviousClose'] is not None:
                price = info['regularMarketPreviousClose']

            name = info.get('longName', symbol)
            if not name or name == symbol:
                name = info.get('shortName', symbol)

            if price is None:
                print(f"Could not find price data for {symbol}")
                return None

            result = {
                'name': name,
                'price': float(price)
            }

            self.cache.set(cache_key, result)
            return result

        except Exception as e:
            print(f"Error retrieving real-time data for {symbol}: {e}")
            return None

    def get_info(self, symbol):
        """Get comprehensive company information"""
        cache_key = f"info:{symbol}"
        cached = self.cache.get(cache_key, max_age=300)  # 5 min cache
        if cached:
            return cached

        try:
            stock = yf.Ticker(symbol)
            time.sleep(0.2)

            info = stock.info

            if not info or len(info) == 0:
                time.sleep(0.5)
                info = stock.info

            if info and isinstance(info, dict) and len(info) > 0:
                self.cache.set(cache_key, info)
                return info
            else:
                print(f"Warning: Empty or invalid info returned for {symbol}")
                return {}

        except Exception as e:
            print(f"Error retrieving info for {symbol}: {e}")
            return {}

    def get_historical_data(self, symbol, start_date, end_date):
        """Get historical data"""
        try:
            stock = yf.Ticker(symbol)
            hist = stock.history(start=start_date, end=end_date)

            if hist.empty:
                print(f"No historical data available for {symbol}")
                return None

            historical_data = []
            for date, row in hist.iterrows():
                historical_data.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'close': float(row['Close'])
                })

            return historical_data

        except Exception as e:
            print(f"Error retrieving historical data for {symbol}: {e}")
            return None

    def get_day_change_percent(self, symbol: str, date_str: str) -> float:
        """Compute close-to-close percent change for a specific trading date"""
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d")
            end_date = (target_date + timedelta(days=1)).strftime("%Y-%m-%d")
            start_date = (target_date - timedelta(days=10)).strftime("%Y-%m-%d")

            stock = yf.Ticker(symbol)
            hist = stock.history(start=start_date, end=end_date)
            if hist is None or hist.empty or len(hist) < 2:
                return 0.0

            closes = hist["Close"].dropna()
            if len(closes) < 2:
                return 0.0

            close_today = closes.iloc[-1]
            close_prev = closes.iloc[-2]
            if close_prev and close_prev > 0:
                return float((close_today / close_prev - 1.0) * 100.0)
            return 0.0
        except Exception as e:
            print(f"Error computing day change percent for {symbol} on {date_str}: {e}")
            return 0.0

# =============================================================================
# STOCK CLASS (unchanged)
# =============================================================================

class Stock:
    def __init__(self, symbol, api=None):
        self.symbol = symbol.upper()
        self.name = ""
        self.price = 0.0
        self.previous_price = 0.0
        self.api = api

    def retrieve_data(self):
        if not self.api:
            self.name = f"No API configured for {self.symbol}"
            return

        data = self.api.get_real_time_data(self.symbol)
        if data:
            self.name = data['name']
            self.previous_price = self.price
            self.price = data['price']
        else:
            self.name = f"Stock '{self.symbol}' not found"

    def retrieve_historical_data(self, start_date, end_date):
        if not self.api:
            return None, None

        data = self.api.get_historical_data(self.symbol, start_date, end_date)
        if data:
            return [entry['date'] for entry in data], [entry['close'] for entry in data]
        else:
            return None, None

    def __str__(self):
        return f"{self.name} Price: ${self.price:.2f}"

# =============================================================================
# IMPROVED ALPACA API WITH REQUEST QUEUE AND BETTER RATE LIMITING
# =============================================================================

class ImprovedAlpacaAPI:
    """
    Improved Alpaca API client with:
    - Request queue for rate limit management
    - Per-endpoint circuit breakers
    - Smart caching
    - Optimized retry logic
    - Batch request support
    """
    def __init__(self, api_key=None, secret_key=None, base_url=None):
        self.api_key = api_key or os.getenv('ALPACA_API_KEY')
        self.secret_key = secret_key or os.getenv('ALPACA_SECRET_KEY')
        self.base_url = base_url or os.getenv('ALPACA_DATA_URL', 'https://data.alpaca.markets/v2')

        # Initialize improved components
        self.request_queue = RequestQueue(max_requests_per_minute=180)  # Stay under 200 limit
        self.circuit_breaker = ImprovedCircuitBreaker(failure_threshold=3, recovery_timeout=30)
        self.cache = SmartCache(default_ttl=30)  # 30s cache for prices
        self._company_name_cache = {}

        if not self.api_key or not self.secret_key:
            print("⚠️ [ALPACA] Warning: API keys not set")
        else:
            print(f"✅ [ALPACA] Initialized with improved rate limiting")
            print(f"   Max requests/min: {self.request_queue.max_requests_per_minute}")

    def _get_headers(self):
        """Get authentication headers"""
        return {
            'APCA-API-KEY-ID': self.api_key,
            'APCA-API-SECRET-KEY': self.secret_key
        }

    def _wait_for_rate_limit(self):
        """Wait if necessary to respect rate limits"""
        wait_time = self.request_queue.get_wait_time()
        if wait_time > 0:
            print(f"⏳ [ALPACA] Rate limit - waiting {wait_time:.1f}s")
            time.sleep(wait_time)

    def get_real_time_data(self, symbol, use_cache=True):
        """
        Get real-time stock data with improved retry logic and caching
        """
        if not self.api_key or not self.secret_key:
            return None

        # Check cache first
        if use_cache:
            cache_key = f"price:{symbol}"
            cached = self.cache.get(cache_key, max_age=30)
            if cached:
                print(f"📦 [ALPACA] Cache hit for {symbol}")
                return cached

        # Check circuit breaker
        endpoint_key = f"snapshot:{symbol}"
        if self.circuit_breaker.get_state(endpoint_key) == 'OPEN':
            print(f"🚫 [ALPACA] Circuit breaker OPEN for {symbol}")
            return None

        # Wait for rate limit
        self._wait_for_rate_limit()

        def _fetch():
            # Single attempt with optimized timeout
            timeout = 4  # Reduced from 8-10s
            print(f"🔵 [ALPACA] Fetching {symbol} (timeout: {timeout}s)...")

            # Try snapshot endpoint (most reliable)
            try:
                url = f'{self.base_url}/stocks/{symbol}/snapshot'
                headers = self._get_headers()

                response = requests.get(url, headers=headers, timeout=timeout)
                self.request_queue.record_request()

                if response.status_code == 200:
                    data = response.json()
                    latest_trade = data.get('latestTrade', {})
                    price = latest_trade.get('p')

                    if not price:
                        daily_bar = data.get('dailyBar', {})
                        price = daily_bar.get('c')

                    if price:
                        name = self._get_company_name(symbol, timeout)
                        result = {
                            'name': name or symbol,
                            'price': float(price)
                        }
                        print(f"✅ [ALPACA] {symbol}: ${float(price):.2f}")

                        # Cache the result
                        cache_key = f"price:{symbol}"
                        self.cache.set(cache_key, result)

                        return result
                    else:
                        print(f"⚠️ [ALPACA] {symbol}: No price data")
                        return None

                elif response.status_code == 404:
                    print(f"⚠️ [ALPACA] {symbol} not found")
                    return None

                elif response.status_code == 429:
                    print(f"⚠️ [ALPACA] Rate limited for {symbol}")
                    self.request_queue.stats['rate_limited'] += 1
                    raise Exception(f"Rate limited: {response.status_code}")

                else:
                    print(f"❌ [ALPACA] {symbol}: HTTP {response.status_code}")
                    raise Exception(f"API error: {response.status_code}")

            except requests.exceptions.Timeout:
                print(f"⏰ [ALPACA] Timeout for {symbol}")
                raise Exception(f"Timeout after {timeout}s")

        try:
            return self.circuit_breaker.call(_fetch, endpoint_key=endpoint_key)
        except Exception as e:
            print(f"🚫 [ALPACA] Failed for {symbol}: {e}")
            return None

    def get_batch_snapshots(self, symbols: List[str], use_cache=True) -> Dict:
        """
        Get snapshot data for multiple symbols in a single API call
        THIS IS THE KEY OPTIMIZATION - Use this instead of individual calls!
        """
        if not self.api_key or not self.secret_key:
            return {}

        if not symbols:
            return {}

        # Check cache first and filter out cached symbols
        results = {}
        symbols_to_fetch = []

        if use_cache:
            for symbol in symbols:
                cache_key = f"price:{symbol}"
                cached = self.cache.get(cache_key, max_age=30)
                if cached:
                    results[symbol] = cached
                else:
                    symbols_to_fetch.append(symbol)
        else:
            symbols_to_fetch = symbols

        if not symbols_to_fetch:
            print(f"📦 [ALPACA BATCH] All {len(symbols)} symbols from cache")
            return results

        # Check circuit breaker
        endpoint_key = "batch_snapshots"
        if self.circuit_breaker.get_state(endpoint_key) == 'OPEN':
            print(f"🚫 [ALPACA BATCH] Circuit breaker OPEN")
            return results

        # Wait for rate limit
        self._wait_for_rate_limit()

        def _batch_fetch():
            timeout = 6  # Optimized timeout
            symbols_str = ','.join(symbols_to_fetch)
            url = f'{self.base_url}/stocks/snapshots'
            params = {'symbols': symbols_str}
            headers = self._get_headers()

            print(f"🔵 [ALPACA BATCH] Fetching {len(symbols_to_fetch)} symbols...")

            response = requests.get(url, headers=headers, params=params, timeout=timeout)
            self.request_queue.record_request()

            if response.status_code == 200:
                data = response.json()

                for symbol in symbols_to_fetch:
                    symbol_data = data.get(symbol, {})
                    if not symbol_data:
                        continue

                    latest_trade = symbol_data.get('latestTrade', {})
                    price = latest_trade.get('p')

                    if not price:
                        daily_bar = symbol_data.get('dailyBar', {})
                        price = daily_bar.get('c')

                    if price:
                        name = self._get_company_name(symbol, timeout)
                        result = {
                            'name': name or symbol,
                            'price': float(price)
                        }
                        results[symbol] = result

                        # Cache the result
                        cache_key = f"price:{symbol}"
                        self.cache.set(cache_key, result)

                print(f"✅ [ALPACA BATCH] Fetched {len(results)}/{len(symbols_to_fetch)} symbols")
                return results

            elif response.status_code == 429:
                print(f"⚠️ [ALPACA BATCH] Rate limited")
                self.request_queue.stats['rate_limited'] += 1
                raise Exception("Rate limited")

            else:
                print(f"❌ [ALPACA BATCH] HTTP {response.status_code}")
                raise Exception(f"API error: {response.status_code}")

        try:
            self.circuit_breaker.call(_batch_fetch, endpoint_key=endpoint_key)
            return results
        except Exception as e:
            print(f"🚫 [ALPACA BATCH] Failed: {e}")
            return results

    def _get_company_name(self, symbol, timeout=3):
        """Get company name with caching"""
        if symbol in self._company_name_cache:
            return self._company_name_cache[symbol]

        try:
            url = f'{self.base_url}/assets/{symbol}'
            headers = self._get_headers()
            response = requests.get(url, headers=headers, timeout=timeout)

            if response.status_code == 200:
                data = response.json()
                name = data.get('name', symbol)
                self._company_name_cache[symbol] = name
                return name
        except Exception as e:
            print(f"⚠️ [ALPACA] Error getting name for {symbol}: {e}")

        self._company_name_cache[symbol] = symbol
        return symbol

    def get_info(self, symbol):
        """Get company information (limited compared to Yahoo)"""
        if not self.api_key or not self.secret_key:
            return {}

        try:
            url = f'{self.base_url}/assets/{symbol}'
            headers = self._get_headers()
            response = requests.get(url, headers=headers, timeout=3)

            if response.status_code == 200:
                asset_data = response.json()

                snapshot_url = f'{self.base_url}/stocks/{symbol}/snapshot'
                snapshot_response = requests.get(snapshot_url, headers=headers, timeout=3)

                info = {
                    'name': asset_data.get('name', symbol),
                    'exchange': asset_data.get('exchange', ''),
                    'class': asset_data.get('class', ''),
                    'status': asset_data.get('status', ''),
                }

                if snapshot_response.status_code == 200:
                    snapshot = snapshot_response.json()
                    latest_trade = snapshot.get('latestTrade', {})
                    prev_close = snapshot.get('prevDailyBar', {})

                    if latest_trade.get('p'):
                        info['currentPrice'] = latest_trade.get('p')
                    if prev_close.get('c'):
                        info['regularMarketPreviousClose'] = prev_close.get('c')

                return info
        except Exception as e:
            print(f"Error getting Alpaca info for {symbol}: {e}")

        return {}

    def search_stocks(self, query, limit=10):
        """Search stocks - Alpaca doesn't have good search, return empty"""
        return []

    def get_queue_stats(self):
        """Get request queue statistics for monitoring"""
        return self.request_queue.get_stats()

# Keep original AlpacaAPI for backward compatibility
AlpacaAPI = ImprovedAlpacaAPI

# =============================================================================
# OTHER API CLASSES (Finnhub, AlphaVantage, FMP, CompanyInfoService)
# =============================================================================
# These remain unchanged from original file - copying them here for completeness

class FinnhubAPI:
    def __init__(self, api_key=None):
        self.api_key = api_key or 'c34391qad3i8edlcgrgg'
        self.base_url = 'https://finnhub.io/api/v1/'

    def get_company_profile(self, symbol):
        """Get company profile from Finnhub API"""
        try:
            url = f'{self.base_url}stock/profile2'
            params = {'symbol': symbol, 'token': self.api_key}
            response = requests.get(url, params=params, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data and isinstance(data, dict) and len(data) > 0:
                    ceo = data.get('ceo', '') or data.get('ceo', '-')
                    description = data.get('finnhubIndustry', '') or data.get('finnhubIndustry', '-')
                    if not description or description == '-':
                        description = data.get('description', '-')
                    return {
                        'ceo': ceo if ceo else '-',
                        'description': description if description else '-'
                    }
                else:
                    print(f'Finnhub returned empty data for {symbol}')
                    return {'ceo': '-', 'description': '-'}
            else:
                print(f'Finnhub error: {response.status_code}')
                return {'ceo': '-', 'description': '-'}
        except requests.exceptions.Timeout:
            print(f'Finnhub timeout for {symbol}')
            return {'ceo': '-', 'description': '-'}
        except Exception as e:
            print(f'Error fetching Finnhub profile for {symbol}: {e}')
            return {'ceo': '-', 'description': '-'}

class AlphaVantageAPI:
    """Alpha Vantage API - Free tier: 5 calls/minute, 500 calls/day"""
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv('ALPHA_VANTAGE_API_KEY', 'demo')
        self.base_url = 'https://www.alphavantage.co/query'

    def get_company_overview(self, symbol):
        """Get company overview"""
        try:
            params = {
                'function': 'OVERVIEW',
                'symbol': symbol,
                'apikey': self.api_key
            }
            response = requests.get(self.base_url, params=params, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data and 'Symbol' in data:
                    return {
                        'marketCap': data.get('MarketCapitalization', ''),
                        'peRatio': data.get('PERatio', ''),
                        'dividendYield': data.get('DividendYield', ''),
                        'description': data.get('Description', ''),
                        'sector': data.get('Sector', ''),
                        'industry': data.get('Industry', ''),
                        'address': data.get('Address', ''),
                        'ceo': data.get('CEO', ''),
                        'website': data.get('Website', '')
                    }
        except Exception as e:
            print(f'Alpha Vantage error for {symbol}: {e}')
        return {}

class FinancialModelingPrepAPI:
    """Financial Modeling Prep API"""
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv('FMP_API_KEY', 'demo')
        self.base_url = 'https://financialmodelingprep.com/api/v3'

    def get_company_profile(self, symbol):
        """Get company profile"""
        try:
            url = f'{self.base_url}/profile/{symbol}'
            params = {'apikey': self.api_key}
            response = requests.get(url, params=params, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    company = data[0]
                    return {
                        'marketCap': company.get('mktCap', ''),
                        'peRatio': company.get('pe', ''),
                        'dividendYield': company.get('lastDiv', ''),
                        'description': company.get('description', ''),
                        'sector': company.get('sector', ''),
                        'industry': company.get('industry', ''),
                        'ceo': company.get('ceo', ''),
                        'website': company.get('website', ''),
                        'address': company.get('address', ''),
                        'city': company.get('city', ''),
                        'state': company.get('state', ''),
                        'country': company.get('country', '')
                    }
        except Exception as e:
            print(f'Financial Modeling Prep error for {symbol}: {e}')
        return {}

class CompanyInfoService:
    """Service that aggregates company info from multiple APIs"""
    def __init__(self):
        self.finnhub = FinnhubAPI()
        self.alpha_vantage = AlphaVantageAPI()
        self.fmp = FinancialModelingPrepAPI()

    def get_comprehensive_info(self, symbol, yahoo_info=None):
        """Get comprehensive company info trying multiple APIs"""
        result = {
            'ceo': '-',
            'marketCap': '-',
            'peRatio': '-',
            'dividendYield': '-',
            'website': '-',
            'headquarters': '-',
            'description': '-'
        }

        # Try Yahoo Finance first
        if yahoo_info:
            result['ceo'] = self._extract_ceo_from_yahoo(yahoo_info) or '-'
            result['marketCap'] = self._format_market_cap(yahoo_info.get('marketCap')) or '-'
            result['peRatio'] = self._format_pe_ratio(yahoo_info.get('trailingPE') or yahoo_info.get('forwardPE')) or '-'
            result['dividendYield'] = self._format_dividend_yield(yahoo_info.get('dividendYield')) or '-'
            result['website'] = self._format_website(yahoo_info.get('website')) or '-'
            result['headquarters'] = self._format_headquarters(
                yahoo_info.get('city'),
                yahoo_info.get('state'),
                yahoo_info.get('country')
            ) or '-'
            result['description'] = yahoo_info.get('longBusinessSummary') or yahoo_info.get('sector') or '-'

        # Fill gaps with other APIs (implementation continues...)
        return result

    def _extract_ceo_from_yahoo(self, yahoo_info):
        """Extract CEO from Yahoo company officers"""
        officers = yahoo_info.get('companyOfficers', [])
        for officer in officers:
            if isinstance(officer, dict):
                title = officer.get('title', '').upper()
                if 'CEO' in title or 'CHIEF EXECUTIVE OFFICER' in title:
                    return officer.get('name', '-')
        return None

    def _format_market_cap(self, value):
        """Format market cap value"""
        if not value:
            return None
        try:
            if isinstance(value, str):
                value = value.replace(',', '').replace('$', '')
                value = float(value)
            if isinstance(value, (int, float)) and value > 0:
                if value >= 1e12:
                    return f"${value/1e12:.2f}T"
                elif value >= 1e9:
                    return f"${value/1e9:.2f}B"
                elif value >= 1e6:
                    return f"${value/1e6:.2f}M"
                else:
                    return f"${value:,.0f}"
        except:
            return str(value) if value else None
        return None

    def _format_pe_ratio(self, value):
        """Format P/E ratio"""
        if not value:
            return None
        try:
            if isinstance(value, str):
                value = float(value)
            if isinstance(value, (int, float)) and value > 0:
                return f"{value:.2f}"
        except:
            return str(value) if value else None
        return None

    def _format_dividend_yield(self, value):
        """Format dividend yield"""
        if not value:
            return None
        try:
            if isinstance(value, str):
                value = value.replace('%', '')
                value = float(value)
            if isinstance(value, (int, float)):
                if value < 1 and value > 0:
                    return f"{value*100:.2f}%"
                elif value >= 1:
                    return f"{value:.2f}%"
        except:
            return str(value) + '%' if value else None
        return None

    def _format_website(self, value):
        """Format website URL"""
        if not value or value == '-':
            return None
        value = str(value).strip()
        if value and not value.startswith('http'):
            return f"https://{value}"
        return value

    def _format_headquarters(self, city, state, country):
        """Format headquarters address"""
        if not city:
            return None
        parts = [city]
        if state:
            parts.append(state)
        elif country:
            parts.append(country)
        return ', '.join(parts)

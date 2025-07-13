from flask_caching import Cache
from functools import wraps
import time

cache = Cache()

def cache_stock_data(timeout=300):  # 5 minutes
    """Cache decorator for stock data"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Create cache key based on function name and arguments
            cache_key = f"{f.__name__}_{'_'.join(str(arg) for arg in args)}"
            
            # Try to get from cache first
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                return cached_result
            
            # If not in cache, execute function and cache result
            result = f(*args, **kwargs)
            cache.set(cache_key, result, timeout=timeout)
            return result
        return decorated_function
    return decorator

def invalidate_stock_cache(symbol):
    """Invalidate cache for a specific stock symbol"""
    cache.delete(f"get_real_time_data_{symbol}")
    cache.delete(f"get_historical_data_{symbol}")

class StockCache:
    @staticmethod
    @cache_stock_data(timeout=300)  # Cache for 5 minutes
    def get_cached_stock_data(symbol):
        """Get stock data with caching"""
        from stock import Stock, YahooFinanceAPI
        api = YahooFinanceAPI()
        stock = Stock(symbol, api)
        stock.retrieve_data()
        return {
            'symbol': stock.symbol,
            'name': stock.name,
            'price': stock.price
        }
    
    @staticmethod
    def clear_cache():
        """Clear all stock cache"""
        cache.clear() 
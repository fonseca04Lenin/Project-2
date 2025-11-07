"""
Chat Service for AI Stock Advisor
Handles Google Gemini API integration and conversation management
"""

import os
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import google.generativeai as genai
from google.generativeai.types import Tool, FunctionDeclaration
from firebase_service import FirebaseService, get_firestore_client
from stock import Stock, YahooFinanceAPI, NewsAPI, FinnhubAPI
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def serialize_datetime(obj):
    """Helper function to serialize datetime objects for JSON"""
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {k: serialize_datetime(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [serialize_datetime(item) for item in obj]
    else:
        return obj

class ChatService:
    def __init__(self):
        """Initialize the chat service with Gemini API and Firebase"""
        self.gemini_client = None
        self.firebase_service = FirebaseService()
        self.firestore_client = get_firestore_client()
        self.stock_api = YahooFinanceAPI()
        self.finnhub_api = FinnhubAPI()
        self.news_api = NewsAPI()
        
        # Rate limiting
        self.user_requests = {}  # Track user request counts
        self.max_requests_per_hour = 5
        
        # Initialize Gemini client
        self._initialize_gemini()
    
    def _initialize_gemini(self):
        """Initialize Gemini API client"""
        try:
            api_key = os.getenv('GEMINI_API_KEY')
            if not api_key:
                logger.warning("GEMINI_API_KEY not found in environment variables")
                return
            
            genai.configure(api_key=api_key)
            # List available models and prefer lighter models (flash/nano) for free tier
            try:
                models = genai.list_models()
                available_models = [m.name for m in models if 'generateContent' in m.supported_generation_methods]
                
                if available_models:
                    # Prefer lighter models for free tier (flash, nano) - these have better quotas
                    # AVOID experimental (exp) and pro models for free tier
                    preferred_models = ['flash', 'nano', '1.5-flash']
                    model_name = None
                    
                    # First, try to find flash or nano models (best for free tier)
                    for preferred in preferred_models:
                        matching = [m for m in available_models if preferred.lower() in m.lower() and 'exp' not in m.lower()]
                        if matching:
                            model_name = matching[0]
                            logger.info(f"✅ Found preferred model for free tier: {model_name}")
                            break
                    
                    # If no flash/nano found, try 1.0-pro (avoid exp and 2.x)
                    if not model_name:
                        matching = [m for m in available_models if '1.0-pro' in m.lower() and 'exp' not in m.lower()]
                        if matching:
                            model_name = matching[0]
                            logger.info(f"✅ Using 1.0-pro model: {model_name}")
                    
                    # If still no preferred model, filter out exp models and use first available
                    if not model_name:
                        non_exp_models = [m for m in available_models if 'exp' not in m.lower() and '2.5' not in m.lower()]
                        if non_exp_models:
                            model_name = non_exp_models[0]
                            logger.info(f"✅ Using non-experimental model: {model_name}")
                        else:
                            # Last resort - use first available
                            model_name = available_models[0]
                            logger.warning(f"⚠️ Using model (may have quota limits): {model_name}")
                    
                    # Extract just the model name (remove 'models/' prefix if present)
                    if '/' in model_name:
                        model_name = model_name.split('/')[-1]
                    
                    self.gemini_client = genai.GenerativeModel(model_name)
                    logger.info(f"✅ Gemini API client initialized with model: {model_name}")
                    logger.info(f"📋 Available models: {', '.join(available_models[:5])}")
                else:
                    logger.error("❌ No available models found that support generateContent")
                    self.gemini_client = None
            except Exception as e:
                logger.error(f"❌ Failed to list/initialize Gemini models: {e}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
                self.gemini_client = None
        except Exception as e:
            logger.error(f"❌ Failed to initialize Gemini API: {e}")
    
    def _check_rate_limit(self, user_id: str) -> bool:
        """Check if user has exceeded rate limit"""
        current_time = time.time()
        hour_ago = current_time - 3600  # 1 hour ago
        
        # Clean old entries
        if user_id in self.user_requests:
            self.user_requests[user_id] = [
                req_time for req_time in self.user_requests[user_id] 
                if req_time > hour_ago
            ]
        else:
            self.user_requests[user_id] = []
        
        # Check if under limit
        if len(self.user_requests[user_id]) >= self.max_requests_per_hour:
            return False
        
        # Add current request
        self.user_requests[user_id].append(current_time)
        return True
    
    def _get_user_context(self, user_id: str) -> Dict[str, Any]:
        """Get user's watchlist and conversation context"""
        try:
            logger.info(f"🔍 Getting user context for user: {user_id}")
            
            # Use the same approach as the working API endpoint
            from watchlist_service import WatchlistService
            watchlist_service = WatchlistService(self.firestore_client)
            
            logger.info(f"🔍 WatchlistService initialized, Firestore client: {watchlist_service.db is not None}")
            
            # Get user's current watchlist using the watchlist service (same as API)
            watchlist_items = watchlist_service.get_watchlist(user_id, limit=10)
            logger.info(f"🔍 Retrieved {len(watchlist_items)} raw watchlist items from Firestore")
            
            # Debug: Log the raw data structure
            if watchlist_items:
                logger.info(f"🔍 Sample watchlist item structure: {watchlist_items[0]}")
            else:
                logger.warning(f"⚠️ No watchlist items found for user {user_id}")
                # Try alternative user ID formats
                logger.info(f"🔍 Trying alternative user ID formats...")
                
                # Try with Firebase UID format (if user_id is email)
                if '@' in user_id:
                    logger.info(f"🔍 User ID contains @, might be email format")
                    # The user_id might be the email, but we need the Firebase UID
                    # Let's try to get the user document directly
                    try:
                        user_doc = self.firestore_client.collection('users').document(user_id).get()
                        if user_doc.exists:
                            logger.info(f"🔍 Found user document with email as ID")
                            # Try getting watchlist with this ID
                            watchlist_items = watchlist_service.get_watchlist(user_id, limit=10)
                            logger.info(f"🔍 Retry retrieved {len(watchlist_items)} items")
                    except Exception as e:
                        logger.error(f"❌ Error trying alternative user ID: {e}")
            
            watchlist_data = []
            
            # Process watchlist items with current prices
            for item in watchlist_items:
                try:
                    symbol = item.get('symbol') or item.get('id', '')  # Handle both 'symbol' and 'id' fields
                    logger.info(f"🔍 Processing watchlist item: {symbol}")
                    
                    # Get current stock price and info
                    stock_info = self.stock_api.get_stock_info(symbol)
                    watchlist_data.append({
                        'symbol': symbol,
                        'name': item.get('company_name', stock_info.get('name', '')),
                        'current_price': stock_info.get('current_price', 0),
                        'change_percent': stock_info.get('change_percent', 0),
                        'category': item.get('category', 'General'),
                        'priority': item.get('priority', 'medium'),
                        'notes': item.get('notes', ''),
                        'target_price': item.get('target_price'),
                        'stop_loss': item.get('stop_loss'),
                        'added_at': item.get('added_at', '')
                    })
                except Exception as e:
                    logger.warning(f"Failed to get price for {item.get('symbol', item.get('id', 'Unknown'))}: {e}")
                    # Fallback to basic info without current price
                    symbol = item.get('symbol') or item.get('id', '')
                    watchlist_data.append({
                        'symbol': symbol,
                        'name': item.get('company_name', ''),
                        'current_price': 0,
                        'change_percent': 0,
                        'category': item.get('category', 'General'),
                        'priority': item.get('priority', 'medium'),
                        'notes': item.get('notes', ''),
                        'target_price': item.get('target_price'),
                        'stop_loss': item.get('stop_loss'),
                        'added_at': item.get('added_at', '')
                    })
            
            # Get recent conversation history (last 3 messages)
            chat_history = self._get_conversation_history(user_id, limit=3)
            
            logger.info(f"✅ Retrieved {len(watchlist_data)} watchlist items for user {user_id}")
            logger.info(f"🔍 Watchlist data: {watchlist_data}")
            
            return {
                'watchlist': watchlist_data,
                'recent_conversation': chat_history,
                'user_id': user_id
            }
        except Exception as e:
            logger.error(f"❌ Failed to get user context: {e}")
            import traceback
            logger.error(f"❌ Full traceback: {traceback.format_exc()}")
            return {'watchlist': [], 'recent_conversation': [], 'user_id': user_id}
    
    def _get_conversation_history(self, user_id: str, limit: int = 3) -> List[Dict]:
        """Get recent conversation history from Firestore"""
        try:
            chat_ref = self.firestore_client.collection('chat_conversations').document(user_id)
            chat_doc = chat_ref.get()
            
            if chat_doc.exists:
                chat_data = chat_doc.to_dict()
                messages = chat_data.get('messages', [])
                
                # Convert Firestore datetime objects to ISO strings
                serialized_messages = []
                for message in messages[-limit:] if messages else []:
                    serialized_message = {
                        'role': message.get('role'),
                        'content': message.get('content'),
                        'timestamp': message.get('timestamp', datetime.now().isoformat())
                    }
                    serialized_messages.append(serialized_message)
                
                return serialized_messages
            return []
        except Exception as e:
            logger.error(f"Failed to get conversation history: {e}")
            return []
    
    def _save_conversation(self, user_id: str, user_message: str, ai_response: str):
        """Save conversation to Firestore"""
        try:
            chat_ref = self.firestore_client.collection('chat_conversations').document(user_id)
            chat_doc = chat_ref.get()
            
            if chat_doc.exists:
                chat_data = chat_doc.to_dict()
                messages = chat_data.get('messages', [])
            else:
                messages = []
            
            # Add new messages
            messages.extend([
                {
                    'role': 'user',
                    'content': user_message,
                    'timestamp': datetime.now().isoformat()
                },
                {
                    'role': 'assistant',
                    'content': ai_response,
                    'timestamp': datetime.now().isoformat()
                }
            ])
            
            # Keep only last 50 messages to prevent document size issues
            if len(messages) > 50:
                messages = messages[-50:]
            
            chat_ref.set({
                'messages': messages,
                'last_updated': datetime.now().isoformat(),
                'user_id': user_id
            })
            
        except Exception as e:
            logger.error(f"Failed to save conversation: {e}")
    
    def _get_available_functions(self) -> List[Dict]:
        """Define available functions for the AI to call"""
        return [
            {
                "name": "get_stock_price",
                "description": "Get current stock price and basic information for a stock symbol",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Stock symbol (e.g., AAPL, GOOGL, TSLA)"
                        }
                    },
                    "required": ["symbol"]
                }
            },
            {
                "name": "get_top_performer_by_date",
                "description": "Find the top performing stock for a specific date within a universe (watchlist or S&P 500)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Date in YYYY-MM-DD"
                        },
                        "universe": {
                            "type": "string",
                            "enum": ["watchlist", "sp500"],
                            "description": "Universe to consider"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Optional cap on symbols to evaluate"
                        }
                    },
                    "required": ["date"]
                }
            },
            {
                "name": "analyze_watchlist",
                "description": "Analyze the user's complete watchlist performance",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "user_id": {
                            "type": "string",
                            "description": "User ID to analyze watchlist for"
                        }
                    },
                    "required": ["user_id"]
                }
            },
            {
                "name": "get_watchlist_details",
                "description": "Get detailed information about all stocks in the user's watchlist",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "user_id": {
                            "type": "string",
                            "description": "User ID to get watchlist for"
                        }
                    },
                    "required": ["user_id"]
                }
            },
            {
                "name": "get_market_news",
                "description": "Get relevant market news for specific stocks",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbols": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Array of stock symbols to get news for"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of news articles to return",
                            "default": 5
                        }
                    },
                    "required": ["symbols"]
                }
            },
            {
                "name": "compare_stocks",
                "description": "Compare multiple stocks side by side",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbols": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Array of stock symbols to compare"
                        }
                    },
                    "required": ["symbols"]
                }
            },
            {
                "name": "add_stock_to_watchlist",
                "description": "Add a stock to the user's watchlist. You can provide either a stock symbol OR a company name.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Stock symbol if user provided one directly (e.g., AAPL, GOOGL, WMT). Leave empty if company name provided."
                        },
                        "company_name": {
                            "type": "string",
                            "description": "Company name if user provided company name instead of symbol (e.g., Walmart, Apple, Microsoft). Leave empty if symbol provided."
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "remove_stock_from_watchlist",
                "description": "Remove a stock from the user's watchlist. You can provide either a stock symbol OR a company name.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Stock symbol if user provided one directly (e.g., AAPL, GOOGL, WMT). Leave empty if company name provided."
                        },
                        "company_name": {
                            "type": "string",
                            "description": "Company name if user provided company name instead of symbol (e.g., Walmart, Apple, Microsoft). Leave empty if symbol provided."
                        }
                    },
                    "required": []
                }
            }
        ]
    
    def _format_function_result(self, result: Dict, function_name: str = None) -> str:
        """Format function result for AI to understand"""
        if result.get("success"):
            # For add/remove operations, be EXTREMELY explicit
            if function_name and "add_stock_to_watchlist" in function_name:
                symbol = result.get("data", {}).get("symbol", "")
                name = result.get("data", {}).get("name", "")
                price = result.get("data", {}).get("price", 0)
                return f"SUCCESS: Stock added to watchlist. Respond with ONLY this EXACT message and NOTHING else: '✅ Successfully added {symbol} ({name}) to your watchlist at ${price}. Your watchlist will update automatically.' DO NOT show any JSON or additional data."
            elif function_name and "remove_stock_from_watchlist" in function_name:
                symbol = result.get("data", {}).get("symbol", "")
                return f"SUCCESS: Stock removed from watchlist. Respond with ONLY this EXACT message and NOTHING else: '✅ Successfully removed {symbol} from your watchlist.' DO NOT show any JSON or additional data."
            
            message = result.get("message", "Success")
            # Make it VERY explicit
            return f"SUCCESS: {message}. Use this exact information in your response to the user."
        else:
            error_msg = result.get("message", result.get("error", "Unknown error"))
            return f"FAILED: {error_msg}. Tell the user this exact error."
    
    def _execute_function(self, function_name: str, arguments: Dict, user_id: str) -> Dict:
        """Execute a function called by the AI"""
        try:
            # Validate function name
            if not function_name or not function_name.strip():
                logger.error(f"Empty function name provided. Arguments: {arguments}")
                return {
                    "success": False,
                    "data": None,
                    "message": "Function name is required. Please specify a valid function to call."
                }
            
            if function_name == "get_stock_price":
                symbol = arguments.get("symbol", "").upper()
                stock_data = self.stock_api.get_real_time_data(symbol)
                if stock_data:
                    return {
                        "success": True,
                        "data": {
                            "symbol": symbol,
                            "name": stock_data.get("name", symbol),
                            "current_price": stock_data.get("price", 0),
                            "change_percent": 0  # We'll calculate this separately if needed
                        },
                        "message": f"Retrieved data for {symbol}"
                    }
                else:
                    return {
                        "success": False,
                        "data": None,
                        "message": f"Could not retrieve data for {symbol}"
                    }
            
            elif function_name == "analyze_watchlist":
                # Get user's watchlist and analyze performance
                context = self._get_user_context(user_id)
                watchlist = context.get('watchlist', [])
                
                if not watchlist:
                    return {
                        "success": True,
                        "data": {"message": "No stocks in watchlist to analyze"},
                        "message": "User has no stocks in watchlist"
                    }
                
                # Calculate basic metrics
                total_change = sum(item.get('change_percent', 0) for item in watchlist)
                avg_change = total_change / len(watchlist) if watchlist else 0
                
                analysis = {
                    "total_stocks": len(watchlist),
                    "average_change": round(avg_change, 2),
                    "stocks_up": len([s for s in watchlist if s.get('change_percent', 0) > 0]),
                    "stocks_down": len([s for s in watchlist if s.get('change_percent', 0) < 0]),
                    "stocks_flat": len([s for s in watchlist if s.get('change_percent', 0) == 0]),
                    "watchlist": watchlist
                }
                
                return {
                    "success": True,
                    "data": analysis,
                    "message": f"Analyzed {len(watchlist)} stocks in watchlist"
                }
            
            elif function_name == "get_watchlist_details":
                # Get comprehensive watchlist information
                context = self._get_user_context(user_id)
                watchlist = context.get('watchlist', [])
                
                if not watchlist:
                    return {
                        "success": True,
                        "data": {"message": "No stocks in watchlist"},
                        "message": "User has no stocks in watchlist"
                    }
                
                # Organize watchlist by categories and priorities
                categories = {}
                priorities = {'high': [], 'medium': [], 'low': []}
                
                for stock in watchlist:
                    category = stock.get('category', 'General')
                    priority = stock.get('priority', 'medium')
                    
                    if category not in categories:
                        categories[category] = []
                    categories[category].append(stock)
                    priorities[priority].append(stock)
                
                details = {
                    "total_stocks": len(watchlist),
                    "by_category": categories,
                    "by_priority": priorities,
                    "stocks_with_targets": [s for s in watchlist if s.get('target_price')],
                    "stocks_with_stop_loss": [s for s in watchlist if s.get('stop_loss')],
                    "stocks_with_notes": [s for s in watchlist if s.get('notes')],
                    "full_watchlist": watchlist
                }
                
                return {
                    "success": True,
                    "data": details,
                    "message": f"Retrieved detailed information for {len(watchlist)} stocks"
                }
            
            elif function_name == "get_market_news":
                symbols = arguments.get("symbols", [])
                limit = arguments.get("limit", 5)
                
                news_data = []
                for symbol in symbols[:3]:  # Limit to 3 symbols to avoid rate limits
                    try:
                        news = self.news_api.get_news(symbol, limit=2)
                        news_data.extend(news)
                    except Exception as e:
                        logger.warning(f"Failed to get news for {symbol}: {e}")
                
                return {
                    "success": True,
                    "data": news_data[:limit],
                    "message": f"Retrieved {len(news_data)} news articles"
                }
            
            elif function_name == "compare_stocks":
                symbols = arguments.get("symbols", [])
                comparison_data = []
                
                for symbol in symbols[:5]:  # Limit to 5 stocks
                    try:
                        stock_data = self.stock_api.get_real_time_data(symbol)
                        if stock_data:
                            comparison_data.append({
                                "symbol": symbol,
                                "name": stock_data.get("name", symbol),
                                "current_price": stock_data.get("price", 0)
                            })
                    except Exception as e:
                        logger.warning(f"Failed to get data for {symbol}: {e}")
                
                return {
                    "success": True,
                    "data": comparison_data,
                    "message": f"Compared {len(comparison_data)} stocks"
                }

            elif function_name == "get_top_performer_by_date":
                # Compute top performer by calling internal method directly (avoid external HTTP)
                date_str = arguments.get("date", "").strip()
                universe = (arguments.get("universe", "watchlist") or "watchlist").lower()
                limit = arguments.get("limit")

                if not date_str:
                    return {"success": False, "data": None, "message": "Date (YYYY-MM-DD) is required"}

                # Build symbol list
                symbols: List[str] = []
                universe_used = universe

                if universe == "watchlist":
                    context = self._get_user_context(user_id)
                    wl = context.get('watchlist', [])
                    symbols = [item.get('symbol') for item in wl if item.get('symbol')]
                elif universe == "sp500":
                    # Use Finnhub constituents helper; fallback to popular tickers
                    try:
                        symbols = self.finnhub_api.get_index_constituents('^GSPC') or []
                    except Exception:
                        symbols = []
                    if not symbols:
                        symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AVGO', 'BRK.B', 'LLY']
                else:
                    return {"success": False, "data": None, "message": "universe must be 'watchlist' or 'sp500'"}

                if limit:
                    try:
                        limit_int = int(limit)
                        symbols = symbols[:max(1, limit_int)]
                    except Exception:
                        pass

                if not symbols:
                    return {"success": False, "data": None, "message": f"No symbols found for universe {universe_used}"}

                best_symbol: Optional[str] = None
                best_change: Optional[float] = None
                evaluated = 0

                for sym in symbols:
                    try:
                        change_pct = self.stock_api.get_day_change_percent(sym, date_str)
                        evaluated += 1
                        if best_change is None or change_pct > best_change:
                            best_change = change_pct
                            best_symbol = sym
                    except Exception:
                        continue

                if best_symbol is None:
                    return {"success": False, "data": None, "message": "Could not compute top performer for requested date"}

                return {
                    "success": True,
                    "data": {
                        "date": date_str,
                        "universe": universe_used,
                        "top_symbol": best_symbol,
                        "top_change_percent": round(best_change or 0.0, 2),
                        "evaluated_count": evaluated,
                        "source": "Yahoo Finance via yfinance"
                    },
                    "message": f"Top performer on {date_str}: {best_symbol} ({round(best_change or 0.0, 2)}%)"
                }
            
            elif function_name == "add_stock_to_watchlist":
                symbol = arguments.get("symbol", "").strip().upper()
                company_name_input = arguments.get("company_name", "").strip()
                
                logger.info(f"Adding stock to watchlist: symbol={symbol}, company_name={company_name_input}, user={user_id}")
                
                # Import watchlist service
                from watchlist_service import get_watchlist_service
                from firebase_service import get_firestore_client
                
                db_client = get_firestore_client()
                watchlist_service = get_watchlist_service(db_client)
                
                # If company name provided but not symbol, try to find the symbol
                if company_name_input and not symbol:
                    logger.info(f"Searching for symbol for company: {company_name_input}")
                    # Try to search for the company
                    try:
                        search_result = self.stock_api.search_stocks(company_name_input, limit=5)
                        if search_result and len(search_result) > 0:
                            symbol = search_result[0].get('symbol', '').upper()
                            logger.info(f"Found symbol {symbol} for company {company_name_input}")
                        else:
                            return {
                                "success": False,
                                "data": None,
                                "message": f"Could not find stock for '{company_name_input}'. Please provide the stock symbol directly (e.g., WMT for Walmart)."
                            }
                    except Exception as e:
                        logger.error(f"Error searching for company: {e}")
                        return {
                            "success": False,
                            "data": None,
                            "message": f"Error searching for '{company_name_input}'. Please provide the stock symbol directly (e.g., WMT for Walmart)."
                        }
                
                # If still no symbol, fail
                if not symbol:
                    return {
                        "success": False,
                        "data": None,
                        "message": "Please provide either a stock symbol (e.g., WMT) or a company name (e.g., Walmart)."
                    }
                
                # Get current stock price to set as original_price
                logger.info(f"Fetching stock data for {symbol}...")
                stock_data = self.stock_api.get_real_time_data(symbol)
                
                if not stock_data:
                    logger.error(f"Could not fetch stock data for {symbol}")
                    return {
                        "success": False,
                        "data": None,
                        "message": f"Could not find stock {symbol}. Please check the symbol and try again."
                    }
                
                # Fetch company name and price from stock data
                company_name = stock_data.get("name", symbol)
                current_price = stock_data.get("price", 0)
                
                logger.info(f"Stock data received: name={company_name}, price={current_price}")
                
                # Add stock to watchlist
                try:
                    logger.info(f"Calling watchlist_service.add_stock for {symbol}...")
                    result = watchlist_service.add_stock(
                        user_id=user_id,
                        symbol=symbol,
                        company_name=company_name,
                        current_price=current_price
                    )
                    logger.info(f"watchlist_service.add_stock result: {result}")
                    
                    if result.get("success"):
                        logger.info(f"SUCCESS: Added {symbol} to watchlist for user {user_id}")
                        return {
                            "success": True,
                            "data": {
                                "symbol": symbol,
                                "name": company_name,
                                "price": current_price
                            },
                            "message": f"SUCCESS: Added {symbol} ({company_name}) to your watchlist at ${current_price:.2f}"
                        }
                    else:
                        error_msg = result.get("message", f"Failed to add {symbol} to watchlist")
                        logger.warning(f"FAILED to add {symbol}: {error_msg}")
                        return {
                            "success": False,
                            "data": None,
                            "message": f"FAILED: {error_msg}"
                        }
                except Exception as e:
                    logger.error(f"Exception adding stock to watchlist: {e}", exc_info=True)
                    return {
                        "success": False,
                        "data": None,
                        "message": f"FAILED: Error adding {symbol} to watchlist: {str(e)}"
                    }
            
            elif function_name == "remove_stock_from_watchlist":
                symbol = arguments.get("symbol", "").strip().upper()
                company_name_input = arguments.get("company_name", "").strip()
                
                logger.info(f"Removing stock from watchlist: symbol={symbol}, company_name={company_name_input}, user={user_id}")
                
                # Import watchlist service
                from watchlist_service import get_watchlist_service
                from firebase_service import get_firestore_client
                
                db_client = get_firestore_client()
                watchlist_service = get_watchlist_service(db_client)
                
                # If company name provided but not symbol, try to find the symbol
                if company_name_input and not symbol:
                    logger.info(f"Searching for symbol for company: {company_name_input}")
                    try:
                        search_result = self.stock_api.search_stocks(company_name_input, limit=5)
                        if search_result and len(search_result) > 0:
                            symbol = search_result[0].get('symbol', '').upper()
                            logger.info(f"Found symbol {symbol} for company {company_name_input}")
                        else:
                            return {
                                "success": False,
                                "data": None,
                                "message": f"FAILED: Could not find stock for '{company_name_input}'. Please provide the stock symbol directly."
                            }
                    except Exception as e:
                        logger.error(f"Error searching for company: {e}")
                        return {
                            "success": False,
                            "data": None,
                            "message": f"FAILED: Error searching for '{company_name_input}'. Please provide the stock symbol directly."
                        }
                
                # If still no symbol, fail
                if not symbol:
                    return {
                        "success": False,
                        "data": None,
                        "message": "FAILED: Please provide either a stock symbol or a company name."
                    }
                
                # Remove stock from watchlist
                try:
                    logger.info(f"Calling watchlist_service.remove_stock for {symbol}...")
                    result = watchlist_service.remove_stock(
                        user_id=user_id,
                        symbol=symbol
                    )
                    logger.info(f"watchlist_service.remove_stock result: {result}")
                    
                    if result.get("success"):
                        logger.info(f"Successfully removed {symbol} from watchlist for user {user_id}")
                        return {
                            "success": True,
                            "data": {
                                "symbol": symbol
                            },
                            "message": f"Success: Removed {symbol} from your watchlist"
                        }
                    else:
                        error_msg = result.get("message", f"Failed to remove {symbol} from watchlist")
                        logger.warning(f"Failed to remove {symbol}: {error_msg}")
                        return {
                            "success": False,
                            "data": None,
                            "message": f"Failed: {error_msg}"
                        }
                except Exception as e:
                    logger.error(f"Error removing stock from watchlist: {e}")
                    return {
                        "success": False,
                        "data": None,
                        "message": f"Error removing {symbol} from watchlist: {str(e)}"
                    }
            
            else:
                return {
                    "success": False,
                    "data": None,
                    "message": f"Unknown function: {function_name}"
                }
                
        except Exception as e:
            logger.error(f"Error executing function {function_name}: {e}")
            return {
                "success": False,
                "data": None,
                "message": f"Error executing function: {str(e)}"
            }
    
    def process_message(self, user_id: str, message: str) -> Dict[str, Any]:
        """Process a user message and return AI response"""
        try:
            logger.info(f"Processing message from user {user_id}: {message}")
            
            # Check rate limit
            if not self._check_rate_limit(user_id):
                logger.warning(f"Rate limit exceeded for user {user_id}")
                return {
                    "success": False,
                    "error": "Rate limit exceeded. Please wait before sending another message.",
                    "response": "I'm getting a lot of requests right now. Please wait a moment before asking another question."
                }
            
            # Check if Gemini client is available
            if not self.gemini_client:
                logger.error("Gemini client not initialized - API key may be missing")
                return {
                    "success": False,
                    "error": "AI service unavailable - API key not configured",
                    "response": "I'm currently unavailable. The AI service needs to be configured. Please try again later."
                }
            
            # Get user context
            context = self._get_user_context(user_id)
            
            # Serialize context to handle any datetime objects
            serialized_context = serialize_datetime(context)
            
            # Prepare system prompt
            system_prompt = f"""You are an AI stock advisor for Stock Watchlist Pro. Help users with investment advice, portfolio analysis, and market insights.

User Context:
- User ID: {user_id}
- Watchlist: {json.dumps(serialized_context['watchlist'], indent=2)}
- Recent conversation: {json.dumps(serialized_context['recent_conversation'], indent=2)}

Your Personality: Be brief, helpful, and professional. Give concise answers without unnecessary details. Think like a skilled trader giving quick, actionable advice.

Guidelines:
1. Keep ALL responses SHORT and actionable - aim for 2-3 sentences max when possible
2. **ALWAYS check the user's existing watchlist before recommending stocks** - don't recommend stocks they already have
3. When asked "what stocks should I add?", ONLY RECOMMEND stocks - DO NOT add them automatically
4. Use the get_watchlist_details function to see current holdings before making recommendations
5. Wait for EXPLICIT user confirmation before adding any stocks to the watchlist
6. Give brief reasoning for recommendations (1-2 sentences max)
7. Don't over-explain or be verbose - users want quick, direct answers
8. Be conversational and direct, not academic or formal
9. Use functions to get real data, don't make assumptions
10. When you successfully add or remove a stock, just give the confirmation message - nothing else

Available functions:
- get_stock_price: Get current stock price and info
- analyze_watchlist: Analyze user's watchlist performance  
- get_watchlist_details: Get comprehensive watchlist information
- get_market_news: Get news for specific stocks
- compare_stocks: Compare multiple stocks
- add_stock_to_watchlist: Add a stock to the user's watchlist
- remove_stock_from_watchlist: Remove a stock from the user's watchlist

CRITICAL RULES:
1. **BE BRIEF** - Aim for 2-3 sentences max in all responses. Don't dump watchlist data or give unnecessary details.
2. **ALWAYS CHECK EXISTING WATCHLIST FIRST** - Before recommending any stocks, check what they already have using get_watchlist_details to avoid duplicate suggestions
3. **DO NOT ADD STOCKS AUTOMATICALLY** - Only add stocks when user explicitly says "add" or "yes" or gives clear confirmation
4. When user asks "what stocks should I add?", first check current watchlist, then recommend 2-3 NEW stocks they don't already have and WAIT for confirmation
5. NEVER create fake data, fake stock details, or fake watchlists
6. NEVER say you're adding a stock "manually" - always use the actual function
7. When you receive "SUCCESS:" from a function, that means it actually worked in the database
8. When you receive "FAILED:" from a function, tell the user exactly what went wrong
9. **ABSOLUTELY CRITICAL**: When adding a stock, respond with EXACTLY this format:
   "✅ Successfully added AAPL (Apple Inc.) to your watchlist at $150.00. Your watchlist will update automatically."
   ONE line only. Nothing else.
10. **ABSOLUTELY CRITICAL**: When removing a stock, respond with:
    "✅ Successfully removed AAPL from your watchlist."
    ONE line only.
11. NEVER show full watchlist JSON to the user - just brief responses
12. NEVER generate fake JSON watchlists - only use real data from functions
13. ALWAYS use the exact information returned by functions
14. When users provide company names for adding/removing, use company_name parameter
15. When users provide stock symbols, use symbol parameter
16. For add/remove operations, provide EITHER symbol OR company_name, not both
17. **DON'T VERBOSE**: When listing your current watchlist, just give symbols and brief performance - don't analyze every single stock unless asked"""

            # Prepare messages for Gemini API
            # Combine system prompt and user message
            full_prompt = f"{system_prompt}\n\nUser: {message}\nAssistant:"
            
            # Convert functions to Gemini's tool format
            try:
                function_declarations = []
                for func in self._get_available_functions():
                    function_declarations.append(
                        FunctionDeclaration(
                            name=func["name"],
                            description=func["description"],
                            parameters=func["parameters"]
                        )
                    )
                
                # Create tools list with all function declarations
                tools = [Tool(function_declarations=function_declarations)] if function_declarations else None
            except Exception as e:
                # Fallback to dictionary format if Tool/FunctionDeclaration not available
                logger.warning(f"Could not use Tool types, falling back to dict format: {e}")
                function_declarations = []
                for func in self._get_available_functions():
                    function_declarations.append({
                        "name": func["name"],
                        "description": func["description"],
                        "parameters": func["parameters"]
                    })
                tools = [{"function_declarations": function_declarations}] if function_declarations else None
            
            # Call Gemini API
            logger.info("Calling Gemini API...")
            try:
                # Use the model instance
                model = self.gemini_client
                
                # Generate content with tools for function calling
                # Use shorter max_output_tokens for free tier
                response = model.generate_content(
                    full_prompt,
                    tools=tools if tools else None,
                    generation_config={
                        "temperature": 0.7,
                        "max_output_tokens": 500  # Reduced for free tier
                    }
                )
                logger.info("Gemini API call successful")
            except Exception as e:
                error_str = str(e)
                logger.error(f"Gemini API call failed: {error_str}")
                
                # Check if it's a quota error
                if "429" in error_str or "quota" in error_str.lower() or "Quota exceeded" in error_str:
                    logger.warning("⚠️ Quota exceeded - user may need to wait or upgrade plan")
                    return {
                        "success": False,
                        "error": "I've reached my usage limit for today. Please try again later, or check your Gemini API quota at https://ai.dev/usage?tab=rate-limit",
                        "response": "I've reached my daily usage limit. Please try again in a few hours, or check your API quota settings."
                    }
                
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
                return {
                    "success": False,
                    "error": f"I'm having trouble connecting to my AI service right now. Please try again in a moment. Error: {str(e)[:200]}",
                    "response": "I'm having trouble connecting right now. Please try again in a moment."
                }
            
            # Process response
            ai_response = None
            function_calls = []
            
            # Extract text response and function calls from Gemini
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                
                # Check for function calls in the response
                if hasattr(candidate, 'content') and candidate.content:
                    parts = candidate.content.parts
                    for part in parts:
                        # Check for function calls (Gemini function calling format)
                        if hasattr(part, 'function_call') and part.function_call:
                            func_call = part.function_call
                            # Validate function name exists
                            if hasattr(func_call, 'name') and func_call.name:
                                function_calls.append(func_call)
                            else:
                                logger.warning(f"Received function call with empty name: {func_call}")
                        elif hasattr(part, 'text') and part.text:
                            ai_response = part.text
                # Fallback: try to get text directly
                elif hasattr(response, 'text') and response.text:
                    ai_response = response.text
            
            # Handle function calls (if any)
            if function_calls:
                function_results = []
                for func_call in function_calls:
                    try:
                        # Get function name
                        function_name = getattr(func_call, 'name', None)
                        if not function_name:
                            logger.error(f"Function call missing name: {func_call}")
                            function_results.append({
                                "function_name": "unknown",
                                "result": {
                                    "success": False,
                                    "error": "Function name is missing"
                                }
                            })
                            continue
                        
                        function_args = {}
                        
                        # Parse function arguments
                        if hasattr(func_call, 'args'):
                            # Convert args to dict
                            if hasattr(func_call.args, 'items'):
                                function_args = dict(func_call.args.items())
                            elif hasattr(func_call.args, '__dict__'):
                                function_args = func_call.args.__dict__
                            elif isinstance(func_call.args, dict):
                                function_args = func_call.args
                            else:
                                # Try to convert to dict
                                try:
                                    function_args = dict(func_call.args) if func_call.args else {}
                                except:
                                    function_args = {}
                        
                        logger.info(f"Executing function: {function_name} with args: {function_args}")
                        
                        # Execute the function
                        result = self._execute_function(function_name, function_args, user_id)
                        # Serialize datetime objects in result
                        serialized_result = serialize_datetime(result)
                        function_results.append({
                            "function_name": function_name,
                            "result": serialized_result
                        })
                    except Exception as e:
                        logger.error(f"Error executing function {func_call.name}: {e}")
                        import traceback
                        logger.error(f"Traceback: {traceback.format_exc()}")
                        function_results.append({
                            "function_name": func_call.name,
                            "result": {
                                "success": False,
                                "error": f"Function execution failed: {str(e)}"
                            }
                        })
                
                # Build context for final response with function results
                results_context = "\n\nFunction Results:\n"
                for result in function_results:
                    formatted_content = self._format_function_result(result["result"], result["function_name"])
                    results_context += f"- {result['function_name']}: {formatted_content}\n"
                
                final_prompt = f"{system_prompt}\n\nUser: {message}\n{results_context}\nAssistant:"
                
                # Get final AI response
                try:
                    logger.info("Getting final AI response after function execution...")
                    final_response = model.generate_content(
                        final_prompt,
                        tools=tools if tools else None,
                        generation_config={
                            "temperature": 0.7,
                            "max_output_tokens": 1000
                        }
                    )
                    
                    if hasattr(final_response, 'candidates') and final_response.candidates:
                        candidate = final_response.candidates[0]
                        if hasattr(candidate, 'content') and candidate.content:
                            parts = candidate.content.parts
                            for part in parts:
                                if hasattr(part, 'text'):
                                    ai_response = part.text
                                    break
                    
                    if not ai_response:
                        # Fallback to function results summary
                        if function_results:
                            success_results = [r for r in function_results if r["result"].get("success")]
                            if success_results:
                                messages_summary = ", ".join([r["result"].get("message", "") for r in success_results])
                                ai_response = messages_summary
                            else:
                                error_messages = [r["result"].get("message", "Unknown error") for r in function_results]
                                ai_response = f"Error: {'; '.join(error_messages)}"
                        else:
                            ai_response = "I've completed the requested action."
                    
                    logger.info(f"Final AI response received: {ai_response[:100]}...")
                except Exception as e:
                    logger.error(f"Failed to get final AI response: {e}")
                    # Fallback to function results summary
                    if function_results:
                        success_results = [r for r in function_results if r["result"].get("success")]
                        if success_results:
                            messages_summary = ", ".join([r["result"].get("message", "") for r in success_results])
                            ai_response = messages_summary
                        else:
                            error_messages = [r["result"].get("message", "Unknown error") for r in function_results]
                            ai_response = f"Error: {'; '.join(error_messages)}"
                    else:
                        ai_response = "I encountered an error while processing your request. Please try again."
            else:
                # No function calls, just get the text response
                if not ai_response:
                    if hasattr(response, 'candidates') and response.candidates:
                        candidate = response.candidates[0]
                        if hasattr(candidate, 'content') and candidate.content:
                            parts = candidate.content.parts
                            for part in parts:
                                if hasattr(part, 'text'):
                                    ai_response = part.text
                                    break
                
                if not ai_response:
                    ai_response = "I'm sorry, I didn't receive a response. Please try again."
            
            # Save conversation
            self._save_conversation(user_id, message, ai_response)
            
            return {
                "success": True,
                "response": ai_response,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "response": f"I'm sorry, I encountered an error processing your message: {str(e)}. Please try again."
            }

# Global chat service instance
chat_service = ChatService()

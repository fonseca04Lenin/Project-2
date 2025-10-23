"""
Chat Service for AI Stock Advisor
Handles Groq API integration and conversation management
"""

import os
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from groq import Groq
from firebase_service import FirebaseService, get_firestore_client
from stock import Stock, YahooFinanceAPI, NewsAPI, FinnhubAPI
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ChatService:
    def __init__(self):
        """Initialize the chat service with Groq API and Firebase"""
        self.groq_client = None
        self.firebase_service = FirebaseService()
        self.firestore_client = get_firestore_client()
        self.stock_api = YahooFinanceAPI()
        self.finnhub_api = FinnhubAPI()
        self.news_api = NewsAPI()
        
        # Rate limiting
        self.user_requests = {}  # Track user request counts
        self.max_requests_per_hour = 5
        
        # Initialize Groq client
        self._initialize_groq()
    
    def _initialize_groq(self):
        """Initialize Groq API client"""
        try:
            api_key = os.getenv('GROQ_API_KEY')
            if not api_key:
                logger.warning("GROQ_API_KEY not found in environment variables")
                return
            
            self.groq_client = Groq(api_key=api_key)
            logger.info("✅ Groq API client initialized successfully")
        except Exception as e:
            logger.error(f"❌ Failed to initialize Groq API: {e}")
    
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
            # Import watchlist service to get current watchlist data
            from watchlist_service import WatchlistService
            watchlist_service = WatchlistService(self.firestore_client)
            
            # Get user's current watchlist using the watchlist service
            watchlist_items = watchlist_service.get_watchlist(user_id, limit=10)
            watchlist_data = []
            
            # Process watchlist items with current prices
            for item in watchlist_items:
                try:
                    # Get current stock price and info
                    stock_info = self.stock_api.get_stock_info(item['symbol'])
                    watchlist_data.append({
                        'symbol': item['symbol'],
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
                    logger.warning(f"Failed to get price for {item['symbol']}: {e}")
                    # Fallback to basic info without current price
                    watchlist_data.append({
                        'symbol': item['symbol'],
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
            
            logger.info(f"Retrieved {len(watchlist_data)} watchlist items for user {user_id}")
            
            return {
                'watchlist': watchlist_data,
                'recent_conversation': chat_history,
                'user_id': user_id
            }
        except Exception as e:
            logger.error(f"Failed to get user context: {e}")
            return {'watchlist': [], 'recent_conversation': [], 'user_id': user_id}
    
    def _get_conversation_history(self, user_id: str, limit: int = 3) -> List[Dict]:
        """Get recent conversation history from Firestore"""
        try:
            chat_ref = self.firestore_client.collection('chat_conversations').document(user_id)
            chat_doc = chat_ref.get()
            
            if chat_doc.exists:
                chat_data = chat_doc.to_dict()
                messages = chat_data.get('messages', [])
                return messages[-limit:] if messages else []
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
            }
        ]
    
    def _execute_function(self, function_name: str, arguments: Dict, user_id: str) -> Dict:
        """Execute a function called by the AI"""
        try:
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
            
            # Check if Groq client is available
            if not self.groq_client:
                logger.error("Groq client not initialized - API key may be missing")
                return {
                    "success": False,
                    "error": "AI service unavailable - API key not configured",
                    "response": "I'm currently unavailable. The AI service needs to be configured. Please try again later."
                }
            
            # Get user context
            context = self._get_user_context(user_id)
            
            # Prepare system prompt
            system_prompt = f"""You are an AI stock advisor for Stock Watchlist Pro. You help users with investment advice, portfolio analysis, and market insights.

User Context:
- User ID: {user_id}
- Watchlist: {json.dumps(context['watchlist'], indent=2)}
- Recent conversation: {json.dumps(context['recent_conversation'], indent=2)}

Guidelines:
1. Provide helpful, accurate financial advice based on real-time data
2. Always mention that this is general information, not personalized financial advice
3. Use emojis and formatting to make responses engaging
4. When analyzing stocks, use the available functions to get current data
5. Be conversational but professional
6. If you don't know something, say so rather than guessing

Available functions:
- get_stock_price: Get current stock price and info
- analyze_watchlist: Analyze user's watchlist performance  
- get_watchlist_details: Get comprehensive watchlist information
- get_market_news: Get news for specific stocks
- compare_stocks: Compare multiple stocks

Remember: Always use functions to get real-time data when discussing specific stocks or portfolios."""

            # Prepare messages for Groq API
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message}
            ]
            
            # Call Groq API with function calling
            logger.info("Calling Groq API...")
            response = self.groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=messages,
                tools=[{"type": "function", "function": func} for func in self._get_available_functions()],
                tool_choice="auto",
                temperature=0.7,
                max_tokens=1000
            )
            logger.info("Groq API call successful")
            
            # Process response
            ai_message = response.choices[0].message
            
            # Handle function calls
            if ai_message.tool_calls:
                function_results = []
                for tool_call in ai_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    # Execute the function
                    result = self._execute_function(function_name, function_args, user_id)
                    function_results.append({
                        "tool_call_id": tool_call.id,
                        "function_name": function_name,
                        "result": result
                    })
                
                # Get final response with function results
                messages.append(ai_message)
                for result in function_results:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": result["tool_call_id"],
                        "content": json.dumps(result["result"])
                    })
                
                # Get final AI response
                final_response = self.groq_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=messages,
                    temperature=0.7,
                    max_tokens=1000
                )
                
                ai_response = final_response.choices[0].message.content
            else:
                ai_response = ai_message.content
            
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

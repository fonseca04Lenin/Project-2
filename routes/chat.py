import logging
import time
import re
import json
from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_socketio import emit

from extensions import socketio
from firebase_service import get_firestore_client
from services import authenticate_request, yahoo_finance_api, news_api

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__, url_prefix='/api')

# AI Analysis cache - 4 hour TTL
_ai_analysis_cache = {}
ANALYSIS_CACHE_TTL = 4 * 60 * 60


@chat_bp.route('/chat', methods=['POST'])
def chat_endpoint():
    """Main chat endpoint for AI stock advisor"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'error': 'Message is required'}), 400

        message = data['message'].strip()
        if not message:
            return jsonify({'error': 'Message cannot be empty'}), 400

        from chat_service import chat_service

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
        logger.error("Chat endpoint error: %s", e)
        import traceback
        logger.error("Full traceback: %s", traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Internal server error: {str(e)}',
            'response': 'I\'m sorry, I encountered an error. Please try again.'
        }), 500


@chat_bp.route('/chat/history', methods=['GET'])
def get_chat_history():
    """Get user's chat conversation history"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        from chat_service import chat_service

        history = chat_service._get_conversation_history(user.id, limit=50)

        return jsonify({
            'success': True,
            'history': history
        })

    except Exception as e:
        logger.error("Chat history error: %s", e)
        return jsonify({
            'success': False,
            'error': 'Could not retrieve chat history'
        }), 500


@chat_bp.route('/chat/clear', methods=['DELETE'])
def clear_chat_history():
    """Clear user's chat conversation history"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        firestore_client = get_firestore_client()
        chat_ref = firestore_client.collection('chat_conversations').document(user.id)
        chat_ref.delete()

        return jsonify({
            'success': True,
            'message': 'Chat history cleared successfully'
        })

    except Exception as e:
        logger.error("Clear chat history error: %s", e)
        return jsonify({
            'success': False,
            'error': 'Could not clear chat history'
        }), 500


@chat_bp.route('/chat/status', methods=['GET'])
def chat_status():
    """Get chat service status and user rate limit info"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        from chat_service import chat_service

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
        logger.error("Chat status error: %s", e)
        return jsonify({
            'success': False,
            'error': 'Could not get chat status'
        }), 500


@chat_bp.route('/chat/test-gemini', methods=['GET'])
def test_gemini_api():
    """Test Gemini API directly"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        from chat_service import chat_service

        if not chat_service.gemini_client:
            return jsonify({
                'success': False,
                'error': 'Gemini client not initialized - API key may be missing',
                'gemini_available': False
            })

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
        logger.error("Gemini test error: %s", e)
        import traceback
        logger.error("Full traceback: %s", traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e),
            'gemini_available': False,
            'message': 'Gemini API test failed'
        }), 500


@chat_bp.route('/stock/<symbol>/ai-analysis', methods=['GET'])
def get_stock_ai_analysis(symbol):
    """Generate AI analysis of stock movement"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        symbol = symbol.upper()
        current_time = time.time()

        if symbol in _ai_analysis_cache:
            cached = _ai_analysis_cache[symbol]
            cache_age = current_time - cached['timestamp']
            if cache_age < ANALYSIS_CACHE_TTL:
                cached_data = cached['data'].copy()
                cached_data['cached'] = True
                cached_data['cache_age_minutes'] = int(cache_age / 60)
                return jsonify(cached_data)

        stock_data = yahoo_finance_api.get_real_time_data(symbol)
        if not stock_data:
            return jsonify({
                'success': False,
                'error': f'Could not fetch stock data for {symbol}'
            }), 404

        try:
            news = news_api.get_company_news(symbol, limit=5)
        except Exception as e:
            logger.warning("Could not fetch news for AI analysis of %s: %s", symbol, e)
            news = []

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

        response_data = {
            'success': True,
            'symbol': symbol,
            'analysis': result.get('analysis'),
            'cached': False,
            'cache_age_minutes': 0,
            'generated_at': datetime.now().isoformat()
        }

        _ai_analysis_cache[symbol] = {
            'data': response_data,
            'timestamp': current_time
        }

        return jsonify(response_data)

    except Exception as e:
        logger.error("Error in AI analysis for %s: %s", symbol, e)
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'symbol': symbol,
            'error': f'Analysis failed: {str(e)[:100]}'
        }), 500


@chat_bp.route('/stock/<symbol>/ai-insight')
def get_stock_ai_insight(symbol):
    """Get AI-generated insight explaining why a stock is moving"""
    symbol = symbol.upper()

    try:
        from chat_service import chat_service
        import yfinance as yf

        logger.info("[AI Insight] Starting for %s", symbol)

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            price = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('regularMarketPreviousClose') or 0
            prev_close = info.get('regularMarketPreviousClose') or info.get('previousClose') or 0
            name = info.get('shortName') or info.get('longName') or symbol

            if price and prev_close and prev_close != 0:
                change = price - prev_close
                change_pct = (change / prev_close) * 100
            else:
                change = 0
                change_pct = 0

            logger.info("[AI Insight] %s: $%.2f (%+.2f%%)", symbol, price, change_pct)

        except Exception as e:
            import traceback
            logger.error("[AI Insight] yfinance error for %s: %s", symbol, e)
            traceback.print_exc()
            return jsonify({'error': f'Stock "{symbol}" not found', 'symbol': symbol}), 404

        if not price:
            logger.warning("[AI Insight] No price data for %s", symbol)
            return jsonify({'error': f'Stock "{symbol}" not found', 'symbol': symbol}), 404

        news_context = ""
        try:
            news = news_api.get_company_news(symbol, limit=3)
            if news:
                news_context = "\n".join([f"- {n.get('title', '')}" for n in news[:3]])
        except:
            pass

        if not chat_service.gemini_client:
            logger.warning("[AI Insight] Gemini client not available")
            return jsonify({'symbol': symbol, 'ai_insight': 'AI service temporarily unavailable.'}), 200

        direction = "up" if change_pct >= 0 else "down"
        prompt = f"""Explain in 2-3 short sentences why {name} ({symbol}) stock moved {direction} {abs(change_pct):.1f}% today.

Current price: ${price:.2f}
Recent headlines: {news_context if news_context else "No recent news available"}

Write plain text only. No formatting, no bullet points, no JSON. Complete your sentences."""

        logger.debug("[AI Insight] Calling Gemini for %s", symbol)

        response = chat_service.gemini_client.generate_content(
            prompt,
            generation_config={"temperature": 0.5, "max_output_tokens": 500}
        )

        insight_text = None
        if hasattr(response, 'candidates') and response.candidates:
            candidate = response.candidates[0]
            if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                for part in candidate.content.parts:
                    if hasattr(part, 'text') and part.text:
                        insight_text = part.text.strip()
                        break

        if not insight_text and hasattr(response, 'text'):
            insight_text = response.text.strip()

        if insight_text:
            if insight_text.strip().startswith('{') or '```json' in insight_text:
                try:
                    clean = re.sub(r'^```json\s*', '', insight_text.strip())
                    clean = re.sub(r'\s*```$', '', clean)
                    parsed = json.loads(clean)
                    if isinstance(parsed, dict) and 'summary' in parsed:
                        insight_text = parsed['summary']
                except:
                    pass

            logger.info("[AI Insight] Generated for %s: %s...", symbol, insight_text[:80])
            return jsonify({
                'symbol': symbol,
                'change_percent': round(change_pct, 2),
                'ai_insight': insight_text
            })
        else:
            logger.warning("[AI Insight] No text in response for %s", symbol)
            return jsonify({'symbol': symbol, 'ai_insight': 'Unable to generate insight.'}), 200

    except Exception as e:
        import traceback
        error_msg = str(e)
        logger.error("[AI Insight] Error for %s: %s", symbol, error_msg)
        traceback.print_exc()

        if '429' in error_msg or 'quota' in error_msg.lower():
            return jsonify({
                'symbol': symbol,
                'ai_insight': 'AI quota exceeded. Please try again later.'
            }), 200

        return jsonify({
            'symbol': symbol,
            'ai_insight': f'Error: {error_msg[:100]}'
        }), 200


def register_chat_socketio_events():
    """Register chat-related SocketIO events"""
    @socketio.on('chat_message')
    def handle_chat_message(data):
        """Handle real-time chat messages via WebSocket"""
        try:
            user_id = data.get('user_id')
            message = data.get('message')

            if not user_id or not message:
                emit('chat_error', {'error': 'Invalid message data'})
                return

            from chat_service import chat_service

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
            logger.error("WebSocket chat error: %s", e)
            emit('chat_error', {
                'error': 'Internal server error',
                'response': 'I\'m sorry, I encountered an error. Please try again.'
            })

import logging
import os
import time
import re
import json
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from flask_socketio import emit

from app.extensions import socketio
from app.services.firebase_service import get_firestore_client
from app.services.services import authenticate_request, yahoo_finance_api, news_api

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

        # --- Subscription gate: daily chat limit ---
        from app.services.subscription_service import check_and_increment_chat_usage
        usage = check_and_increment_chat_usage(user.id)
        if not usage['allowed']:
            limit = usage['limit']
            tier = usage['tier']
            now_utc = datetime.now(timezone.utc)
            tomorrow_midnight = (now_utc + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            hours_left = max(1, int((tomorrow_midnight - now_utc).total_seconds() / 3600))
            reset_note = f" Resets in ~{hours_left} hour{'s' if hours_left != 1 else ''} (midnight UTC)."
            if tier == 'free':
                upgrade_hint = " Upgrade to Pro for 50 messages/day, or Elite for unlimited."
            else:
                upgrade_hint = " Upgrade to Elite for unlimited messages."
            return jsonify({
                'success': False,
                'error': 'daily_limit_reached',
                'message': (
                    f"You've used all {limit} AI messages for today.{reset_note}{upgrade_hint}"
                ),
                'usage': {
                    'used': usage['used'],
                    'limit': limit,
                    'tier': tier,
                    'upgrade_required': True,
                },
            }), 429

        from app.services.chat_service import chat_service

        result = chat_service.process_message(user.id, message)

        if result['success']:
            return jsonify({
                'success': True,
                'response': result['response'],
                'timestamp': result['timestamp'],
                'usage': {
                    'used': usage['used'],
                    'limit': usage['limit'],
                    'tier': usage['tier'],
                },
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Unknown error'),
                'response': result.get('response', 'I encountered an error. Please try again.')
            }), 500

    except Exception as e:
        import traceback
        logger.error("Chat endpoint error: %s", e)
        logger.error("Full traceback: %s", traceback.format_exc())
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'response': 'I\'m sorry, I encountered an error. Please try again.'
        }), 500


@chat_bp.route('/chat/history', methods=['GET'])
def get_chat_history():
    """Get user's chat conversation history"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        from app.services.chat_service import chat_service

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

        from app.services.chat_service import chat_service
        from app.services.subscription_service import get_user_subscription, get_daily_chat_usage, PLANS

        sub = get_user_subscription(user.id)
        tier = sub['tier']
        plan = PLANS.get(tier, PLANS['free'])
        used = get_daily_chat_usage(user.id)
        limit = plan['chat_daily_limit']
        can_send = limit is None or used < limit

        return jsonify({
            'success': True,
            'status': 'available' if chat_service.xai_api_key else 'unavailable',
            'rate_limit': {
                'can_send': can_send,
                'used_today': used,
                'daily_limit': limit,
                'tier': tier,
                'upgrade_required': not can_send,
            }
        })

    except Exception as e:
        logger.error("Chat status error: %s", e)
        return jsonify({
            'success': False,
            'error': 'Could not get chat status'
        }), 500


@chat_bp.route('/chat/test-grok', methods=['GET'])
def test_grok_api():
    """Test Grok (xAI) API directly"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        from app.services.chat_service import chat_service

        if not chat_service.xai_api_key:
            return jsonify({
                'success': False,
                'error': 'XAI_API_KEY not configured',
                'grok_available': False
            })

        data = chat_service._call_grok_api(
            [{"role": "user", "content": "Say 'Hello, Grok API is working!'"}],
            max_tokens=50
        )
        result = data['choices'][0]['message'].get('content', '')

        return jsonify({
            'success': True,
            'grok_available': True,
            'test_response': result,
            'message': 'Grok API is working correctly'
        })

    except Exception as e:
        logger.error("Grok test error: %s", e)
        import traceback
        logger.error("Full traceback: %s", traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e),
            'grok_available': False,
            'message': 'Grok API test failed'
        }), 500


@chat_bp.route('/stock/<symbol>/ai-analysis', methods=['GET'])
def get_stock_ai_analysis(symbol):
    """Generate AI analysis of stock movement"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        # --- Subscription gate: Pro/Elite only ---
        from app.services.subscription_service import check_ai_suite_access
        access = check_ai_suite_access(user.id)
        if not access['allowed']:
            return jsonify({
                'error': 'upgrade_required',
                'message': 'AI Stock Analysis is available on Pro and Elite plans.',
                'tier': access['tier'],
            }), 403

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

        from app.services.chat_service import chat_service

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
    """Get AI-generated 7-day overview explaining why a stock is moving (powered by Grok)"""
    # --- Auth + subscription gate: Pro/Elite only ---
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    from app.services.subscription_service import check_ai_suite_access
    access = check_ai_suite_access(user.id)
    if not access['allowed']:
        return jsonify({
            'error': 'upgrade_required',
            'message': 'AI Market Insights are available on Pro and Elite plans.',
            'tier': access['tier'],
        }), 403

    symbol = symbol.upper()

    try:
        import requests as http_requests
        import yfinance as yf

        logger.info("[AI Insight] Starting 7-day overview for %s", symbol)

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            price = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('regularMarketPreviousClose') or 0
            name = info.get('shortName') or info.get('longName') or symbol

            # Always use 7-day history for the weekly overview
            hist = ticker.history(period='7d')
            if len(hist) >= 2:
                week_start_price = float(hist['Close'].iloc[0])
                weekly_change_pct = ((price - week_start_price) / week_start_price) * 100 if week_start_price else 0
            else:
                weekly_change_pct = 0

            logger.info("[AI Insight] %s: $%.2f 7-day=%+.2f%%", symbol, price, weekly_change_pct)

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
        except Exception:
            pass

        direction = "up" if weekly_change_pct >= 0 else "down"
        prompt = f"""Explain in 2-3 short sentences why {name} ({symbol}) stock has moved {direction} {abs(weekly_change_pct):.1f}% over the past 7 days. Focus on the weekly trend, sector dynamics, or macro factors driving this move.

Current price: ${price:.2f}
7-day change: {'+' if weekly_change_pct >= 0 else ''}{weekly_change_pct:.1f}%
Recent headlines: {news_context if news_context else "No recent news available"}

Write plain text only. No formatting, no bullet points, no JSON. Complete your sentences."""

        logger.debug("[AI Insight] Calling Grok for %s", symbol)

        xai_api_key = os.environ.get('XAI_API_KEY')
        if not xai_api_key:
            logger.warning("[AI Insight] XAI_API_KEY not configured")
            return jsonify({'symbol': symbol, 'ai_insight': 'AI service temporarily unavailable.'}), 200

        grok_resp = http_requests.post(
            'https://api.x.ai/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {xai_api_key}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'grok-3-fast',
                'messages': [{'role': 'user', 'content': prompt}],
                'temperature': 0.5,
                'max_tokens': 300
            },
            timeout=30
        )
        grok_resp.raise_for_status()
        insight_text = grok_resp.json()['choices'][0]['message']['content'].strip()

        if insight_text:
            logger.info("[AI Insight] Generated for %s: %s...", symbol, insight_text[:80])
            return jsonify({
                'symbol': symbol,
                'change_percent': round(weekly_change_pct, 2),
                'period': '7 days',
                'ai_insight': insight_text
            })
        else:
            logger.warning("[AI Insight] Empty response for %s", symbol)
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

            from app.services.chat_service import chat_service

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

import logging
import os
import re
import json
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify, Response, stream_with_context
from flask_socketio import emit

from app.extensions import socketio
from app.services.firebase_service import get_firestore_client
from app.services.services import authenticate_request, yahoo_finance_api, news_api
from app.services.cache_service import cache_get, cache_set
from app.services.ai_gateway import generate as ai_generate

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__, url_prefix='/api')

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
        from app.services.subscription_service import (
            check_and_increment_chat_usage, check_hourly_rate_limit
        )
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

        # --- Hourly burst limit (60/hr, all tiers) ---
        hourly = check_hourly_rate_limit(user.id, limit=60)
        if not hourly['allowed']:
            return jsonify({
                'success': False,
                'error': 'hourly_limit_reached',
                'message': 'You have sent too many messages this hour. Please wait a few minutes.',
                'usage': {'used': hourly['used'], 'limit': hourly['limit']},
            }), 429

        from app.services.chat_service import chat_service

        thread_id = data.get('thread_id')
        result = chat_service.process_message(user.id, message, thread_id=thread_id)

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


@chat_bp.route('/chat/stream', methods=['POST'])
def chat_stream():
    """
    Streaming chat endpoint — returns Server-Sent Events (text/event-stream).

    Each event is:  data: {"chunk": "..."}\n\n
    Final event is: data: {"done": true, "usage": {...}}\n\n
    Error event is: data: {"error": "..."}\n\n

    The client reads chunks and appends them to the message bubble in real time.
    """
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        data = request.get_json(silent=True) or {}
        message = (data.get('message') or '').strip()
        if not message:
            return jsonify({'error': 'Message is required'}), 400

        from app.services.subscription_service import (
            check_and_increment_chat_usage, check_hourly_rate_limit
        )
        usage = check_and_increment_chat_usage(user.id)
        if not usage['allowed']:
            limit = usage['limit']
            return jsonify({
                'success': False,
                'error': 'daily_limit_reached',
                'message': (
                    f"You've used all {limit} free AI messages for today. "
                    "Upgrade to Pro for 50 messages/day, or Elite for unlimited access."
                ),
            }), 429

        hourly = check_hourly_rate_limit(user.id, limit=60)
        if not hourly['allowed']:
            return jsonify({
                'success': False,
                'error': 'hourly_limit_reached',
                'message': 'You have sent too many messages this hour. Please wait a few minutes.',
            }), 429

        from app.services.chat_service import chat_service

        thread_id = data.get('thread_id')

        def generate():
            try:
                for chunk in chat_service.process_message_stream(user.id, message, thread_id=thread_id):
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                yield f"data: {json.dumps({'done': True, 'usage': {'used': usage['used'], 'limit': usage['limit'], 'tier': usage['tier']}})}\n\n"
            except Exception as e:
                logger.error("SSE stream error for user %s: %s", user.id, e)
                yield f"data: {json.dumps({'error': str(e)[:100]})}\n\n"

        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',   # disable nginx buffering
                'Connection': 'keep-alive',
            },
        )

    except Exception as e:
        logger.error("chat_stream endpoint error: %s", e)
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@chat_bp.route('/chat/threads', methods=['GET'])
def list_threads():
    """List all chat threads for the user"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        from app.services.chat_service import chat_service
        threads = chat_service.list_threads(user.id)
        return jsonify({'success': True, 'threads': threads})
    except Exception as e:
        logger.error("list_threads error: %s", e)
        return jsonify({'success': False, 'error': 'Could not list threads'}), 500


@chat_bp.route('/chat/threads', methods=['POST'])
def create_thread():
    """Create a new chat thread"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        data = request.get_json(silent=True) or {}
        title = data.get('title', 'New Chat')
        from app.services.chat_service import chat_service
        thread = chat_service.create_thread(user.id, title=title)
        return jsonify({'success': True, 'thread': thread}), 201
    except Exception as e:
        logger.error("create_thread error: %s", e)
        return jsonify({'success': False, 'error': 'Could not create thread'}), 500


@chat_bp.route('/chat/threads/<thread_id>', methods=['DELETE'])
def delete_thread(thread_id):
    """Delete a chat thread"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        from app.services.chat_service import chat_service
        chat_service.delete_thread(user.id, thread_id)
        return jsonify({'success': True})
    except Exception as e:
        logger.error("delete_thread error: %s", e)
        return jsonify({'success': False, 'error': 'Could not delete thread'}), 500


@chat_bp.route('/chat/threads/<thread_id>', methods=['PATCH'])
def rename_thread(thread_id):
    """Rename a chat thread"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        data = request.get_json(silent=True) or {}
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'error': 'Title is required'}), 400
        from app.services.chat_service import chat_service
        chat_service.rename_thread(user.id, thread_id, title)
        return jsonify({'success': True})
    except Exception as e:
        logger.error("rename_thread error: %s", e)
        return jsonify({'success': False, 'error': 'Could not rename thread'}), 500


@chat_bp.route('/chat/threads/<thread_id>/history', methods=['GET'])
def get_thread_history(thread_id):
    """Get message history for a specific thread"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        from app.services.chat_service import chat_service
        history = chat_service._get_thread_history(user.id, thread_id, limit=100)
        return jsonify({'success': True, 'history': history})
    except Exception as e:
        logger.error("get_thread_history error: %s", e)
        return jsonify({'success': False, 'error': 'Could not retrieve thread history'}), 500


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



@chat_bp.route('/stock/<symbol>/ai-analysis', methods=['GET'])
def get_stock_ai_analysis(symbol):
    """Generate AI analysis of stock movement"""
    try:
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        # --- Usage gate: free=1/day, pro/elite=unlimited ---
        from app.services.subscription_service import check_and_increment_analysis_usage
        access = check_and_increment_analysis_usage(user.id)
        if not access['allowed']:
            return jsonify({
                'error': 'upgrade_required',
                'message': f"You've used your {access['limit']} free AI analysis today. Upgrade for unlimited access.",
                'tier': access['tier'],
                'used': access['used'],
                'limit': access['limit'],
            }), 403

        symbol = symbol.upper()
        cache_key = f'ai_analysis_{symbol}'

        cached = cache_get(cache_key, ANALYSIS_CACHE_TTL)
        if cached is not None:
            cached['cached'] = True
            return jsonify(cached)

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
            'generated_at': datetime.now().isoformat()
        }

        cache_set(cache_key, response_data, ANALYSIS_CACHE_TTL)
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
    """AI-generated stock overview for 7d, 6mo, or 1y."""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    from app.services.subscription_service import check_and_increment_overview_usage
    access = check_and_increment_overview_usage(user.id)
    if not access['allowed']:
        return jsonify({
            'error': 'upgrade_required',
            'message': f"You've used your {access['limit']} free AI overviews today. Upgrade for unlimited access.",
            'tier': access['tier'],
            'used': access['used'],
            'limit': access['limit'],
        }), 403

    symbol = symbol.upper()

    # Accepted period values
    period_param = request.args.get('period', '1mo').lower()
    if period_param not in ('7d', '1mo', '6mo', '1y'):
        period_param = '1mo'

    period_labels = {'7d': '7 days', '1mo': '1 month', '6mo': '6 months', '1y': '1 year'}
    period_label = period_labels[period_param]

    try:
        import yfinance as yf

        logger.info("[AI Insight] Starting %s overview for %s", period_param, symbol)

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            price = (info.get('currentPrice') or info.get('regularMarketPrice')
                     or info.get('regularMarketPreviousClose') or 0)
            name = info.get('shortName') or info.get('longName') or symbol

            hist = ticker.history(period=period_param)
            if len(hist) >= 2:
                start_price = float(hist['Close'].iloc[0])
                change_pct = ((price - start_price) / start_price) * 100 if start_price else 0
                period_high = float(hist['High'].max())
                period_low = float(hist['Low'].min())
            else:
                change_pct = 0
                period_high = price
                period_low = price
                start_price = price

            logger.info("[AI Insight] %s: $%.2f %s=%+.2f%%", symbol, price, period_param, change_pct)

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
            news_limit = 3 if period_param == '7d' else 5
            news = news_api.get_company_news(symbol, limit=news_limit)
            if news:
                news_context = "\n".join([f"- {n.get('title', '')}" for n in news[:news_limit]])
        except Exception:
            pass

        direction = "up" if change_pct >= 0 else "down"
        sign = '+' if change_pct >= 0 else ''

        if period_param == '7d':
            prompt = f"""Explain in 2-3 short sentences why {name} ({symbol}) stock has moved {direction} {abs(change_pct):.1f}% over the past 7 days. Focus on the weekly trend, sector dynamics, or macro factors driving this move.

Current price: ${price:.2f}
7-day change: {sign}{change_pct:.1f}%
Recent headlines: {news_context if news_context else "No recent news available"}

Write plain text only. No formatting, no bullet points, no JSON. Complete your sentences."""
            max_tokens = 300

        else:
            # 1mo, 6mo or 1y — detailed narrative with major events
            prompt = f"""Write a concise {period_label} overview for {name} ({symbol}) covering the major events and themes that drove the stock's performance during this period.

Performance data:
- Current price: ${price:.2f}
- {period_label} change: {sign}{change_pct:.1f}% (from ~${start_price:.2f} to ${price:.2f})
- {period_label} high: ${period_high:.2f}
- {period_label} low: ${period_low:.2f}
Recent headlines: {news_context if news_context else "No recent news available"}

Instructions:
- Write 4-6 sentences total.
- Highlight only the 3-4 most significant events or catalysts (earnings, macro shifts, regulatory news, product launches, sector rotations, etc.) that occurred during this period.
- Include how much the stock rose or declined overall and note any major peaks or troughs.
- End with a brief statement on current sentiment or outlook.
- Write plain text only. No bullet points, no headers, no JSON. Complete all sentences."""
            max_tokens = 500

        logger.debug("[AI Insight] Calling AI gateway for %s (%s)", symbol, period_param)

        try:
            insight_text = ai_generate(prompt, max_tokens=max_tokens, temperature=0.5, endpoint='ai_insight')
        except Exception as gw_err:
            logger.warning("[AI Insight] Gateway failed for %s: %s", symbol, gw_err)
            return jsonify({'symbol': symbol, 'ai_insight': 'AI service temporarily unavailable.'}), 200

        if insight_text:
            logger.info("[AI Insight] Generated for %s (%s): %s...", symbol, period_param, insight_text[:80])
            return jsonify({
                'symbol': symbol,
                'change_percent': round(change_pct, 2),
                'period_high': round(period_high, 2),
                'period_low': round(period_low, 2),
                'start_price': round(start_price, 2),
                'current_price': round(price, 2),
                'period': period_label,
                'period_param': period_param,
                'ai_insight': insight_text,
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
            'ai_insight': 'Unable to generate insight at this time.'
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

import logging
from datetime import datetime

from flask import Blueprint, jsonify
from flask_login import current_user

from config import Config
from services import (
    authenticate_request, get_watchlist_service_lazy, ensure_watchlist_service,
    connected_users, USE_ALPACA_API, alpaca_api, watchlist_service,
)
from firebase_service import FirebaseService, FirebaseUser

logger = logging.getLogger(__name__)

core_bp = Blueprint('core', __name__)


@core_bp.route('/', methods=['GET'])
def root():
    """Root endpoint for basic connectivity test"""
    return jsonify({
        'message': 'Stock Watchlist Pro API',
        'status': 'running',
        'timestamp': datetime.now().isoformat()
    })


@core_bp.route('/api', methods=['GET'])
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


@core_bp.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for Railway - must respond quickly"""
    try:
        response = jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat()
        })
        response.status_code = 200
        return response
    except Exception as e:
        try:
            return jsonify({
                'status': 'unhealthy',
                'error': str(e)
            }), 500
        except:
            return 'OK', 200


@core_bp.route('/api/test/watchlist-service')
def test_watchlist_service():
    """Test endpoint to verify watchlist service is working"""
    try:
        logger.info("Testing watchlist service...")
        service = get_watchlist_service_lazy()
        if service is None:
            return jsonify({
                'status': 'warning',
                'message': 'WatchlistService not available - Firebase may not be configured',
                'firestore_available': False
            }), 503

        db_available = service.db is not None if service else False

        return jsonify({
            'status': 'success',
            'message': 'WatchlistService is working correctly',
            'firestore_available': db_available
        })
    except Exception as e:
        logger.error("WatchlistService test failed: %s", e)
        return jsonify({'error': f'WatchlistService test failed: {str(e)}'}), 500


@core_bp.route('/api/stats', methods=['GET'])
def get_api_stats():
    """Get API statistics for monitoring rate limits and performance"""
    try:
        stats = {
            'connected_users': len(connected_users),
            'alpaca_enabled': USE_ALPACA_API,
            'timestamp': datetime.now().isoformat()
        }

        if USE_ALPACA_API and alpaca_api and hasattr(alpaca_api, 'get_queue_stats'):
            try:
                alpaca_stats = alpaca_api.get_queue_stats()
                stats['alpaca'] = alpaca_stats
                requests_last_min = alpaca_stats.get('requests_last_minute', 0)
                health_percentage = ((180 - requests_last_min) / 180) * 100 if requests_last_min <= 180 else 0
                stats['alpaca']['health'] = {
                    'percentage': round(health_percentage, 1),
                    'status': 'healthy' if health_percentage > 50 else 'warning' if health_percentage > 20 else 'critical'
                }
            except Exception as e:
                stats['alpaca'] = {'error': str(e)}

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


# Debug endpoints - only registered if DEBUG is enabled
if Config.DEBUG:
    @core_bp.route('/api/debug/auth', methods=['GET', 'POST'])
    def debug_auth():
        """Debug endpoint to test authentication headers"""
        from flask import request
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

    @core_bp.route('/api/debug/test-watchlist')
    def debug_test_watchlist():
        """Debug endpoint to test watchlist with a test user"""
        try:
            test_user_data = {
                'uid': 'debug-test-user',
                'name': 'Test User',
                'email': 'test@example.com'
            }

            test_user = FirebaseUser(test_user_data)
            ws = get_watchlist_service_lazy()

            try:
                watchlist = ws.get_watchlist(test_user.id, limit=5)
                watchlist_test = {
                    'success': True,
                    'watchlist_count': len(watchlist),
                    'watchlist': watchlist[:3]
                }
            except Exception as e:
                watchlist_test = {
                    'success': False,
                    'error': str(e)
                }

            try:
                add_result = ws.add_stock(
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
                'firestore_available': ws.db is not None
            })

        except Exception as e:
            return jsonify({'error': f'Debug test failed: {str(e)}'}), 500

    @core_bp.route('/api/debug/chatbot-watchlist/<user_id>')
    def debug_chatbot_watchlist(user_id):
        """Debug endpoint to test chatbot's watchlist access for a specific user"""
        try:
            from chat_service import chat_service

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

    @core_bp.route('/api/debug/current-user-watchlist')
    def debug_current_user_watchlist():
        """Debug endpoint to test current user's watchlist access"""
        try:
            user = authenticate_request()
            if not user:
                return jsonify({'error': 'Authentication required'}), 401

            ws = get_watchlist_service_lazy()
            watchlist_service_result = ws.get_watchlist(user.id, limit=10)

            from chat_service import chat_service
            chatbot_context = chat_service._get_user_context(user.id)

            return jsonify({
                'user_id': user.id,
                'user_email': user.email,
                'watchlist_service_count': len(watchlist_service_result),
                'watchlist_service_data': watchlist_service_result[:3],
                'chatbot_context_count': len(chatbot_context.get('watchlist', [])),
                'chatbot_context_data': chatbot_context.get('watchlist', [])[:3],
                'firestore_client_available': chat_service.firestore_client is not None
            })

        except Exception as e:
            import traceback
            return jsonify({
                'error': f'Current user watchlist debug failed: {str(e)}',
                'traceback': traceback.format_exc()
            }), 500

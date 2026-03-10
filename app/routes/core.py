import logging
from datetime import datetime

from flask import Blueprint, jsonify
from flask_login import current_user

from app.config import Config
from app.services.services import (
    authenticate_request, get_watchlist_service_lazy, ensure_watchlist_service,
    connected_users, USE_ALPACA_API, alpaca_api, watchlist_service,
)
from app.services.firebase_service import FirebaseService, FirebaseUser

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
    """Health check endpoint for Railway — must respond quickly"""
    try:
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat()
        })
    except Exception:
        return 'OK', 200



@core_bp.route('/api/stats', methods=['GET'])
def get_api_stats():
    """Get API statistics — authenticated users only"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

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
                health_pct = ((180 - requests_last_min) / 180) * 100 if requests_last_min <= 180 else 0
                stats['alpaca']['health'] = {
                    'percentage': round(health_pct, 1),
                    'status': 'healthy' if health_pct > 50 else 'warning' if health_pct > 20 else 'critical'
                }
            except Exception as e:
                logger.warning("Failed to get Alpaca stats: %s", e)
                stats['alpaca'] = {'error': 'Unavailable'}

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
                logger.warning("Failed to get circuit breaker stats: %s", e)

        return jsonify(stats)
    except Exception as e:
        logger.error("Stats endpoint error: %s", e)
        return jsonify({'error': 'Could not retrieve stats'}), 500


# ---------------------------------------------------------------------------
# Debug endpoints — ONLY in development, NEVER in production
# ---------------------------------------------------------------------------
if Config.DEBUG:
    @core_bp.route('/api/debug/auth', methods=['GET', 'POST'])
    def debug_auth():
        """Debug: test authentication headers — development only"""
        from flask import request
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        try:
            auth_header = request.headers.get('Authorization')
            return jsonify({
                'authenticated': True,
                'user_id': user.id,
                'has_auth_header': bool(auth_header),
                'auth_header_format_correct': bool(auth_header and auth_header.startswith('Bearer ')),
            })
        except Exception as e:
            logger.error("Debug auth error: %s", e)
            return jsonify({'error': 'Debug endpoint failed'}), 500

    @core_bp.route('/api/debug/current-user-watchlist')
    def debug_current_user_watchlist():
        """Debug: test current user's watchlist — development only, requires auth"""
        user = authenticate_request()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        try:
            ws = get_watchlist_service_lazy()
            watchlist = ws.get_watchlist(user.id, limit=10)
            return jsonify({
                'user_id': user.id,
                'watchlist_count': len(watchlist),
                'sample': watchlist[:3],
            })
        except Exception as e:
            logger.error("Debug watchlist error for user %s: %s", user.id, e)
            return jsonify({'error': 'Failed to retrieve watchlist'}), 500

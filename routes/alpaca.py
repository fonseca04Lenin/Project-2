import logging
from datetime import datetime

from flask import Blueprint, request, jsonify

from stock import AlpacaAPI
from firebase_service import get_firestore_client
from crypto_utils import encrypt_data, decrypt_data
from services import (
    authenticate_request, ensure_watchlist_service, get_stock_with_fallback,
)

logger = logging.getLogger(__name__)

alpaca_bp = Blueprint('alpaca', __name__, url_prefix='/api/alpaca')


@alpaca_bp.route('/connect', methods=['POST'])
def connect_alpaca_account():
    """Connect user's Alpaca account by storing their API keys securely"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        data = request.get_json()
        api_key = data.get('api_key', '').strip()
        secret_key = data.get('secret_key', '').strip()
        use_paper = data.get('use_paper', True)

        if not api_key or not secret_key:
            return jsonify({'error': 'API key and secret key are required'}), 400

        # Test the credentials
        try:
            trading_url = 'https://paper-api.alpaca.markets' if use_paper else 'https://api.alpaca.markets'
            headers = {
                'APCA-API-KEY-ID': api_key,
                'APCA-API-SECRET-KEY': secret_key
            }
            import requests
            response = requests.get(f'{trading_url}/v2/account', headers=headers, timeout=5)

            if response.status_code != 200:
                return jsonify({'error': 'Invalid Alpaca API credentials. Please check your keys.'}), 401

            account_data = response.json()
        except Exception as e:
            logger.error("Error verifying Alpaca credentials: %s", e)
            return jsonify({'error': 'Failed to verify Alpaca credentials. Please check your keys.'}), 401

        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500

        encrypted_api_key = encrypt_data(api_key)
        encrypted_secret_key = encrypt_data(secret_key)

        user_ref = db.collection('users').document(user.id)
        user_ref.set({
            'alpaca_connected': True,
            'alpaca_api_key_encrypted': encrypted_api_key,
            'alpaca_secret_key_encrypted': encrypted_secret_key,
            'alpaca_use_paper': use_paper,
            'alpaca_connected_at': datetime.utcnow(),
            'alpaca_account_number': account_data.get('account_number', ''),
            'alpaca_account_status': account_data.get('status', '')
        }, merge=True)

        logger.info("Alpaca account connected for user %s", user.id)
        return jsonify({
            'success': True,
            'message': 'Alpaca account connected successfully',
            'account_number': account_data.get('account_number', ''),
            'account_status': account_data.get('status', ''),
            'use_paper': use_paper
        })

    except Exception as e:
        logger.error("Error connecting Alpaca account: %s", e)
        import traceback
        logger.error("Traceback: %s", traceback.format_exc())
        return jsonify({'error': f'Failed to connect Alpaca account: {str(e)}'}), 500


@alpaca_bp.route('/disconnect', methods=['POST'])
def disconnect_alpaca_account():
    """Disconnect user's Alpaca account"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500

        user_ref = db.collection('users').document(user.id)
        user_ref.update({
            'alpaca_connected': False,
            'alpaca_api_key_encrypted': None,
            'alpaca_secret_key_encrypted': None,
            'alpaca_disconnected_at': datetime.utcnow()
        })

        logger.info("Alpaca account disconnected for user %s", user.id)
        return jsonify({'success': True, 'message': 'Alpaca account disconnected successfully'})

    except Exception as e:
        logger.error("Error disconnecting Alpaca account: %s", e)
        return jsonify({'error': f'Failed to disconnect Alpaca account: {str(e)}'}), 500


@alpaca_bp.route('/status', methods=['GET'])
def get_alpaca_status():
    """Get user's Alpaca connection status"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500

        user_doc = db.collection('users').document(user.id).get()
        if not user_doc.exists:
            return jsonify({'connected': False})

        user_data = user_doc.to_dict()
        is_connected = user_data.get('alpaca_connected', False)

        if is_connected:
            return jsonify({
                'connected': True,
                'account_number': user_data.get('alpaca_account_number', ''),
                'account_status': user_data.get('alpaca_account_status', ''),
                'use_paper': user_data.get('alpaca_use_paper', True),
                'connected_at': user_data.get('alpaca_connected_at').isoformat() if user_data.get('alpaca_connected_at') else None
            })
        else:
            return jsonify({'connected': False})

    except Exception as e:
        logger.error("Error getting Alpaca status: %s", e)
        return jsonify({'error': f'Failed to get Alpaca status: {str(e)}'}), 500


@alpaca_bp.route('/positions', methods=['GET'])
def get_alpaca_positions():
    """Get user's positions from their Alpaca account"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500

        user_doc = db.collection('users').document(user.id).get()
        if not user_doc.exists:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_doc.to_dict()
        if not user_data.get('alpaca_connected', False):
            return jsonify({'error': 'Alpaca account not connected'}), 400

        encrypted_api_key = user_data.get('alpaca_api_key_encrypted')
        encrypted_secret_key = user_data.get('alpaca_secret_key_encrypted')
        use_paper = user_data.get('alpaca_use_paper', True)

        if not encrypted_api_key or not encrypted_secret_key:
            return jsonify({'error': 'Alpaca credentials not found'}), 400

        api_key = decrypt_data(encrypted_api_key)
        secret_key = decrypt_data(encrypted_secret_key)

        trading_url = 'https://paper-api.alpaca.markets' if use_paper else 'https://api.alpaca.markets'
        headers = {
            'APCA-API-KEY-ID': api_key,
            'APCA-API-SECRET-KEY': secret_key
        }

        import requests
        response = requests.get(f'{trading_url}/v2/positions', headers=headers, timeout=10)

        if response.status_code != 200:
            return jsonify({'error': f'Failed to fetch positions from Alpaca: {response.status_code}'}), 500

        positions = response.json()

        formatted_positions = []
        for pos in positions:
            formatted_positions.append({
                'symbol': pos.get('symbol', ''),
                'qty': float(pos.get('qty', 0)),
                'avg_entry_price': float(pos.get('avg_entry_price', 0)),
                'current_price': float(pos.get('current_price', 0)),
                'market_value': float(pos.get('market_value', 0)),
                'cost_basis': float(pos.get('cost_basis', 0)),
                'unrealized_pl': float(pos.get('unrealized_pl', 0)),
                'unrealized_plpc': float(pos.get('unrealized_plpc', 0)),
                'side': pos.get('side', 'long')
            })

        return jsonify({
            'success': True,
            'positions': formatted_positions,
            'count': len(formatted_positions)
        })

    except Exception as e:
        logger.error("Error fetching Alpaca positions: %s", e)
        import traceback
        logger.error("Traceback: %s", traceback.format_exc())
        return jsonify({'error': f'Failed to fetch positions: {str(e)}'}), 500


@alpaca_bp.route('/sync-positions', methods=['POST'])
def sync_alpaca_positions():
    """Sync Alpaca positions to user's watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        db = get_firestore_client()
        if not db:
            return jsonify({'error': 'Database not available'}), 500

        user_doc = db.collection('users').document(user.id).get()
        if not user_doc.exists:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_doc.to_dict()
        if not user_data.get('alpaca_connected', False):
            return jsonify({'error': 'Alpaca account not connected'}), 400

        encrypted_api_key = user_data.get('alpaca_api_key_encrypted')
        encrypted_secret_key = user_data.get('alpaca_secret_key_encrypted')
        use_paper = user_data.get('alpaca_use_paper', True)

        if not encrypted_api_key or not encrypted_secret_key:
            return jsonify({'error': 'Alpaca credentials not found'}), 400

        api_key = decrypt_data(encrypted_api_key)
        secret_key = decrypt_data(encrypted_secret_key)

        trading_url = 'https://paper-api.alpaca.markets' if use_paper else 'https://api.alpaca.markets'
        headers = {
            'APCA-API-KEY-ID': api_key,
            'APCA-API-SECRET-KEY': secret_key
        }

        import requests
        response = requests.get(f'{trading_url}/v2/positions', headers=headers, timeout=10)

        if response.status_code != 200:
            return jsonify({'error': f'Failed to fetch positions from Alpaca: {response.status_code}'}), 500

        positions = response.json()

        if not positions:
            return jsonify({'success': True, 'message': 'No positions to sync', 'added': 0})

        try:
            service = ensure_watchlist_service()
        except RuntimeError as e:
            return jsonify({'error': str(e)}), 503
        added_count = 0

        for position in positions:
            symbol = position.get('symbol', '').upper()
            if not symbol:
                continue

            try:
                existing = service.get_stock(user.id, symbol)
                if existing:
                    continue

                stock, _ = get_stock_with_fallback(symbol)
                company_name = stock.name if stock else symbol

                service.add_stock(
                    user_id=user.id,
                    symbol=symbol,
                    company_name=company_name,
                    category='Alpaca Positions'
                )
                added_count += 1

            except Exception as e:
                logger.error("Error adding %s to watchlist: %s", symbol, e)
                continue

        return jsonify({
            'success': True,
            'message': f'Synced {added_count} positions to watchlist',
            'added': added_count,
            'total': len(positions)
        })

    except Exception as e:
        logger.error("Error syncing Alpaca positions: %s", e)
        import traceback
        logger.error("Traceback: %s", traceback.format_exc())
        return jsonify({'error': f'Failed to sync positions: {str(e)}'}), 500

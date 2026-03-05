"""
Paper Trading API Routes

GET    /api/paper-trading/portfolio      - portfolio summary + live positions
POST   /api/paper-trading/orders         - place order (market or limit)
GET    /api/paper-trading/orders         - order history
DELETE /api/paper-trading/orders/<id>    - cancel pending order
GET    /api/paper-trading/trades         - trade ledger
GET    /api/paper-trading/history        - portfolio value history (for chart)
GET    /api/paper-trading/analytics      - win rate, realized P&L, etc.
POST   /api/paper-trading/reset          - wipe and restart with $100k
"""

import logging
from flask import Blueprint, request, jsonify

from app.services.services import authenticate_request, get_stock_with_fallback
from app.services.firebase_service import get_firestore_client
from app.services.paper_trading_service import get_paper_trading_service

logger = logging.getLogger(__name__)

paper_trading_bp = Blueprint('paper_trading', __name__, url_prefix='/api/paper-trading')


def _get_service():
    db = get_firestore_client()
    return get_paper_trading_service(db)


def _require_auth():
    user = authenticate_request()
    if not user:
        return None, (jsonify({'error': 'Authentication required'}), 401)
    return user, None


# ------------------------------------------------------------------ #
# Portfolio summary                                                    #
# ------------------------------------------------------------------ #

@paper_trading_bp.route('/portfolio', methods=['GET'])
def get_portfolio():
    user, err = _require_auth()
    if err:
        return err

    try:
        svc = _get_service()

        # Get positions first to know which prices to fetch
        positions = svc.get_positions(user.id)
        symbols = [p['symbol'] for p in positions]

        # Fetch current prices in parallel (one per position)
        price_map = {}
        for symbol in symbols:
            try:
                stock, _ = get_stock_with_fallback(symbol)
                if stock and stock.price and stock.price > 0:
                    price_map[symbol] = stock.price
            except Exception as e:
                logger.warning("Could not fetch price for %s: %s", symbol, e)

        # Process any pending limit orders at current prices
        if price_map:
            svc.process_pending_orders(user.id, price_map)

        summary = svc.get_portfolio_summary(user.id, price_map)

        # Serialise datetime fields
        def clean(obj):
            from datetime import datetime
            if isinstance(obj, datetime):
                return obj.isoformat()
            if isinstance(obj, dict):
                return {k: clean(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [clean(i) for i in obj]
            return obj

        return jsonify(clean(summary))

    except Exception as e:
        logger.error("Error getting portfolio for %s: %s", user.id, e)
        return jsonify({'error': 'Failed to load portfolio'}), 500


# ------------------------------------------------------------------ #
# Orders                                                               #
# ------------------------------------------------------------------ #

@paper_trading_bp.route('/orders', methods=['POST'])
def place_order():
    user, err = _require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    symbol = (data.get('symbol') or '').strip().upper()
    side = (data.get('side') or '').strip().lower()
    quantity = data.get('quantity')
    order_type = (data.get('order_type') or 'market').strip().lower()
    limit_price = data.get('limit_price')

    if not symbol:
        return jsonify({'error': 'Symbol is required'}), 400
    if side not in ('buy', 'sell'):
        return jsonify({'error': 'Side must be buy or sell'}), 400
    if order_type not in ('market', 'limit'):
        return jsonify({'error': 'order_type must be market or limit'}), 400

    try:
        quantity = float(quantity)
        if quantity <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({'error': 'Quantity must be a positive number'}), 400

    if order_type == 'limit':
        try:
            limit_price = float(limit_price)
            if limit_price <= 0:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify({'error': 'limit_price must be a positive number for limit orders'}), 400

    try:
        # Fetch current price
        stock, _ = get_stock_with_fallback(symbol)
        if not stock or not stock.price or stock.price <= 0:
            return jsonify({'error': f'Could not fetch current price for {symbol}'}), 404

        current_price = stock.price
        company_name = stock.name or symbol

        svc = _get_service()
        result = svc.place_order(
            user_id=user.id,
            symbol=symbol,
            company_name=company_name,
            side=side,
            quantity=quantity,
            order_type=order_type,
            current_price=current_price,
            limit_price=limit_price,
        )

        if result['success']:
            return jsonify(result), 201
        return jsonify({'error': result['message']}), 400

    except Exception as e:
        logger.error("Error placing order for %s: %s", user.id, e)
        return jsonify({'error': 'Failed to place order'}), 500


@paper_trading_bp.route('/orders', methods=['GET'])
def get_orders():
    user, err = _require_auth()
    if err:
        return err

    status = request.args.get('status')
    limit = min(int(request.args.get('limit', 50)), 200)

    try:
        svc = _get_service()
        orders = svc.get_orders(user.id, limit=limit, status=status)
        return jsonify(orders)
    except Exception as e:
        logger.error("Error getting orders for %s: %s", user.id, e)
        return jsonify({'error': 'Failed to load orders'}), 500


@paper_trading_bp.route('/orders/<order_id>', methods=['DELETE'])
def cancel_order(order_id):
    user, err = _require_auth()
    if err:
        return err

    try:
        svc = _get_service()
        result = svc.cancel_order(user.id, order_id)
        if result['success']:
            return jsonify(result)
        return jsonify({'error': result['message']}), 400
    except Exception as e:
        logger.error("Error cancelling order %s: %s", order_id, e)
        return jsonify({'error': 'Failed to cancel order'}), 500


# ------------------------------------------------------------------ #
# Trades                                                               #
# ------------------------------------------------------------------ #

@paper_trading_bp.route('/trades', methods=['GET'])
def get_trades():
    user, err = _require_auth()
    if err:
        return err

    limit = min(int(request.args.get('limit', 50)), 200)

    try:
        svc = _get_service()
        trades = svc.get_trades(user.id, limit=limit)
        return jsonify(trades)
    except Exception as e:
        logger.error("Error getting trades for %s: %s", user.id, e)
        return jsonify({'error': 'Failed to load trades'}), 500


# ------------------------------------------------------------------ #
# Analytics & History                                                  #
# ------------------------------------------------------------------ #

@paper_trading_bp.route('/analytics', methods=['GET'])
def get_analytics():
    user, err = _require_auth()
    if err:
        return err

    try:
        svc = _get_service()
        analytics = svc.get_analytics(user.id)
        return jsonify(analytics)
    except Exception as e:
        logger.error("Error getting analytics for %s: %s", user.id, e)
        return jsonify({'error': 'Failed to load analytics'}), 500


@paper_trading_bp.route('/history', methods=['GET'])
def get_history():
    user, err = _require_auth()
    if err:
        return err

    limit = min(int(request.args.get('limit', 100)), 500)

    try:
        svc = _get_service()
        history = svc.get_portfolio_history(user.id, limit=limit)
        return jsonify(history)
    except Exception as e:
        logger.error("Error getting portfolio history for %s: %s", user.id, e)
        return jsonify({'error': 'Failed to load history'}), 500


# ------------------------------------------------------------------ #
# Reset                                                                #
# ------------------------------------------------------------------ #

@paper_trading_bp.route('/reset', methods=['POST'])
def reset_portfolio():
    user, err = _require_auth()
    if err:
        return err

    try:
        svc = _get_service()
        result = svc.reset_portfolio(user.id)
        if result['success']:
            return jsonify(result)
        return jsonify({'error': result['message']}), 500
    except Exception as e:
        logger.error("Error resetting portfolio for %s: %s", user.id, e)
        return jsonify({'error': 'Failed to reset portfolio'}), 500

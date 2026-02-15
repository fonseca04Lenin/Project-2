import logging

from flask import Blueprint, request, jsonify

from services import authenticate_request
from firebase_service import FirebaseService

logger = logging.getLogger(__name__)

alerts_bp = Blueprint('alerts', __name__, url_prefix='/api/alerts')


@alerts_bp.route('', methods=['GET'])
def get_alerts():
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = request.args.get('symbol')
    alerts = FirebaseService.get_alerts(user.id, symbol)
    return jsonify(alerts)


@alerts_bp.route('', methods=['POST'])
def create_alert():
    from utils import sanitize_stock_symbol, validate_stock_symbol

    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.get_json()
    symbol = sanitize_stock_symbol(data.get('symbol', ''))
    target_price = data.get('target_price')
    alert_type = data.get('alert_type', 'above')

    if not symbol or target_price is None:
        return jsonify({'error': 'Symbol and target price are required'}), 400

    if not validate_stock_symbol(symbol):
        return jsonify({'error': 'Invalid stock symbol format'}), 400

    try:
        target_price = float(target_price)
    except ValueError:
        return jsonify({'error': 'Invalid target price'}), 400

    if alert_type not in ['above', 'below']:
        return jsonify({'error': 'Alert type must be either "above" or "below"'}), 400

    alert_id = FirebaseService.create_alert(user.id, symbol, target_price, alert_type)
    if alert_id:
        return jsonify({'message': 'Alert created successfully', 'alert_id': alert_id})
    else:
        return jsonify({'error': 'Failed to create alert'}), 500


@alerts_bp.route('/<alert_id>', methods=['DELETE'])
def delete_alert(alert_id):
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    success = FirebaseService.delete_alert(user.id, alert_id)

    if success:
        return jsonify({'message': 'Alert removed successfully'})
    return jsonify({'error': 'Alert not found'}), 404

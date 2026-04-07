import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from app.services.services import authenticate_request
from app.services.firebase_service import get_firestore_client

logger = logging.getLogger(__name__)

stock_notes_bp = Blueprint('stock_notes', __name__, url_prefix='/api/stock-notes')


@stock_notes_bp.route('/<symbol>', methods=['GET'])
def get_note(symbol):
    """Get the user's note for a specific stock"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = symbol.upper()
    db = get_firestore_client()
    if not db:
        return jsonify({'error': 'Database unavailable'}), 503

    doc = db.collection('stock_notes').document(user.id).collection('notes').document(symbol).get()
    if doc.exists:
        data = doc.to_dict()
        return jsonify({'symbol': symbol, 'note': data.get('note', ''), 'updated_at': data.get('updated_at', '')})

    return jsonify({'symbol': symbol, 'note': '', 'updated_at': ''})


@stock_notes_bp.route('/<symbol>', methods=['PUT'])
def upsert_note(symbol):
    """Create or update the user's note for a specific stock"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = symbol.upper()
    data = request.get_json()
    if data is None or 'note' not in data:
        return jsonify({'error': 'note field is required'}), 400

    note = data.get('note', '').strip()

    db = get_firestore_client()
    if not db:
        return jsonify({'error': 'Database unavailable'}), 503

    now = datetime.now(timezone.utc).isoformat()
    db.collection('stock_notes').document(user.id).collection('notes').document(symbol).set({
        'note': note,
        'symbol': symbol,
        'updated_at': now,
    })

    return jsonify({'symbol': symbol, 'note': note, 'updated_at': now})


@stock_notes_bp.route('/<symbol>', methods=['DELETE'])
def delete_note(symbol):
    """Delete the user's note for a specific stock"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = symbol.upper()
    db = get_firestore_client()
    if not db:
        return jsonify({'error': 'Database unavailable'}), 503

    db.collection('stock_notes').document(user.id).collection('notes').document(symbol).delete()
    return jsonify({'message': 'Note deleted'})

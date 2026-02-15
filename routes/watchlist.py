import logging
from datetime import datetime

from flask import Blueprint, request, jsonify, Response

from services import (
    authenticate_request, ensure_watchlist_service, rate_limiter,
    get_stock_alpaca_only, get_watchlist_service_lazy,
    yahoo_finance_api, company_info_service,
)

logger = logging.getLogger(__name__)

watchlist_bp = Blueprint('watchlist', __name__, url_prefix='/api/watchlist')


@watchlist_bp.route('', methods=['GET', 'OPTIONS'])
def get_watchlist_route():
    """Lightweight watchlist endpoint with current prices"""
    if request.method == 'OPTIONS':
        response = jsonify()
        origin = request.headers.get('Origin', '')
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-ID, Cache-Control, X-Request-Source'
            response.headers['Access-Control-Max-Age'] = '86400'
        return response

    origin = request.headers.get('Origin', '')
    logger.info("GET /api/watchlist request from origin: %s", origin)
    logger.debug("Request headers - Authorization: %s, X-User-ID: %s", bool(request.headers.get('Authorization')), request.headers.get('X-User-ID'))

    user = authenticate_request()
    if not user:
        logger.warning("Authentication failed for /api/watchlist")
        return jsonify({'error': 'Authentication required'}), 401

    if not rate_limiter.is_allowed(user.id):
        logger.warning("Rate limit exceeded for user: %s", user.id)
        return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429

    try:
        logger.info("=" * 80)
        logger.info("GET WATCHLIST REQUEST for user: %s", user.id)
        logger.info("=" * 80)

        try:
            service = ensure_watchlist_service()
        except Exception as service_error:
            logger.error("Failed to initialize watchlist service: %s", service_error)
            import traceback
            logger.error("Traceback: %s", traceback.format_exc())
            return jsonify({'error': 'Service unavailable'}), 503

        logger.info("Fetching watchlist from Firestore...")
        watchlist = []

        try:
            watchlist = service.get_watchlist(user.id, limit=100)
            logger.info("Retrieved %s items from Firebase", len(watchlist))
        except Exception as firestore_error:
            logger.error("Firestore query error: %s", firestore_error)
            import traceback
            logger.error("Traceback: %s", traceback.format_exc())
            watchlist = []
            logger.warning("Returning empty watchlist due to Firestore error")

        if watchlist:
            try:
                firebase_symbols = [item.get('symbol') or item.get('id') or 'NO_SYMBOL' for item in watchlist]
                logger.info("STOCKS FROM FIREBASE:")
                for i, symbol in enumerate(firebase_symbols[:10], 1):
                    logger.info("   %s. %s", i, symbol)
                if len(firebase_symbols) > 10:
                    logger.info("   ... and %s more", len(firebase_symbols) - 10)
            except Exception as log_error:
                logger.error("Error logging symbols: %s", log_error)
        else:
            logger.info("NO STOCKS IN FIREBASE WATCHLIST")

        watchlist_with_prices = watchlist

        try:
            cleaned_watchlist = []
            for item in watchlist_with_prices:
                try:
                    cleaned_item = {}
                    for key, value in item.items():
                        try:
                            if isinstance(value, datetime):
                                cleaned_item[key] = value.isoformat()
                            elif hasattr(value, 'timestamp'):
                                cleaned_item[key] = value.timestamp()
                            elif hasattr(value, '__dict__'):
                                continue
                            else:
                                cleaned_item[key] = value
                        except Exception:
                            continue
                    cleaned_watchlist.append(cleaned_item)
                except Exception as item_error:
                    logger.error("Error cleaning item: %s", item_error)
                    continue

            watchlist_with_prices = cleaned_watchlist
        except Exception as clean_error:
            logger.error("Error cleaning watchlist: %s", clean_error)
            pass

        logger.info("RETURNING %s items", len(watchlist_with_prices))
        logger.info("=" * 80)

        try:
            response = jsonify(watchlist_with_prices)
            return response
        except Exception as json_error:
            logger.error("Error serializing watchlist to JSON: %s", json_error)
            import traceback
            logger.error("Traceback: %s", traceback.format_exc())
            return jsonify([]), 500

    except Exception as e:
        logger.error("Error in get_watchlist_route: %s", e)
        import traceback
        logger.error("Traceback: %s", traceback.format_exc())
        try:
            return jsonify({'error': 'Internal server error', 'items': []}), 500
        except:
            return Response('[]', mimetype='application/json', status=500)


@watchlist_bp.route('', methods=['POST'])
def add_to_watchlist():
    """Lightweight watchlist POST endpoint with direct Firestore operations"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    if not rate_limiter.is_allowed(user.id):
        logger.warning("Rate limit exceeded for user: %s", user.id)
        return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429

    data = request.get_json()

    from utils import sanitize_stock_symbol, validate_stock_symbol

    symbol = sanitize_stock_symbol(data.get('symbol', ''))

    if not symbol:
        return jsonify({'error': 'Please provide a stock symbol'}), 400

    if not validate_stock_symbol(symbol):
        return jsonify({'error': 'Invalid stock symbol format'}), 400

    category = data.get('category', 'General')
    notes = data.get('notes', '')
    priority = data.get('priority', 'medium')
    target_price = data.get('target_price')
    stop_loss = data.get('stop_loss')
    alert_enabled = data.get('alert_enabled', True)
    company_name = data.get('company_name', symbol)

    try:
        logger.info("POST watchlist request - User: %s, Symbol: %s, Company: %s", user.id, symbol, company_name)

        current_price = None
        try:
            logger.debug("[WATCHLIST] Using Alpaca-only for adding stock to watchlist: %s", symbol)
            stock, api_used = get_stock_alpaca_only(symbol)
            if stock and stock.price and stock.price > 0:
                current_price = stock.price
                logger.info("Current price for %s from Alpaca: $%s", symbol, current_price)
            else:
                logger.warning("Could not get current price for %s from Alpaca (no Yahoo fallback)", symbol)
                return jsonify({'error': f'Stock "{symbol}" not available via Alpaca API. Please check the symbol or try again later.'}), 404
        except Exception as price_error:
            logger.error("Error getting current price for %s from Alpaca: %s", symbol, price_error)
            return jsonify({'error': f'Failed to fetch stock data from Alpaca API: {str(price_error)}'}), 500

        service = ensure_watchlist_service()

        result = service.add_stock(
            user.id,
            symbol,
            company_name,
            current_price=current_price,
            category=category,
            notes=notes,
            priority=priority,
            target_price=target_price,
            stop_loss=stop_loss,
            alert_enabled=alert_enabled
        )

        if result['success']:
            logger.info("Successfully added %s to watchlist", symbol)
            return jsonify(result)
        else:
            logger.warning("Failed to add %s: %s", symbol, result['message'])
            return jsonify({'error': result['message']}), 400

    except Exception as e:
        logger.error("Error adding stock to watchlist: %s", e)
        return jsonify({'error': f'Failed to add {symbol} to watchlist'}), 500


@watchlist_bp.route('/<symbol>', methods=['DELETE'])
def remove_from_watchlist(symbol):
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        service = ensure_watchlist_service()
        symbol = symbol.upper()
        result = service.remove_stock(user.id, symbol)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

    if result['success']:
        return jsonify({'message': result['message']})

    return jsonify({'error': result['message']}), 404


@watchlist_bp.route('/<symbol>', methods=['PUT'])
def update_watchlist_stock(symbol):
    """Update a stock in the watchlist with new details"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        service = ensure_watchlist_service()
        symbol = symbol.upper()
        data = request.get_json()

        data.pop('symbol', None)

        result = service.update_stock(user.id, symbol, **data)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

    if result['success']:
        return jsonify({
            'message': result['message'],
            'item': result.get('item')
        })

    return jsonify({'error': result['message']}), 400


@watchlist_bp.route('/<symbol>/notes', methods=['PUT'])
def update_watchlist_notes(symbol):
    """Update notes for a specific stock in the watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = symbol.upper()
    data = request.get_json()

    if not data or 'notes' not in data:
        return jsonify({'error': 'Notes field is required'}), 400

    notes = data.get('notes', '').strip()

    try:
        service = ensure_watchlist_service()
        result = service.update_stock(user.id, symbol, notes=notes)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

    if result['success']:
        return jsonify({
            'message': result['message'],
            'notes': notes
        })

    return jsonify({'error': result['message']}), 400


@watchlist_bp.route('/categories', methods=['GET'])
def get_watchlist_categories():
    """Get all categories used by the user"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        service = ensure_watchlist_service()
        categories = service.get_categories(user.id)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    return jsonify({'categories': categories})


@watchlist_bp.route('/stats', methods=['GET'])
def get_watchlist_stats():
    """Get statistics about user's watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        service = ensure_watchlist_service()
        stats = service.get_watchlist_stats(user.id)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    return jsonify(stats)


@watchlist_bp.route('/clear', methods=['DELETE'])
def clear_watchlist():
    """Clear all stocks from user's watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        service = ensure_watchlist_service()
        result = service.clear_watchlist(user.id)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

    if result['success']:
        return jsonify({'message': result['message']})

    return jsonify({'error': result['message']}), 500


@watchlist_bp.route('/batch', methods=['PUT'])
def batch_update_watchlist():
    """Batch update multiple stocks in watchlist"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.get_json()
    if not data or 'updates' not in data:
        return jsonify({'error': 'Updates data required'}), 400

    updates = data['updates']
    try:
        service = ensure_watchlist_service()
        result = service.batch_update(user.id, updates)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

    if result['success']:
        return jsonify({'message': result['message']})

    return jsonify({'error': result['message']}), 500


@watchlist_bp.route('/migrate', methods=['POST'])
def migrate_watchlist():
    """Migrate user's watchlist from old format to new format"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    from migrate_watchlist import migrate_user_watchlist
    result = migrate_user_watchlist(user.id)

    if result['success']:
        return jsonify({
            'message': 'Migration completed successfully',
            'details': result
        })

    return jsonify({'error': result['message']}), 500


@watchlist_bp.route('/migration-status', methods=['GET'])
def get_migration_status():
    """Check user's migration status"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    from migrate_watchlist import check_migration_status
    status = check_migration_status(user.id)

    if status:
        return jsonify({
            'migrated': True,
            'status': status
        })
    else:
        return jsonify({
            'migrated': False,
            'message': 'No migration record found'
        })


@watchlist_bp.route('/<symbol>/details')
def get_watchlist_stock_details(symbol):
    """Get detailed information for a stock in user's watchlist including watchlist-specific data"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = symbol.upper()

    try:
        logger.info("Getting watchlist details for symbol: %s, user: %s", symbol, user.id)

        try:
            service = ensure_watchlist_service()
            watchlist_item = service.get_stock(user.id, symbol)
        except RuntimeError as e:
            return jsonify({'error': str(e)}), 503
        if not watchlist_item:
            logger.warning("Stock %s not found in watchlist for user %s", symbol, user.id)
            return jsonify({'error': f'Stock "{symbol}" not found in watchlist'}), 404

        logger.info("Found watchlist item for %s", symbol)

        logger.debug("[WATCHLIST] Using Alpaca-only for watchlist details: %s", symbol)
        stock, api_used = get_stock_alpaca_only(symbol)
        if not stock:
            return jsonify({'error': f'Stock "{symbol}" not available via Alpaca API. Please check the symbol or try again later.'}), 404

        info = yahoo_finance_api.get_info(symbol)
        company_info = company_info_service.get_comprehensive_info(symbol, yahoo_info=info)

        if not stock.name or 'not found' in stock.name.lower():
            return jsonify({'error': f'Stock "{symbol}" not found'}), 404

        percentage_change = None
        price_change = None
        original_price = watchlist_item.get('original_price')
        current_price = stock.price

        if not original_price and current_price:
            logger.info("Setting current price as original price for legacy stock %s", symbol)
            try:
                service = ensure_watchlist_service()
                service.update_stock(user.id, symbol, original_price=current_price)
                original_price = current_price
            except RuntimeError:
                logger.warning("Could not update original price - service unavailable")

        if original_price and current_price and original_price > 0:
            price_change = current_price - original_price
            percentage_change = (price_change / original_price) * 100

        added_at = watchlist_item.get('added_at')
        if isinstance(added_at, datetime):
            date_added_str = added_at.strftime('%B %d, %Y')
        else:
            date_added_str = 'Unknown'

        return jsonify({
            'symbol': stock.symbol,
            'name': stock.name,
            'ceo': company_info.get('ceo', '-'),
            'description': company_info.get('description', '-'),
            'price': stock.price,
            'marketCap': company_info.get('marketCap', '-'),
            'peRatio': company_info.get('peRatio', '-'),
            'dividendYield': company_info.get('dividendYield', '-'),
            'website': company_info.get('website', '-'),
            'headquarters': company_info.get('headquarters', '-'),
            'high52Week': info.get('fiftyTwoWeekHigh') if info else None,
            'low52Week': info.get('fiftyTwoWeekLow') if info else None,
            'volume': info.get('volume') or info.get('regularMarketVolume') if info else None,
            'sector': info.get('sector', '-') if info else '-',
            'industry': info.get('industry', '-') if info else '-',
            # Watchlist-specific data
            'date_added': date_added_str,
            'original_price': original_price,
            'price_change': price_change,
            'percentage_change': percentage_change,
            'category': watchlist_item.get('category', 'General'),
            'notes': watchlist_item.get('notes', ''),
            'priority': watchlist_item.get('priority', 'medium'),
            'target_price': watchlist_item.get('target_price'),
            'stop_loss': watchlist_item.get('stop_loss')
        })

    except Exception as e:
        logger.error("Error getting watchlist stock details for %s: %s", symbol, e)
        return jsonify({'error': f'Failed to get stock details for {symbol}'}), 500

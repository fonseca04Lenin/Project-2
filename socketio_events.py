import logging
import time
import threading
import gc
from datetime import datetime

from flask import request
from flask_socketio import emit, join_room

from extensions import socketio
from stock import Stock
from services import (
    connected_users, connection_timestamps, active_stocks, active_stocks_timestamps,
    ACTIVE_STOCK_TIMEOUT,
    cleanup_inactive_connections, limit_connections,
    get_watchlist_service_lazy, get_market_status,
    get_stock_alpaca_only, yahoo_finance_api,
    USE_ALPACA_API, alpaca_api,
)

logger = logging.getLogger(__name__)


def register_socketio_events():
    """Register all SocketIO event handlers"""

    @socketio.on('connect')
    def handle_connect():
        logger.info("Client connected: %s", request.sid)
        try:
            cleanup_inactive_connections()
            limit_connections()
            connection_timestamps[request.sid] = time.time()
            emit('connected', {'message': 'Connected to server'})
        except Exception as e:
            logger.error("Error in connect handler: %s", e)

    @socketio.on('disconnect')
    def handle_disconnect():
        logger.info("Client disconnected: %s", request.sid)
        user_id = connected_users.get(request.sid)

        if request.sid in connected_users:
            del connected_users[request.sid]
        if request.sid in connection_timestamps:
            del connection_timestamps[request.sid]

        if user_id:
            if user_id in active_stocks:
                del active_stocks[user_id]
            if user_id in active_stocks_timestamps:
                del active_stocks_timestamps[user_id]
            logger.info("Cleaned up active stocks for user %s", user_id)

    @socketio.on('join_user_room')
    def handle_join_user_room(data):
        """Join user to their personal room for private updates"""
        try:
            user_id = data.get('user_id')
            if user_id:
                join_room(f"user_{user_id}")
                connected_users[request.sid] = user_id
                logger.info("User %s joined room: user_%s", user_id, user_id)
        except Exception as e:
            logger.error("Error joining user room: %s", e)

    @socketio.on('join_watchlist_updates')
    def handle_join_watchlist_updates(data):
        """Join user to watchlist updates room"""
        try:
            user_id = data.get('user_id')
            if user_id:
                join_room(f"watchlist_{user_id}")
                logger.info("User %s joined watchlist updates", user_id)
        except Exception as e:
            logger.error("Error joining watchlist updates: %s", e)

    @socketio.on('join_market_updates')
    def handle_join_market_updates():
        """Join user to market updates room"""
        try:
            join_room("market_updates")
            logger.info("Client %s joined market updates", request.sid)
        except Exception as e:
            logger.error("Error joining market updates: %s", e)

    @socketio.on('join_news_updates')
    def handle_join_news_updates():
        """Join user to news updates room"""
        try:
            join_room("news_updates")
            logger.info("Client %s joined news updates", request.sid)
        except Exception as e:
            logger.error("Error joining news updates: %s", e)

    @socketio.on('track_stock_view')
    def handle_track_stock_view(data):
        """Track which stock a user is actively viewing for priority updates"""
        from utils import sanitize_stock_symbol, validate_stock_symbol
        try:
            user_id = data.get('user_id')
            symbol = sanitize_stock_symbol(data.get('symbol', ''))

            if user_id and symbol and validate_stock_symbol(symbol):
                active_stocks[user_id].add(symbol)
                active_stocks_timestamps[user_id][symbol] = time.time()
                logger.debug("User %s is viewing %s - adding to priority queue", user_id, symbol)
            elif symbol and not validate_stock_symbol(symbol):
                logger.warning("Invalid symbol rejected in track_stock_view: %s", symbol)
        except Exception as e:
            logger.error("Error tracking stock view: %s", e)

    @socketio.on('untrack_stock_view')
    def handle_untrack_stock_view(data):
        """Stop tracking a stock when user stops viewing it"""
        from utils import sanitize_stock_symbol, validate_stock_symbol
        try:
            user_id = data.get('user_id')
            symbol = sanitize_stock_symbol(data.get('symbol', ''))

            if user_id and symbol and validate_stock_symbol(symbol):
                active_stocks[user_id].discard(symbol)
                active_stocks_timestamps[user_id].pop(symbol, None)
                logger.debug("User %s stopped viewing %s", user_id, symbol)
        except Exception as e:
            logger.error("Error untracking stock view: %s", e)

    @socketio.on('track_search_stock')
    def handle_track_search_stock(data):
        """Track stocks being searched for priority updates"""
        try:
            user_id = data.get('user_id')
            symbols = data.get('symbols', [])

            if user_id and symbols:
                for symbol in symbols:
                    symbol = symbol.upper()
                    active_stocks[user_id].add(symbol)
                    active_stocks_timestamps[user_id][symbol] = time.time()
                logger.debug("User %s searching %s stocks - adding to priority queue", user_id, len(symbols))
        except Exception as e:
            logger.error("Error tracking search stocks: %s", e)


def update_stock_prices():
    """Memory-optimized background task to update stock prices"""
    logger.info("Starting memory-optimized price update task...")

    update_cycle_count = 0

    while True:
        update_cycle_count += 1
        try:
            cleanup_inactive_connections()

            if not connected_users:
                logger.info("No connected users, skipping price updates")
                time.sleep(60)
                continue

            logger.info("=" * 80)
            logger.info("[REALTIME UPDATE CYCLE #%s] - %s", update_cycle_count, datetime.now().strftime('%H:%M:%S'))
            logger.info("Updating prices for %s connected users...", len(connected_users))
            logger.info("=" * 80)

            all_symbols = set()
            user_watchlists = {}
            priority_symbols = set()

            current_time = time.time()
            for user_id in list(active_stocks_timestamps.keys()):
                expired_symbols = [
                    sym for sym, ts in active_stocks_timestamps[user_id].items()
                    if current_time - ts > ACTIVE_STOCK_TIMEOUT
                ]
                for sym in expired_symbols:
                    active_stocks[user_id].discard(sym)
                    active_stocks_timestamps[user_id].pop(sym, None)

            for sid, user_id in list(connected_users.items()):
                if user_id:
                    try:
                        service = get_watchlist_service_lazy()
                        if service is None:
                            continue
                        watchlist = service.get_watchlist(user_id, limit=None)
                        if watchlist:
                            logger.info("[REALTIME] Loaded %s stocks for user %s", len(watchlist), user_id)
                            user_watchlists[user_id] = watchlist
                            for item in watchlist:
                                symbol = item.get('symbol') or item.get('id')
                                if symbol:
                                    all_symbols.add(symbol)
                                    logger.debug("  Added %s to update queue", symbol)
                                else:
                                    logger.debug("  Skipping item without symbol: %s", item.keys())
                        else:
                            logger.debug("[REALTIME] No watchlist found for user %s", user_id)

                        if user_id in active_stocks:
                            for symbol in active_stocks[user_id]:
                                priority_symbols.add(symbol)
                                all_symbols.add(symbol)
                    except Exception as e:
                        logger.error("Error getting watchlist for user %s: %s", user_id, e)
                        import traceback
                        traceback.print_exc()
                        continue

            updated_symbols = {}

            priority_to_fetch = [s for s in all_symbols if s in priority_symbols]
            regular_to_fetch = [s for s in all_symbols if s not in priority_symbols]
            all_symbols_to_fetch = priority_to_fetch + regular_to_fetch

            logger.info("[REALTIME] Total symbols to update: %s", len(all_symbols_to_fetch))
            logger.info("   Priority: %s, Regular: %s", len(priority_to_fetch), len(regular_to_fetch))
            if all_symbols_to_fetch:
                logger.debug("   Symbols: %s%s", ', '.join(list(all_symbols_to_fetch)[:20]), '...' if len(all_symbols_to_fetch) > 20 else '')

            batch_failed_symbols = set()
            if all_symbols_to_fetch and USE_ALPACA_API and alpaca_api:
                try:
                    logger.info("[REALTIME] Batch updating %s symbols (%s priority) via Alpaca batch API...", len(all_symbols_to_fetch), len(priority_to_fetch))
                    batch_size = 50
                    for i in range(0, len(all_symbols_to_fetch), batch_size):
                        batch = all_symbols_to_fetch[i:i+batch_size]
                        batch_results = alpaca_api.get_batch_snapshots(batch)

                        batch_success_symbols = set()

                        for symbol, data in batch_results.items():
                            if data and 'price' in data and data.get('price') and data['price'] > 0:
                                stock_data = {
                                    'symbol': symbol,
                                    'name': data.get('name', symbol),
                                    'price': data['price'],
                                    'last_updated': datetime.now().isoformat(),
                                    'is_priority': symbol in priority_symbols
                                }
                                updated_symbols[symbol] = stock_data
                                batch_success_symbols.add(symbol)

                        for symbol in batch:
                            if symbol not in batch_success_symbols:
                                batch_failed_symbols.add(symbol)

                        if i + batch_size < len(all_symbols_to_fetch):
                            time.sleep(0.1)

                    logger.info("[REALTIME] Batch updated %s symbols (%s priority)", len(updated_symbols), len(priority_to_fetch))
                    if batch_failed_symbols:
                        logger.warning("[REALTIME] %s symbols failed in batch, will retry individually: %s", len(batch_failed_symbols), list(batch_failed_symbols)[:10])

                except Exception as e:
                    logger.error("[REALTIME] Batch update failed, falling back to individual calls: %s", e)
                    import traceback
                    logger.error("[REALTIME] Batch error traceback: %s", traceback.format_exc())
                    batch_failed_symbols = set(all_symbols_to_fetch)

            if batch_failed_symbols:
                symbols_needing_individual_fetch = batch_failed_symbols
            elif not (USE_ALPACA_API and alpaca_api):
                symbols_needing_individual_fetch = all_symbols_to_fetch
            else:
                symbols_needing_individual_fetch = []

            if symbols_needing_individual_fetch:
                priority_failed = [s for s in symbols_needing_individual_fetch if s in priority_symbols]
                regular_failed = [s for s in symbols_needing_individual_fetch if s not in priority_symbols]
                symbols_to_process = priority_failed + regular_failed

                logger.info("[REALTIME] Fetching %s symbols individually (%s priority)...", len(symbols_to_process), len(priority_failed))

                for symbol in symbols_to_process[:50]:
                    try:
                        delay = 0.05 if symbol in priority_symbols else 0.1
                        time.sleep(delay)

                        logger.debug("[REALTIME] Updating price for %s %s...", symbol, '(PRIORITY)' if symbol in priority_symbols else '')
                        stock, api_used = get_stock_alpaca_only(symbol)

                        if not stock or not stock.price or stock.price == 0:
                            logger.warning("[REALTIME] Alpaca failed for %s, trying Yahoo fallback...", symbol)
                            try:
                                stock = Stock(symbol, yahoo_finance_api)
                                stock.retrieve_data()
                                api_used = 'yahoo'
                                if stock and stock.price:
                                    logger.info("[REALTIME] Yahoo fallback successful for %s: $%.2f", symbol, stock.price)
                                else:
                                    logger.warning("[REALTIME] Yahoo fallback also failed for %s", symbol)
                                    continue
                            except Exception as yahoo_error:
                                logger.error("[REALTIME] Yahoo fallback failed for %s: %s", symbol, yahoo_error)
                                continue

                        logger.info("[REALTIME] Updated %s: $%.2f (Source: %s)", symbol, stock.price, api_used.upper() if api_used else 'ALPACA')

                        if stock.name and 'not found' not in stock.name.lower():
                            stock_data = {
                                'symbol': symbol,
                                'name': stock.name,
                                'price': stock.price,
                                'last_updated': datetime.now().isoformat(),
                                'is_priority': symbol in priority_symbols
                            }
                            updated_symbols[symbol] = stock_data

                    except Exception as e:
                        logger.error("Error updating %s: %s", symbol, e)
                        continue

            for user_id, watchlist in user_watchlists.items():
                try:
                    user_updates = []
                    for item in watchlist:
                        symbol = item['symbol']

                        if symbol in updated_symbols:
                            stock_data = updated_symbols[symbol]

                            original_price = item.get('original_price', 0)
                            current_price = stock_data.get('price', 0)
                            price_change = 0
                            price_change_percent = 0

                            if original_price and original_price > 0 and current_price > 0:
                                price_change = current_price - original_price
                                price_change_percent = (price_change / original_price) * 100

                            user_updates.append({
                                **stock_data,
                                'price_change': price_change,
                                'price_change_percent': price_change_percent,
                                'change_percent': price_change_percent,
                                'priceChangePercent': price_change_percent,
                                'category': item.get('category', 'General'),
                                'priority': item.get('priority', 'medium'),
                                '_fresh': True
                            })
                        else:
                            logger.debug("[REALTIME] Symbol %s not in updated_symbols for user %s, may need fallback fetch", symbol, user_id)

                    if user_updates:
                        room_name = f"watchlist_{user_id}"
                        socketio.emit('watchlist_updated', {
                            'prices': user_updates,
                            'timestamp': datetime.now().isoformat(),
                            'cycle': update_cycle_count
                        }, room=room_name)
                        logger.info("[REALTIME] Sent %s stock updates to user %s (Cycle #%s)", len(user_updates), user_id, update_cycle_count)
                    else:
                        logger.debug("[REALTIME] No updates to send for user %s (watchlist has %s stocks, updated_symbols has %s symbols)", user_id, len(watchlist), len(updated_symbols))

                except Exception as e:
                    logger.error("Error sending updates to user %s: %s", user_id, e)
                    continue

            try:
                market_status = get_market_status()
                socketio.emit('market_status_updated', market_status, room="market_updates")
            except Exception as market_error:
                logger.error("Error updating market status: %s", market_error)

            cycle_end_time = time.time()
            cycle_duration = cycle_end_time - current_time
            logger.info("Update cycle completed in %.2f seconds", cycle_duration)

            if USE_ALPACA_API and alpaca_api and hasattr(alpaca_api, 'get_queue_stats'):
                try:
                    stats = alpaca_api.get_queue_stats()
                    logger.info("API Stats: %s/%s req/min | Total: %s | Rate limited: %s",
                               stats['requests_last_minute'], stats.get('can_request', 'N/A'),
                               stats['total_requests'], stats['rate_limited'])
                except:
                    pass

            logger.info("Sleeping for 30 seconds before next update...")
            logger.info("Next update at: %s", datetime.fromtimestamp(time.time() + 30).strftime('%H:%M:%S'))
            time.sleep(30)

        except Exception as e:
            logger.error("Error in price update loop: %s", e)
            gc.collect()
            logger.info("Sleeping for 3 minutes after error...")
            time.sleep(180)


def start_price_updates():
    """Start the background price update task with proper memory management"""
    logger.info("Starting memory-optimized price update background task...")

    def cleanup_memory():
        """Enhanced periodic memory cleanup"""
        while True:
            time.sleep(300)
            try:
                cleanup_inactive_connections()
                collected = gc.collect()
                logger.info("Memory cleanup completed, collected %s objects", collected)
                try:
                    import psutil
                    process = psutil.Process()
                    memory_mb = process.memory_info().rss / 1024 / 1024
                    logger.info("Current memory usage: %.1f MB", memory_mb)
                except ImportError:
                    pass
            except Exception as e:
                logger.error("Memory cleanup error: %s", e)

    cleanup_thread = threading.Thread(target=cleanup_memory, daemon=True, name="MemoryCleanupThread")
    cleanup_thread.start()
    logger.info("Memory cleanup thread started")

    price_thread = threading.Thread(target=update_stock_prices, daemon=True, name="PriceUpdateThread")
    price_thread.start()
    logger.info("Memory-optimized price update background thread started")

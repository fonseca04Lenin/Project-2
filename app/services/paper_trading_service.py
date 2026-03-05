"""
Paper Trading Service
Simulates real trading using live market prices with virtual money.
Data stored in Firestore under users/{user_id}/ following the same pattern as watchlist_service.py.
"""

import logging
import uuid
from datetime import datetime, date
from typing import Dict, List, Optional, Any

from firebase_admin import firestore

logger = logging.getLogger(__name__)

STARTING_BALANCE = 100_000.00
COMMISSION = 0.00  # Zero commission (like modern brokers)
MAX_POSITION_PCT = 0.50  # Max 50% of portfolio in a single position


class PaperTradingService:
    """
    Manages paper trading portfolios per user in Firestore.

    Firestore layout under users/{user_id}/:
        paper_portfolio          <- single document (cash, initial_balance, etc.)
        paper_positions/{symbol} <- one doc per open position
        paper_orders/{order_id}  <- every order (filled + pending + cancelled)
        paper_trades/{trade_id}  <- immutable ledger of filled executions
        paper_history/{YYYY-MM-DD} <- daily/per-trade portfolio value snapshots
    """

    def __init__(self, db_client=None):
        self.db = db_client or firestore.client()

    # ------------------------------------------------------------------ #
    # Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    def _portfolio_ref(self, user_id: str):
        return self.db.collection('users').document(user_id).collection('paper_portfolio').document('main')

    def _positions_ref(self, user_id: str):
        return self.db.collection('users').document(user_id).collection('paper_positions')

    def _orders_ref(self, user_id: str):
        return self.db.collection('users').document(user_id).collection('paper_orders')

    def _trades_ref(self, user_id: str):
        return self.db.collection('users').document(user_id).collection('paper_trades')

    def _history_ref(self, user_id: str):
        return self.db.collection('users').document(user_id).collection('paper_history')

    def _serialize(self, data: Dict) -> Dict:
        """Convert datetime objects to ISO strings for JSON serialisation."""
        result = {}
        for k, v in data.items():
            if isinstance(v, datetime):
                result[k] = v.isoformat()
            else:
                result[k] = v
        return result

    # ------------------------------------------------------------------ #
    # Portfolio                                                            #
    # ------------------------------------------------------------------ #

    def get_or_create_portfolio(self, user_id: str) -> Dict[str, Any]:
        """Return portfolio doc, creating it with $100k if it doesn't exist yet."""
        try:
            ref = self._portfolio_ref(user_id)
            doc = ref.get()
            if doc.exists:
                return doc.to_dict()

            # First time — initialise portfolio
            portfolio = {
                'cash_balance': STARTING_BALANCE,
                'initial_balance': STARTING_BALANCE,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
            }
            ref.set(portfolio)
            logger.info("Created new paper portfolio for user %s", user_id)
            return portfolio
        except Exception as e:
            logger.error("Error get_or_create_portfolio for %s: %s", user_id, e)
            raise

    def get_positions(self, user_id: str) -> List[Dict[str, Any]]:
        """Return all open positions as a list of dicts."""
        try:
            docs = self._positions_ref(user_id).stream()
            positions = []
            for doc in docs:
                data = doc.to_dict()
                data['symbol'] = doc.id
                positions.append(data)
            return positions
        except Exception as e:
            logger.error("Error getting positions for %s: %s", user_id, e)
            return []

    def get_portfolio_summary(self, user_id: str, price_map: Dict[str, float] = None) -> Dict[str, Any]:
        """
        Return full portfolio summary including live P&L.
        price_map: {symbol: current_price} — caller must supply current prices.
        """
        try:
            portfolio = self.get_or_create_portfolio(user_id)
            positions = self.get_positions(user_id)
            price_map = price_map or {}

            cash = portfolio.get('cash_balance', STARTING_BALANCE)
            initial = portfolio.get('initial_balance', STARTING_BALANCE)

            enriched_positions = []
            positions_value = 0.0
            unrealized_pnl = 0.0

            for pos in positions:
                symbol = pos['symbol']
                shares = pos.get('shares', 0)
                avg_cost = pos.get('avg_cost', 0)
                current_price = price_map.get(symbol, pos.get('last_price', avg_cost))

                market_value = shares * current_price
                cost_basis = shares * avg_cost
                pnl = market_value - cost_basis
                pnl_pct = (pnl / cost_basis * 100) if cost_basis > 0 else 0.0

                positions_value += market_value
                unrealized_pnl += pnl

                enriched_positions.append({
                    'symbol': symbol,
                    'company_name': pos.get('company_name', symbol),
                    'shares': shares,
                    'avg_cost': avg_cost,
                    'current_price': current_price,
                    'market_value': market_value,
                    'cost_basis': cost_basis,
                    'unrealized_pnl': pnl,
                    'unrealized_pnl_pct': pnl_pct,
                    'opened_at': pos.get('opened_at', ''),
                })

            total_value = cash + positions_value
            total_return = total_value - initial
            total_return_pct = (total_return / initial * 100) if initial > 0 else 0.0

            return {
                'cash_balance': cash,
                'initial_balance': initial,
                'positions_value': positions_value,
                'total_value': total_value,
                'total_return': total_return,
                'total_return_pct': total_return_pct,
                'unrealized_pnl': unrealized_pnl,
                'positions': enriched_positions,
                'created_at': portfolio.get('created_at', ''),
            }
        except Exception as e:
            logger.error("Error getting portfolio summary for %s: %s", user_id, e)
            raise

    # ------------------------------------------------------------------ #
    # Orders                                                               #
    # ------------------------------------------------------------------ #

    def place_order(
        self,
        user_id: str,
        symbol: str,
        company_name: str,
        side: str,            # 'buy' | 'sell'
        quantity: float,
        order_type: str,      # 'market' | 'limit'
        current_price: float,
        limit_price: float = None,
    ) -> Dict[str, Any]:
        """
        Place a paper trading order.

        Market orders fill immediately at current_price.
        Limit orders:
          - BUY  limit: store as pending if current_price > limit_price, else fill immediately
          - SELL limit: store as pending if current_price < limit_price, else fill immediately
        """
        try:
            symbol = symbol.upper()
            side = side.lower()

            if side not in ('buy', 'sell'):
                return {'success': False, 'message': 'Side must be buy or sell'}
            if quantity <= 0:
                return {'success': False, 'message': 'Quantity must be greater than zero'}
            if current_price <= 0:
                return {'success': False, 'message': 'Invalid current price'}

            portfolio = self.get_or_create_portfolio(user_id)
            cash = portfolio.get('cash_balance', 0)

            # Determine fill price and whether order is immediately fillable
            fill_price = current_price
            is_fillable = True

            if order_type == 'limit':
                if limit_price is None or limit_price <= 0:
                    return {'success': False, 'message': 'Limit price required for limit orders'}
                fill_price = limit_price
                if side == 'buy' and current_price > limit_price:
                    is_fillable = False
                elif side == 'sell' and current_price < limit_price:
                    is_fillable = False

            order_id = str(uuid.uuid4())
            now = datetime.utcnow()

            # Validate the order
            if is_fillable:
                validation = self._validate_order(user_id, symbol, side, quantity, fill_price, cash)
                if not validation['valid']:
                    return {'success': False, 'message': validation['message']}

            order = {
                'symbol': symbol,
                'company_name': company_name,
                'side': side,
                'order_type': order_type,
                'quantity': quantity,
                'limit_price': limit_price,
                'fill_price': fill_price if is_fillable else None,
                'total_value': quantity * fill_price if is_fillable else None,
                'status': 'filled' if is_fillable else 'pending',
                'created_at': now,
                'filled_at': now if is_fillable else None,
            }

            self._orders_ref(user_id).document(order_id).set(order)

            if is_fillable:
                self._execute_fill(user_id, order_id, symbol, company_name, side, quantity, fill_price, now)

            return {
                'success': True,
                'order_id': order_id,
                'status': order['status'],
                'message': (
                    f'{"Bought" if side == "buy" else "Sold"} {quantity} share(s) of {symbol} at ${fill_price:.2f}'
                    if is_fillable
                    else f'Limit order placed — will fill when {symbol} reaches ${limit_price:.2f}'
                ),
                'fill_price': fill_price if is_fillable else None,
                'total_value': quantity * fill_price if is_fillable else None,
            }

        except Exception as e:
            logger.error("Error placing order for %s: %s", user_id, e)
            return {'success': False, 'message': f'Order failed: {str(e)}'}

    def _validate_order(self, user_id: str, symbol: str, side: str, quantity: float, price: float, cash: float) -> Dict:
        total_cost = quantity * price

        if side == 'buy':
            if cash < total_cost:
                return {
                    'valid': False,
                    'message': f'Insufficient cash. Need ${total_cost:,.2f}, have ${cash:,.2f}',
                }
            return {'valid': True}

        # sell — check position exists with enough shares
        pos_doc = self._positions_ref(user_id).document(symbol).get()
        if not pos_doc.exists:
            return {'valid': False, 'message': f'No position in {symbol} to sell'}
        held = pos_doc.to_dict().get('shares', 0)
        if quantity > held:
            return {
                'valid': False,
                'message': f'Cannot sell {quantity} shares — only holding {held}',
            }
        return {'valid': True}

    def _execute_fill(
        self, user_id: str, order_id: str, symbol: str, company_name: str,
        side: str, quantity: float, fill_price: float, now: datetime
    ):
        """Update positions, cash, and write trade record."""
        portfolio_ref = self._portfolio_ref(user_id)
        pos_ref = self._positions_ref(user_id).document(symbol)

        portfolio = portfolio_ref.get().to_dict()
        cash = portfolio.get('cash_balance', 0)
        total_value = quantity * fill_price
        realized_pnl = 0.0

        pos_doc = pos_ref.get()

        if side == 'buy':
            cash -= total_value
            if pos_doc.exists:
                pos = pos_doc.to_dict()
                old_shares = pos.get('shares', 0)
                old_avg = pos.get('avg_cost', fill_price)
                new_shares = old_shares + quantity
                new_avg = ((old_shares * old_avg) + (quantity * fill_price)) / new_shares
                pos_ref.update({
                    'shares': new_shares,
                    'avg_cost': new_avg,
                    'last_price': fill_price,
                    'last_updated': now,
                })
            else:
                pos_ref.set({
                    'symbol': symbol,
                    'company_name': company_name,
                    'shares': quantity,
                    'avg_cost': fill_price,
                    'last_price': fill_price,
                    'opened_at': now,
                    'last_updated': now,
                })

        else:  # sell
            cash += total_value
            pos = pos_doc.to_dict()
            old_shares = pos.get('shares', 0)
            avg_cost = pos.get('avg_cost', fill_price)
            realized_pnl = (fill_price - avg_cost) * quantity
            new_shares = old_shares - quantity

            if new_shares <= 0:
                pos_ref.delete()
            else:
                pos_ref.update({
                    'shares': new_shares,
                    'last_price': fill_price,
                    'last_updated': now,
                })

        # Update cash
        portfolio_ref.update({
            'cash_balance': cash,
            'updated_at': now,
        })

        # Write trade record (immutable ledger)
        trade_id = str(uuid.uuid4())
        self._trades_ref(user_id).document(trade_id).set({
            'symbol': symbol,
            'company_name': company_name,
            'side': side,
            'quantity': quantity,
            'price': fill_price,
            'total_value': total_value,
            'realized_pnl': realized_pnl,
            'order_id': order_id,
            'timestamp': now,
        })

        # Save snapshot for history chart
        self._save_snapshot(user_id, cash, now)

    def _save_snapshot(self, user_id: str, cash: float, now: datetime):
        """Save a portfolio value snapshot for the history chart."""
        try:
            positions = self.get_positions(user_id)
            # Use last_price as best estimate for snapshot
            positions_value = sum(p.get('shares', 0) * p.get('last_price', p.get('avg_cost', 0)) for p in positions)
            total_value = cash + positions_value

            snapshot_id = now.strftime('%Y%m%d_%H%M%S_') + str(uuid.uuid4())[:8]
            self._history_ref(user_id).document(snapshot_id).set({
                'total_value': total_value,
                'cash_balance': cash,
                'positions_value': positions_value,
                'timestamp': now,
                'date': now.strftime('%Y-%m-%d'),
            })
        except Exception as e:
            logger.warning("Failed to save portfolio snapshot: %s", e)

    # ------------------------------------------------------------------ #
    # Pending limit order processing                                       #
    # ------------------------------------------------------------------ #

    def process_pending_orders(self, user_id: str, price_map: Dict[str, float]):
        """
        Check pending limit orders against current prices and fill any that qualify.
        Called automatically when the portfolio endpoint is hit.
        """
        try:
            pending = (
                self._orders_ref(user_id)
                .where(filter=firestore.FieldFilter('status', '==', 'pending'))
                .limit(50)
                .stream()
            )
            filled_count = 0
            portfolio = self.get_or_create_portfolio(user_id)
            cash = portfolio.get('cash_balance', 0)

            for doc in pending:
                order = doc.to_dict()
                symbol = order.get('symbol')
                side = order.get('side')
                quantity = order.get('quantity', 0)
                limit_price = order.get('limit_price', 0)
                company_name = order.get('company_name', symbol)
                current_price = price_map.get(symbol)

                if current_price is None:
                    continue

                should_fill = False
                if side == 'buy' and current_price <= limit_price:
                    should_fill = True
                elif side == 'sell' and current_price >= limit_price:
                    should_fill = True

                if should_fill:
                    validation = self._validate_order(user_id, symbol, side, quantity, limit_price, cash)
                    if not validation['valid']:
                        # Cancel unfillable order
                        doc.reference.update({'status': 'cancelled', 'cancel_reason': validation['message']})
                        continue

                    now = datetime.utcnow()
                    doc.reference.update({
                        'status': 'filled',
                        'fill_price': limit_price,
                        'total_value': quantity * limit_price,
                        'filled_at': now,
                    })
                    self._execute_fill(user_id, doc.id, symbol, company_name, side, quantity, limit_price, now)
                    # Refresh cash after fill
                    portfolio = self.get_or_create_portfolio(user_id)
                    cash = portfolio.get('cash_balance', 0)
                    filled_count += 1

            if filled_count:
                logger.info("Filled %d pending limit orders for user %s", filled_count, user_id)

        except Exception as e:
            logger.error("Error processing pending orders for %s: %s", user_id, e)

    def cancel_order(self, user_id: str, order_id: str) -> Dict[str, Any]:
        """Cancel a pending order."""
        try:
            doc_ref = self._orders_ref(user_id).document(order_id)
            doc = doc_ref.get()
            if not doc.exists:
                return {'success': False, 'message': 'Order not found'}
            order = doc.to_dict()
            if order.get('status') != 'pending':
                return {'success': False, 'message': f'Cannot cancel order with status "{order.get("status")}"'}
            doc_ref.update({'status': 'cancelled', 'cancelled_at': datetime.utcnow()})
            return {'success': True, 'message': 'Order cancelled'}
        except Exception as e:
            logger.error("Error cancelling order %s: %s", order_id, e)
            return {'success': False, 'message': str(e)}

    # ------------------------------------------------------------------ #
    # Reads                                                                #
    # ------------------------------------------------------------------ #

    def get_orders(self, user_id: str, limit: int = 50, status: str = None) -> List[Dict]:
        """Return order history, most recent first."""
        try:
            query = self._orders_ref(user_id)
            if status:
                query = query.where(filter=firestore.FieldFilter('status', '==', status))
            docs = query.limit(limit).stream()
            orders = []
            for doc in docs:
                data = doc.to_dict()
                data['id'] = doc.id
                orders.append(self._serialize(data))
            orders.sort(key=lambda x: x.get('created_at', ''), reverse=True)
            return orders
        except Exception as e:
            logger.error("Error getting orders for %s: %s", user_id, e)
            return []

    def get_trades(self, user_id: str, limit: int = 50) -> List[Dict]:
        """Return trade history, most recent first."""
        try:
            docs = self._trades_ref(user_id).limit(limit).stream()
            trades = []
            for doc in docs:
                data = doc.to_dict()
                data['id'] = doc.id
                trades.append(self._serialize(data))
            trades.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            return trades
        except Exception as e:
            logger.error("Error getting trades for %s: %s", user_id, e)
            return []

    def get_portfolio_history(self, user_id: str, limit: int = 100) -> List[Dict]:
        """Return portfolio value snapshots for the history chart."""
        try:
            docs = self._history_ref(user_id).limit(limit).stream()
            history = []
            for doc in docs:
                data = doc.to_dict()
                data['id'] = doc.id
                history.append(self._serialize(data))
            history.sort(key=lambda x: x.get('timestamp', ''))
            return history
        except Exception as e:
            logger.error("Error getting portfolio history for %s: %s", user_id, e)
            return []

    def get_analytics(self, user_id: str) -> Dict[str, Any]:
        """Compute performance analytics from trade history."""
        try:
            trades = self.get_trades(user_id, limit=500)
            sells = [t for t in trades if t.get('side') == 'sell']

            if not sells:
                return {
                    'total_trades': len(trades),
                    'total_sells': 0,
                    'win_rate': 0,
                    'realized_pnl': 0,
                    'avg_win': 0,
                    'avg_loss': 0,
                    'best_trade': None,
                    'worst_trade': None,
                }

            realized_pnl = sum(t.get('realized_pnl', 0) for t in sells)
            wins = [t for t in sells if t.get('realized_pnl', 0) > 0]
            losses = [t for t in sells if t.get('realized_pnl', 0) < 0]

            avg_win = sum(t['realized_pnl'] for t in wins) / len(wins) if wins else 0
            avg_loss = sum(t['realized_pnl'] for t in losses) / len(losses) if losses else 0

            best = max(sells, key=lambda t: t.get('realized_pnl', 0)) if sells else None
            worst = min(sells, key=lambda t: t.get('realized_pnl', 0)) if sells else None

            return {
                'total_trades': len(trades),
                'total_sells': len(sells),
                'win_rate': len(wins) / len(sells) * 100 if sells else 0,
                'realized_pnl': realized_pnl,
                'avg_win': avg_win,
                'avg_loss': avg_loss,
                'best_trade': best,
                'worst_trade': worst,
            }
        except Exception as e:
            logger.error("Error computing analytics for %s: %s", user_id, e)
            return {}

    # ------------------------------------------------------------------ #
    # Reset                                                                #
    # ------------------------------------------------------------------ #

    def reset_portfolio(self, user_id: str) -> Dict[str, Any]:
        """Wipe all paper trading data and restart with $100k."""
        try:
            for collection in ('paper_positions', 'paper_orders', 'paper_trades', 'paper_history', 'paper_portfolio'):
                docs = self.db.collection('users').document(user_id).collection(collection).stream()
                for doc in docs:
                    doc.reference.delete()

            now = datetime.utcnow()
            self._portfolio_ref(user_id).set({
                'cash_balance': STARTING_BALANCE,
                'initial_balance': STARTING_BALANCE,
                'created_at': now,
                'updated_at': now,
            })

            # Save opening snapshot
            self._history_ref(user_id).document('start').set({
                'total_value': STARTING_BALANCE,
                'cash_balance': STARTING_BALANCE,
                'positions_value': 0.0,
                'timestamp': now,
                'date': now.strftime('%Y-%m-%d'),
            })

            logger.info("Reset paper portfolio for user %s", user_id)
            return {'success': True, 'message': f'Portfolio reset to ${STARTING_BALANCE:,.2f}'}
        except Exception as e:
            logger.error("Error resetting portfolio for %s: %s", user_id, e)
            return {'success': False, 'message': str(e)}


# Singleton
_paper_trading_service: Optional[PaperTradingService] = None


def get_paper_trading_service(db_client=None) -> PaperTradingService:
    global _paper_trading_service
    if _paper_trading_service is None:
        _paper_trading_service = PaperTradingService(db_client)
    return _paper_trading_service

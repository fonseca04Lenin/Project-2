"""
Unit tests for PaperTradingService business logic.

All Firestore calls are mocked via a mock db_client, or by patching
higher-level service methods so tests focus on logic, not DB mechanics.
"""
import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime

from app.services.paper_trading_service import PaperTradingService, STARTING_BALANCE


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_svc(portfolio_data=None, position_data=None, position_exists=True):
    """Return a PaperTradingService with a mock Firestore client."""
    mock_db = MagicMock()

    # portfolio document mock
    portfolio_doc = MagicMock()
    portfolio_doc.exists = portfolio_data is not None
    portfolio_doc.to_dict.return_value = portfolio_data or {}

    # position document mock
    pos_doc = MagicMock()
    pos_doc.exists = position_exists
    pos_doc.to_dict.return_value = position_data or {}

    # Wire up the Firestore chain – both portfolio and positions share the
    # same chain, so the document mock is configured to serve both roles.
    doc_ref = MagicMock()
    doc_ref.get.side_effect = [portfolio_doc, pos_doc, portfolio_doc, pos_doc]

    mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = doc_ref
    mock_db.collection.return_value.document.return_value.collection.return_value.stream.return_value = iter([])

    svc = PaperTradingService(db_client=mock_db)
    return svc, mock_db


# ---------------------------------------------------------------------------
# Portfolio creation
# ---------------------------------------------------------------------------

class TestGetOrCreatePortfolio:
    def test_creates_portfolio_when_missing(self):
        svc, mock_db = make_svc(portfolio_data=None)
        ref = mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value
        doc = MagicMock(exists=False)
        ref.get.return_value = doc

        result = svc.get_or_create_portfolio("user1")

        ref.set.assert_called_once()
        assert result["cash_balance"] == STARTING_BALANCE
        assert result["initial_balance"] == STARTING_BALANCE

    def test_returns_existing_portfolio(self):
        existing = {"cash_balance": 75_000.0, "initial_balance": 100_000.0}
        svc, mock_db = make_svc(portfolio_data=existing)
        ref = mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value
        doc = MagicMock(exists=True)
        doc.to_dict.return_value = existing
        ref.get.return_value = doc

        result = svc.get_or_create_portfolio("user1")

        ref.set.assert_not_called()
        assert result["cash_balance"] == 75_000.0


# ---------------------------------------------------------------------------
# Order validation
# ---------------------------------------------------------------------------

class TestValidateOrder:
    def test_buy_with_sufficient_cash_is_valid(self):
        svc, _ = make_svc()
        result = svc._validate_order("u1", "AAPL", "buy", 10, 100.0, cash=5_000.0)
        assert result["valid"] is True

    def test_buy_with_insufficient_cash_is_invalid(self):
        svc, _ = make_svc()
        result = svc._validate_order("u1", "AAPL", "buy", 100, 100.0, cash=500.0)
        assert result["valid"] is False
        assert "Insufficient cash" in result["message"]
        assert "10,000.00" in result["message"]

    def test_sell_without_any_position_is_invalid(self):
        svc, mock_db = make_svc()
        pos_doc = MagicMock(exists=False)
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value = pos_doc

        result = svc._validate_order("u1", "AAPL", "sell", 10, 100.0, cash=50_000.0)
        assert result["valid"] is False
        assert "No position in AAPL" in result["message"]

    def test_sell_more_than_held_is_invalid(self):
        svc = PaperTradingService(db_client=MagicMock())
        pos_doc = MagicMock(exists=True)
        pos_doc.to_dict.return_value = {"shares": 5}
        svc._positions_ref = MagicMock()
        svc._positions_ref.return_value.document.return_value.get.return_value = pos_doc

        result = svc._validate_order("u1", "AAPL", "sell", 10, 100.0, cash=50_000.0)
        assert result["valid"] is False
        assert "10" in result["message"]
        assert "5" in result["message"]

    def test_sell_exact_shares_is_valid(self):
        svc = PaperTradingService(db_client=MagicMock())
        pos_doc = MagicMock(exists=True)
        pos_doc.to_dict.return_value = {"shares": 10}
        svc._positions_ref = MagicMock()
        svc._positions_ref.return_value.document.return_value.get.return_value = pos_doc

        result = svc._validate_order("u1", "AAPL", "sell", 10, 100.0, cash=50_000.0)
        assert result["valid"] is True


# ---------------------------------------------------------------------------
# Place order
# ---------------------------------------------------------------------------

class TestPlaceOrder:
    def _svc_with_mocked_methods(self, cash=100_000.0):
        svc = PaperTradingService(db_client=MagicMock())
        svc.get_or_create_portfolio = MagicMock(return_value={"cash_balance": cash})
        svc._validate_order = MagicMock(return_value={"valid": True})
        svc._execute_fill = MagicMock()
        return svc

    def test_invalid_side_returns_error(self):
        svc = self._svc_with_mocked_methods()
        result = svc.place_order("u1", "AAPL", "Apple", "short", 10, "market", 150.0)
        assert result["success"] is False
        assert "buy or sell" in result["message"]

    def test_zero_quantity_returns_error(self):
        svc = self._svc_with_mocked_methods()
        result = svc.place_order("u1", "AAPL", "Apple", "buy", 0, "market", 150.0)
        assert result["success"] is False
        assert "greater than zero" in result["message"]

    def test_invalid_price_returns_error(self):
        svc = self._svc_with_mocked_methods()
        result = svc.place_order("u1", "AAPL", "Apple", "buy", 10, "market", 0)
        assert result["success"] is False

    def test_market_buy_fills_immediately(self):
        svc = self._svc_with_mocked_methods()
        result = svc.place_order("u1", "AAPL", "Apple", "buy", 10, "market", 150.0)

        assert result["success"] is True
        assert result["status"] == "filled"
        assert result["fill_price"] == 150.0
        assert result["total_value"] == 1500.0
        svc._execute_fill.assert_called_once()

    def test_market_sell_fills_immediately(self):
        svc = self._svc_with_mocked_methods()
        result = svc.place_order("u1", "AAPL", "Apple", "sell", 5, "market", 200.0)

        assert result["success"] is True
        assert result["status"] == "filled"
        svc._execute_fill.assert_called_once()

    def test_limit_buy_becomes_pending_when_price_above_limit(self):
        svc = self._svc_with_mocked_methods()
        # current price 155 > limit 150 → should NOT fill
        result = svc.place_order("u1", "AAPL", "Apple", "buy", 10, "limit", 155.0, limit_price=150.0)

        assert result["success"] is True
        assert result["status"] == "pending"
        assert result["fill_price"] is None
        svc._execute_fill.assert_not_called()

    def test_limit_buy_fills_when_price_at_or_below_limit(self):
        svc = self._svc_with_mocked_methods()
        # current price 145 <= limit 150 → fills immediately
        result = svc.place_order("u1", "AAPL", "Apple", "buy", 10, "limit", 145.0, limit_price=150.0)

        assert result["success"] is True
        assert result["status"] == "filled"
        svc._execute_fill.assert_called_once()

    def test_limit_sell_becomes_pending_when_price_below_limit(self):
        svc = self._svc_with_mocked_methods()
        # current price 145 < limit 150 → pending
        result = svc.place_order("u1", "AAPL", "Apple", "sell", 5, "limit", 145.0, limit_price=150.0)

        assert result["success"] is True
        assert result["status"] == "pending"
        svc._execute_fill.assert_not_called()

    def test_limit_order_without_limit_price_returns_error(self):
        svc = self._svc_with_mocked_methods()
        result = svc.place_order("u1", "AAPL", "Apple", "buy", 10, "limit", 150.0)

        assert result["success"] is False
        assert "Limit price required" in result["message"]

    def test_validation_failure_blocks_order(self):
        svc = self._svc_with_mocked_methods(cash=100.0)
        svc._validate_order = MagicMock(return_value={"valid": False, "message": "Insufficient cash"})

        result = svc.place_order("u1", "AAPL", "Apple", "buy", 100, "market", 200.0)
        assert result["success"] is False
        assert "Insufficient cash" in result["message"]


# ---------------------------------------------------------------------------
# Cancel order
# ---------------------------------------------------------------------------

class TestCancelOrder:
    def test_cancel_pending_order_succeeds(self):
        svc, mock_db = make_svc()
        doc_ref = MagicMock()
        order_doc = MagicMock(exists=True)
        order_doc.to_dict.return_value = {"status": "pending"}
        doc_ref.get.return_value = order_doc
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = doc_ref

        result = svc.cancel_order("u1", "order-abc")
        assert result["success"] is True
        doc_ref.update.assert_called_once()

    def test_cancel_nonexistent_order_returns_error(self):
        svc, mock_db = make_svc()
        doc_ref = MagicMock()
        doc_ref.get.return_value = MagicMock(exists=False)
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = doc_ref

        result = svc.cancel_order("u1", "ghost-order")
        assert result["success"] is False
        assert "not found" in result["message"]

    def test_cancel_filled_order_returns_error(self):
        svc, mock_db = make_svc()
        doc_ref = MagicMock()
        order_doc = MagicMock(exists=True)
        order_doc.to_dict.return_value = {"status": "filled"}
        doc_ref.get.return_value = order_doc
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = doc_ref

        result = svc.cancel_order("u1", "order-filled")
        assert result["success"] is False
        assert "filled" in result["message"]


# ---------------------------------------------------------------------------
# Portfolio summary
# ---------------------------------------------------------------------------

class TestGetPortfolioSummary:
    def test_empty_portfolio_shows_starting_balance(self):
        svc = PaperTradingService(db_client=MagicMock())
        svc.get_or_create_portfolio = MagicMock(
            return_value={"cash_balance": STARTING_BALANCE, "initial_balance": STARTING_BALANCE}
        )
        svc.get_positions = MagicMock(return_value=[])

        result = svc.get_portfolio_summary("u1")
        assert result["cash_balance"] == STARTING_BALANCE
        assert result["positions_value"] == 0.0
        assert result["total_value"] == STARTING_BALANCE
        assert result["total_return"] == 0.0
        assert result["total_return_pct"] == 0.0

    def test_unrealized_pnl_calculated_correctly(self):
        svc = PaperTradingService(db_client=MagicMock())
        svc.get_or_create_portfolio = MagicMock(
            return_value={"cash_balance": 90_000.0, "initial_balance": 100_000.0}
        )
        svc.get_positions = MagicMock(return_value=[
            {"symbol": "AAPL", "shares": 10, "avg_cost": 100.0, "last_price": 100.0},
        ])

        # Current price is 150, avg cost was 100 → unrealized PnL = 500
        result = svc.get_portfolio_summary("u1", price_map={"AAPL": 150.0})
        assert result["unrealized_pnl"] == pytest.approx(500.0)
        assert result["positions_value"] == pytest.approx(1500.0)
        assert result["total_value"] == pytest.approx(91_500.0)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

class TestGetAnalytics:
    def test_no_trades_returns_zeroed_stats(self):
        svc = PaperTradingService(db_client=MagicMock())
        svc.get_trades = MagicMock(return_value=[])

        result = svc.get_analytics("u1")
        assert result["total_trades"] == 0
        assert result["win_rate"] == 0
        assert result["realized_pnl"] == 0

    def test_win_rate_calculated_correctly(self):
        svc = PaperTradingService(db_client=MagicMock())
        svc.get_trades = MagicMock(return_value=[
            {"side": "buy",  "realized_pnl": 0},
            {"side": "sell", "realized_pnl": 200.0},
            {"side": "sell", "realized_pnl": -50.0},
            {"side": "sell", "realized_pnl": 100.0},
        ])

        result = svc.get_analytics("u1")
        assert result["total_sells"] == 3
        # 2 wins out of 3 sells
        assert result["win_rate"] == pytest.approx(200 / 3)
        assert result["realized_pnl"] == pytest.approx(250.0)

    def test_best_and_worst_trade_identified(self):
        svc = PaperTradingService(db_client=MagicMock())
        svc.get_trades = MagicMock(return_value=[
            {"side": "sell", "realized_pnl": 500.0, "symbol": "AAPL"},
            {"side": "sell", "realized_pnl": -200.0, "symbol": "TSLA"},
            {"side": "sell", "realized_pnl": 100.0, "symbol": "MSFT"},
        ])

        result = svc.get_analytics("u1")
        assert result["best_trade"]["realized_pnl"] == 500.0
        assert result["worst_trade"]["realized_pnl"] == -200.0

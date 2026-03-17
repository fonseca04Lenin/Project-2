"""
Unit tests for subscription_service: tier resolution, chat limits, AI suite gating,
Stripe webhook processing, and price-to-tier mapping.
"""
import os
import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_db_with_user(data=None, exists=True):
    mock_db = MagicMock()
    doc = MagicMock()
    doc.exists = exists
    doc.to_dict.return_value = data or {}
    mock_db.collection.return_value.document.return_value.get.return_value = doc
    return mock_db


# ---------------------------------------------------------------------------
# get_user_subscription
# ---------------------------------------------------------------------------

class TestGetUserSubscription:
    def test_unknown_user_defaults_to_free(self):
        mock_db = _mock_db_with_user(exists=False)
        with patch("app.services.subscription_service._get_db", return_value=mock_db):
            from app.services.subscription_service import get_user_subscription
            result = get_user_subscription("unknown-uid")

        assert result["tier"] == "free"
        assert result["status"] is None

    def test_active_pro_user_returns_pro_tier(self):
        mock_db = _mock_db_with_user(
            data={"subscription_tier": "pro", "subscription_status": "active"},
            exists=True,
        )
        with patch("app.services.subscription_service._get_db", return_value=mock_db):
            from app.services.subscription_service import get_user_subscription
            result = get_user_subscription("uid-pro")

        assert result["tier"] == "pro"
        assert result["status"] == "active"

    def test_trialing_user_keeps_paid_tier(self):
        mock_db = _mock_db_with_user(
            data={"subscription_tier": "elite", "subscription_status": "trialing"},
            exists=True,
        )
        with patch("app.services.subscription_service._get_db", return_value=mock_db):
            from app.services.subscription_service import get_user_subscription
            result = get_user_subscription("uid-trial")

        assert result["tier"] == "elite"

    def test_inactive_pro_subscription_downgrades_to_free(self):
        mock_db = _mock_db_with_user(
            data={"subscription_tier": "pro", "subscription_status": "past_due"},
            exists=True,
        )
        with patch("app.services.subscription_service._get_db", return_value=mock_db):
            from app.services.subscription_service import get_user_subscription
            result = get_user_subscription("uid-lapsed")

        assert result["tier"] == "free"

    def test_canceled_subscription_downgrades_to_free(self):
        mock_db = _mock_db_with_user(
            data={"subscription_tier": "elite", "subscription_status": "canceled"},
            exists=True,
        )
        with patch("app.services.subscription_service._get_db", return_value=mock_db):
            from app.services.subscription_service import get_user_subscription
            result = get_user_subscription("uid-canceled")

        assert result["tier"] == "free"

    def test_firestore_error_defaults_to_free(self):
        with patch("app.services.subscription_service._get_db", side_effect=Exception("DB down")):
            from app.services.subscription_service import get_user_subscription
            result = get_user_subscription("uid-err")

        assert result["tier"] == "free"


# ---------------------------------------------------------------------------
# check_and_increment_chat_usage
# ---------------------------------------------------------------------------

class TestCheckAndIncrementChatUsage:
    def test_free_user_at_daily_limit_is_blocked(self):
        with patch("app.services.subscription_service.get_user_subscription",
                   return_value={"tier": "free", "status": "active"}), \
             patch("app.services.subscription_service.get_daily_chat_usage", return_value=5):
            from app.services.subscription_service import check_and_increment_chat_usage
            result = check_and_increment_chat_usage("uid-free")

        assert result["allowed"] is False
        assert result["upgrade_required"] is True
        assert result["limit"] == 5
        assert result["used"] == 5

    def test_free_user_under_limit_is_allowed(self):
        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value.set.return_value = None
        daily_doc = MagicMock(exists=True)
        daily_doc.to_dict.return_value = {}
        mock_db.collection.return_value.document.return_value.get.return_value = daily_doc

        with patch("app.services.subscription_service.get_user_subscription",
                   return_value={"tier": "free", "status": "active"}), \
             patch("app.services.subscription_service.get_daily_chat_usage", return_value=2), \
             patch("app.services.subscription_service._increment_chat_usage", return_value=3):
            from app.services.subscription_service import check_and_increment_chat_usage
            result = check_and_increment_chat_usage("uid-free")

        assert result["allowed"] is True
        assert result["upgrade_required"] is False

    def test_pro_user_under_50_limit_is_allowed(self):
        with patch("app.services.subscription_service.get_user_subscription",
                   return_value={"tier": "pro", "status": "active"}), \
             patch("app.services.subscription_service.get_daily_chat_usage", return_value=49), \
             patch("app.services.subscription_service._increment_chat_usage", return_value=50):
            from app.services.subscription_service import check_and_increment_chat_usage
            result = check_and_increment_chat_usage("uid-pro")

        assert result["allowed"] is True
        assert result["limit"] == 50

    def test_elite_user_always_allowed_regardless_of_count(self):
        with patch("app.services.subscription_service.get_user_subscription",
                   return_value={"tier": "elite", "status": "active"}), \
             patch("app.services.subscription_service.get_daily_chat_usage", return_value=9999), \
             patch("app.services.subscription_service._increment_chat_usage", return_value=10000):
            from app.services.subscription_service import check_and_increment_chat_usage
            result = check_and_increment_chat_usage("uid-elite")

        assert result["allowed"] is True
        assert result["limit"] is None


# ---------------------------------------------------------------------------
# check_ai_suite_access
# ---------------------------------------------------------------------------

class TestCheckAiSuiteAccess:
    def test_free_user_denied_ai_suite(self):
        with patch("app.services.subscription_service.get_user_subscription",
                   return_value={"tier": "free", "status": None}):
            from app.services.subscription_service import check_ai_suite_access
            result = check_ai_suite_access("uid-free")

        assert result["allowed"] is False
        assert result["upgrade_required"] is True

    def test_pro_user_granted_ai_suite(self):
        with patch("app.services.subscription_service.get_user_subscription",
                   return_value={"tier": "pro", "status": "active"}):
            from app.services.subscription_service import check_ai_suite_access
            result = check_ai_suite_access("uid-pro")

        assert result["allowed"] is True
        assert result["upgrade_required"] is False

    def test_elite_user_granted_ai_suite(self):
        with patch("app.services.subscription_service.get_user_subscription",
                   return_value={"tier": "elite", "status": "active"}):
            from app.services.subscription_service import check_ai_suite_access
            result = check_ai_suite_access("uid-elite")

        assert result["allowed"] is True


# ---------------------------------------------------------------------------
# _price_to_tier
# ---------------------------------------------------------------------------

class TestPriceToTier:
    def test_pro_monthly_price_maps_to_pro(self):
        from app.services.subscription_service import _price_to_tier
        assert _price_to_tier("price_pro_monthly") == "pro"

    def test_pro_yearly_price_maps_to_pro(self):
        from app.services.subscription_service import _price_to_tier
        assert _price_to_tier("price_pro_yearly") == "pro"

    def test_elite_monthly_price_maps_to_elite(self):
        from app.services.subscription_service import _price_to_tier
        assert _price_to_tier("price_elite_monthly") == "elite"

    def test_elite_yearly_price_maps_to_elite(self):
        from app.services.subscription_service import _price_to_tier
        assert _price_to_tier("price_elite_yearly") == "elite"

    def test_unknown_price_defaults_to_free(self):
        from app.services.subscription_service import _price_to_tier
        assert _price_to_tier("price_unknown_attacker") == "free"

    def test_none_price_defaults_to_free(self):
        from app.services.subscription_service import _price_to_tier
        assert _price_to_tier(None) == "free"


# ---------------------------------------------------------------------------
# handle_stripe_webhook
# ---------------------------------------------------------------------------

class TestHandleStripeWebhook:
    def test_invalid_signature_returns_false(self):
        import stripe as mock_stripe_mod
        mock_stripe_mod.Webhook.construct_event.side_effect = Exception("Invalid signature")

        from app.services.subscription_service import handle_stripe_webhook
        result = handle_stripe_webhook(b"payload", "bad-sig")

        assert result is False

    def test_valid_subscription_created_event_returns_true(self):
        subscription_obj = {
            "id": "sub_123",
            "customer": "cus_abc",
            "status": "active",
            "metadata": {"firebase_uid": "uid-123"},
            "items": {"data": [{"price": {"id": "price_pro_monthly"}}]},
            "trial_end": None,
            "current_period_end": 9999999999,
        }
        event = {
            "type": "customer.subscription.created",
            "data": {"object": subscription_obj},
        }

        mock_db = MagicMock()
        import stripe as mock_stripe_mod
        mock_stripe_mod.Webhook.construct_event.side_effect = None
        mock_stripe_mod.Webhook.construct_event.return_value = event

        with patch("app.services.subscription_service._get_db", return_value=mock_db):
            from app.services.subscription_service import handle_stripe_webhook
            result = handle_stripe_webhook(b"payload", "valid-sig")

        assert result is True
        mock_db.collection.return_value.document.return_value.set.assert_called_once()

    def test_payment_failed_event_syncs_subscription(self):
        subscription_obj = {
            "id": "sub_123",
            "customer": "cus_abc",
            "status": "past_due",
            "metadata": {"firebase_uid": "uid-123"},
            "items": {"data": [{"price": {"id": "price_pro_monthly"}}]},
            "trial_end": None,
            "current_period_end": 9999999999,
        }
        invoice_obj = {
            "subscription": "sub_123",
            "customer": "cus_abc",
        }
        event = {
            "type": "invoice.payment_failed",
            "data": {"object": invoice_obj},
        }

        import stripe as mock_stripe_mod
        mock_stripe_mod.Webhook.construct_event.return_value = event
        mock_stripe_mod.Subscription.retrieve.return_value = subscription_obj

        mock_db = MagicMock()
        with patch("app.services.subscription_service._get_db", return_value=mock_db):
            from app.services.subscription_service import handle_stripe_webhook
            result = handle_stripe_webhook(b"payload", "valid-sig")

        assert result is True
        # Subscription sync should have written to Firestore
        mock_db.collection.return_value.document.return_value.set.assert_called_once()

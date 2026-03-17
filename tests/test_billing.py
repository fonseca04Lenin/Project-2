"""
Tests for billing routes: subscription info, checkout, portal, and webhook.
"""
import json
import os
import pytest
from unittest.mock import patch, MagicMock

from tests.conftest import make_mock_user

_FREE_SUB = {"tier": "free", "status": None, "trial_end": None, "current_period_end": None}
_PRO_SUB = {"tier": "pro", "status": "active", "trial_end": None, "current_period_end": 9999999999}
_ELITE_SUB = {"tier": "elite", "status": "active", "trial_end": None, "current_period_end": 9999999999}


class TestGetSubscription:
    def test_unauthenticated_returns_401(self, client):
        with patch("app.routes.billing.authenticate_request", return_value=None):
            resp = client.get("/api/billing/subscription")
        assert resp.status_code == 401

    def test_free_user_subscription_info(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user), \
             patch("app.services.subscription_service.get_user_subscription", return_value=_FREE_SUB), \
             patch("app.services.subscription_service.get_daily_chat_usage", return_value=3):
            resp = client.get("/api/billing/subscription")

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["tier"] == "free"
        assert data["chat_daily_limit"] == 5
        assert data["chat_used_today"] == 3
        assert data["can_send_chat"] is True
        assert data["ai_suite_access"] is False

    def test_free_user_at_limit_cannot_send_chat(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user), \
             patch("app.services.subscription_service.get_user_subscription", return_value=_FREE_SUB), \
             patch("app.services.subscription_service.get_daily_chat_usage", return_value=5):
            resp = client.get("/api/billing/subscription")

        data = resp.get_json()
        assert data["can_send_chat"] is False

    def test_pro_user_has_ai_suite_access(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user), \
             patch("app.services.subscription_service.get_user_subscription", return_value=_PRO_SUB), \
             patch("app.services.subscription_service.get_daily_chat_usage", return_value=0):
            resp = client.get("/api/billing/subscription")

        data = resp.get_json()
        assert data["tier"] == "pro"
        assert data["ai_suite_access"] is True
        assert data["chat_daily_limit"] == 50

    def test_elite_user_has_unlimited_chat(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user), \
             patch("app.services.subscription_service.get_user_subscription", return_value=_ELITE_SUB), \
             patch("app.services.subscription_service.get_daily_chat_usage", return_value=9999):
            resp = client.get("/api/billing/subscription")

        data = resp.get_json()
        assert data["tier"] == "elite"
        assert data["chat_daily_limit"] is None
        assert data["can_send_chat"] is True  # None limit → always allowed


class TestCreateCheckout:
    def test_unauthenticated_returns_401(self, client):
        with patch("app.routes.billing.authenticate_request", return_value=None):
            resp = client.post("/api/billing/create-checkout", json={"price_id": "price_pro_monthly"})
        assert resp.status_code == 401

    def test_missing_price_id_returns_400(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user):
            resp = client.post("/api/billing/create-checkout", json={})
        assert resp.status_code == 400
        assert "price_id" in resp.get_json()["error"]

    def test_invalid_price_id_rejected(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user):
            resp = client.post(
                "/api/billing/create-checkout",
                json={"price_id": "price_attacker_injected"},
            )
        assert resp.status_code == 400
        assert "Invalid price ID" in resp.get_json()["error"]

    def test_valid_price_id_returns_checkout_url(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user), \
             patch("app.services.subscription_service.create_checkout_session",
                   return_value="https://checkout.stripe.com/pay/cs_test_abc"):
            resp = client.post(
                "/api/billing/create-checkout",
                json={"price_id": "price_pro_monthly"},
            )

        assert resp.status_code == 200
        assert "checkout.stripe.com" in resp.get_json()["checkout_url"]

    def test_checkout_service_error_returns_500(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user), \
             patch("app.services.subscription_service.create_checkout_session",
                   side_effect=Exception("Stripe error")):
            resp = client.post(
                "/api/billing/create-checkout",
                json={"price_id": "price_pro_monthly"},
            )

        assert resp.status_code == 500


class TestCustomerPortal:
    def test_unauthenticated_returns_401(self, client):
        with patch("app.routes.billing.authenticate_request", return_value=None):
            resp = client.post("/api/billing/portal")
        assert resp.status_code == 401

    def test_no_subscription_returns_400(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user), \
             patch("app.services.subscription_service.create_portal_session",
                   side_effect=ValueError("No Stripe customer")):
            resp = client.post("/api/billing/portal")

        assert resp.status_code == 400
        assert "upgrade" in resp.get_json()["error"].lower()

    def test_portal_session_returns_url(self, client, mock_user):
        with patch("app.routes.billing.authenticate_request", return_value=mock_user), \
             patch("app.services.subscription_service.create_portal_session",
                   return_value="https://billing.stripe.com/session/bps_test_abc"):
            resp = client.post("/api/billing/portal")

        assert resp.status_code == 200
        assert "billing.stripe.com" in resp.get_json()["portal_url"]


class TestStripeWebhook:
    def test_missing_webhook_secret_returns_500(self, client):
        original = os.environ.pop("STRIPE_WEBHOOK_SECRET", None)
        try:
            resp = client.post(
                "/api/billing/webhook",
                data=b"payload",
                headers={"Stripe-Signature": "t=1,v1=abc"},
            )
            assert resp.status_code == 500
        finally:
            if original:
                os.environ["STRIPE_WEBHOOK_SECRET"] = original

    def test_missing_signature_header_returns_400(self, client):
        resp = client.post("/api/billing/webhook", data=b"payload")
        assert resp.status_code == 400
        assert "signature" in resp.get_json()["error"].lower()

    def test_invalid_stripe_signature_returns_400(self, client):
        with patch(
            "app.services.subscription_service.handle_stripe_webhook",
            return_value=False,
        ):
            resp = client.post(
                "/api/billing/webhook",
                data=b"bad-payload",
                headers={"Stripe-Signature": "invalid"},
            )
        assert resp.status_code == 400

    def test_valid_webhook_returns_200(self, client):
        with patch(
            "app.services.subscription_service.handle_stripe_webhook",
            return_value=True,
        ):
            resp = client.post(
                "/api/billing/webhook",
                data=b'{"type":"customer.subscription.updated"}',
                headers={"Stripe-Signature": "t=1,v1=abc123"},
            )
        assert resp.status_code == 200
        assert resp.get_json()["received"] is True

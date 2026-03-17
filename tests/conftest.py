"""
Shared test configuration.

External SDKs are stubbed at sys.modules level before any app code is imported,
so the app factory can run without real credentials.
"""
import os
import sys
from unittest.mock import MagicMock

# ---------------------------------------------------------------------------
# Stub external SDKs before any app import
# ---------------------------------------------------------------------------
_STUBS = [
    "firebase_admin",
    "firebase_admin.credentials",
    "firebase_admin.auth",
    "firebase_admin.firestore",
    "google",
    "google.auth",
    "google.cloud",
    "google.cloud.firestore_v1",
    "google.cloud.firestore_v1.base_query",
    "google.generativeai",
    "stripe",
    "yfinance",
    "openai",
    "groq",
    "alpaca_trade_api",
    "alpaca_trade_api.rest",
    "finnhub",
    "newsapi",
    "newsapi.newsapi_client",
]
for _mod in _STUBS:
    sys.modules.setdefault(_mod, MagicMock())

# ---------------------------------------------------------------------------
# Env vars required by the app factory and billing module
# ---------------------------------------------------------------------------
os.environ.setdefault("SECRET_KEY", "test-secret-key-pytest")
os.environ.setdefault("FRONTEND_URL", "https://test.example.com")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_placeholder")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_placeholder")
os.environ.setdefault("STRIPE_PRO_MONTHLY_PRICE_ID", "price_pro_monthly")
os.environ.setdefault("STRIPE_PRO_YEARLY_PRICE_ID", "price_pro_yearly")
os.environ.setdefault("STRIPE_ELITE_MONTHLY_PRICE_ID", "price_elite_monthly")
os.environ.setdefault("STRIPE_ELITE_YEARLY_PRICE_ID", "price_elite_yearly")

import pytest
from flask_login import UserMixin


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class FakeUser(UserMixin):
    """Minimal Flask-Login compatible user for tests."""
    def __init__(self, uid="uid-test", name="Test User", email="test@example.com", username="testuser"):
        self.id = uid
        self.name = name
        self.email = email
        self.username = username

    def get_id(self):
        return str(self.id)


def make_mock_user(uid="uid-test", name="Test User", email="test@example.com", username="testuser"):
    return FakeUser(uid=uid, name=name, email=email, username=username)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app():
    from app import create_app
    application = create_app()
    application.config["TESTING"] = True
    return application


@pytest.fixture
def client(app):
    with app.test_client() as c:
        yield c


@pytest.fixture
def mock_user():
    return make_mock_user()

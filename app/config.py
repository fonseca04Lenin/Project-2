import os
import secrets
import logging
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def _secret_key() -> str:
    """Returns SECRET_KEY or generates a secure one-time key with a loud warning."""
    val = os.environ.get('SECRET_KEY')
    if val:
        return val
    generated = secrets.token_hex(32)
    logger.critical(
        "SECRET_KEY is not set! Using a randomly generated key — "
        "all sessions will be invalidated on every restart. "
        "Set SECRET_KEY in your environment immediately."
    )
    return generated


class Config:
    SECRET_KEY = _secret_key()

    # Firebase
    FIREBASE_CREDENTIALS_PATH = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'firebase-credentials.json')
    FIREBASE_PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', '')

    # API keys (validated lazily where used)
    NEWS_API_KEY = os.environ.get('NEWS_API_KEY', '')
    YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY', '')
    XAI_API_KEY = os.environ.get('XAI_API_KEY', '')

    # App
    DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'
    PORT = int(os.environ.get('PORT', 5000))
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)

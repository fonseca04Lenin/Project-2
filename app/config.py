import os
import secrets
import logging
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def _require_env(var: str) -> str:
    """Raises on startup if a required env var is missing."""
    val = os.environ.get(var)
    if not val:
        raise RuntimeError(f"Required environment variable '{var}' is not set. Set it before starting the server.")
    return val


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

    # Firebase Configuration
    FIREBASE_CREDENTIALS_PATH = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'firebase-credentials.json')
    FIREBASE_PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', '')

    # API Keys (not validated at import time — validated lazily when used)
    NEWS_API_KEY = os.environ.get('NEWS_API_KEY', '')
    YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY', '')
    XAI_API_KEY = os.environ.get('XAI_API_KEY', '')

    # App Settings
    DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'
    PORT = int(os.environ.get('PORT', 5000))

    # Rate limiting / session
    RATELIMIT_STORAGE_URL = os.environ.get('REDIS_URL', '')
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    SESSION_TYPE = 'redis'
    SESSION_REDIS = os.environ.get('REDIS_URL', '')

    # Security headers
    TALISMAN_FORCE_HTTPS = True
    TALISMAN_CONTENT_SECURITY_POLICY = {
        'default-src': "'self'",
        # unsafe-inline kept only because the app uses inline Babel/React scripts
        # TODO: migrate to external bundles and remove unsafe-inline
        'script-src': ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com', 'unpkg.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com', 'fonts.googleapis.com'],
        'font-src': ["'self'", 'cdnjs.cloudflare.com', 'fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'", 'https:'],
    }


class DevelopmentConfig(Config):
    DEBUG = True
    CACHE_TYPE = 'simple'


class ProductionConfig(Config):
    DEBUG = False
    CACHE_TYPE = 'redis'
    CACHE_REDIS_URL = os.environ.get('REDIS_URL')

    # Celery configuration
    CELERY_BROKER_URL = os.environ.get('REDIS_URL')
    CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL')


class TestingConfig(Config):
    TESTING = True
    WTF_CSRF_ENABLED = False


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

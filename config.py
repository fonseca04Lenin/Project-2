import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-here')
    
    # Firebase Configuration
    FIREBASE_CREDENTIALS_PATH = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'firebase-credentials.json')
    FIREBASE_PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', 'your-firebase-project-id')
    
    # API Keys
    NEWS_API_KEY = os.environ.get('NEWS_API_KEY', 'your-news-api-key')
    
    # App Settings
    DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'
    PORT = int(os.environ.get('PORT', 5000))
    
    # Rate limiting
    RATELIMIT_STORAGE_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
    
    # Session configuration
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    SESSION_TYPE = 'redis'
    SESSION_REDIS = os.environ.get('REDIS_URL', 'redis://localhost:6379')
    
    # Security headers
    TALISMAN_FORCE_HTTPS = True
    TALISMAN_CONTENT_SECURITY_POLICY = {
        'default-src': "'self'",
        'script-src': ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
        'font-src': ["'self'", 'cdnjs.cloudflare.com'],
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

    # Test-specific Firebase configuration
    FIREBASE_PROJECT_ID = os.environ.get('TEST_FIREBASE_PROJECT_ID', 'test-stock-watcher')
    FIREBASE_CREDENTIALS_PATH = os.environ.get('TEST_FIREBASE_CREDENTIALS_PATH', 'firebase-credentials-test.json')

    # Test API keys
    NEWS_API_KEY = os.environ.get('TEST_NEWS_API_KEY', 'test-news-api-key')

    # Test Redis/cache settings
    CACHE_TYPE = 'simple'
    SESSION_TYPE = 'filesystem'
    RATELIMIT_STORAGE_URL = 'memory://'

# Environment detection helpers
def get_config():
    """Get configuration based on environment"""
    env = os.environ.get('FLASK_ENV', 'development').lower()

    # Check if we're in Heroku test environment
    heroku_app_name = os.environ.get('HEROKU_APP_NAME', '')
    if 'test' in heroku_app_name.lower() or env == 'testing':
        return TestingConfig()

    config_map = {
        'development': DevelopmentConfig,
        'production': ProductionConfig,
        'testing': TestingConfig,
    }

    return config_map.get(env, DevelopmentConfig())

def is_testing_environment():
    """Check if we're in a testing environment"""
    env = os.environ.get('FLASK_ENV', 'development').lower()
    heroku_app_name = os.environ.get('HEROKU_APP_NAME', '')
    return env == 'testing' or 'test' in heroku_app_name.lower()

def is_production_environment():
    """Check if we're in production"""
    env = os.environ.get('FLASK_ENV', 'development').lower()
    heroku_app_name = os.environ.get('HEROKU_APP_NAME', '')
    return env == 'production' or (heroku_app_name and 'test' not in heroku_app_name.lower())

# Export the config getter
config = get_config() 
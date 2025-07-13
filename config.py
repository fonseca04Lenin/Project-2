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
    PORT = int(os.environ.get('PORT', 5001))
    
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

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
} 
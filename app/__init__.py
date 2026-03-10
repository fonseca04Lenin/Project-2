import logging
import os

from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

from app.extensions import socketio, login_manager
from app.config import Config

logger = logging.getLogger(__name__)


def create_app():
    """Application factory for the Stock Watchlist App."""
    app = Flask(__name__)
    app.config['SECRET_KEY'] = Config.SECRET_KEY

    # -------------------------------------------------------------------
    # CORS
    # -------------------------------------------------------------------
    is_production = (
        os.environ.get('FLASK_ENV') == 'production'
        or os.environ.get('RAILWAY_ENVIRONMENT') is not None
    )

    allowed_origins = [
        "https://aistocksage.com",
        "https://www.aistocksage.com",
        "https://stock-watchlist-frontend.vercel.app",
    ]

    if not is_production:
        allowed_origins.extend([
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5000",
            "http://localhost:8000",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://localhost:8081",
            "http://127.0.0.1:8081",
        ])

    frontend_url = os.environ.get('FRONTEND_URL')
    if frontend_url:
        allowed_origins.append(frontend_url)

    CORS(app,
         origins=allowed_origins,
         supports_credentials=True,
         allow_headers=['Content-Type', 'Authorization', 'X-Requested-With',
                        'Accept', 'Origin', 'X-User-ID', 'Cache-Control',
                        'X-Request-Source'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
         expose_headers=['Content-Type', 'Authorization', 'X-API-Source'],
         vary_header=False)

    @app.before_request
    def handle_preflight():
        if request.method == 'OPTIONS':
            origin = request.headers.get('Origin', '')
            if origin and origin in allowed_origins:
                response = app.make_default_options_response()
                response.headers['Access-Control-Allow-Origin'] = origin
                response.headers['Access-Control-Allow-Credentials'] = 'true'
                response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
                response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-ID, Cache-Control, X-Request-Source'
                response.headers['Access-Control-Max-Age'] = '86400'
                return response

    @app.after_request
    def after_request(response):
        origin = request.headers.get('Origin', '')
        if origin and origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-ID, Cache-Control, X-Request-Source'
        return response

    # -------------------------------------------------------------------
    # Initialize extensions
    # -------------------------------------------------------------------
    socketio.init_app(
        app,
        cors_allowed_origins=allowed_origins,
        async_mode='threading',
        logger=False,
        engineio_logger=False,
        ping_timeout=60,
        ping_interval=25,
    )
    login_manager.init_app(app)

    @login_manager.unauthorized_handler
    def unauthorized():
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Authentication required'}), 401
        return redirect('/')

    # -------------------------------------------------------------------
    # Register blueprints (deferred to avoid circular imports)
    # -------------------------------------------------------------------
    from app.auth import auth
    from app.routes.core import core_bp
    from app.routes.watchlist import watchlist_bp
    from app.routes.stock_data import stock_data_bp
    from app.routes.market import market_bp
    from app.routes.news_social import news_social_bp
    from app.routes.chat import chat_bp, register_chat_socketio_events
    from app.routes.alerts_routes import alerts_bp
    from app.routes.map_companies import map_companies_bp
    from app.routes.youtube import youtube_bp
    from app.routes.ai_features import ai_features_bp
    from app.routes.paper_trading import paper_trading_bp
    from app.routes.billing import billing_bp

    app.register_blueprint(auth)
    app.register_blueprint(core_bp)
    app.register_blueprint(watchlist_bp)
    app.register_blueprint(stock_data_bp)
    app.register_blueprint(market_bp)
    app.register_blueprint(news_social_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(map_companies_bp)
    app.register_blueprint(youtube_bp)
    app.register_blueprint(ai_features_bp)
    app.register_blueprint(paper_trading_bp)
    app.register_blueprint(billing_bp)

    # -------------------------------------------------------------------
    # Register SocketIO events
    # -------------------------------------------------------------------
    from app.socketio_events import register_socketio_events, start_price_updates

    register_socketio_events()
    register_chat_socketio_events()

    # -------------------------------------------------------------------
    # Startup logging + security validation
    # -------------------------------------------------------------------
    logger.info("=" * 80)
    logger.info("Stock Watchlist App - Initializing...")
    logger.info("=" * 80)
    logger.info("Debug mode: %s", Config.DEBUG)
    logger.info("Environment: %s",
                'production' if os.environ.get('RAILWAY_ENVIRONMENT') else 'development')
    logger.info("Firebase credentials: %s",
                'configured' if os.path.exists(Config.FIREBASE_CREDENTIALS_PATH)
                or os.environ.get('FIREBASE_CREDENTIALS_BASE64') else 'not found (will initialize on demand)')

    # Warn loudly if critical env vars are missing in production
    _is_production = os.environ.get('RAILWAY_ENVIRONMENT') is not None
    _required_in_prod = [
        'SECRET_KEY', 'XAI_API_KEY', 'FIREBASE_CREDENTIALS_BASE64',
        'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    ]
    if _is_production:
        for _var in _required_in_prod:
            if not os.environ.get(_var):
                logger.critical("SECURITY: Required environment variable '%s' is not set in production!", _var)

    if Config.DEBUG and _is_production:
        logger.critical("SECURITY: DEBUG mode is enabled in production! Disable it immediately.")

    logger.info("App module loaded successfully - services will initialize on demand")
    logger.info("=" * 80)

    return app

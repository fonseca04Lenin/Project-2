import logging
import os

from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

from extensions import socketio, login_manager
from config import Config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Create Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config['SECRET_KEY'] = Config.SECRET_KEY

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
is_production = os.environ.get('FLASK_ENV') == 'production' or os.environ.get('RAILWAY_ENVIRONMENT') is not None

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
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-User-ID', 'Cache-Control', 'X-Request-Source'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     expose_headers=['Content-Type', 'Authorization', 'X-API-Source'],
     vary_header=False)


@app.before_request
def handle_preflight():
    """Handle CORS preflight OPTIONS requests"""
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
    """Ensure CORS headers are set for all allowed origins"""
    origin = request.headers.get('Origin', '')
    if origin and origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-ID, Cache-Control, X-Request-Source'
    return response

# ---------------------------------------------------------------------------
# Initialize extensions
# ---------------------------------------------------------------------------
socketio.init_app(
    app,
    cors_allowed_origins=allowed_origins,
    async_mode='threading',
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25
)
login_manager.init_app(app)


@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Authentication required'}), 401
    return redirect('/')

# ---------------------------------------------------------------------------
# Register blueprints
# ---------------------------------------------------------------------------
from auth import auth
from routes.core import core_bp
from routes.watchlist import watchlist_bp
from routes.stock_data import stock_data_bp
from routes.market import market_bp
from routes.news_social import news_social_bp
from routes.chat import chat_bp, register_chat_socketio_events
from routes.alpaca import alpaca_bp
from routes.alerts_routes import alerts_bp
from routes.map_companies import map_companies_bp
from routes.youtube import youtube_bp

app.register_blueprint(auth)
app.register_blueprint(core_bp)
app.register_blueprint(watchlist_bp)
app.register_blueprint(stock_data_bp)
app.register_blueprint(market_bp)
app.register_blueprint(news_social_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(alpaca_bp)
app.register_blueprint(alerts_bp)
app.register_blueprint(map_companies_bp)
app.register_blueprint(youtube_bp)

# ---------------------------------------------------------------------------
# Register SocketIO events
# ---------------------------------------------------------------------------
from socketio_events import register_socketio_events, start_price_updates

register_socketio_events()
register_chat_socketio_events()

# ---------------------------------------------------------------------------
# Startup logging
# ---------------------------------------------------------------------------
logger.info("=" * 80)
logger.info("Stock Watchlist App - Initializing...")
logger.info("=" * 80)
logger.info("Debug mode: %s", Config.DEBUG)
logger.info("Environment: %s", 'production' if os.environ.get('RAILWAY_ENVIRONMENT') else 'development')
logger.info("Firebase credentials: %s", 'configured' if os.path.exists(Config.FIREBASE_CREDENTIALS_PATH) or os.environ.get('FIREBASE_CREDENTIALS_BASE64') else 'not found (will initialize on demand)')
logger.info("App module loaded successfully - services will initialize on demand")
logger.info("=" * 80)

if __name__ == '__main__':
    port = Config.PORT
    logger.info("Starting Stock Watchlist App...")
    logger.info("Using Firebase for authentication and data storage")
    logger.info("Starting real-time price updates...")
    logger.info("Server running on port: %s", port)
    logger.info("Debug mode: %s", Config.DEBUG)
    logger.info("Firebase project: %s", Config.FIREBASE_PROJECT_ID)
    logger.info("Environment: %s", 'production' if os.environ.get('RAILWAY_ENVIRONMENT') else 'development')

    try:
        if os.environ.get('RAILWAY_ENVIRONMENT'):
            logger.info("Railway environment detected - skipping background tasks")
        else:
            logger.info("Starting price update task...")
            start_price_updates()
            logger.info("Price update task started")

        logger.info("Starting Flask server...")
        socketio.run(app, debug=Config.DEBUG, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)

    except Exception as e:
        logger.error("Failed to start server: %s", e)
        import traceback
        logger.error("Startup traceback: %s", traceback.format_exc())
        raise

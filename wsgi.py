from app import create_app
from app.extensions import socketio
from app.config import Config

app = create_app()

if __name__ == '__main__':
    import os
    import logging
    from app.socketio_events import start_price_updates

    logger = logging.getLogger(__name__)
    port = Config.PORT

    logger.info("Starting Stock Watchlist App...")
    logger.info("Using Firebase for authentication and data storage")
    logger.info("Starting real-time price updates...")
    logger.info("Server running on port: %s", port)
    logger.info("Debug mode: %s", Config.DEBUG)
    logger.info("Firebase project: %s", Config.FIREBASE_PROJECT_ID)
    logger.info("Environment: %s",
                'production' if os.environ.get('RAILWAY_ENVIRONMENT') else 'development')

    try:
        if os.environ.get('RAILWAY_ENVIRONMENT'):
            logger.info("Railway environment detected - skipping background tasks")
        else:
            logger.info("Starting price update task...")
            start_price_updates()
            logger.info("Price update task started")

        logger.info("Starting Flask server...")
        socketio.run(app, debug=Config.DEBUG, host='0.0.0.0', port=port,
                     allow_unsafe_werkzeug=True)

    except Exception as e:
        logger.error("Failed to start server: %s", e)
        import traceback
        logger.error("Startup traceback: %s", traceback.format_exc())
        raise

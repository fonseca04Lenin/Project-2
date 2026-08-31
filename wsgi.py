from app import create_app
from app.extensions import socketio
from app.config import Config

app = create_app()

if __name__ == '__main__':
    import logging

    logger = logging.getLogger(__name__)
    port = Config.PORT

    logger.info("Starting Stock Watchlist App on port %s (debug=%s)", port, Config.DEBUG)

    try:
        socketio.run(app, debug=Config.DEBUG, host='0.0.0.0', port=port,
                     allow_unsafe_werkzeug=True)
    except Exception as e:
        logger.error("Failed to start server: %s", e, exc_info=True)
        raise

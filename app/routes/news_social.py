import logging
import os

from flask import Blueprint, request, jsonify

from app.services.services import news_api, stocktwits_api

logger = logging.getLogger(__name__)

news_social_bp = Blueprint('news_social', __name__, url_prefix='/api')

_ALLOWED_ORIGINS = {
    "https://aistocksage.com",
    "https://www.aistocksage.com",
    "https://stock-watchlist-frontend.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
}


@news_social_bp.route('/news/market')
def get_market_news():
    try:
        limit = min(request.args.get('limit', 10, type=int), 20)
        page = max(request.args.get('page', 1, type=int), 1)
        query = request.args.get('q', '').strip()
        news = news_api.get_market_news(limit=limit, query=query if query else None, page=page)
        return jsonify({'articles': news, 'page': page, 'limit': limit})
    except Exception as e:
        return jsonify({'error': 'Could not fetch market news'}), 500


# Major index symbols → human-readable news search terms.
# Finnhub company-news doesn't cover these; market news with a name query works.
_INDEX_NEWS_QUERIES = {
    '^GSPC': 'S&P 500',
    '^IXIC': 'Nasdaq Composite',
    '^DJI': 'Dow Jones',
    'GSPC': 'S&P 500',
    'IXIC': 'Nasdaq Composite',
    'DJI': 'Dow Jones',
}


@news_social_bp.route('/news/company/<symbol>')
def get_company_news(symbol):
    try:
        symbol = symbol.upper()
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 5, type=int)

        index_query = _INDEX_NEWS_QUERIES.get(symbol)
        if index_query:
            news = news_api.get_market_news(limit=limit, query=index_query, page=page)
        else:
            news = news_api.get_company_news(symbol, limit=limit, page=page)

        return jsonify({
            'articles': news,
            'page': page,
            'limit': limit,
            'hasMore': len(news) == limit
        })
    except Exception as e:
        return jsonify({'error': f'Could not fetch news for {symbol}'}), 500


@news_social_bp.route('/stocktwits/<symbol>', methods=['GET', 'OPTIONS'])
def get_stock_stocktwits(symbol):
    """Get recent Stocktwits messages for a stock"""
    if request.method == 'OPTIONS':
        response = jsonify()
        origin = request.headers.get('Origin', '')
        if origin and origin in _ALLOWED_ORIGINS:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-ID'
        return response

    try:
        symbol = symbol.upper()
        limit = request.args.get('limit', 15, type=int)
        max_id = request.args.get('max', None, type=int)

        if limit > 30:
            limit = 30

        result = stocktwits_api.get_stock_messages(symbol, limit=limit, max_id=max_id)

        return jsonify({
            'symbol': symbol,
            'messages': result.get('messages', []),
            'count': len(result.get('messages', [])),
            'cursor': result.get('cursor'),
            'has_more': result.get('has_more', False)
        })
    except Exception as e:
        return jsonify({
            'symbol': symbol,
            'messages': [],
            'count': 0,
            'cursor': None,
            'has_more': False,
            'error': 'Could not fetch social sentiment'
        }), 200


@news_social_bp.route('/stocktwits/<symbol>/sentiment', methods=['GET', 'OPTIONS'])
def get_stock_sentiment(symbol):
    """Get sentiment summary for a stock from Stocktwits"""
    if request.method == 'OPTIONS':
        response = jsonify()
        origin = request.headers.get('Origin', '')
        if origin and origin in _ALLOWED_ORIGINS:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-ID'
        return response

    try:
        symbol = symbol.upper()
        sentiment = stocktwits_api.get_symbol_sentiment(symbol)

        if sentiment:
            return jsonify(sentiment)
        else:
            return jsonify({
                'symbol': symbol,
                'sentiment': None,
                'error': 'Sentiment data not available'
            })
    except Exception as e:
        logger.error("Error fetching sentiment for %s: %s", symbol, e)
        return jsonify({
            'symbol': symbol,
            'sentiment': None,
            'error': 'Could not fetch sentiment'
        })


@news_social_bp.route('/stocktwits/trending', methods=['GET', 'OPTIONS'])
def get_trending_stocktwits():
    """Get trending symbols on Stocktwits"""
    if request.method == 'OPTIONS':
        response = jsonify()
        origin = request.headers.get('Origin', '')
        if origin and origin in _ALLOWED_ORIGINS:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-ID'
        return response

    try:
        limit = request.args.get('limit', 10, type=int)
        trending = stocktwits_api.get_trending_symbols(limit=limit)

        return jsonify({
            'trending': trending,
            'count': len(trending)
        })
    except Exception as e:
        logger.error("Error fetching trending: %s", e)
        return jsonify({
            'trending': [],
            'count': 0,
            'error': 'Could not fetch trending symbols'
        })

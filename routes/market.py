import logging
import os
import re
from datetime import datetime, timedelta, timezone

try:
    import zoneinfo
except ImportError:
    try:
        from backports import zoneinfo
    except ImportError:
        zoneinfo = None

from flask import Blueprint, request, jsonify

from services import (
    authenticate_request, ensure_watchlist_service,
    yahoo_finance_api, finnhub_api,
)

logger = logging.getLogger(__name__)

market_bp = Blueprint('market', __name__, url_prefix='/api')

# Cache for market data (10 minute TTL)
_market_data_cache = {
    'top_movers': {'data': None, 'timestamp': None},
    'sector_performance': {'data': None, 'timestamp': None}
}
_CACHE_TTL_SECONDS = 600


def _is_cache_valid(cache_key):
    cache = _market_data_cache.get(cache_key, {})
    if cache.get('data') is None or cache.get('timestamp') is None:
        return False
    age = (datetime.now() - cache['timestamp']).total_seconds()
    return age < _CACHE_TTL_SECONDS


def generate_ai_reasons_for_movers(movers):
    """Generate AI explanations for why stocks are moving"""
    try:
        from chat_service import ChatService
        chat_svc = ChatService()

        stocks_info = "\n".join([
            f"- {m['symbol']} ({m['sector']}): {'+' if m['change'] >= 0 else ''}{m['change']}% at ${m['price']}"
            for m in movers
        ])

        prompt = f"""For each of these top moving stocks today, provide a brief 1-sentence explanation of why it might be moving. Be specific and mention likely catalysts like earnings, news, sector trends, or market conditions. Keep each explanation under 20 words.

{stocks_info}

Format your response as:
SYMBOL: reason
(one per line, no extra text)"""

        response = chat_svc.generate_simple_response(prompt)

        reasons = {}
        for line in response.strip().split('\n'):
            if ':' in line:
                parts = line.split(':', 1)
                symbol = parts[0].strip().upper()
                reason = parts[1].strip() if len(parts) > 1 else ''
                reasons[symbol] = reason

        for mover in movers:
            mover['ai_reason'] = reasons.get(mover['symbol'], '')

        logger.info("Generated AI reasons for %s movers", len(reasons))
        return movers

    except Exception as e:
        logger.error("Failed to generate AI reasons: %s", e)
        return movers


def get_real_top_movers():
    """Fetch real top movers using batch download (FAST)"""
    if _is_cache_valid('top_movers'):
        logger.debug("Using cached top movers data")
        return _market_data_cache['top_movers']['data']

    try:
        import yfinance as yf

        stock_universe = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD',
            'JPM', 'BAC', 'XOM', 'JNJ', 'V', 'WMT', 'DIS', 'NFLX'
        ]

        sector_map = {
            'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology',
            'AMZN': 'Consumer Cyclical', 'META': 'Technology', 'TSLA': 'Consumer Cyclical',
            'NVDA': 'Technology', 'AMD': 'Technology', 'JPM': 'Financial Services',
            'BAC': 'Financial Services', 'XOM': 'Energy', 'JNJ': 'Healthcare',
            'V': 'Financial Services', 'WMT': 'Consumer Defensive', 'DIS': 'Communication Services',
            'NFLX': 'Communication Services'
        }

        logger.info("Fetching top movers for %s stocks (batch)...", len(stock_universe))
        data = yf.download(stock_universe, period='5d', progress=False, threads=True)

        top_movers = []
        for symbol in stock_universe:
            try:
                if symbol in data['Close'].columns:
                    closes = data['Close'][symbol].dropna()
                    if len(closes) >= 2:
                        first_close = closes.iloc[0]
                        last_close = closes.iloc[-1]
                        pct_change = ((last_close - first_close) / first_close) * 100

                        top_movers.append({
                            'symbol': symbol,
                            'change': round(pct_change, 2),
                            'sector': sector_map.get(symbol, 'Unknown'),
                            'price': round(last_close, 2)
                        })
            except Exception:
                continue

        top_movers.sort(key=lambda x: abs(x['change']), reverse=True)
        result = top_movers[:5]

        result = generate_ai_reasons_for_movers(result)

        _market_data_cache['top_movers'] = {'data': result, 'timestamp': datetime.now()}
        logger.info("Cached top movers: %s", [m['symbol'] for m in result])

        return result

    except Exception as e:
        logger.error("Error fetching top movers: %s", e)
        return [
            {'symbol': 'NVDA', 'change': 8.5, 'sector': 'Technology', 'price': 950.00, 'ai_reason': 'Strong AI chip demand and data center growth driving momentum.'},
            {'symbol': 'TSLA', 'change': 5.2, 'sector': 'Consumer Cyclical', 'price': 250.00, 'ai_reason': 'EV delivery numbers exceeded expectations this quarter.'},
            {'symbol': 'META', 'change': 4.8, 'sector': 'Technology', 'price': 500.00, 'ai_reason': 'Ad revenue growth and AI investments boosting investor confidence.'},
            {'symbol': 'AAPL', 'change': -2.1, 'sector': 'Technology', 'price': 180.00, 'ai_reason': 'iPhone sales concerns in China weighing on shares.'},
            {'symbol': 'GOOGL', 'change': 3.3, 'sector': 'Technology', 'price': 175.00, 'ai_reason': 'Cloud growth and AI search integration driving gains.'}
        ]


def get_real_sector_performance():
    """Fetch real sector performance using batch download (FAST)"""
    if _is_cache_valid('sector_performance'):
        logger.debug("Using cached sector performance data")
        return _market_data_cache['sector_performance']['data']

    try:
        import yfinance as yf

        sector_etfs = {
            'XLK': 'Technology', 'XLF': 'Financials', 'XLE': 'Energy',
            'XLV': 'Healthcare', 'XLY': 'Consumer Discretionary',
            'XLP': 'Consumer Staples', 'XLI': 'Industrials',
            'XLB': 'Materials', 'XLU': 'Utilities',
            'XLRE': 'Real Estate', 'XLC': 'Communication Services'
        }

        symbols = list(sector_etfs.keys())

        logger.info("Fetching sector performance for %s ETFs (batch)...", len(symbols))
        data = yf.download(symbols, period='5d', progress=False, threads=True)

        sector_performance = []
        for symbol, sector_name in sector_etfs.items():
            try:
                if symbol in data['Close'].columns:
                    closes = data['Close'][symbol].dropna()
                    if len(closes) >= 2:
                        first_close = closes.iloc[0]
                        last_close = closes.iloc[-1]
                        pct_change = ((last_close - first_close) / first_close) * 100

                        sector_performance.append({
                            'name': sector_name,
                            'change': round(pct_change, 2),
                            'symbol': symbol
                        })
            except Exception:
                continue

        sector_performance.sort(key=lambda x: x['change'], reverse=True)

        _market_data_cache['sector_performance'] = {'data': sector_performance, 'timestamp': datetime.now()}
        logger.info("Cached sector performance: %s sectors", len(sector_performance))

        return sector_performance

    except Exception as e:
        logger.error("Error fetching sector performance: %s", e)
        return [
            {'name': 'Technology', 'change': 3.5, 'symbol': 'XLK'},
            {'name': 'Energy', 'change': 2.8, 'symbol': 'XLE'},
            {'name': 'Healthcare', 'change': 1.5, 'symbol': 'XLV'},
            {'name': 'Financials', 'change': -0.5, 'symbol': 'XLF'},
            {'name': 'Consumer Discretionary', 'change': 1.2, 'symbol': 'XLY'}
        ]


@market_bp.route('/market-status')
def market_status():
    """Get market status using Eastern Time"""
    origin = request.headers.get('Origin', '')
    logger.debug("GET /api/market-status request from origin: %s", origin)

    try:
        if zoneinfo:
            try:
                et_tz = zoneinfo.ZoneInfo("America/New_York")
            except:
                et_tz = timezone(timedelta(hours=-4))
        else:
            et_tz = timezone(timedelta(hours=-4))

        now_et = datetime.now(et_tz)

        is_weekday = now_et.weekday() < 5
        current_time = now_et.time()
        market_open_time = now_et.replace(hour=9, minute=30, second=0, microsecond=0).time()
        market_close_time = now_et.replace(hour=16, minute=0, second=0, microsecond=0).time()

        is_market_hours = market_open_time <= current_time <= market_close_time
        is_open = is_weekday and is_market_hours

        return jsonify({
            'isOpen': is_open,
            'is_open': is_open,
            'status': 'Market is Open' if is_open else 'Market is Closed'
        })
    except Exception as e:
        logger.error("Error in market_status endpoint: %s", e)
        return jsonify({
            'isOpen': False,
            'is_open': False,
            'status': 'Market status unknown'
        }), 500


@market_bp.route('/market/analysis')
def get_market_analysis():
    """Get AI-generated market analysis with trends and insights"""
    top_movers = get_real_top_movers()
    sector_performance = get_real_sector_performance()

    market_data = {
        'topMovers': top_movers,
        'upcomingEvents': [
            {'title': 'Federal Reserve Meeting', 'date': 'Next Week'},
            {'title': 'CPI Data Release', 'date': 'Thursday'},
            {'title': 'Tech Earnings Season', 'date': 'This Week'},
            {'title': 'Jobs Report', 'date': 'Friday'},
            {'title': 'GDP Report', 'date': 'Next Month'}
        ],
        'sectorPerformance': sector_performance
    }

    try:
        import requests as http_requests

        prompt = """You are a professional financial analyst writing a weekly market update.

Write a market analysis covering:
- Current market trends and what's driving them
- Notable sector performance
- Key economic factors affecting markets
- What investors should watch for

IMPORTANT RULES:
- Do NOT include specific dates, years, or quarters in your response
- Use phrases like "this week", "recently", "currently" instead of dates
- Do NOT write things like "Q4 2024" or "January 2025" - avoid all specific dates
- Write in flowing paragraphs, no bullet points or headers
- Be specific about sectors and market movements
- Write approximately 180 words"""

        groq_api_key = os.environ.get('GROQ_API_KEY')
        if not groq_api_key:
            raise Exception("GROQ_API_KEY not configured")

        groq_response = http_requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {groq_api_key}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'llama-3.3-70b-versatile',
                'messages': [{'role': 'user', 'content': prompt}],
                'temperature': 0.5,
                'max_tokens': 500
            },
            timeout=30
        )
        groq_response.raise_for_status()
        groq_data = groq_response.json()
        analysis_text = groq_data['choices'][0]['message']['content'].strip()

        if analysis_text:
            analysis_text = analysis_text.replace(' undefined', '')
            analysis_text = analysis_text.replace('undefined ', '')
            analysis_text = analysis_text.replace('undefined', '')

        return jsonify({
            'analysis': analysis_text,
            'data': market_data,
            'generated_at': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error("Error generating AI market analysis: %s", e)
        import traceback
        traceback.print_exc()

        current_date = datetime.now().strftime('%B %d, %Y')
        fallback_analysis = f"""Markets are showing mixed signals this week as investors digest recent economic data and corporate earnings. Technology stocks continue to drive momentum, while traditional sectors face pressure from interest rate uncertainty. The Federal Reserve's policy stance remains a key focus, with traders closely monitoring inflation indicators and employment data. Geopolitical developments are contributing to volatility, particularly in energy and defense sectors. Consumer spending data suggests resilience despite the higher rate environment, though some analysts express caution about valuations in growth stocks. Looking ahead, watch for upcoming Fed commentary and any surprises in the quarterly earnings reports. Market participants should stay alert to shifts in sector leadership and potential policy changes that could influence near-term direction. As of {current_date}, the overall market sentiment leans cautiously optimistic."""

        return jsonify({
            'analysis': fallback_analysis,
            'data': market_data,
            'generated_at': datetime.now().isoformat(),
            'fallback': True
        })


@market_bp.route('/market/top-performer', methods=['GET'])
def get_top_performer_by_date():
    """Return the top performing stock for a specific date within a universe."""
    try:
        date_str = request.args.get('date', '').strip()
        universe = (request.args.get('universe', 'watchlist') or 'watchlist').lower()
        limit_param = request.args.get('limit')
        try:
            limit = int(limit_param) if limit_param is not None else None
        except Exception:
            limit = None

        if not date_str:
            return jsonify({'error': 'date is required (YYYY-MM-DD)'}), 400

        symbols = []
        universe_used = universe

        if universe == 'watchlist':
            user = authenticate_request()
            if not user:
                return jsonify({'error': 'Authentication required'}), 401
            try:
                service = ensure_watchlist_service()
                wl = service.get_watchlist(user.id, limit=500)
            except RuntimeError as e:
                return jsonify({'error': str(e)}), 503
            symbols = [item.get('symbol') or item.get('id') for item in wl if item.get('symbol') or item.get('id')]
            symbols = [s.upper() for s in symbols if isinstance(s, str) and len(s) > 0]
        elif universe == 'sp500':
            constituents = finnhub_api.get_index_constituents('^GSPC') or []
            symbols = [s.upper() for s in constituents if isinstance(s, str) and len(s) > 0]
            if not symbols:
                symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AVGO', 'BRK.B', 'LLY']
        else:
            return jsonify({'error': "universe must be 'watchlist' or 'sp500'"}), 400

        if limit:
            symbols = symbols[:max(1, limit)]

        if not symbols:
            return jsonify({'error': f'No symbols found for universe {universe_used}'}), 404

        best_symbol = None
        best_change = None

        evaluated = 0
        for symbol in symbols:
            try:
                change_pct = yahoo_finance_api.get_day_change_percent(symbol, date_str)
                evaluated += 1
                if best_change is None or change_pct > best_change:
                    best_change = change_pct
                    best_symbol = symbol
            except Exception:
                continue

        if best_symbol is None:
            return jsonify({'error': 'Could not compute top performer for requested date'}), 502

        return jsonify({
            'date': date_str,
            'universe': universe_used,
            'top_symbol': best_symbol,
            'top_change_percent': round(best_change, 2),
            'evaluated_count': evaluated,
            'source': 'Yahoo Finance via yfinance'
        })
    except Exception as e:
        return jsonify({'error': f'Failed to compute top performer: {str(e)}'}), 500


@market_bp.route('/market/earnings')
def get_earnings_calendar():
    """Get upcoming earnings dates from Finnhub API"""
    try:
        earnings_raw = finnhub_api.get_earnings_calendar()

        if not earnings_raw:
            return jsonify(_get_fallback_earnings())

        earnings_data = []
        for item in earnings_raw:
            earnings_data.append({
                'symbol': item.get('symbol', ''),
                'company_name': item.get('symbol', ''),
                'earnings_date': item.get('date', ''),
                'estimate': item.get('epsEstimate'),
                'actual': item.get('epsActual'),
                'surprise': item.get('epsSurprise'),
                'quarter': item.get('quarter'),
                'year': item.get('year'),
                'hour': item.get('hour', '')
            })

        earnings_data.sort(key=lambda x: x['earnings_date'])

        return jsonify(earnings_data if earnings_data else _get_fallback_earnings())
    except Exception as e:
        logger.error("Error fetching earnings calendar: %s", e)
        return jsonify(_get_fallback_earnings())


def _get_fallback_earnings():
    base_date = datetime.now()
    return [
        {'symbol': 'AAPL', 'company_name': 'Apple Inc.', 'earnings_date': (base_date + timedelta(days=7)).strftime('%Y-%m-%d'), 'estimate': 2.35},
        {'symbol': 'MSFT', 'company_name': 'Microsoft Corp.', 'earnings_date': (base_date + timedelta(days=10)).strftime('%Y-%m-%d'), 'estimate': 2.82},
        {'symbol': 'GOOGL', 'company_name': 'Alphabet Inc.', 'earnings_date': (base_date + timedelta(days=14)).strftime('%Y-%m-%d'), 'estimate': 1.45},
        {'symbol': 'AMZN', 'company_name': 'Amazon.com Inc.', 'earnings_date': (base_date + timedelta(days=18)).strftime('%Y-%m-%d'), 'estimate': 0.98},
        {'symbol': 'NVDA', 'company_name': 'NVIDIA Corp.', 'earnings_date': (base_date + timedelta(days=21)).strftime('%Y-%m-%d'), 'estimate': 4.12},
    ]


@market_bp.route('/market/insider-trading/<symbol>')
def get_insider_trading(symbol):
    """Get recent insider trading data for a symbol from Finnhub API"""
    try:
        symbol = symbol.upper()

        transactions_raw = finnhub_api.get_insider_transactions(symbol)

        if not transactions_raw:
            return jsonify(_get_fallback_insider(symbol))

        insider_data = []
        for item in transactions_raw:
            change = item.get('change', 0)
            transaction_type = 'BUY' if change > 0 else 'SELL'

            insider_data.append({
                'filer_name': item.get('name', 'Unknown'),
                'title': item.get('position', ''),
                'transaction_type': transaction_type,
                'shares': abs(change) if change else item.get('share', 0),
                'price': item.get('transactionPrice', 0),
                'date': item.get('transactionDate', ''),
                'value': abs(change * item.get('transactionPrice', 0)) if change and item.get('transactionPrice') else 0,
                'filing_date': item.get('filingDate', '')
            })

        insider_data.sort(key=lambda x: x['date'], reverse=True)

        return jsonify(insider_data if insider_data else _get_fallback_insider(symbol))
    except Exception as e:
        logger.error("Error fetching insider trading for %s: %s", symbol, e)
        return jsonify(_get_fallback_insider(symbol))


def _get_fallback_insider(symbol):
    base_date = datetime.now()
    return [
        {'filer_name': 'Executive Officer', 'title': 'CEO', 'transaction_type': 'SELL', 'shares': 50000, 'price': 175.50, 'date': (base_date - timedelta(days=3)).strftime('%Y-%m-%d')},
        {'filer_name': 'Board Member', 'title': 'Director', 'transaction_type': 'BUY', 'shares': 10000, 'price': 172.25, 'date': (base_date - timedelta(days=7)).strftime('%Y-%m-%d')},
        {'filer_name': 'CFO', 'title': 'Chief Financial Officer', 'transaction_type': 'SELL', 'shares': 25000, 'price': 178.00, 'date': (base_date - timedelta(days=14)).strftime('%Y-%m-%d')},
    ]


@market_bp.route('/market/analyst-ratings/<symbol>')
def get_analyst_ratings(symbol):
    """Get current analyst ratings and price targets from Finnhub API"""
    try:
        symbol = symbol.upper()

        recommendations = finnhub_api.get_recommendation_trends(symbol)
        price_target_data = finnhub_api.get_price_target(symbol) or {}

        if not recommendations:
            return jsonify(_get_fallback_analyst(symbol))

        latest = recommendations[0] if recommendations else {}

        strong_buy = latest.get('strongBuy', 0)
        buy = latest.get('buy', 0)
        hold = latest.get('hold', 0)
        sell = latest.get('sell', 0)
        strong_sell = latest.get('strongSell', 0)

        total_buy = strong_buy + buy
        total_sell = sell + strong_sell

        if total_buy > total_sell and total_buy > hold:
            consensus = 'BUY'
        elif total_sell > total_buy and total_sell > hold:
            consensus = 'SELL'
        else:
            consensus = 'HOLD'

        analysts = []
        period = latest.get('period', '')

        if strong_buy > 0:
            analysts.append({'firm': f'{strong_buy} Analysts', 'rating': 'STRONG BUY', 'date': period})
        if buy > 0:
            analysts.append({'firm': f'{buy} Analysts', 'rating': 'BUY', 'date': period})
        if hold > 0:
            analysts.append({'firm': f'{hold} Analysts', 'rating': 'HOLD', 'date': period})
        if sell > 0:
            analysts.append({'firm': f'{sell} Analysts', 'rating': 'SELL', 'date': period})
        if strong_sell > 0:
            analysts.append({'firm': f'{strong_sell} Analysts', 'rating': 'STRONG SELL', 'date': period})

        for analyst in analysts:
            analyst['price_target'] = price_target_data.get('targetMean')

        ratings_data = {
            'symbol': symbol,
            'consensus_rating': consensus,
            'price_target_avg': price_target_data.get('targetMean'),
            'price_target_high': price_target_data.get('targetHigh'),
            'price_target_low': price_target_data.get('targetLow'),
            'analysts': analysts,
            'total_analysts': strong_buy + buy + hold + sell + strong_sell,
            'period': period
        }

        return jsonify(ratings_data)
    except Exception as e:
        logger.error("Error fetching analyst ratings for %s: %s", symbol, e)
        return jsonify(_get_fallback_analyst(symbol))


def _get_fallback_analyst(symbol):
    current_date = datetime.now().strftime('%Y-%m-%d')
    return {
        'symbol': symbol,
        'consensus_rating': 'BUY',
        'price_target_avg': 185.00,
        'price_target_high': 210.00,
        'price_target_low': 160.00,
        'analysts': [
            {'firm': '8 Analysts', 'rating': 'STRONG BUY', 'date': current_date, 'price_target': 185.00},
            {'firm': '12 Analysts', 'rating': 'BUY', 'date': current_date, 'price_target': 185.00},
            {'firm': '5 Analysts', 'rating': 'HOLD', 'date': current_date, 'price_target': 185.00},
            {'firm': '2 Analysts', 'rating': 'SELL', 'date': current_date, 'price_target': 185.00},
        ],
        'total_analysts': 27,
        'period': current_date
    }


@market_bp.route('/sectors/batch', methods=['POST'])
def get_sectors_batch():
    """Get sector information for multiple stocks at once"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.get_json()
    symbols = data.get('symbols', [])

    if not symbols or not isinstance(symbols, list):
        return jsonify({'error': 'Please provide a list of symbols'}), 400

    sectors = {}
    for symbol in symbols:
        try:
            symbol = symbol.upper()
            info = yahoo_finance_api.get_info(symbol)
            sector = info.get('sector', 'Other')
            if sector and sector != 'None' and sector != '-':
                sectors[symbol] = sector
            else:
                sectors[symbol] = 'Other'
        except Exception as e:
            logger.error("Error getting sector for %s: %s", symbol, e)
            sectors[symbol] = 'Other'

    return jsonify(sectors)


@market_bp.route('/stocks/correlation', methods=['POST'])
def get_stock_correlation():
    """Calculate correlation matrix for a set of stocks using 90 days of historical data"""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.get_json()
    symbols = data.get('symbols', [])

    if not symbols or not isinstance(symbols, list):
        return jsonify({'error': 'Please provide a list of symbols'}), 400

    if len(symbols) > 20:
        return jsonify({'error': 'Maximum 20 symbols allowed'}), 400

    if len(symbols) < 2:
        return jsonify({'error': 'At least 2 symbols required'}), 400

    import pandas as pd

    clean_symbols = []
    for s in symbols:
        s = s.upper().strip()
        if re.match(r'^[A-Z]{1,5}$', s):
            clean_symbols.append(s)

    if len(clean_symbols) < 2:
        return jsonify({'error': 'At least 2 valid symbols required'}), 400

    try:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')

        price_series = {}
        for sym in clean_symbols:
            hist = yahoo_finance_api.get_historical_data(sym, start_date, end_date)
            if hist and len(hist) > 0:
                price_series[sym] = {entry['date']: entry['close'] for entry in hist}

        if len(price_series) < 2:
            return jsonify({'error': 'Not enough historical data available'}), 400

        df = pd.DataFrame(price_series)
        df = df.dropna()

        if len(df) < 5:
            return jsonify({'error': 'Not enough overlapping trading days'}), 400

        corr = df.corr()
        result_symbols = list(corr.columns)
        matrix = corr.values.tolist()

        return jsonify({
            'symbols': result_symbols,
            'matrix': matrix,
            'period': '90d'
        })

    except Exception as e:
        logger.error("Error calculating correlation: %s", e)
        return jsonify({'error': 'Failed to calculate correlation'}), 500

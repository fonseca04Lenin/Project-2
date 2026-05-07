import logging
import re
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_login import current_user

from app.services.stock import Stock
from app.services.firebase_service import FirebaseService
from app.services.services import (
    authenticate_request, yahoo_finance_api, company_info_service,
    get_stock_with_fallback, get_stock_alpaca_only, stock_symbol_index_service,
)

logger = logging.getLogger(__name__)

stock_data_bp = Blueprint('stock_data', __name__, url_prefix='/api')


_COMPANY_NETWORK_LIBRARY = {
    'F': {
        'brands': ['Ford', 'Lincoln', 'Ford Pro', 'Ford Credit'],
        'business_lines': ['Cars', 'Trucks', 'Commercial Vehicles', 'EVs', 'Parts & Service'],
    },
    'AAPL': {
        'brands': ['iPhone', 'Mac', 'iPad', 'Apple Watch', 'AirPods'],
        'business_lines': ['Devices', 'Services', 'Wearables', 'Software'],
    },
    'MSFT': {
        'brands': ['Windows', 'Microsoft 365', 'Azure', 'LinkedIn', 'Xbox', 'GitHub'],
        'business_lines': ['Cloud', 'Productivity Software', 'Gaming', 'Enterprise Platforms'],
    },
    'GOOGL': {
        'brands': ['Google', 'YouTube', 'Android', 'Google Cloud', 'Waymo'],
        'business_lines': ['Search', 'Advertising', 'Cloud', 'Consumer Platforms'],
    },
    'GOOG': {
        'brands': ['Google', 'YouTube', 'Android', 'Google Cloud', 'Waymo'],
        'business_lines': ['Search', 'Advertising', 'Cloud', 'Consumer Platforms'],
    },
    'AMZN': {
        'brands': ['Amazon', 'AWS', 'Prime Video', 'Whole Foods', 'Audible'],
        'business_lines': ['E-commerce', 'Cloud', 'Streaming', 'Logistics'],
    },
    'META': {
        'brands': ['Facebook', 'Instagram', 'WhatsApp', 'Messenger', 'Reality Labs'],
        'business_lines': ['Social Platforms', 'Advertising', 'Messaging', 'XR Hardware'],
    },
    'DIS': {
        'brands': ['Disney', 'Pixar', 'Marvel', 'ESPN', 'Hulu'],
        'business_lines': ['Studios', 'Streaming', 'Sports Media', 'Parks & Experiences'],
    },
    'NKE': {
        'brands': ['Nike', 'Jordan', 'Converse'],
        'business_lines': ['Footwear', 'Apparel', 'Equipment', 'Direct-to-Consumer'],
    },
    'TSLA': {
        'brands': ['Tesla', 'Supercharger', 'Powerwall', 'Megapack'],
        'business_lines': ['EVs', 'Energy Storage', 'Solar', 'Charging Network'],
    },
    'NVDA': {
        'brands': ['GeForce', 'CUDA', 'DGX', 'Mellanox'],
        'business_lines': ['Data Center', 'Gaming', 'Automotive', 'Networking'],
    },
}

_DESCRIPTION_KEYWORDS = {
    'cloud': 'Cloud',
    'advertis': 'Advertising',
    'stream': 'Streaming',
    'truck': 'Trucks',
    'car': 'Cars',
    'commercial vehicle': 'Commercial Vehicles',
    'electric vehicle': 'EVs',
    'semiconductor': 'Semiconductors',
    'chip': 'Chips',
    'footwear': 'Footwear',
    'apparel': 'Apparel',
    'software': 'Software',
    'gaming': 'Gaming',
    'search': 'Search',
    'social': 'Social Platforms',
    'payments': 'Payments',
    'logistics': 'Logistics',
    'energy storage': 'Energy Storage',
    'solar': 'Solar',
    'theme park': 'Parks & Experiences',
}


def _slugify_network_id(prefix: str, label: str) -> str:
    base = re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-')
    return f'{prefix}-{base or "node"}'


def _append_network_node(nodes, seen, label: str, node_type: str, source: str):
    cleaned = (label or '').strip()
    if not cleaned or cleaned == '-':
        return
    key = cleaned.lower()
    if key in seen:
        return
    seen.add(key)
    nodes.append({
        'id': _slugify_network_id(node_type, cleaned),
        'label': cleaned,
        'type': node_type,
        'source': source,
    })


def _derive_business_lines(symbol: str, description: str):
    curated = _COMPANY_NETWORK_LIBRARY.get(symbol, {})
    if curated.get('business_lines'):
        return curated['business_lines'], 'curated'

    found = []
    lowered = (description or '').lower()
    for needle, label in _DESCRIPTION_KEYWORDS.items():
        if needle in lowered and label not in found:
            found.append(label)
        if len(found) >= 4:
            break
    return found, 'derived'


def _derive_brand_nodes(symbol: str):
    curated = _COMPANY_NETWORK_LIBRARY.get(symbol, {})
    return curated.get('brands', []), 'curated' if curated.get('brands') else 'none'


def _build_company_network_payload(symbol: str, stock_name: str, info: dict, company_info: dict):
    description = (company_info.get('description') or info.get('longBusinessSummary') or '').strip()
    sector = info.get('sector') if info else None
    industry = info.get('industry') if info else None
    headquarters = company_info.get('headquarters')

    nodes = []
    seen = set()

    _append_network_node(nodes, seen, sector, 'sector', 'yahoo')
    _append_network_node(nodes, seen, industry, 'industry', 'yahoo')

    if headquarters and headquarters != '-':
        city_label = headquarters.split(',')[0].strip()
        _append_network_node(nodes, seen, city_label, 'location', 'yahoo')

    business_lines, business_source = _derive_business_lines(symbol, description)
    for line in business_lines[:5]:
        _append_network_node(nodes, seen, line, 'business_line', business_source)

    brands, brand_source = _derive_brand_nodes(symbol)
    for brand in brands[:6]:
        _append_network_node(nodes, seen, brand, 'brand', brand_source)

    if len(nodes) < 4 and description:
        fragments = re.split(r'[.;]', description)
        for fragment in fragments:
            phrase = fragment.strip()
            if len(phrase) < 12:
                continue
            phrase = re.sub(r'^(the company|it|we)\s+', '', phrase, flags=re.IGNORECASE)
            phrase = phrase[:42].rsplit(' ', 1)[0] if len(phrase) > 42 else phrase
            _append_network_node(nodes, seen, phrase, 'business_line', 'description')
            if len(nodes) >= 6:
                break

    return {
        'symbol': symbol,
        'name': stock_name,
        'description': description or '-',
        'sector': sector or '-',
        'industry': industry or '-',
        'headquarters': headquarters or '-',
        'website': company_info.get('website', '-'),
        'network': {
            'center': {
                'symbol': symbol,
                'label': stock_name,
            },
            'nodes': nodes[:10],
        }
    }


@stock_data_bp.route('/search', methods=['POST'])
def search_stock():
    from app.utils.validation import sanitize_stock_symbol, validate_stock_symbol

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request data'}), 400

    symbol = data.get('symbol', '').strip()

    if not symbol:
        return jsonify({'error': 'Please enter a stock symbol'}), 400

    symbol = sanitize_stock_symbol(symbol)

    if not validate_stock_symbol(symbol):
        return jsonify({'error': 'Invalid stock symbol format'}), 400

    is_watchlist_request = request.headers.get('X-Request-Source') == 'watchlist' or \
                          request.referrer and 'dashboard' in request.referrer.lower()

    if is_watchlist_request:
        stock, api_used = get_stock_alpaca_only(symbol)
        if not stock:
            logger.warning("[WATCHLIST] Alpaca failed for %s, returning error (no Yahoo fallback)", symbol)
            return jsonify({'error': f'Stock "{symbol}" not available via Alpaca API. Please check the symbol or try again later.'}), 404
    else:
        stock, api_used = get_stock_with_fallback(symbol)
    if not stock:
        logger.warning("[API] Could not retrieve stock data for %s", symbol)
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404
    if stock.name and 'not found' not in stock.name.lower():
        yesterday_date = datetime.now() - timedelta(days=5)
        start_date = yesterday_date.strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")
        historical_data = yahoo_finance_api.get_historical_data(symbol, start_date, end_date)

        prev_close = 0.0
        if historical_data and len(historical_data) >= 2:
            prev_close = historical_data[-2]['close']
        elif historical_data and len(historical_data) == 1:
            prev_close = historical_data[0]['close']

        price_change = stock.price - prev_close if prev_close > 0 else 0
        price_change_percent = (price_change / prev_close * 100) if prev_close > 0 else 0

        alerts_data = []
        if current_user.is_authenticated:
            triggered_alerts = FirebaseService.check_triggered_alerts(current_user.id, symbol, stock.price)
            alerts_data = [{
                'target_price': float(alert['target_price']),
                'alert_type': alert['alert_type']
            } for alert in triggered_alerts]

        response_data = {
            'symbol': stock.symbol,
            'name': stock.name,
            'price': stock.price,
            'previousClose': prev_close,
            'priceChange': price_change,
            'priceChangePercent': price_change_percent,
            'triggeredAlerts': alerts_data,
            'apiSource': api_used if api_used else 'yahoo'
        }

        response = jsonify(response_data)
        api_source_header = api_used.upper() if api_used else 'YAHOO'
        response.headers['X-API-Source'] = api_source_header
        logger.debug("[API] Sending response for %s with apiSource: %s, header: %s", symbol, response_data['apiSource'], api_source_header)
        return response
    else:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404


@stock_data_bp.route('/stock/<symbol>', methods=['GET'])
def get_stock_data(symbol):
    """Get current stock data for a specific symbol (used by watchlist price updates)"""
    from app.utils.validation import sanitize_stock_symbol, validate_stock_symbol

    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    symbol = sanitize_stock_symbol(symbol)

    if not symbol:
        return jsonify({'error': 'Please provide a stock symbol'}), 400

    if not validate_stock_symbol(symbol):
        return jsonify({'error': 'Invalid stock symbol format'}), 400

    try:
        logger.debug("[WATCHLIST] /api/stock/%s - Using Alpaca-only for watchlist price update", symbol)
        stock, api_used = get_stock_alpaca_only(symbol)
        if not stock:
            return jsonify({'error': f'Stock "{symbol}" not available via Alpaca API. Please check the symbol or try again later.'}), 404

        if stock.name and 'not found' not in stock.name.lower():
            yesterday_date = datetime.now() - timedelta(days=5)
            start_date = yesterday_date.strftime("%Y-%m-%d")
            end_date = datetime.now().strftime("%Y-%m-%d")
            historical_data = yahoo_finance_api.get_historical_data(symbol, start_date, end_date)

            prev_close = 0.0
            if historical_data and len(historical_data) >= 2:
                prev_close = historical_data[-2]['close']
            elif historical_data and len(historical_data) == 1:
                prev_close = historical_data[0]['close']

            price_change = stock.price - prev_close if prev_close > 0 else 0
            price_change_percent = (price_change / prev_close * 100) if prev_close > 0 else 0

            alerts_data = []
            if user:
                triggered_alerts = FirebaseService.check_triggered_alerts(user.id, symbol, stock.price)
                alerts_data = [{
                    'target_price': float(alert['target_price']),
                    'alert_type': alert['alert_type']
                } for alert in triggered_alerts]

            return jsonify({
                'symbol': stock.symbol,
                'name': stock.name,
                'price': stock.price,
                'previousClose': prev_close,
                'priceChange': price_change,
                'priceChangePercent': price_change_percent,
                'triggeredAlerts': alerts_data,
                'last_updated': datetime.now().isoformat()
            })
        else:
            return jsonify({'error': f'Stock "{symbol}" not found'}), 404

    except Exception as e:
        logger.error("Error fetching stock data for %s: %s", symbol, e)
        return jsonify({'error': 'Failed to fetch stock data'}), 500


@stock_data_bp.route('/search/stocks', methods=['GET'])
def search_stocks():
    """Search stocks by name or symbol with caching and rate limiting protection"""
    from app.utils.validation import sanitize_search_query, validate_search_length

    query = request.args.get('q', '').strip()

    if not query:
        return jsonify({'error': 'Please provide a search query'}), 400

    if not validate_search_length(query, min_length=2, max_length=100):
        return jsonify({'error': 'Search query must be between 2 and 100 characters'}), 400

    query = sanitize_search_query(query)

    try:
        source = 'symbol_index'
        search_results = stock_symbol_index_service.search(query, limit=10)
        if not search_results:
            search_results = yahoo_finance_api.search_stocks(query, limit=10)
            source = 'yahoo_fallback'

        if search_results:
            return jsonify({
                'results': search_results,
                'query': query,
                'source': source
            })
        else:
            return jsonify({
                'results': [],
                'query': query,
                'message': f'No stocks found for "{query}"'
            })

    except Exception as e:
        logger.error("Error searching stocks for '%s': %s", query, e)
        return jsonify({
            'results': [],
            'query': query,
            'message': 'Search temporarily unavailable. Please try again in a moment.',
            'error': str(e)
        })


_CEO_INDEX = [
    {"ceo_name": "Tim Cook", "company_name": "Apple Inc.", "symbol": "AAPL"},
    {"ceo_name": "Satya Nadella", "company_name": "Microsoft Corporation", "symbol": "MSFT"},
    {"ceo_name": "Sundar Pichai", "company_name": "Alphabet Inc.", "symbol": "GOOGL"},
    {"ceo_name": "Andy Jassy", "company_name": "Amazon.com Inc.", "symbol": "AMZN"},
    {"ceo_name": "Elon Musk", "company_name": "Tesla Inc.", "symbol": "TSLA"},
    {"ceo_name": "Mark Zuckerberg", "company_name": "Meta Platforms Inc.", "symbol": "META"},
    {"ceo_name": "Jensen Huang", "company_name": "NVIDIA Corporation", "symbol": "NVDA"},
    {"ceo_name": "Jamie Dimon", "company_name": "JPMorgan Chase & Co.", "symbol": "JPM"},
    {"ceo_name": "Warren Buffett", "company_name": "Berkshire Hathaway Inc.", "symbol": "BRK-B"},
    {"ceo_name": "Brian Moynihan", "company_name": "Bank of America Corporation", "symbol": "BAC"},
    {"ceo_name": "Reed Hastings", "company_name": "Netflix Inc.", "symbol": "NFLX"},
    {"ceo_name": "Ted Sarandos", "company_name": "Netflix Inc.", "symbol": "NFLX"},
    {"ceo_name": "Lisa Su", "company_name": "Advanced Micro Devices Inc.", "symbol": "AMD"},
    {"ceo_name": "Pat Gelsinger", "company_name": "Intel Corporation", "symbol": "INTC"},
    {"ceo_name": "Bob Iger", "company_name": "The Walt Disney Company", "symbol": "DIS"},
    {"ceo_name": "Doug McMillon", "company_name": "Walmart Inc.", "symbol": "WMT"},
    {"ceo_name": "Mary Barra", "company_name": "General Motors Company", "symbol": "GM"},
    {"ceo_name": "Jim Farley", "company_name": "Ford Motor Company", "symbol": "F"},
    {"ceo_name": "David Zaslav", "company_name": "Warner Bros. Discovery", "symbol": "WBD"},
    {"ceo_name": "Arvind Krishna", "company_name": "International Business Machines Corporation", "symbol": "IBM"},
    {"ceo_name": "Safra Catz", "company_name": "Oracle Corporation", "symbol": "ORCL"},
    {"ceo_name": "Marc Benioff", "company_name": "Salesforce Inc.", "symbol": "CRM"},
    {"ceo_name": "Shantanu Narayen", "company_name": "Adobe Inc.", "symbol": "ADBE"},
    {"ceo_name": "Dara Khosrowshahi", "company_name": "Uber Technologies Inc.", "symbol": "UBER"},
    {"ceo_name": "Brian Chesky", "company_name": "Airbnb Inc.", "symbol": "ABNB"},
    {"ceo_name": "Tony Xu", "company_name": "DoorDash Inc.", "symbol": "DASH"},
    {"ceo_name": "Whitney Wolfe Herd", "company_name": "Bumble Inc.", "symbol": "BMBL"},
    {"ceo_name": "Ryan Cohen", "company_name": "GameStop Corp.", "symbol": "GME"},
    {"ceo_name": "Dave Calhoun", "company_name": "The Boeing Company", "symbol": "BA"},
    {"ceo_name": "Kelly Ortberg", "company_name": "The Boeing Company", "symbol": "BA"},
    {"ceo_name": "James Quincey", "company_name": "The Coca-Cola Company", "symbol": "KO"},
    {"ceo_name": "Ramon Laguarta", "company_name": "PepsiCo Inc.", "symbol": "PEP"},
    {"ceo_name": "Andi Owen", "company_name": "MillerKnoll Inc.", "symbol": "MLKN"},
    {"ceo_name": "Charles Scharf", "company_name": "Wells Fargo & Company", "symbol": "WFC"},
    {"ceo_name": "Jane Fraser", "company_name": "Citigroup Inc.", "symbol": "C"},
    {"ceo_name": "James Gorman", "company_name": "Morgan Stanley", "symbol": "MS"},
    {"ceo_name": "David Solomon", "company_name": "The Goldman Sachs Group Inc.", "symbol": "GS"},
    {"ceo_name": "Larry Fink", "company_name": "BlackRock Inc.", "symbol": "BLK"},
    {"ceo_name": "Vlad Tenev", "company_name": "Robinhood Markets Inc.", "symbol": "HOOD"},
    {"ceo_name": "Sam Altman", "company_name": "OpenAI", "symbol": ""},
    {"ceo_name": "George Kurtz", "company_name": "CrowdStrike Holdings Inc.", "symbol": "CRWD"},
    {"ceo_name": "Nikesh Arora", "company_name": "Palo Alto Networks Inc.", "symbol": "PANW"},
    {"ceo_name": "Hock Tan", "company_name": "Broadcom Inc.", "symbol": "AVGO"},
    {"ceo_name": "Cristiano Amon", "company_name": "Qualcomm Inc.", "symbol": "QCOM"},
    {"ceo_name": "Chuck Robbins", "company_name": "Cisco Systems Inc.", "symbol": "CSCO"},
    {"ceo_name": "Jayshree Ullal", "company_name": "Arista Networks Inc.", "symbol": "ANET"},
    {"ceo_name": "John Donahoe", "company_name": "Nike Inc.", "symbol": "NKE"},
    {"ceo_name": "Elliott Hill", "company_name": "Nike Inc.", "symbol": "NKE"},
    {"ceo_name": "Brian Cornell", "company_name": "Target Corporation", "symbol": "TGT"},
    {"ceo_name": "Andy Jassy", "company_name": "Amazon Web Services", "symbol": "AMZN"},
    {"ceo_name": "Piyush Gupta", "company_name": "DBS Group Holdings", "symbol": "DBSDY"},
    {"ceo_name": "Tobi Lutke", "company_name": "Shopify Inc.", "symbol": "SHOP"},
    {"ceo_name": "Harley Finkelstein", "company_name": "Shopify Inc.", "symbol": "SHOP"},
    {"ceo_name": "Frank Slootman", "company_name": "Snowflake Inc.", "symbol": "SNOW"},
    {"ceo_name": "Sridhar Ramaswamy", "company_name": "Snowflake Inc.", "symbol": "SNOW"},
    {"ceo_name": "George Jaber", "company_name": "Palantir Technologies Inc.", "symbol": "PLTR"},
    {"ceo_name": "Alex Karp", "company_name": "Palantir Technologies Inc.", "symbol": "PLTR"},
    {"ceo_name": "Peter Thiel", "company_name": "Palantir Technologies Inc.", "symbol": "PLTR"},
    {"ceo_name": "Bill McDermott", "company_name": "ServiceNow Inc.", "symbol": "NOW"},
    {"ceo_name": "Aneel Bhusri", "company_name": "Workday Inc.", "symbol": "WDAY"},
    {"ceo_name": "Zoom", "company_name": "Zoom Video Communications Inc.", "symbol": "ZM"},
    {"ceo_name": "Eric Yuan", "company_name": "Zoom Video Communications Inc.", "symbol": "ZM"},
    {"ceo_name": "Olivier Le Peuch", "company_name": "SLB", "symbol": "SLB"},
    {"ceo_name": "Ryan Petersen", "company_name": "Flexport", "symbol": ""},
    {"ceo_name": "Patrick Collison", "company_name": "Stripe", "symbol": ""},
    {"ceo_name": "Daniel Ek", "company_name": "Spotify Technology S.A.", "symbol": "SPOT"},
    {"ceo_name": "Robert Ford", "company_name": "Abbott Laboratories", "symbol": "ABT"},
    {"ceo_name": "Chris Wanstrath", "company_name": "GitHub", "symbol": ""},
    {"ceo_name": "Thomas Kurian", "company_name": "Google Cloud", "symbol": "GOOGL"},
    {"ceo_name": "Adam Selipsky", "company_name": "Amazon Web Services", "symbol": "AMZN"},
    {"ceo_name": "Reshma Kewalramani", "company_name": "Vertex Pharmaceuticals Inc.", "symbol": "VRTX"},
    {"ceo_name": "Albert Bourla", "company_name": "Pfizer Inc.", "symbol": "PFE"},
    {"ceo_name": "Joaquin Duato", "company_name": "Johnson & Johnson", "symbol": "JNJ"},
    {"ceo_name": "Giovanni Caforio", "company_name": "Bristol-Myers Squibb Company", "symbol": "BMY"},
    {"ceo_name": "Christopher Boerner", "company_name": "Bristol-Myers Squibb Company", "symbol": "BMY"},
    {"ceo_name": "Stephane Bancel", "company_name": "Moderna Inc.", "symbol": "MRNA"},
    {"ceo_name": "Kevin Johnson", "company_name": "Starbucks Corporation", "symbol": "SBUX"},
    {"ceo_name": "Laxman Narasimhan", "company_name": "Starbucks Corporation", "symbol": "SBUX"},
    {"ceo_name": "Brian Niccol", "company_name": "Starbucks Corporation", "symbol": "SBUX"},
    {"ceo_name": "David Ricks", "company_name": "Eli Lilly and Company", "symbol": "LLY"},
    {"ceo_name": "Vas Narasimhan", "company_name": "Novartis AG", "symbol": "NVS"},
    {"ceo_name": "Pascal Soriot", "company_name": "AstraZeneca PLC", "symbol": "AZN"},
    {"ceo_name": "Emma Walmsley", "company_name": "GSK plc", "symbol": "GSK"},
    {"ceo_name": "Elon Musk", "company_name": "SpaceX", "symbol": ""},
    {"ceo_name": "Elon Musk", "company_name": "X Corp.", "symbol": ""},
]


@stock_data_bp.route('/search/ceo', methods=['GET'])
def search_ceo():
    """Search CEOs by name with fuzzy matching"""
    query = request.args.get('q', '').strip().lower()
    if not query or len(query) < 2:
        return jsonify([])

    results = []
    for entry in _CEO_INDEX:
        name_lower = entry['ceo_name'].lower()
        if query in name_lower or name_lower.startswith(query):
            results.append(entry)
        elif all(part in name_lower for part in query.split()):
            results.append(entry)

    # Deduplicate by (ceo_name, symbol) while preserving order
    seen = set()
    deduped = []
    for r in results:
        key = (r['ceo_name'], r['symbol'])
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    return jsonify(deduped[:5])


@stock_data_bp.route('/search/companies', methods=['GET'])
def search_companies():
    """Search companies by name with enhanced results and rate limiting protection"""
    from app.utils.validation import sanitize_search_query, validate_search_length

    query = request.args.get('q', '').strip()

    if not query:
        return jsonify({'error': 'Please provide a search query'}), 400

    if not validate_search_length(query, min_length=2, max_length=100):
        return jsonify({'error': 'Search query must be between 2 and 100 characters'}), 400

    query = sanitize_search_query(query)

    try:
        source = 'symbol_index'
        search_results = stock_symbol_index_service.search(query, limit=15)
        if not search_results:
            search_results = yahoo_finance_api.search_stocks(query, limit=15)
            source = 'yahoo_fallback'

        enhanced_results = []
        for result in search_results:
            enhanced_result = {
                'symbol': result.get('symbol', ''),
                'name': result.get('name', ''),
                'exchange': result.get('exchange', ''),
                'type': result.get('type', ''),
                'display_name': f"{result.get('symbol', '')} - {result.get('name', '')}"
            }
            enhanced_results.append(enhanced_result)

        return jsonify({
            'results': enhanced_results,
            'query': query,
            'source': source
        })

    except Exception as e:
        logger.error("Error searching companies for '%s': %s", query, e)
        return jsonify({
            'results': [],
            'query': query,
            'message': 'Company search temporarily unavailable. Please try again in a moment.',
            'error': str(e)
        })


@stock_data_bp.route('/chart/<symbol>')
def get_chart_data(symbol):
    symbol = symbol.upper()

    time_range = request.args.get('range', '1M')

    now = datetime.now()
    interval = '1d'
    period = None

    if time_range == '1D':
        period = '1d'
        interval = '5m'
    elif time_range == '5D':
        period = '5d'
        interval = '15m'
    elif time_range == '1W' or time_range == '7d':
        period = '5d'
        interval = '30m'
    elif time_range == '1M' or time_range == '30d':
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        interval = '1d'
    elif time_range == '3M':
        start_date = (now - timedelta(days=90)).strftime("%Y-%m-%d")
        interval = '1d'
    elif time_range == '6M':
        start_date = (now - timedelta(days=180)).strftime("%Y-%m-%d")
        interval = '1d'
    elif time_range == 'YTD':
        start_date = f"{now.year}-01-01"
        interval = '1d'
    elif time_range == '1Y' or time_range == '1y':
        start_date = (now - timedelta(days=365)).strftime("%Y-%m-%d")
        interval = '1d'
    elif time_range == '5Y' or time_range == '5y':
        start_date = (now - timedelta(days=1825)).strftime("%Y-%m-%d")
        interval = '1wk'
    elif time_range == 'ALL' or time_range == 'all':
        start_date = (now - timedelta(days=3650)).strftime("%Y-%m-%d")
        interval = '1mo'
    else:
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        interval = '1d'

    end_date = now.strftime("%Y-%m-%d")

    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)

        if period:
            hist = ticker.history(period=period, interval=interval)
        else:
            hist = ticker.history(start=start_date, end=end_date, interval=interval)

        if hist.empty:
            if period:
                hist = ticker.history(period='5d', interval='1d')
            if hist.empty:
                return jsonify({'error': 'No chart data available'}), 404

        ohlcv_data = []
        for date, row in hist.iterrows():
            if interval in ['5m', '15m', '30m', '1h']:
                date_str = date.strftime('%Y-%m-%d %H:%M')
            else:
                date_str = date.strftime('%Y-%m-%d')

            ohlcv_data.append({
                'date': date_str,
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close']),
                'volume': int(row['Volume']) if row['Volume'] else 0
            })

        if ohlcv_data:
            return jsonify(ohlcv_data)
        else:
            return jsonify({'error': 'No chart data available'}), 404

    except Exception as e:
        logger.error("[Chart API] Error fetching data for %s: %s", symbol, e)
        stock = Stock(symbol, yahoo_finance_api)
        dates, prices = stock.retrieve_historical_data(
            (now - timedelta(days=30)).strftime("%Y-%m-%d"),
            end_date
        )
        if dates and prices:
            chart_data = [{'date': date, 'price': price, 'close': price, 'open': price, 'high': price, 'low': price, 'volume': 0} for date, price in zip(dates, prices)]
            return jsonify(chart_data)
        return jsonify({'error': 'Could not retrieve chart data'}), 404


@stock_data_bp.route('/company/<symbol>')
def get_company_info(symbol):
    symbol = symbol.upper()
    stock, api_used = get_stock_with_fallback(symbol)
    if not stock:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

    info = yahoo_finance_api.get_info(symbol)
    company_info = company_info_service.get_comprehensive_info(symbol, yahoo_info=info)

    price_change_percent = 0
    price_change = 0
    if info:
        current_price = info.get('currentPrice') or info.get('regularMarketPrice') or stock.price
        prev_close = info.get('regularMarketPreviousClose') or info.get('previousClose')
        if current_price and prev_close and prev_close != 0:
            price_change = current_price - prev_close
            price_change_percent = (price_change / prev_close) * 100

    if stock.name and 'not found' not in stock.name.lower():
        return jsonify({
            'symbol': stock.symbol,
            'name': stock.name,
            'ceo': company_info.get('ceo', '-'),
            'description': company_info.get('description', '-'),
            'price': stock.price,
            'priceChange': price_change,
            'priceChangePercent': price_change_percent,
            'marketCap': company_info.get('marketCap', '-'),
            'peRatio': company_info.get('peRatio', '-'),
            'dividendYield': company_info.get('dividendYield', '-'),
            'website': company_info.get('website', '-'),
            'headquarters': company_info.get('headquarters', '-'),
            'high52Week': info.get('fiftyTwoWeekHigh') if info else None,
            'low52Week': info.get('fiftyTwoWeekLow') if info else None,
            'volume': info.get('volume') or info.get('regularMarketVolume') if info else None,
            'sector': info.get('sector', '-') if info else '-',
            'industry': info.get('industry', '-') if info else '-',
        })
    else:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404


@stock_data_bp.route('/company/<symbol>/network')
def get_company_network(symbol):
    symbol = symbol.upper()
    stock, api_used = get_stock_with_fallback(symbol)
    if not stock:
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

    info = yahoo_finance_api.get_info(symbol) or {}
    company_info = company_info_service.get_comprehensive_info(symbol, yahoo_info=info)

    if not stock.name or 'not found' in stock.name.lower():
        return jsonify({'error': f'Stock "{symbol}" not found'}), 404

    payload = _build_company_network_payload(symbol, stock.name, info, company_info)
    payload['apiSource'] = api_used if api_used else 'yahoo'
    return jsonify(payload)

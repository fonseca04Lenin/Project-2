import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Blueprint, jsonify

logger = logging.getLogger(__name__)

map_companies_bp = Blueprint('map_companies', __name__, url_prefix='/api/companies')

# Comprehensive list of S&P 500 and major publicly traded companies
MAJOR_COMPANY_SYMBOLS = [
    # Technology
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'CRM',
    'ORCL', 'ADBE', 'CSCO', 'IBM', 'QCOM', 'TXN', 'AVGO', 'NOW', 'INTU', 'AMAT',
    'MU', 'LRCX', 'ADI', 'SNPS', 'CDNS', 'KLAC', 'MRVL', 'NXPI', 'FTNT', 'PANW',
    'CRWD', 'ZS', 'DDOG', 'SNOW', 'NET', 'PLTR', 'SHOP', 'SQ', 'PYPL', 'COIN',
    'DELL', 'HPQ', 'HPE', 'NTAP', 'WDC', 'STX',
    # Finance
    'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'SCHW', 'AXP', 'V', 'MA',
    'COF', 'USB', 'PNC', 'TFC', 'BK', 'STT', 'FITB', 'RF', 'CFG', 'KEY',
    'HBAN', 'MTB', 'ZION', 'CMA', 'ALLY', 'DFS', 'SYF', 'AIG', 'MET', 'PRU',
    'AFL', 'TRV', 'CB', 'ALL', 'PGR', 'HIG', 'BRK-B', 'CME', 'ICE', 'NDAQ',
    # Healthcare
    'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'DHR', 'BMY',
    'AMGN', 'GILD', 'CVS', 'CI', 'ELV', 'HUM', 'CNC', 'MCK', 'CAH', 'ABC',
    'ISRG', 'SYK', 'MDT', 'BSX', 'EW', 'ZBH', 'BDX', 'BAX', 'HOLX', 'ALGN',
    'DXCM', 'IDXX', 'IQV', 'MTD', 'A', 'WAT', 'PKI', 'TECH', 'BIO', 'MRNA',
    'REGN', 'VRTX', 'BIIB',
    # Consumer & Retail
    'WMT', 'COST', 'HD', 'LOW', 'TGT', 'AMZN', 'DG', 'DLTR', 'KR', 'SYY',
    'SBUX', 'MCD', 'YUM', 'CMG', 'DPZ', 'QSR', 'DRI', 'TXRH', 'EAT',
    'NKE', 'LULU', 'VFC', 'PVH', 'RL', 'TPR', 'CPRI', 'HBI', 'UAA',
    'PG', 'KO', 'PEP', 'MDLZ', 'KHC', 'GIS', 'K', 'CAG', 'SJM', 'MKC',
    'HSY', 'TSN', 'HRL', 'CPB', 'CLX', 'CL', 'CHD', 'EL', 'KMB',
    # Energy
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'PXD',
    'DVN', 'HES', 'FANG', 'HAL', 'BKR', 'KMI', 'WMB', 'OKE', 'TRGP', 'LNG',
    # Industrial
    'BA', 'CAT', 'GE', 'HON', 'MMM', 'UPS', 'FDX', 'UNP', 'CSX', 'NSC',
    'DE', 'LMT', 'RTX', 'NOC', 'GD', 'TXT', 'HII', 'LHX', 'LDOS', 'BAH',
    'EMR', 'ROK', 'ETN', 'ITW', 'PH', 'IR', 'DOV', 'SWK', 'FAST', 'GWW',
    # Telecom & Media
    'T', 'VZ', 'TMUS', 'CMCSA', 'DIS', 'NFLX', 'WBD', 'PARA', 'FOX', 'FOXA',
    'CHTR', 'DISH', 'LUMN', 'FYBR', 'LSXMA', 'LSXMK', 'SIRI',
    # Real Estate
    'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'O', 'WELL', 'DLR', 'AVB', 'EQR',
    'PSA', 'ARE', 'VTR', 'BXP', 'SLG', 'KIM', 'REG', 'HST', 'MAA', 'UDR',
    # Utilities
    'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'ED', 'WEC',
    'ES', 'DTE', 'PPL', 'FE', 'AEE', 'CMS', 'CNP', 'EVRG', 'NI', 'ATO',
]

# Cache for company locations (refresh every 24 hours)
_company_locations_cache = {'data': None, 'timestamp': None}


@map_companies_bp.route('/locations')
def get_company_locations():
    """Get locations of major publicly traded companies for the map feature"""
    global _company_locations_cache

    cache_valid = (
        _company_locations_cache['data'] is not None and
        _company_locations_cache['timestamp'] is not None and
        (datetime.now() - _company_locations_cache['timestamp']).total_seconds() < 86400
    )

    if cache_valid:
        return jsonify(_company_locations_cache['data'])

    try:
        import yfinance as yf

        companies = []
        failed = []

        def fetch_company_info(symbol):
            try:
                ticker = yf.Ticker(symbol)
                info = ticker.info

                if not info:
                    return None

                city = info.get('city', '')
                state = info.get('state', '')
                country = info.get('country', '')

                if country and country != 'United States':
                    return None
                if not city:
                    return None

                location_str = f"{city}, {state}" if state else city

                return {
                    'symbol': symbol.replace('-', '.'),
                    'name': info.get('longName', info.get('shortName', symbol)),
                    'city': location_str,
                    'sector': info.get('sector', 'Other'),
                    'industry': info.get('industry', ''),
                    'marketCap': info.get('marketCap', 0),
                    'website': info.get('website', ''),
                    'rawCity': city,
                    'rawState': state
                }
            except Exception as e:
                print(f"Error fetching {symbol}: {e}")
                return None

        symbols_to_fetch = MAJOR_COMPANY_SYMBOLS[:100]

        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_symbol = {executor.submit(fetch_company_info, symbol): symbol for symbol in symbols_to_fetch}

            for future in as_completed(future_to_symbol):
                symbol = future_to_symbol[future]
                try:
                    result = future.result()
                    if result:
                        companies.append(result)
                except Exception as e:
                    failed.append(symbol)

        us_city_coords = {
            'Cupertino': (37.3230, -122.0322), 'Mountain View': (37.3861, -122.0839),
            'Menlo Park': (37.4530, -122.1817), 'Redmond': (47.6740, -122.1215),
            'Seattle': (47.6062, -122.3321), 'Santa Clara': (37.3541, -121.9552),
            'Austin': (30.2672, -97.7431), 'Los Gatos': (37.2358, -121.9624),
            'San Francisco': (37.7749, -122.4194), 'San Jose': (37.3382, -121.8863),
            'New York': (40.7128, -74.0060), 'Charlotte': (35.2271, -80.8431),
            'Armonk': (41.1264, -73.7140), 'Purchase': (41.0407, -73.7146),
            'Omaha': (41.2565, -95.9345), 'Minneapolis': (44.9778, -93.2650),
            'Minnetonka': (44.9211, -93.4687), 'Chicago': (41.8781, -87.6298),
            'North Chicago': (42.3256, -87.8412), 'Rahway': (40.6079, -74.2776),
            'Indianapolis': (39.7684, -86.1581), 'Waltham': (42.3765, -71.2356),
            'Abbott Park': (42.2847, -87.8510), 'Bentonville': (36.3729, -94.2088),
            'Cincinnati': (39.1031, -84.5120), 'Atlanta': (33.7490, -84.3880),
            'Beaverton': (45.4871, -122.8037), 'Houston': (29.7604, -95.3698),
            'Irving': (32.8140, -96.9489), 'San Ramon': (37.7799, -121.9780),
            'Deerfield': (42.1711, -87.8445), 'Boston': (42.3601, -71.0589),
            'St. Paul': (44.9537, -93.0900), 'Memphis': (35.1495, -90.0490),
            'Dallas': (32.7767, -96.7970), 'Burbank': (34.1808, -118.3090),
            'Philadelphia': (39.9526, -75.1652), 'New Brunswick': (40.4862, -74.4518),
            'Denver': (39.7392, -104.9903), 'Englewood': (39.6478, -104.9878),
            'Kansas City': (39.0997, -94.5786), 'Des Moines': (41.5868, -93.6250),
            'Moline': (41.5067, -90.5151), 'Decatur': (39.8403, -88.9548),
            'Boise': (43.6150, -116.2023), 'Issaquah': (47.5301, -122.0326),
            'Richmond': (37.5407, -77.4360), 'Detroit': (42.3314, -83.0458),
            'Columbus': (39.9612, -82.9988), 'Phoenix': (33.4484, -112.0740),
            'Tempe': (33.4255, -111.9400), 'Scottsdale': (33.4942, -111.9261),
            'Las Vegas': (36.1699, -115.1398), 'Salt Lake City': (40.7608, -111.8910),
            'Portland': (45.5152, -122.6784), 'Los Angeles': (34.0522, -118.2437),
            'San Diego': (32.7157, -117.1611), 'Irvine': (33.6846, -117.8265),
            'Palo Alto': (37.4419, -122.1430), 'Sunnyvale': (37.3688, -122.0363),
            'Fremont': (37.5485, -121.9886), 'Oakland': (37.8044, -122.2712),
            'Sacramento': (38.5816, -121.4944), 'Miami': (25.7617, -80.1918),
            'Tampa': (27.9506, -82.4572), 'Orlando': (28.5383, -81.3792),
            'Jacksonville': (30.3322, -81.6557), 'Nashville': (36.1627, -86.7816),
            'Louisville': (38.2527, -85.7585), 'Milwaukee': (43.0389, -87.9065),
            'Cleveland': (41.4993, -81.6944), 'Pittsburgh': (40.4406, -79.9959),
            'Baltimore': (39.2904, -76.6122), 'Washington': (38.9072, -77.0369),
            'Reston': (38.9586, -77.3570), 'McLean': (38.9339, -77.1773),
            'Arlington': (38.8816, -77.0910), 'Bethesda': (38.9847, -77.0947),
            'Hartford': (41.7658, -72.6734), 'Stamford': (41.0534, -73.5387),
            'Newark': (40.7357, -74.1724), 'Parsippany': (40.8579, -74.4260),
            'Basking Ridge': (40.7068, -74.5513), 'Princeton': (40.3573, -74.6672),
            'Providence': (41.8240, -71.4128), 'Albany': (42.6526, -73.7562),
            'Buffalo': (42.8864, -78.8784), 'Rochester': (43.1566, -77.6088),
            'Syracuse': (43.0481, -76.1474), 'Wilmington': (39.7391, -75.5398),
            'Plano': (33.0198, -96.6989), 'Fort Worth': (32.7555, -97.3308),
            'San Antonio': (29.4241, -98.4936), 'El Paso': (31.7619, -106.4850),
        }

        for company in companies:
            raw_city = company.get('rawCity', '')
            if raw_city in us_city_coords:
                company['lat'], company['lng'] = us_city_coords[raw_city]
            else:
                for city_name, coords in us_city_coords.items():
                    if city_name.lower() in raw_city.lower() or raw_city.lower() in city_name.lower():
                        company['lat'], company['lng'] = coords
                        break

            company.pop('rawCity', None)
            company.pop('rawState', None)

        companies = [c for c in companies if 'lat' in c and 'lng' in c]
        companies.sort(key=lambda x: x.get('marketCap', 0), reverse=True)

        _company_locations_cache['data'] = {
            'companies': companies,
            'count': len(companies),
            'timestamp': datetime.now().isoformat()
        }
        _company_locations_cache['timestamp'] = datetime.now()

        print(f"Fetched {len(companies)} company locations, {len(failed)} failed")

        return jsonify(_company_locations_cache['data'])

    except Exception as e:
        print(f"Error fetching company locations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'companies': [],
            'count': 0,
            'error': 'Failed to fetch company locations'
        })

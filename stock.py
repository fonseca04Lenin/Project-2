import yfinance as yf
from datetime import datetime, timedelta
import json
import requests

class NewsAPI:
    def __init__(self):
        # NewsAPI.org API key
        self.api_key = '4ba3e56d52e54611b9485cdd2e28e679'

    def get_market_news(self, limit=10):
        """Get general market news using NewsAPI.org"""
        try:
            url = 'https://newsapi.org/v2/top-headlines'
            params = {
                'category': 'business',
                'language': 'en',
                'pageSize': limit,
                'apiKey': self.api_key
            }
            response = requests.get(url, params=params, timeout=3)
            if response.status_code == 200:
                articles = response.json().get('articles', [])
                news_items = []
                for article in articles:
                    news_items.append({
                        'title': article.get('title', ''),
                        'link': article.get('url', ''),
                        'published_at': article.get('publishedAt', ''),
                        'source': article.get('source', {}).get('name', 'NewsAPI'),
                        'summary': article.get('description', '')
                    })
                return news_items
            else:
                print(f"NewsAPI.org error: {response.status_code} {response.text}")
                return self.get_fallback_news()
        except Exception as e:
            print(f"Error fetching market news from NewsAPI.org: {e}")
            return self.get_fallback_news()

    def get_company_news(self, symbol, limit=5):
        """Get news for a specific company using NewsAPI.org"""
        try:
            # First try to get company name from Yahoo Finance for better search results
            stock = yf.Ticker(symbol)
            info = stock.info
            company_name = info.get('longName', '') or info.get('shortName', '') or symbol
            
            # Search for news using NewsAPI.org
            url = 'https://newsapi.org/v2/everything'
            params = {
                'q': f'"{company_name}" OR "{symbol}"',
                'language': 'en',
                'sortBy': 'publishedAt',
                'pageSize': limit,
                'apiKey': self.api_key
            }
            
            response = requests.get(url, params=params, timeout=3)
            if response.status_code == 200:
                articles = response.json().get('articles', [])
                news_items = []
                for article in articles:
                    news_items.append({
                        'title': article.get('title', ''),
                        'link': article.get('url', ''),
                        'published_at': article.get('publishedAt', ''),
                        'source': article.get('source', {}).get('name', 'NewsAPI'),
                        'summary': article.get('description', '')
                    })
                return news_items
            else:
                print(f"NewsAPI.org error for {symbol}: {response.status_code} {response.text}")
                return []
                
        except Exception as e:
            print(f"Error fetching company news for {symbol}: {e}")
            return []

    def get_fallback_news(self):
        """Fallback news when API fails"""
        return [
            {
                'title': 'Market Update: Stocks Show Mixed Performance',
                'link': '#',
                'published_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
                'source': 'Market Update'
            },
            {
                'title': 'Trading Volume Remains Strong Across Major Indices',
                'link': '#',
                'published_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
                'source': 'Market Update'
            }
        ]

class YahooFinanceAPI:
    def __init__(self):
        pass

    def search_stocks(self, query, limit=10):
        """Search stocks by name or symbol using Yahoo Finance public search API with fallback"""
        try:
            url = "https://query2.finance.yahoo.com/v1/finance/search"
            params = {
                "q": query,
                "quotesCount": limit,
                "newsCount": 0,
                "lang": "en"
            }
            response = requests.get(url, params=params, timeout=3)
            if response.status_code == 200:
                data = response.json()
                results = []
                for item in data.get("quotes", []):
                    if item.get("quoteType") in ["EQUITY", "ETF", "MUTUALFUND"]:
                        results.append({
                            "symbol": item.get("symbol", ""),
                            "name": item.get("shortname", "") or item.get("longname", ""),
                            "exchange": item.get("exchange", ""),
                            "type": item.get("quoteType", "")
                        })
                
                # If Yahoo API returns no results, use fallback
                if not results:
                    print("Yahoo API returned no results, using fallback")
                    return self.get_fallback_search_results(query, limit)
                return results
            else:
                print("Yahoo search error:", response.text)
                return self.get_fallback_search_results(query, limit)
        except Exception as e:
            print("Error searching stocks:", e)
            return self.get_fallback_search_results(query, limit)

    def get_fallback_search_results(self, query, limit=10):
        """Fallback search using predefined popular stocks"""
        query_lower = query.lower()
        
        # Popular stocks database
        popular_stocks = [
            {"symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "GOOGL", "name": "Alphabet Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "AMZN", "name": "Amazon.com Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "TSLA", "name": "Tesla Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "META", "name": "Meta Platforms Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "NFLX", "name": "Netflix Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "AMD", "name": "Advanced Micro Devices Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "INTC", "name": "Intel Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "CRM", "name": "Salesforce Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "ORCL", "name": "Oracle Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "ADBE", "name": "Adobe Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "PYPL", "name": "PayPal Holdings Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "SQ", "name": "Block Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "UBER", "name": "Uber Technologies Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "LYFT", "name": "Lyft Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "SPOT", "name": "Spotify Technology S.A.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "ZM", "name": "Zoom Video Communications Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "SHOP", "name": "Shopify Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "SNOW", "name": "Snowflake Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "PLTR", "name": "Palantir Technologies Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "COIN", "name": "Coinbase Global Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "ROKU", "name": "Roku Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "PINS", "name": "Pinterest Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "SNAP", "name": "Snap Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "TWTR", "name": "Twitter Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "DIS", "name": "Walt Disney Company", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "NKE", "name": "Nike Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "SBUX", "name": "Starbucks Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "MCD", "name": "McDonald's Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "KO", "name": "Coca-Cola Company", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "PEP", "name": "PepsiCo Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "PFE", "name": "Pfizer Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "JPM", "name": "JPMorgan Chase & Co.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "BAC", "name": "Bank of America Corp.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "WFC", "name": "Wells Fargo & Company", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "GS", "name": "Goldman Sachs Group Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "V", "name": "Visa Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "MA", "name": "Mastercard Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "HD", "name": "Home Depot Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "WMT", "name": "Walmart Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "TGT", "name": "Target Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "COST", "name": "Costco Wholesale Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "LLY", "name": "Eli Lilly and Company", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "UNH", "name": "UnitedHealth Group Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "ABBV", "name": "AbbVie Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "MRK", "name": "Merck & Co. Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "TMO", "name": "Thermo Fisher Scientific Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "ABT", "name": "Abbott Laboratories", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "DHR", "name": "Danaher Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "BMY", "name": "Bristol-Myers Squibb Company", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "PFE", "name": "Pfizer Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "AMGN", "name": "Amgen Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "GILD", "name": "Gilead Sciences Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "REGN", "name": "Regeneron Pharmaceuticals Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "BIIB", "name": "Biogen Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "VRTX", "name": "Vertex Pharmaceuticals Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "MRNA", "name": "Moderna Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "BIO", "name": "Bio-Rad Laboratories Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "ILMN", "name": "Illumina Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "ISRG", "name": "Intuitive Surgical Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "DXCM", "name": "DexCom Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "ALGN", "name": "Align Technology Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "IDXX", "name": "IDEXX Laboratories Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "WAT", "name": "Waters Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "MTD", "name": "Mettler-Toledo International Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "BRK.A", "name": "Berkshire Hathaway Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "BRK.B", "name": "Berkshire Hathaway Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "XOM", "name": "Exxon Mobil Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "CVX", "name": "Chevron Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "COP", "name": "ConocoPhillips", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "EOG", "name": "EOG Resources Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "SLB", "name": "Schlumberger Limited", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "HAL", "name": "Halliburton Company", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "BHP", "name": "BHP Group Limited", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "RIO", "name": "Rio Tinto Group", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "FCX", "name": "Freeport-McMoRan Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "NEM", "name": "Newmont Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "GOLD", "name": "Barrick Gold Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "AGN", "name": "Allergan plc", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "CELG", "name": "Celgene Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "ALXN", "name": "Alexion Pharmaceuticals Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "MYL", "name": "Mylan N.V.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "TEVA", "name": "Teva Pharmaceutical Industries Limited", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "PRGO", "name": "Perrigo Company plc", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "ENDP", "name": "Endo International plc", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "VRX", "name": "Valeant Pharmaceuticals International Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "MNK", "name": "Mallinckrodt plc", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "ACN", "name": "Accenture plc", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "IBM", "name": "International Business Machines Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "HPQ", "name": "HP Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "DELL", "name": "Dell Technologies Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "CSCO", "name": "Cisco Systems Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "AVGO", "name": "Broadcom Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "QCOM", "name": "QUALCOMM Incorporated", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "TXN", "name": "Texas Instruments Incorporated", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "MU", "name": "Micron Technology Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "KLAC", "name": "KLA Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "LRCX", "name": "Lam Research Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "AMAT", "name": "Applied Materials Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "ASML", "name": "ASML Holding N.V.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "TSM", "name": "Taiwan Semiconductor Manufacturing Company Limited", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "SMH", "name": "VanEck Vectors Semiconductor ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "SOXX", "name": "iShares PHLX Semiconductor ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "XLK", "name": "Technology Select Sector SPDR Fund", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "VGT", "name": "Vanguard Information Technology ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "QQQ", "name": "Invesco QQQ Trust", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "VOO", "name": "Vanguard S&P 500 ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "IVV", "name": "iShares Core S&P 500 ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "DIA", "name": "SPDR Dow Jones Industrial Average ETF Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "IWM", "name": "iShares Russell 2000 ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "VTI", "name": "Vanguard Total Stock Market ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "VEA", "name": "Vanguard FTSE Developed Markets ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "VWO", "name": "Vanguard FTSE Emerging Markets ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "EFA", "name": "iShares MSCI EAFE ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "EEM", "name": "iShares MSCI Emerging Markets ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "AGG", "name": "iShares Core U.S. Aggregate Bond ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "BND", "name": "Vanguard Total Bond Market ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "TLT", "name": "iShares 20+ Year Treasury Bond ETF", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "GLD", "name": "SPDR Gold Shares", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "SLV", "name": "iShares Silver Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "USO", "name": "United States Oil Fund LP", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "UNG", "name": "United States Natural Gas Fund LP", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "DBA", "name": "Invesco DB Agriculture Fund", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "DBC", "name": "Invesco DB Commodity Index Tracking Fund", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "UUP", "name": "Invesco DB US Dollar Index Bullish Fund", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "UUP", "name": "Invesco DB US Dollar Index Bullish Fund", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXY", "name": "Invesco CurrencyShares Japanese Yen Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXE", "name": "Invesco CurrencyShares Euro Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXB", "name": "Invesco CurrencyShares British Pound Sterling Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXC", "name": "Invesco CurrencyShares Canadian Dollar Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXA", "name": "Invesco CurrencyShares Australian Dollar Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXF", "name": "Invesco CurrencyShares Swiss Franc Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXS", "name": "Invesco CurrencyShares Swedish Krona Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXM", "name": "Invesco CurrencyShares Mexican Peso Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXZ", "name": "Invesco CurrencyShares New Zealand Dollar Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXO", "name": "Invesco CurrencyShares Norwegian Krone Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXH", "name": "Invesco CurrencyShares Hong Kong Dollar Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXK", "name": "Invesco CurrencyShares Danish Krone Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXU", "name": "Invesco CurrencyShares Russian Ruble Trust", "exchange": "NYSE", "type": "ETF"},
            {"symbol": "FXW", "name": "Invesco CurrencyShares Singapore Dollar Trust", "exchange": "NYSE", "type": "ETF"}
        ]
        
        # Filter stocks based on query
        results = []
        for stock in popular_stocks:
            if (query_lower in stock["symbol"].lower() or 
                query_lower in stock["name"].lower()):
                results.append(stock)
                if len(results) >= limit:
                    break
        
        return results

    def get_real_time_data(self, symbol):
        try:
            # Get stock data using yfinance
            stock = yf.Ticker(symbol)
            info = stock.info
            
            # Try different price fields in order of preference
            price = None
            if 'currentPrice' in info and info['currentPrice'] is not None:
                price = info['currentPrice']
            elif 'regularMarketPrice' in info and info['regularMarketPrice'] is not None:
                price = info['regularMarketPrice']
            elif 'regularMarketPreviousClose' in info and info['regularMarketPreviousClose'] is not None:
                price = info['regularMarketPreviousClose']
            
            # Get company name
            name = info.get('longName', symbol)
            if not name or name == symbol:
                name = info.get('shortName', symbol)
            
            if price is None:
                print(f"Could not find price data for {symbol}")
                return None
                
            return {
                'name': name,
                'price': float(price)
            }
                
        except Exception as e:
            print(f"Error retrieving real-time data for {symbol}: {e}")
            return None

    def get_info(self, symbol):
        try:
            stock = yf.Ticker(symbol)
            return stock.info
        except Exception as e:
            print(f"Error retrieving info for {symbol}: {e}")
            return {}

    def get_historical_data(self, symbol, start_date, end_date):
        try:
            # Get historical data using yfinance
            stock = yf.Ticker(symbol)
            hist = stock.history(start=start_date, end=end_date)
            
            if hist.empty:
                print(f"No historical data available for {symbol}")
                return None
            
            # Convert to the format expected by the original code
            historical_data = []
            
            for date, row in hist.iterrows():
                historical_data.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'close': float(row['Close'])
                })
            
            return historical_data
                
        except Exception as e:
            print(f"Error retrieving historical data for {symbol}: {e}")
            return None

class Stock:
    def __init__(self, symbol, api=None):
        self.symbol = symbol.upper()
        self.name = ""
        self.price = 0.0
        self.previous_price = 0.0
        self.api = api

    def retrieve_data(self):
        if not self.api:
            self.name = f"No API configured for {self.symbol}"
            return
            
        # Retrieve real-time data from API
        data = self.api.get_real_time_data(self.symbol)
        if data:
            self.name = data['name']
            self.previous_price = self.price
            self.price = data['price']
        else:
            self.name = f"Stock '{self.symbol}' not found"

    def retrieve_historical_data(self, start_date, end_date):
        if not self.api:
            return None, None
            
        # Retrieve historical data from API
        data = self.api.get_historical_data(self.symbol, start_date, end_date)
        if data:
            # Extract dates and closing prices
            return [entry['date'] for entry in data], [entry['close'] for entry in data]
        else:
            return None, None

    def __str__(self):
        return f"{self.name} Price: ${self.price:.2f}"

# Helper to fetch CEO and description from Finnhub
class FinnhubAPI:
    def __init__(self, api_key=None):
        self.api_key = api_key or 'c34391qad3i8edlcgrgg'  # Demo key, replace with your own for production
        self.base_url = 'https://finnhub.io/api/v1/'

    def get_company_profile(self, symbol):
        try:
            url = f'{self.base_url}stock/profile2'
            params = {'symbol': symbol, 'token': self.api_key}
            response = requests.get(url, params=params, timeout=3)
            if response.status_code == 200:
                data = response.json()
                return {
                    'ceo': data.get('ceo', '-'),
                    'description': data.get('finnhubIndustry', '-')  # Finnhub does not provide full description, but industry
                }
            else:
                print(f'Finnhub error: {response.status_code} {response.text}')
                return {'ceo': '-', 'description': '-'}
        except Exception as e:
            print(f'Error fetching Finnhub profile for {symbol}: {e}')
            return {'ceo': '-', 'description': '-'}


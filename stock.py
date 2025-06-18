import yfinance as yf
from datetime import datetime, timedelta
import json
import requests

class NewsAPI:
    def __init__(self):
        # Using NewsAPI.org - you can get a free API key from https://newsapi.org/
        # For now, we'll use a demo approach with Yahoo Finance news
        pass

    def get_market_news(self, limit=10):
        """Get general market news"""
        try:
            # Using Yahoo Finance for news (no API key required)
            url = "https://feeds.finance.yahoo.com/rss/2.0/headline"
            params = {
                's': '^GSPC',  # S&P 500
                'region': 'US',
                'lang': 'en-US'
            }
            
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                # Parse RSS feed
                import xml.etree.ElementTree as ET
                root = ET.fromstring(response.content)
                
                news_items = []
                for item in root.findall('.//item')[:limit]:
                    title = item.find('title').text if item.find('title') is not None else ''
                    link = item.find('link').text if item.find('link') is not None else ''
                    pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ''
                    
                    news_items.append({
                        'title': title,
                        'link': link,
                        'published_at': pub_date,
                        'source': 'Yahoo Finance'
                    })
                
                return news_items
            else:
                return self.get_fallback_news()
                
        except Exception as e:
            print(f"Error fetching market news: {e}")
            return self.get_fallback_news()

    def get_company_news(self, symbol, limit=5):
        """Get news for a specific company"""
        try:
            stock = yf.Ticker(symbol)
            news = stock.news
            
            news_items = []
            for article in news[:limit]:
                news_items.append({
                    'title': article.get('title', ''),
                    'link': article.get('link', ''),
                    'published_at': datetime.fromtimestamp(article.get('providerPublishTime', 0)).strftime('%Y-%m-%d %H:%M'),
                    'source': article.get('publisher', 'Yahoo Finance'),
                    'summary': article.get('summary', '')[:200] + '...' if article.get('summary') else ''
                })
            
            return news_items
                
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


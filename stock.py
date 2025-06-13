import yfinance as yf
from datetime import datetime, timedelta
import json

class YahooFinanceAPI:
    def __init__(self):
        pass

    def get_real_time_data(self, symbol):
        try:
            # tock data using yfinance
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
            
            #convert to the format expected by my original code
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
            
        # eetrieve real-time data from API
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
            
        #Retrieve historical data from API
        data = self.api.get_historical_data(self.symbol, start_date, end_date)
        if data:
            # Extract dates and closing prices
            return [entry['date'] for entry in data], [entry['close'] for entry in data]
        else:
            return None, None

    def __str__(self):
        return f"{self.name} Price: ${self.price:.2f}"


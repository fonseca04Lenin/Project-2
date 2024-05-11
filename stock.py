import requests  # Importing requests library to send HTTP requests

class IEXCloudAPI:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = 'https://cloud.iexapis.com/stable'

    def get_real_time_data(self, symbol):
        try:
            url = f"{self.base_url}/stock/{symbol}/quote?token={self.api_key}"
            response = requests.get(url)
            if response.status_code == 200:  # Check if request is successful
                data = response.json()
                return {
                    'name': data['companyName'],  # Extract company name
                    'price': data['latestPrice']  # Extract latest price
                }
            else:
                print("Error retrieving real-time data:", response.text)
                return None
        except Exception as e:
            print("Error retrieving real-time data:", e)
            return None

    def get_historical_data(self, symbol, start_date, end_date):
        try:
            url = f"{self.base_url}/stock/{symbol}/chart/1m?token={self.api_key}&filter=close,date&chartByDay=true"
            response = requests.get(url)
            if response.status_code == 200:  # Check if request is successful
                data = response.json()
                # Filter data based on start and end date
                filtered_data = [entry for entry in data if start_date <= entry['date'] <= end_date]
                return filtered_data
            else:
                print("Error retrieving historical data:", response.text)
                return None
        except Exception as e:
            print("Error retrieving historical data:", e)
            return None

class Stock:
    def __init__(self, symbol, api):
        self.symbol = symbol.upper()
        self.name = ""
        self.price = 0.0
        self.previous_price = 0.0  # Adds a new attribute to store the previous price
        self.api = api

    def retrieve_data(self):
        # Retrieve real-time data from API
        data = self.api.get_real_time_data(self.symbol)
        if data:
            self.name = data['name']
            self.previous_price = self.price  # Update the previous price
            self.price = data['price']
        else:
            self.name = f"Stock '{self.symbol}' not found"

    def retrieve_historical_data(self, start_date, end_date):
        # Retrieve historical data from API
        data = self.api.get_historical_data(self.symbol, start_date, end_date)
        if data:
            # Extract dates and closing prices
            return [entry['date'] for entry in data], [entry['close'] for entry in data]
        else:
            return None, None

    def __str__(self):
        return f"{self.name} Price: ${self.price:.2f}"


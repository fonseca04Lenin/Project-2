import pickle

class WatchList:
    def __init__(self):
        self.stocks = []
        self.load_watchlist()

    def add_to_watchlist(self, stock):
        self.stocks.append(stock)
        self.save_watchlist()

    def remove_from_watchlist(self, stock):
        self.stocks.remove(stock)
        self.save_watchlist()

    def save_watchlist(self):
        with open('watchlist.pkl', 'wb') as f:
            pickle.dump(self.stocks, f)

    def load_watchlist(self):
        try:
            with open('watchlist.pkl', 'rb') as f:
                self.stocks = pickle.load(f)
        except FileNotFoundError:
            self.stocks = []  # Initialize an empty watchlist if file doesn't exist

    def get_watchlist(self):
        return self.stocks

    # New feature: Method to clear the watchlist
    def clear_watchlist(self):
        self.stocks = []
        self.save_watchlist()


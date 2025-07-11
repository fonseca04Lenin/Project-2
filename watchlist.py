import pickle
import os

class WatchList:
    def __init__(self, session_id):
        self.session_id = session_id
        self.stocks = []
        self.load_watchlist()

    def get_watchlist_file(self):
        # Store watchlists in a sessions directory
        if not os.path.exists('sessions'):
            os.makedirs('sessions')
        return f'sessions/watchlist_{self.session_id}.pkl'

    def add_to_watchlist(self, stock):
        self.stocks.append(stock)
        self.save_watchlist()

    def remove_from_watchlist(self, stock):
        self.stocks.remove(stock)
        self.save_watchlist()

    def save_watchlist(self):
        with open(self.get_watchlist_file(), 'wb') as f:
            pickle.dump(self.stocks, f)

    def load_watchlist(self):
        try:
            with open(self.get_watchlist_file(), 'rb') as f:
                self.stocks = pickle.load(f)
        except FileNotFoundError:
            self.stocks = []  # Initialize an empty watchlist if file doesn't exist

    def get_watchlist(self):
        return self.stocks

    # New feature: Method to clear the watchlist
    def clear_watchlist(self):
        self.stocks = []
        self.save_watchlist()

    @staticmethod
    def cleanup_old_sessions():
        """Clean up session files older than 24 hours"""
        import time
        if os.path.exists('sessions'):
            current_time = time.time()
            for filename in os.listdir('sessions'):
                filepath = os.path.join('sessions', filename)
                # If file is older than 24 hours, delete it
                if os.path.getmtime(filepath) < current_time - 86400:  # 86400 seconds = 24 hours
                    try:
                        os.remove(filepath)
                    except:
                        pass


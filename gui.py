import tkinter as tk
from tkinter import messagebox
import matplotlib
import matplotlib.dates
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from datetime import datetime, timedelta
from stock import Stock, IEXCloudAPI
from watchlist import WatchList

class StockGUI: # UI for app
    def __init__(self, root):
        self.root = root
        self.root.title("Stock Watchlist App")

        self.iex_cloud_api_key = 'pk_b60d5e6f35c94e04a5ee80b9c51d9a2e'
        self.iex_cloud_api = IEXCloudAPI(self.iex_cloud_api_key)

        self.watchlist = WatchList()

        self.label = tk.Label(root, text="Enter Stock Symbol:")
        self.label.pack()

        self.entry = tk.Entry(root)
        self.entry.pack()

        self.search_button = tk.Button(root, text="Search", command=self.search_stock)
        self.search_button.pack()

        self.results_frame = tk.Frame(root)
        self.results_frame.pack(pady=10)

        self.results_text = tk.Text(self.results_frame, height=10, width=50, state='disabled')
        self.results_text.pack()

        self.scrollbar = tk.Scrollbar(self.results_frame, orient="vertical", command=self.results_text.yview)
        self.scrollbar.pack(side="right", fill="y")
        self.results_text.config(yscrollcommand=self.scrollbar.set)

        self.add_watchlist_button = tk.Button(root, text="Add to Watchlist", command=self.add_to_watchlist)
        self.add_watchlist_button.pack()

        self.view_watchlist_button = tk.Button(root, text="View Watchlist", command=self.view_watchlist)
        self.view_watchlist_button.pack()

        self.clear_watchlist_button = tk.Button(root, text="Clear Watchlist", command=self.clear_watchlist)
        self.clear_watchlist_button.pack()

        self.market_status_label = tk.Label(root, text="")
        self.market_status_label.pack()

        self.watchlist_window = None

        # Initialize a variable to store the last search symbol
        self.last_searched_symbol = None

        # Update market status either closed or open
        self.update_market_status()

    def search_stock(self):
        symbol = self.entry.get()
        if symbol:
            stock = Stock(symbol, self.iex_cloud_api)
            stock.retrieve_data()
            if stock.name:
                self.display_results(stock)
                # Update stock data in real-time after the search
                self.update_stock_data(symbol)
                # Store the last searched symbol
                self.last_searched_symbol = symbol
            else:
                messagebox.showwarning("Warning", "Stock Couldn't be Found")
        else:
            messagebox.showwarning("Warning", "Please enter a stock symbol.")

    def display_results(self, stock=None):
        self.results_text.config(state='normal')
        self.results_text.delete('1.0', tk.END)
        if stock:
            self.results_text.insert(tk.END, str(stock) + "\n")
            last_month_date = datetime.now() - timedelta(days=30)
            self.results_text.insert(tk.END, f"Price from last month: ${self.get_price_last_month(stock, last_month_date):.2f}\n")
        self.results_text.config(state='disabled')

    def get_price_last_month(self, stock, date):
        # Retrieve historical data from the last month
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = date.strftime("%Y-%m-%d")
        historical_data = self.iex_cloud_api.get_historical_data(stock.symbol, start_date, end_date)
        if historical_data:
            # If historical data is available it returns the closing price from the last day of the month
            return historical_data[-1]['close']
        else:
            # If historical data is not available it  returns 0
            return 0.0

    def add_to_watchlist(self):
        symbol = self.entry.get()
        if symbol:
            stock = Stock(symbol, self.iex_cloud_api)
            stock.retrieve_data()
            if stock.name:
                if not any(s.symbol == stock.symbol for s in self.watchlist.get_watchlist()):
                    self.watchlist.add_to_watchlist(stock)
                    messagebox.showinfo("Success", f"{stock.name} added to watchlist.")
                else:
                    messagebox.showinfo("Info", f"{stock.name} is already in the watchlist.")
            else:
                messagebox.showwarning("Warning", f"Stock '{symbol}' doesn't exist.")
        else:
            messagebox.showwarning("Warning", "Please enter a stock symbol.")

    def view_watchlist(self):
        if self.watchlist_window:
            self.watchlist_window.destroy()

        self.watchlist_window = tk.Toplevel(self.root)
        self.watchlist_window.title("Watchlist")

        if self.watchlist.get_watchlist():
            self.update_watchlist_window()
        else:
            label = tk.Label(self.watchlist_window, text="Your watchlist is empty.")
            label.pack()

    def update_watchlist_window(self):
        watchlist_stocks = self.watchlist.get_watchlist()

        for widget in self.watchlist_window.winfo_children():
            widget.destroy()

        for stock in watchlist_stocks:
            self.update_stock_data(stock.symbol)  # Update stock data in real-time
            label = tk.Label(self.watchlist_window, text=str(stock))
            label.pack()
            remove_button = tk.Button(self.watchlist_window, text="Remove", command=lambda stock=stock: self.remove_from_watchlist(stock))
            remove_button.pack()
            display_graph_button = tk.Button(self.watchlist_window, text="Display Graph", command=lambda stock=stock: self.view_stock_graph(stock))
            display_graph_button.pack()

    def update_stock_data(self, symbol):
        for stock in self.watchlist.get_watchlist():
            if stock.symbol == symbol:
                stock.retrieve_data()

    def remove_from_watchlist(self, stock):
        self.watchlist.remove_from_watchlist(stock)
        messagebox.showinfo("Success", f"{stock.name} removed from watchlist.")
        self.view_watchlist()

    def view_stock_graph(self, stock):
        last_month_date = datetime.now() - timedelta(days=30)
        start_date = last_month_date.strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")
        dates, prices = stock.retrieve_historical_data(start_date, end_date)
        if dates and prices:
            # Convert dates to datetime objects
            dates = [datetime.strptime(date, '%Y-%m-%d') for date in dates]

            fig, ax = plt.subplots()

            ax.plot(dates, prices)
            ax.set_xlabel('Date')
            ax.set_ylabel('Price')
            ax.set_title(f"{stock.name} Historical Prices")

            # Set x-axis date format and font size
            date_format = matplotlib.dates.DateFormatter("%Y-%m-%d")
            ax.xaxis.set_major_formatter(date_format)
            plt.xticks(fontsize=8, rotation=45)

            fig.tight_layout()

            graph_window = tk.Toplevel(self.root)
            graph_window.title(f"{stock.name} Historical Prices")

            canvas = FigureCanvasTkAgg(fig, master=graph_window)
            canvas.draw()
            canvas.get_tk_widget().pack()
        else:
            messagebox.showwarning("Warning", f"Could not retrieve historical data for {stock.name}.")

    def clear_watchlist(self):
        self.watchlist.clear_watchlist()
        self.view_watchlist()

    def update_market_status(self):
        if self.market_is_open():
            self.market_status_label.config(text="Market is Open")
        else:
            self.market_status_label.config(text="Market is Closed")
        self.root.after(60000, self.update_market_status)  # Update every minute

    def market_is_open(self):
        now = datetime.now()
        market_open_time = now.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close_time = now.replace(hour=16, minute=0, second=0, microsecond=0)
        return market_open_time <= now <= market_close_time and now.weekday() < 5



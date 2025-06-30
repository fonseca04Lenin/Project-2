from datetime import datetime
import pickle

class PriceAlert:
    def __init__(self, symbol, target_price, alert_type='above'):
        self.symbol = symbol
        self.target_price = float(target_price)
        self.alert_type = alert_type  # 'above' or 'below'
        self.created_at = datetime.now()
        self.triggered = False

    def check_alert(self, current_price):
        if self.alert_type == 'above' and current_price >= self.target_price:
            self.triggered = True
            return True
        elif self.alert_type == 'below' and current_price <= self.target_price:
            self.triggered = True
            return True
        return False

class AlertManager:
    def __init__(self):
        self.alerts = {}  # symbol -> list of alerts
        self.load_alerts()

    def add_alert(self, symbol, target_price, alert_type='above'):
        if symbol not in self.alerts:
            self.alerts[symbol] = []
        
        alert = PriceAlert(symbol, target_price, alert_type)
        self.alerts[symbol].append(alert)
        self.save_alerts()
        return alert

    def remove_alert(self, symbol, alert_index):
        if symbol in self.alerts and 0 <= alert_index < len(self.alerts[symbol]):
            self.alerts[symbol].pop(alert_index)
            if not self.alerts[symbol]:
                del self.alerts[symbol]
            self.save_alerts()
            return True
        return False

    def get_alerts(self, symbol=None):
        if symbol:
            return self.alerts.get(symbol, [])
        return self.alerts

    def check_price_alerts(self, symbol, current_price):
        triggered_alerts = []
        if symbol in self.alerts:
            for alert in self.alerts[symbol]:
                if not alert.triggered and alert.check_alert(current_price):
                    triggered_alerts.append(alert)
        return triggered_alerts

    def save_alerts(self):
        try:
            with open('alerts.pkl', 'wb') as f:
                pickle.dump(self.alerts, f)
        except Exception as e:
            print(f"Error saving alerts: {e}")

    def load_alerts(self):
        try:
            with open('alerts.pkl', 'rb') as f:
                self.alerts = pickle.load(f)
        except:
            self.alerts = {} 
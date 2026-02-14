from datetime import datetime
import json
import os
import logging

logger = logging.getLogger(__name__)

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

    def to_dict(self):
        return {
            'symbol': self.symbol,
            'target_price': self.target_price,
            'alert_type': self.alert_type,
            'created_at': self.created_at.isoformat(),
            'triggered': self.triggered
        }

    @classmethod
    def from_dict(cls, data):
        alert = cls(data['symbol'], data['target_price'], data.get('alert_type', 'above'))
        alert.created_at = datetime.fromisoformat(data['created_at'])
        alert.triggered = data.get('triggered', False)
        return alert

class AlertManager:
    def __init__(self, session_id):
        self.session_id = session_id
        self.alerts = {}  # symbol -> list of alerts
        self.load_alerts()

    def get_alerts_file(self):
        # Store alerts in a sessions directory
        if not os.path.exists('sessions'):
            os.makedirs('sessions')
        return f'sessions/alerts_{self.session_id}.json'

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
            serializable = {}
            for symbol, alert_list in self.alerts.items():
                serializable[symbol] = [alert.to_dict() for alert in alert_list]
            with open(self.get_alerts_file(), 'w') as f:
                json.dump(serializable, f, indent=2)
        except Exception as e:
            logger.error("Error saving alerts: %s", e)

    def load_alerts(self):
        try:
            with open(self.get_alerts_file(), 'r') as f:
                data = json.load(f)
            self.alerts = {}
            for symbol, alert_list in data.items():
                self.alerts[symbol] = [PriceAlert.from_dict(a) for a in alert_list]
        except (FileNotFoundError, json.JSONDecodeError):
            self.alerts = {}
        except Exception as e:
            logger.error("Error loading alerts: %s", e)
            self.alerts = {}

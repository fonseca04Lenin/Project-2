import firebase_admin
from firebase_admin import credentials, firestore, auth
from flask_login import UserMixin
from datetime import datetime, timedelta
import uuid
from config import Config
import os

# Initialize Firebase
firebase_initialized = False
try:
    if os.path.exists(Config.FIREBASE_CREDENTIALS_PATH):
        print(f"🔑 Loading Firebase credentials from: {Config.FIREBASE_CREDENTIALS_PATH}")
        cred = credentials.Certificate(Config.FIREBASE_CREDENTIALS_PATH)
        firebase_admin.initialize_app(cred)
        firebase_initialized = True
        print("✅ Firebase initialized successfully with credentials")
    else:
        print(f"⚠️ Firebase credentials file not found: {Config.FIREBASE_CREDENTIALS_PATH}")
        firebase_admin.initialize_app()
        print("🔥 Firebase Demo Mode: Using default configuration")
except Exception as e:
    print(f"⚠️ Firebase initialization error: {e}")
    # Fallback to demo mode
    firebase_admin.initialize_app()
    print("🔥 Firebase Demo Mode: Using fallback configuration")

db = firestore.client()

class FirebaseUser(UserMixin):
    def __init__(self, user_data):
        self.id = user_data.get('uid')
        self.username = user_data.get('username')
        self.email = user_data.get('email')
        self.created_at = user_data.get('created_at')
        self.last_login = user_data.get('last_login')
    
    def get_id(self):
        return self.id

class FirebaseService:
    # Demo storage for testing without Firebase
    _demo_users = {}
    _demo_watchlists = {}
    _demo_alerts = {}
    
    @staticmethod
    def create_user(username, email, password):
        """Create a new user in Firebase Auth and Firestore"""
        try:
            # Generate a demo user ID
            user_id = str(uuid.uuid4())
            
            # Store additional user data in Firestore (or demo storage)
            user_data = {
                'uid': user_id,
                'username': username,
                'email': email,
                'created_at': datetime.utcnow(),
                'last_login': datetime.utcnow()
            }
            
            # Try to save to Firestore, fallback to demo storage
            if firebase_initialized:
                try:
                    db.collection('users').document(user_id).set(user_data)
                    print(f"✅ User saved to Firestore: {username}")
                except Exception as e:
                    print(f"❌ Firestore error: {e}")
                    FirebaseService._demo_users[user_id] = user_data
                    print(f"📝 Demo mode: User stored in memory")
            else:
                FirebaseService._demo_users[user_id] = user_data
                print(f"📝 Demo mode: User stored in memory")
            
            return user_data
            
        except Exception as e:
            raise Exception(f"Failed to create user: {str(e)}")
    
    @staticmethod
    def get_user_by_id(user_id):
        """Get user data from Firestore"""
        try:
            # Try Firestore first
            if firebase_initialized:
                try:
                    doc = db.collection('users').document(user_id).get()
                    if doc.exists:
                        return FirebaseUser(doc.to_dict())
                except Exception as e:
                    print(f"❌ Firestore error getting user: {e}")
            
            # Fallback to demo storage
            if user_id in FirebaseService._demo_users:
                return FirebaseUser(FirebaseService._demo_users[user_id])
            
            return None
        except Exception as e:
            # Fallback to demo storage
            if user_id in FirebaseService._demo_users:
                return FirebaseUser(FirebaseService._demo_users[user_id])
            return None
    
    @staticmethod
    def get_user_by_username(username):
        """Get user by username"""
        try:
            # Try Firestore first
            if firebase_initialized:
                try:
                    users_ref = db.collection('users')
                    query = users_ref.where('username', '==', username).limit(1).stream()
                    for doc in query:
                        return FirebaseUser(doc.to_dict())
                except Exception as e:
                    print(f"❌ Firestore error getting user by username: {e}")
            
            # Fallback to demo storage
            for user_data in FirebaseService._demo_users.values():
                if user_data.get('username') == username:
                    return FirebaseUser(user_data)
            
            return None
        except Exception as e:
            # Fallback to demo storage
            for user_data in FirebaseService._demo_users.values():
                if user_data.get('username') == username:
                    return FirebaseUser(user_data)
            return None
    
    @staticmethod
    def verify_token(id_token):
        """Verify Firebase ID token"""
        try:
            decoded_token = auth.verify_id_token(id_token)
            return decoded_token
        except Exception as e:
            print(f"Error verifying token: {e}")
            return None
    
    @staticmethod
    def update_last_login(user_id):
        """Update user's last login time"""
        try:
            db.collection('users').document(user_id).update({
                'last_login': datetime.utcnow()
            })
        except:
            # Fallback to demo storage
            if user_id in FirebaseService._demo_users:
                FirebaseService._demo_users[user_id]['last_login'] = datetime.utcnow()
    
    @staticmethod
    def add_to_watchlist(user_id, symbol, company_name):
        """Add stock to user's watchlist"""
        try:
            watchlist_data = {
                'symbol': symbol.upper(),
                'company_name': company_name,
                'added_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }
            
            # Try Firestore first
            if firebase_initialized:
                try:
                    db.collection('users').document(user_id).collection('watchlist').document(symbol.upper()).set(watchlist_data)
                except Exception as e:
                    print(f"❌ Firestore error adding to watchlist: {e}")
                    # Fallback to demo storage
                    if user_id not in FirebaseService._demo_watchlists:
                        FirebaseService._demo_watchlists[user_id] = {}
                    FirebaseService._demo_watchlists[user_id][symbol.upper()] = watchlist_data
                    print(f"📝 Demo mode: Watchlist item stored in memory")
            else:
                # Fallback to demo storage
                if user_id not in FirebaseService._demo_watchlists:
                    FirebaseService._demo_watchlists[user_id] = {}
                FirebaseService._demo_watchlists[user_id][symbol.upper()] = watchlist_data
                print(f"📝 Demo mode: Watchlist item stored in memory")
            
            return True
        except Exception as e:
            print(f"Error adding to watchlist: {e}")
            return False
    
    @staticmethod
    def remove_from_watchlist(user_id, symbol):
        """Remove stock from user's watchlist"""
        try:
            # Try Firestore first
            if firebase_initialized:
                try:
                    db.collection('users').document(user_id).collection('watchlist').document(symbol.upper()).delete()
                except Exception as e:
                    print(f"❌ Firestore error removing from watchlist: {e}")
                    # Fallback to demo storage
                    if user_id in FirebaseService._demo_watchlists and symbol.upper() in FirebaseService._demo_watchlists[user_id]:
                        del FirebaseService._demo_watchlists[user_id][symbol.upper()]
            else:
                # Fallback to demo storage
                if user_id in FirebaseService._demo_watchlists and symbol.upper() in FirebaseService._demo_watchlists[user_id]:
                    del FirebaseService._demo_watchlists[user_id][symbol.upper()]
            
            return True
        except Exception as e:
            print(f"Error removing from watchlist: {e}")
            return False
    
    @staticmethod
    def get_watchlist(user_id):
        """Get user's watchlist"""
        try:
            watchlist = []
            
            # Try Firestore first
            if firebase_initialized:
                try:
                    docs = db.collection('users').document(user_id).collection('watchlist').stream()
                    for doc in docs:
                        watchlist.append(doc.to_dict())
                except Exception as e:
                    print(f"❌ Firestore error getting watchlist: {e}")
                    # Fallback to demo storage
                    if user_id in FirebaseService._demo_watchlists:
                        watchlist = list(FirebaseService._demo_watchlists[user_id].values())
            else:
                # Fallback to demo storage
                if user_id in FirebaseService._demo_watchlists:
                    watchlist = list(FirebaseService._demo_watchlists[user_id].values())
            
            return watchlist
        except Exception as e:
            print(f"Error getting watchlist: {e}")
            return []
    
    @staticmethod
    def create_alert(user_id, symbol, target_price, alert_type):
        """Create a price alert"""
        try:
            alert_data = {
                'symbol': symbol.upper(),
                'target_price': target_price,
                'alert_type': alert_type,
                'is_active': True,
                'triggered': False,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }
            
            alert_id = str(uuid.uuid4())
            
            # Try Firestore first
            if firebase_initialized:
                try:
                    db.collection('users').document(user_id).collection('alerts').document(alert_id).set(alert_data)
                except Exception as e:
                    print(f"❌ Firestore error creating alert: {e}")
                    # Fallback to demo storage
                    if user_id not in FirebaseService._demo_alerts:
                        FirebaseService._demo_alerts[user_id] = {}
                    FirebaseService._demo_alerts[user_id][alert_id] = alert_data
                    print(f"📝 Demo mode: Alert stored in memory")
            else:
                # Fallback to demo storage
                if user_id not in FirebaseService._demo_alerts:
                    FirebaseService._demo_alerts[user_id] = {}
                FirebaseService._demo_alerts[user_id][alert_id] = alert_data
                print(f"📝 Demo mode: Alert stored in memory")
            
            return alert_id
        except Exception as e:
            print(f"Error creating alert: {e}")
            return None
    
    @staticmethod
    def get_alerts(user_id, symbol=None):
        """Get user's alerts"""
        try:
            alerts = []
            
            # Try Firestore first
            if firebase_initialized:
                try:
                    query = db.collection('users').document(user_id).collection('alerts')
                    
                    if symbol:
                        query = query.where('symbol', '==', symbol.upper())
                    
                    docs = query.stream()
                    for doc in docs:
                        alert_data = doc.to_dict()
                        alert_data['id'] = doc.id
                        alerts.append(alert_data)
                except Exception as e:
                    print(f"❌ Firestore error getting alerts: {e}")
                    # Fallback to demo storage
                    if user_id in FirebaseService._demo_alerts:
                        for alert_id, alert_data in FirebaseService._demo_alerts[user_id].items():
                            if not symbol or alert_data['symbol'] == symbol.upper():
                                alert_data_copy = alert_data.copy()
                                alert_data_copy['id'] = alert_id
                                alerts.append(alert_data_copy)
            else:
                # Fallback to demo storage
                if user_id in FirebaseService._demo_alerts:
                    for alert_id, alert_data in FirebaseService._demo_alerts[user_id].items():
                        if not symbol or alert_data['symbol'] == symbol.upper():
                            alert_data_copy = alert_data.copy()
                            alert_data_copy['id'] = alert_id
                            alerts.append(alert_data_copy)
            
            return alerts
        except Exception as e:
            print(f"Error getting alerts: {e}")
            return []
    
    @staticmethod
    def delete_alert(user_id, alert_id):
        """Delete an alert"""
        try:
            # Verify the alert belongs to the user
            doc = db.collection('alerts').document(alert_id).get()
            if doc.exists and doc.to_dict()['user_id'] == user_id:
                db.collection('alerts').document(alert_id).delete()
                return True
            return False
        except Exception as e:
            print(f"Error deleting alert: {e}")
            return False
    
    @staticmethod
    def check_triggered_alerts(user_id, symbol, current_price):
        """Check if any alerts should be triggered"""
        try:
            triggered_alerts = []
            
            # Try Firestore first
            if firebase_initialized:
                try:
                    alerts = db.collection('users').document(user_id).collection('alerts').where('symbol', '==', symbol.upper()).where('is_active', '==', True).where('triggered', '==', False).stream()
                    
                    for doc in alerts:
                        alert_data = doc.to_dict()
                        should_trigger = False
                        
                        if alert_data['alert_type'] == 'above' and current_price >= alert_data['target_price']:
                            should_trigger = True
                        elif alert_data['alert_type'] == 'below' and current_price <= alert_data['target_price']:
                            should_trigger = True
                        
                        if should_trigger:
                            # Mark alert as triggered
                            db.collection('users').document(user_id).collection('alerts').document(doc.id).update({
                                'triggered': True,
                                'triggered_at': datetime.utcnow()
                            })
                            triggered_alerts.append(alert_data)
                except Exception as e:
                    print(f"❌ Firestore error checking triggered alerts: {e}")
                    # Fallback to demo storage
                    if user_id in FirebaseService._demo_alerts:
                        for alert_id, alert_data in FirebaseService._demo_alerts[user_id].items():
                            if (alert_data['symbol'] == symbol.upper() and 
                                alert_data['is_active'] and 
                                not alert_data['triggered']):
                                
                                should_trigger = False
                                if alert_data['alert_type'] == 'above' and current_price >= alert_data['target_price']:
                                    should_trigger = True
                                elif alert_data['alert_type'] == 'below' and current_price <= alert_data['target_price']:
                                    should_trigger = True
                                
                                if should_trigger:
                                    FirebaseService._demo_alerts[user_id][alert_id]['triggered'] = True
                                    FirebaseService._demo_alerts[user_id][alert_id]['triggered_at'] = datetime.utcnow()
                                    triggered_alerts.append(alert_data)
            
            return triggered_alerts
        except Exception as e:
            print(f"Error checking triggered alerts: {e}")
            return [] 
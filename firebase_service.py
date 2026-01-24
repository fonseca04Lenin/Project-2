import firebase_admin
from firebase_admin import credentials, firestore, auth
from flask_login import UserMixin
from datetime import datetime, timedelta
import uuid
from config import Config
import os
import base64
import json
import warnings

# Initialize Firebase with connection pooling
firebase_initialized = False
db = None
_db_instances = {}  # Connection pool for database instances

def initialize_firebase():
    global firebase_initialized, db
    
    try:
        # Prevent multiple initializations
        if firebase_initialized:
            return True
            
        # Try to use base64 encoded credentials first (for production deployment)
        credentials_base64 = os.environ.get('FIREBASE_CREDENTIALS_BASE64')
        if credentials_base64:
            print("Loading Firebase credentials from base64 environment variable")
            try:
                credentials_json = base64.b64decode(credentials_base64).decode('utf-8')
                credentials_dict = json.loads(credentials_json)
                cred = credentials.Certificate(credentials_dict)
                firebase_admin.initialize_app(cred)
                firebase_initialized = True
                print("Firebase initialized successfully with base64 credentials")
            except Exception as e:
                print(f"Failed to initialize Firebase with base64 credentials: {e}")
                return False
                
        elif os.path.exists(Config.FIREBASE_CREDENTIALS_PATH):
            print(f"Loading Firebase credentials from: {Config.FIREBASE_CREDENTIALS_PATH}")
            try:
                cred = credentials.Certificate(Config.FIREBASE_CREDENTIALS_PATH)
                firebase_admin.initialize_app(cred)
                firebase_initialized = True
                print("Firebase initialized successfully with file credentials")
            except Exception as e:
                print(f"Failed to initialize Firebase with file credentials: {e}")
                return False
        else:
            print(f"Firebase credentials not found - FIREBASE_CREDENTIALS_BASE64 env var missing and {Config.FIREBASE_CREDENTIALS_PATH} file not found")
            print("Firebase authentication is required for this application to function")
            firebase_initialized = False
            return False
            
        # Initialize Firestore client only if Firebase is properly initialized
        if firebase_initialized:
            db = firestore.client()
            print("Firestore client initialized successfully")
            return True
            
    except Exception as e:
        print(f"Critical Firebase initialization error: {e}")
        firebase_initialized = False
        return False
    
    return firebase_initialized

# Initialize Firebase immediately on module load - fail fast if credentials are missing
# The app requires Firebase for auth and watchlist functionality
print("Attempting Firebase initialization...")
if not initialize_firebase():
    print("=" * 80)
    print("CRITICAL: Firebase initialization failed!")
    print("This app requires Firebase credentials to function.")
    print("Please configure FIREBASE_CREDENTIALS_BASE64 environment variable")
    print("or provide firebase-credentials.json file")
    print("=" * 80)
    # Allow app to start but Firebase features will not work
    print(" App will start but Firebase-dependent features will fail")
else:
    print("Firebase initialized successfully on module load")

def get_firestore_client():
    """Get the Firestore client instance with connection pooling"""
    global db, _db_instances
    
    # Return cached instance if available
    if db is not None:
        return db
    
    # Initialize if not already done
    if not firebase_initialized:
        initialize_firebase()
    
    # Create new instance if needed
    if db is None and firebase_initialized:
        try:
            db = firestore.client()
            print("New Firestore client created")
        except Exception as e:
            print(f"Failed to create Firestore client: {e}")
            return None
    
    return db

class FirebaseUser(UserMixin):
    def __init__(self, user_data):
        self.id = user_data.get('uid')
        self.name = user_data.get('name') or user_data.get('username')  # Support both
        self.email = user_data.get('email')
        self.username = user_data.get('username')  # Add username field
        self.created_at = user_data.get('created_at')
        self.last_login = user_data.get('last_login')
    
    def get_id(self):
        return self.id

class FirebaseService:
    @staticmethod
    def create_user(name, email, password):
        """Create a new user using Firebase Authentication ONLY"""
        try:
            if not firebase_initialized:
                raise Exception("Firebase not initialized. Please check your Firebase credentials.")
            
            # Create user in Firebase Authentication
            user_record = auth.create_user(
                email=email,
                password=password,
                display_name=name
            )
            
            print(f"Firebase Auth user created: {user_record.uid}")
            print(f"Using Firebase Authentication only (no Firestore storage)")
            
            return {
                'uid': user_record.uid,
                'name': name,
                'email': email,
                'created_at': datetime.utcnow()
            }
            
        except Exception as e:
            print(f"Error creating user: {e}")
            raise Exception(f"Failed to create user: {str(e)}")
    
    @staticmethod
    def get_user_by_id(user_id):
        """Get user data from Firestore"""
        try:
            if not firebase_initialized or not db:
                print("Firebase or Firestore not initialized")
                return None
                
            doc = db.collection('users').document(user_id).get()
            if doc.exists:
                return FirebaseUser(doc.to_dict())
            else:
                print(f"User not found in Firestore: {user_id}")
                return None
                
        except Exception as e:
            print(f"Error getting user by ID: {e}")
            return None
    
    @staticmethod
    def get_user_by_email(email):
        """Get user by email from Firestore - Note: Use token-based auth instead for better performance"""
        try:
            if not firebase_initialized or not db:
                print("Firebase or Firestore not initialized")
                return None
            
            # Note: Firestore email queries can be slow. Token-based authentication is preferred.
            # This method is mainly kept for compatibility but should not be the primary auth method.
            users_ref = db.collection('users')
            query = users_ref.where(filter=firestore.FieldFilter('email', '==', email)).limit(1).stream()
            for doc in query:
                user_data = doc.to_dict()
                print(f"Found user in Firestore: {user_data.get('name')}")
                return FirebaseUser(user_data)
            
            print(f"User not found with email: {email}")
            return None
        except Exception as e:
            print(f"Error getting user by email: {e}")
            return None
    
    @staticmethod
    def authenticate_with_token(id_token):
        """Authenticate user using Firebase Auth ID token"""
        try:
            if not firebase_initialized:
                print("Firebase not initialized, cannot verify token")
                return None

            if not id_token:
                print("No ID token provided")
                return None

            # Verify the ID token
            decoded_token = auth.verify_id_token(id_token)
            uid = decoded_token['uid']
            email = decoded_token.get('email', '')
            name = decoded_token.get('name', '') or decoded_token.get('display_name', '')

            print(f"Token verified for user: {uid} ({email})")

            # Get additional user details from Firebase Auth
            try:
                user_record = auth.get_user(uid)
                user_profile = {
                    'uid': uid,
                    'name': user_record.display_name or name or 'User',
                    'email': user_record.email or email,
                    'created_at': datetime.utcnow(),
                    'last_login': datetime.utcnow()
                }
                print(f"Firebase Auth user profile: {user_profile['name']} ({user_profile['email']})")
            except Exception as auth_e:
                print(f"Could not get Firebase Auth details, using token data: {auth_e}")
                # Fallback to token data
                user_profile = {
                    'uid': uid,
                    'name': name or 'User',
                    'email': email,
                    'created_at': datetime.utcnow(),
                    'last_login': datetime.utcnow()
                }

            # Store user in Firestore for session persistence
            try:
                if db:
                    # First check if user already exists in Firestore
                    user_doc_ref = db.collection('users').document(uid)
                    existing_user = user_doc_ref.get()
                    
                    # If user exists, get their existing data (especially username)
                    existing_data = {}
                    if existing_user.exists:
                        existing_data = existing_user.to_dict()
                        print(f"Found existing user in Firestore with data: {existing_data}")
                    
                    # Merge existing data with new profile data
                    user_doc = {
                        'uid': uid,
                        'name': user_profile['name'],
                        'email': user_profile['email'],
                        'created_at': existing_data.get('created_at', user_profile['created_at']),
                        'last_login': user_profile['last_login'],
                        'username': existing_data.get('username', None)  # Keep existing username or None
                    }
                    user_doc_ref.set(user_doc, merge=True)
                    print(f"User stored in Firestore: {uid}")
                    
                    # Add username to user_profile for FirebaseUser
                    user_profile['username'] = existing_data.get('username', None)
                else:
                    print("Firestore not available, user not stored")
            except Exception as store_e:
                print(f"Could not store user in Firestore: {store_e}")

            print(f"Returning Firebase Auth user profile for {uid}")
            return FirebaseUser(user_profile)

        except Exception as e:
            print(f"Token verification failed: {e}")
            return None
    
    @staticmethod
    def verify_token(id_token):
        """Verify Firebase ID token"""
        try:
            # Ensure Firebase is initialized before verifying token
            # This is critical - token verification requires Firebase Admin SDK to be initialized
            if not firebase_initialized:
                print("Firebase not initialized, attempting to initialize...")
                initialize_firebase()
                
            if not firebase_initialized:
                print("Firebase not initialized - cannot verify token")
                return None

            print(f"Verifying Firebase token, Firebase initialized: {firebase_initialized}")
            decoded_token = auth.verify_id_token(id_token)
            print(f"Token verified successfully for user: {decoded_token.get('uid')}")
            return decoded_token
        except Exception as e:
            print(f"Error verifying token: {e}")
            print(f"Firebase initialized status: {firebase_initialized}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            return None
    
    @staticmethod
    def update_last_login(user_id):
        """Update user's last login time"""
        try:
            if not firebase_initialized or not db:
                print("Firebase or Firestore not initialized")
                return False
                
            db.collection('users').document(user_id).update({
                'last_login': datetime.utcnow()
            })
            print(f"Updated last login for user: {user_id}")
            return True
        except Exception as e:
            print(f"Error updating last login: {e}")
            return False
    
    @staticmethod
    def is_username_taken(username):
        """Check if username is already taken"""
        try:
            if not firebase_initialized or not db:
                print("Firebase or Firestore not initialized")
                return True  # Assume taken if we can't check
                
            # Query users collection for existing username
            users_ref = db.collection('users')
            query = users_ref.where('username', '==', username).limit(1)
            docs = query.get()
            
            is_taken = len(docs) > 0
            print(f"🔍 Username '{username}' {'is taken' if is_taken else 'is available'}")
            return is_taken
            
        except Exception as e:
            print(f"Error checking username availability: {e}")
            return True  # Assume taken if we can't check
    
    @staticmethod
    def set_user_username(user_id, username):
        """Set username for a user and return updated user data"""
        try:
            if not firebase_initialized or not db:
                print("Firebase or Firestore not initialized")
                return False
                
            # Update user document with username
            update_data = {
                'username': username,
                'updated_at': datetime.utcnow()
            }
            db.collection('users').document(user_id).update(update_data)
            print(f"Set username '{username}' for user: {user_id}")
            return True
            
        except Exception as e:
            print(f"Error setting username: {e}")
            return False

    @staticmethod
    def create_alert(user_id, symbol, target_price, alert_type):
        """Create a price alert"""
        try:
            if not firebase_initialized or not db:
                raise Exception("Firebase not initialized. Cannot create alert.")
                
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
            db.collection('users').document(user_id).collection('alerts').document(alert_id).set(alert_data)
            print(f"Created alert {alert_id} for user {user_id}")
            return alert_id
        except Exception as e:
            print(f"Error creating alert: {e}")
            return None
    
    @staticmethod
    def get_alerts(user_id, symbol=None):
        """Get user's alerts"""
        try:
            if not firebase_initialized or not db:
                print("Firebase not initialized. Cannot get alerts.")
                return []
                
            alerts = []
            query = db.collection('users').document(user_id).collection('alerts')
            
            if symbol:
                query = query.where(filter=firestore.FieldFilter('symbol', '==', symbol.upper()))
            
            docs = query.stream()
            for doc in docs:
                alert_data = doc.to_dict()
                alert_data['id'] = doc.id
                alerts.append(alert_data)
            
            print(f"Retrieved {len(alerts)} alerts for user {user_id}")
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
            if not firebase_initialized or not db:
                print("Firebase not initialized. Cannot check triggered alerts.")
                return []
                
            triggered_alerts = []
            alerts_ref = db.collection('users').document(user_id).collection('alerts')
            alerts = alerts_ref.where(filter=firestore.FieldFilter('symbol', '==', symbol.upper())).limit(10).stream()
            
            for doc in alerts:
                alert_data = doc.to_dict()
                
                # Filter in Python for better performance
                if not alert_data.get('is_active', False) or alert_data.get('triggered', False):
                    continue
                    
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
                    print(f"Alert triggered for {symbol} at ${current_price}")
            
            return triggered_alerts
        except Exception as e:
            print(f"Error checking triggered alerts: {e}")
            return [] 
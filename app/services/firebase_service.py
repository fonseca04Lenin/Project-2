import firebase_admin
from firebase_admin import credentials, firestore, auth
from flask_login import UserMixin
from datetime import datetime
import uuid
from app.config import Config
import os
import base64
import json
import logging

logger = logging.getLogger(__name__)

firebase_initialized = False
db = None

def initialize_firebase():
    global firebase_initialized, db
    
    try:
        # Prevent multiple initializations
        if firebase_initialized:
            return True
            
        # Try to use base64 encoded credentials first (for production deployment)
        credentials_base64 = os.environ.get('FIREBASE_CREDENTIALS_BASE64')
        if credentials_base64:
            logger.info("Loading Firebase credentials from base64 environment variable")
            try:
                credentials_json = base64.b64decode(credentials_base64).decode('utf-8')
                credentials_dict = json.loads(credentials_json)
                cred = credentials.Certificate(credentials_dict)
                firebase_admin.initialize_app(cred)
                firebase_initialized = True
                logger.info("Firebase initialized successfully with base64 credentials")
            except Exception as e:
                logger.error("Failed to initialize Firebase with base64 credentials: %s", e)
                return False
                
        elif os.path.exists(Config.FIREBASE_CREDENTIALS_PATH):
            logger.info("Loading Firebase credentials from file path")
            try:
                cred = credentials.Certificate(Config.FIREBASE_CREDENTIALS_PATH)
                firebase_admin.initialize_app(cred)
                firebase_initialized = True
                logger.info("Firebase initialized successfully with file credentials")
            except Exception as e:
                logger.error("Failed to initialize Firebase with file credentials: %s", e)
                return False
        else:
            logger.error("Firebase credentials not found - FIREBASE_CREDENTIALS_BASE64 env var missing and credentials file not found")
            logger.error("Firebase authentication is required for this application to function")
            firebase_initialized = False
            return False
            
        # Initialize Firestore client only if Firebase is properly initialized
        if firebase_initialized:
            db = firestore.client()
            logger.info("Firestore client initialized successfully")
            return True
            
    except Exception as e:
        logger.error("Critical Firebase initialization error: %s", e)
        firebase_initialized = False
        return False
    
    return firebase_initialized

# Initialize Firebase immediately on module load - fail fast if credentials are missing
# The app requires Firebase for auth and watchlist functionality
logger.info("Attempting Firebase initialization...")
if not initialize_firebase():
    logger.error("CRITICAL: Firebase initialization failed!")
    logger.error("This app requires Firebase credentials to function.")
    logger.error("Please configure FIREBASE_CREDENTIALS_BASE64 environment variable or provide firebase-credentials.json file")
    # Allow app to start but Firebase features will not work
    logger.warning("App will start but Firebase-dependent features will fail")
else:
    logger.info("Firebase initialized successfully on module load")

def get_firestore_client():
    """Get the Firestore client instance."""
    global db

    if db is not None:
        return db

    if not firebase_initialized:
        initialize_firebase()

    if db is None and firebase_initialized:
        try:
            db = firestore.client()
            logger.info("Firestore client created")
        except Exception as e:
            logger.error("Failed to create Firestore client: %s", e)
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
        """Create a new user using Firebase Authentication."""
        try:
            if not firebase_initialized:
                raise Exception("Firebase not initialized. Please check your Firebase credentials.")

            user_record = auth.create_user(
                email=email,
                password=password,
                display_name=name,
            )
            logger.info("Firebase Auth user created: %s", user_record.uid)

            return {
                'uid': user_record.uid,
                'name': name,
                'email': email,
                'created_at': datetime.utcnow(),
            }
        except Exception as e:
            logger.error("Error creating user: %s", e)
            raise Exception(f"Failed to create user: {str(e)}")

    @staticmethod
    def get_user_by_id(user_id):
        """Get user data from Firestore."""
        try:
            if not firebase_initialized or not db:
                logger.warning("Firebase not initialized; cannot look up user %s", user_id)
                return None

            doc = db.collection('users').document(user_id).get()
            if doc.exists:
                return FirebaseUser(doc.to_dict())
            logger.info("User not found in Firestore: %s", user_id)
            return None
        except Exception as e:
            logger.error("Error getting user by ID %s: %s", user_id, e)
            return None

    @staticmethod
    def authenticate_with_token(id_token):
        """Verify a Firebase ID token and upsert the user profile in Firestore."""
        try:
            if not firebase_initialized:
                logger.warning("Firebase not initialized, cannot verify token")
                return None
            if not id_token:
                return None

            decoded_token = auth.verify_id_token(id_token)
            uid = decoded_token['uid']
            email = decoded_token.get('email', '')
            name = decoded_token.get('name', '') or decoded_token.get('display_name', '')

            try:
                user_record = auth.get_user(uid)
                user_profile = {
                    'uid': uid,
                    'name': user_record.display_name or name or 'User',
                    'email': user_record.email or email,
                    'created_at': datetime.utcnow(),
                    'last_login': datetime.utcnow(),
                }
            except Exception as auth_e:
                logger.warning("Could not fetch Firebase Auth details for %s, using token data: %s", uid, auth_e)
                user_profile = {
                    'uid': uid,
                    'name': name or 'User',
                    'email': email,
                    'created_at': datetime.utcnow(),
                    'last_login': datetime.utcnow(),
                }

            try:
                if db:
                    user_doc_ref = db.collection('users').document(uid)
                    existing = user_doc_ref.get()
                    existing_data = existing.to_dict() if existing.exists else {}

                    user_doc_ref.set({
                        'uid': uid,
                        'name': user_profile['name'],
                        'email': user_profile['email'],
                        'created_at': existing_data.get('created_at', user_profile['created_at']),
                        'last_login': user_profile['last_login'],
                        'username': existing_data.get('username'),
                    }, merge=True)

                    user_profile['username'] = existing_data.get('username')
            except Exception as store_e:
                logger.warning("Could not upsert user %s in Firestore: %s", uid, store_e)

            return FirebaseUser(user_profile)
        except Exception as e:
            logger.error("Token verification failed: %s", e)
            return None

    @staticmethod
    def verify_token(id_token):
        """Verify a Firebase ID token; returns the decoded token dict or None."""
        try:
            if not firebase_initialized:
                initialize_firebase()
            if not firebase_initialized:
                logger.warning("Firebase not initialized — cannot verify token")
                return None
            return auth.verify_id_token(id_token)
        except Exception as e:
            logger.error("Error verifying token: %s", e)
            return None

    @staticmethod
    def update_last_login(user_id):
        """Update user's last login timestamp."""
        try:
            if not firebase_initialized or not db:
                return False
            db.collection('users').document(user_id).update({'last_login': datetime.utcnow()})
            return True
        except Exception as e:
            logger.error("Error updating last login for %s: %s", user_id, e)
            return False

    @staticmethod
    def is_username_taken(username):
        """Return True if the username is already claimed, or if we can't check safely."""
        try:
            if not firebase_initialized or not db:
                return True
            query = db.collection('users').where(
                filter=firestore.FieldFilter('username', '==', username)
            ).limit(1)
            return len(query.get()) > 0
        except Exception as e:
            logger.error("Error checking username availability: %s", e)
            return True

    @staticmethod
    def set_user_username(user_id, username):
        """Set the username field on a user document."""
        try:
            if not firebase_initialized or not db:
                return False
            db.collection('users').document(user_id).update({
                'username': username,
                'updated_at': datetime.utcnow(),
            })
            return True
        except Exception as e:
            logger.error("Error setting username for %s: %s", user_id, e)
            return False

    @staticmethod
    def create_alert(user_id, symbol, target_price, alert_type):
        """Create a price alert in the user's alerts subcollection."""
        try:
            if not firebase_initialized or not db:
                raise Exception("Firebase not initialized. Cannot create alert.")

            alert_id = str(uuid.uuid4())
            db.collection('users').document(user_id).collection('alerts').document(alert_id).set({
                'symbol': symbol.upper(),
                'target_price': target_price,
                'alert_type': alert_type,
                'is_active': True,
                'triggered': False,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
            })
            logger.info("Created alert %s for user %s", alert_id, user_id)
            return alert_id
        except Exception as e:
            logger.error("Error creating alert for %s: %s", user_id, e)
            return None

    @staticmethod
    def get_alerts(user_id, symbol=None):
        """Get user's alerts, optionally filtered by symbol."""
        try:
            if not firebase_initialized or not db:
                return []

            query = db.collection('users').document(user_id).collection('alerts')
            if symbol:
                query = query.where(filter=firestore.FieldFilter('symbol', '==', symbol.upper()))

            alerts = []
            for doc in query.stream():
                data = doc.to_dict()
                data['id'] = doc.id
                alerts.append(data)
            return alerts
        except Exception as e:
            logger.error("Error getting alerts for %s: %s", user_id, e)
            return []
    
    @staticmethod
    def delete_alert(user_id, alert_id):
        """Delete an alert from the user's alerts subcollection."""
        try:
            if not firebase_initialized or not db:
                logger.warning("Firebase not initialized. Cannot delete alert.")
                return False
            # Ownership is enforced by the collection path: users/{uid}/alerts/{alertId}
            doc_ref = db.collection('users').document(user_id).collection('alerts').document(alert_id)
            if not doc_ref.get().exists:
                return False
            doc_ref.delete()
            logger.info("Deleted alert %s for user %s", alert_id, user_id)
            return True
        except Exception as e:
            logger.error("Error deleting alert %s for user %s: %s", alert_id, user_id, e)
            return False
    
    @staticmethod
    def check_triggered_alerts(user_id, symbol, current_price):
        """Check active alerts for a symbol and mark any that should trigger."""
        try:
            if not firebase_initialized or not db:
                return []

            triggered = []
            alerts_ref = db.collection('users').document(user_id).collection('alerts')
            alerts = alerts_ref.where(
                filter=firestore.FieldFilter('symbol', '==', symbol.upper())
            ).limit(10).stream()

            for doc in alerts:
                data = doc.to_dict()
                if not data.get('is_active', False) or data.get('triggered', False):
                    continue

                target = data['target_price']
                fired = (
                    (data['alert_type'] == 'above' and current_price >= target)
                    or (data['alert_type'] == 'below' and current_price <= target)
                )
                if fired:
                    alerts_ref.document(doc.id).update({
                        'triggered': True,
                        'triggered_at': datetime.utcnow(),
                    })
                    triggered.append(data)
                    logger.info("Alert triggered for %s at $%s", symbol, current_price)

            return triggered
        except Exception as e:
            logger.error("Error checking triggered alerts for %s/%s: %s", user_id, symbol, e)
            return []

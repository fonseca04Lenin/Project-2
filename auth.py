import logging

from flask import Blueprint, request, jsonify, session
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from firebase_service import FirebaseService, FirebaseUser
from datetime import datetime

logger = logging.getLogger(__name__)

auth = Blueprint('auth', __name__)
login_manager = LoginManager()

@login_manager.user_loader
def load_user(user_id):
    return FirebaseService.get_user_by_id(user_id)

@auth.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    id_token = data.get('idToken')

    if not name or not email:
        return jsonify({'error': 'Name and email are required'}), 400

    try:
        # If idToken is provided, this is a Firebase Auth registration
        if id_token:
            # Verify the user was created in Firebase and create profile
            user = FirebaseService.authenticate_with_token(id_token)
            if user:
                login_user(user)
                return jsonify({
                    'message': 'Registration successful',
                    'user': {
                        'id': user.id,
                        'name': user.name,
                        'email': user.email
                    }
                })
            else:
                return jsonify({'error': 'Failed to verify Firebase registration'}), 400
        
        # No fallback registration - Firebase token required
        return jsonify({'error': 'Firebase authentication token required. Please use the frontend registration form.'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@auth.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request data'}), 400
        
        # Check if this is a token-based login (Firebase Auth)
        id_token = data.get('idToken')
        is_google_signin = data.get('isGoogleSignIn', False)
        
        if id_token:
            logger.info("Token-based login attempt")
            if is_google_signin:
                logger.info("Google Sign-In detected")
            
            # Firebase Authentication flow
            user = FirebaseService.authenticate_with_token(id_token)
            if user:
                # Check if this is a new Google user who needs a username
                if is_google_signin and not user.username:
                    logger.info("New Google user detected, username required")
                    return jsonify({
                        'message': 'Google sign-in successful, username required',
                        'needsUsername': True,
                        'user': {
                            'id': user.id,
                            'name': user.name,
                            'email': user.email
                        }
                    })
                
                login_user(user)
                logger.info("Login successful")
                return jsonify({
                    'message': 'Login successful',
                    'user': {
                        'id': user.id,
                        'name': user.name,
                        'email': user.email,
                        'username': getattr(user, 'username', None)
                    }
                })
            else:
                logger.warning("Token authentication failed")
                return jsonify({'error': 'Invalid authentication token. Please try logging in again.'}), 401
        
        # No fallback authentication - Firebase token required
        return jsonify({'error': 'Firebase authentication token required. Please use the frontend login form.'}), 400
        
    except Exception as e:
        logger.error("Login error: %s", e)
        return jsonify({'error': 'Login failed. Please try again.'}), 500

@auth.route('/api/auth/logout')
def logout():
    # Always try to logout, even if user is not authenticated
    try:
        logout_user()
        # Clear any session data
        session.clear()
        return jsonify({'message': 'Logout successful'})
    except Exception as e:
        # If logout fails, still return success to clear frontend state
        session.clear()
        return jsonify({'message': 'Logout successful'})

@auth.route('/api/auth/set-username', methods=['POST'])
def set_username():
    """Set username for Google Sign-In users"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request data'}), 400
        
        id_token = data.get('idToken')
        username = data.get('username', '').strip()
        
        if not id_token:
            return jsonify({'error': 'Authentication token required'}), 400
        
        if not username:
            return jsonify({'error': 'Username is required'}), 400
        
        if len(username) < 3:
            return jsonify({'error': 'Username must be at least 3 characters long'}), 400
        
        if len(username) > 20:
            return jsonify({'error': 'Username must be less than 20 characters'}), 400
        
        # Verify the token and get user
        user = FirebaseService.authenticate_with_token(id_token)
        if not user:
            return jsonify({'error': 'Invalid authentication token'}), 401
        
        # Check if username is already taken
        if FirebaseService.is_username_taken(username):
            return jsonify({'error': 'Username is already taken. Please choose another.'}), 400
        
        # Set the username
        if FirebaseService.set_user_username(user.id, username):
            # Refresh user data from Firestore to get updated username
            user = FirebaseService.authenticate_with_token(id_token)
            if user:
                login_user(user)
                return jsonify({
                    'message': 'Username set successfully',
                    'user': {
                        'id': user.id,
                        'name': user.name,
                        'email': user.email,
                        'username': getattr(user, 'username', username)
                    }
                })
            else:
                return jsonify({'error': 'Failed to refresh user data'}), 500
        else:
            return jsonify({'error': 'Failed to set username. Please try again.'}), 500
            
    except Exception as e:
        logger.error("Set username error: %s", e)
        return jsonify({'error': 'Failed to set username. Please try again.'}), 500

@auth.route('/api/auth/user')
def get_user():
    if current_user.is_authenticated:
        return jsonify({
            'user': {
                'id': current_user.id,
                'name': current_user.name,
                'email': current_user.email,
                'username': getattr(current_user, 'username', None)
            }
        })
    else:
        return jsonify({'error': 'Not authenticated'}), 401 
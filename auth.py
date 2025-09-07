from flask import Blueprint, request, jsonify, session
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from firebase_service import FirebaseService, FirebaseUser
from datetime import datetime

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
        
        # Fallback for demo/local development
        if not password:
            return jsonify({'error': 'Password is required for demo registration'}), 400
            
        # Check if email already exists in demo storage
        existing_user = FirebaseService.get_user_by_email(email)
        if existing_user:
            return jsonify({'error': 'Email already exists'}), 400
            
        user_data = FirebaseService.create_user(name, email, password)
        user = FirebaseUser(user_data)
        login_user(user)
        
        return jsonify({
            'message': 'Registration successful',
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email
            }
        })
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
        if id_token:
            print(f"🔐 Token-based login attempt with token length: {len(id_token)}")
            # Firebase Authentication flow
            user = FirebaseService.authenticate_with_token(id_token)
            if user:
                login_user(user)
                print(f"✅ Login successful for user: {user.email}")
                return jsonify({
                    'message': 'Login successful',
                    'user': {
                        'id': user.id,
                        'name': user.name,
                        'email': user.email
                    }
                })
            else:
                print("❌ Token authentication failed")
                return jsonify({'error': 'Invalid authentication token. Please try logging in again.'}), 401
        
        # Fallback for demo/local development (email/password)
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password (or idToken) are required'}), 400

        print(f"🔙 Fallback authentication attempt for: {email}")
        
        # Demo storage lookup for local development
        user = FirebaseService.get_user_by_email(email)
        if user:
            # Note: In demo mode, we skip password verification
            # In production, this will be handled by Firebase Auth
            login_user(user)
            print(f"✅ Fallback login successful for user: {email}")
            
            return jsonify({
                'message': 'Login successful (demo mode)',
                'user': {
                    'id': user.id,
                    'name': user.name,
                    'email': user.email
                }
            })
        
        print(f"❌ User not found: {email}")
        return jsonify({'error': 'Invalid email or password'}), 401
        
    except Exception as e:
        print(f"❌ Login error: {e}")
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

@auth.route('/api/auth/user')
def get_user():
    if current_user.is_authenticated:
        return jsonify({
            'user': {
                'id': current_user.id,
                'name': current_user.name,
                'email': current_user.email
            }
        })
    else:
        return jsonify({'error': 'Not authenticated'}), 401 
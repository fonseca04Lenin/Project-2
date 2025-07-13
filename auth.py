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
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400

    # Check if username already exists
    existing_user = FirebaseService.get_user_by_username(username)
    if existing_user:
        return jsonify({'error': 'Username already exists'}), 400

    try:
        user_data = FirebaseService.create_user(username, email, password)
        user = FirebaseUser(user_data)
        login_user(user)
        
        return jsonify({
            'message': 'Registration successful',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@auth.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    # For Firebase, we'll use email as the login identifier
    # You might want to store email in a separate field or use email as username
    user = FirebaseService.get_user_by_username(username)
    if user:
        # Update last login
        FirebaseService.update_last_login(user.id)
        login_user(user)
        
        return jsonify({
            'message': 'Login successful',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email
            }
        })
    
    return jsonify({'error': 'Invalid username or password'}), 401

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
                'username': current_user.username,
                'email': current_user.email
            }
        })
    else:
        return jsonify({'error': 'Not authenticated'}), 401 
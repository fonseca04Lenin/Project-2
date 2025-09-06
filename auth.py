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

    if not name or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400

    # Check if email already exists
    existing_user = FirebaseService.get_user_by_email(email)
    if existing_user:
        return jsonify({'error': 'Email already exists'}), 400

    try:
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
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    # Use email for login
    user = FirebaseService.get_user_by_email(email)
    if user:
        # Update last login
        FirebaseService.update_last_login(user.id)
        login_user(user)
        
        return jsonify({
            'message': 'Login successful',
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email
            }
        })
    
    return jsonify({'error': 'Invalid email or password'}), 401

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
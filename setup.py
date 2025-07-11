#!/usr/bin/env python3
"""
Setup script for Stock Watchlist App
"""
import os
import sys
import subprocess

def install_requirements():
    """Install required packages"""
    print("📦 Installing required packages...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ Packages installed successfully!")
    except subprocess.CalledProcessError:
        print("❌ Error installing packages. Please run: pip install -r requirements.txt")
        return False
    return True

def create_database():
    """Create the database"""
    print("🗄️  Creating database...")
    try:
        from app import app, db
        with app.app_context():
            db.create_all()
        print("✅ Database created successfully!")
    except Exception as e:
        print(f"❌ Error creating database: {e}")
        return False
    return True

def main():
    print("🚀 Stock Watchlist App Setup")
    print("=" * 40)
    
    # Check if Python 3.7+ is installed
    if sys.version_info < (3, 7):
        print("❌ Python 3.7 or higher is required")
        return
    
    # Install requirements
    if not install_requirements():
        return
    
    # Create database
    if not create_database():
        return
    
    print("\n✅ Setup completed successfully!")
    print("\nTo run the application:")
    print("1. Run: python app.py")
    print("2. Open your browser to: http://localhost:5000")
    print("3. Register a new account or login")
    print("\nHappy trading! 📈")

if __name__ == "__main__":
    main() 
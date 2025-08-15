#!/usr/bin/env python3
"""
Script to run both the Flask backend and React frontend
"""

import subprocess
import sys
import time
import os
from pathlib import Path

def run_flask_backend():
    """Run the Flask backend"""
    print("🚀 Starting Flask backend...")
    try:
        subprocess.run([sys.executable, "app.py"], check=True)
    except KeyboardInterrupt:
        print("\n🛑 Flask backend stopped")
    except subprocess.CalledProcessError as e:
        print(f"❌ Flask backend failed: {e}")

def run_react_frontend():
    """Run the React frontend"""
    print("⚛️ Starting React frontend...")
    frontend_dir = Path("stock-watchlist-frontend")
    
    if not frontend_dir.exists():
        print("❌ React frontend directory not found. Please run the migration first.")
        return
    
    try:
        # Change to frontend directory and start React
        os.chdir(frontend_dir)
        subprocess.run(["npm", "start"], check=True)
    except KeyboardInterrupt:
        print("\n🛑 React frontend stopped")
    except subprocess.CalledProcessError as e:
        print(f"❌ React frontend failed: {e}")
    except FileNotFoundError:
        print("❌ npm not found. Please install Node.js and npm first.")

def main():
    """Main function to run both services"""
    print("🎯 Stock Watchlist Pro - Full Stack App")
    print("=" * 50)
    
    # Check if we're in the right directory
    if not Path("app.py").exists():
        print("❌ app.py not found. Please run this script from the project root.")
        return
    
    # Check if React frontend exists
    frontend_dir = Path("stock-watchlist-frontend")
    if not frontend_dir.exists():
        print("❌ React frontend not found. Please run the migration first.")
        return
    
    print("📋 Prerequisites check:")
    print("✅ Flask backend files found")
    print("✅ React frontend directory found")
    
    print("\n🎯 Choose an option:")
    print("1. Run Flask backend only")
    print("2. Run React frontend only")
    print("3. Run both (requires two terminal windows)")
    print("4. Exit")
    
    while True:
        choice = input("\nEnter your choice (1-4): ").strip()
        
        if choice == "1":
            run_flask_backend()
            break
        elif choice == "2":
            run_react_frontend()
            break
        elif choice == "3":
            print("\n📝 To run both services:")
            print("1. Open a new terminal window")
            print("2. Run: python run_app.py")
            print("3. Choose option 1 (Flask backend)")
            print("4. In this terminal, choose option 2 (React frontend)")
            print("\n🌐 Then open http://localhost:3000 in your browser")
            break
        elif choice == "4":
            print("👋 Goodbye!")
            break
        else:
            print("❌ Invalid choice. Please enter 1-4.")

if __name__ == "__main__":
    main() 
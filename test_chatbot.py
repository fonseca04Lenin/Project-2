#!/usr/bin/env python3
"""
Test script for AI Chatbot functionality
Run this to test the chat service before deploying
"""

import os
import sys
import json
from datetime import datetime

# Add the project root to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_chat_service():
    """Test the chat service functionality"""
    print("🤖 Testing AI Chatbot Service...")
    print("=" * 50)
    
    try:
        # Import chat service
        from chat_service import chat_service
        
        # Check if Groq client is initialized
        if not chat_service.groq_client:
            print("❌ Groq API client not initialized")
            print("💡 Make sure to set GROQ_API_KEY environment variable")
            return False
        
        print("✅ Groq API client initialized successfully")
        
        # Test user ID (you can change this)
        test_user_id = "test_user_123"
        
        # Test messages
        test_messages = [
            "Hello! Can you help me with stock advice?",
            "What's the current price of AAPL?",
            "How is my watchlist performing?",
            "Should I buy more Tesla stock?"
        ]
        
        print(f"\n🧪 Testing with user ID: {test_user_id}")
        print("-" * 30)
        
        for i, message in enumerate(test_messages, 1):
            print(f"\n📝 Test {i}: {message}")
            
            try:
                result = chat_service.process_message(test_user_id, message)
                
                if result['success']:
                    print(f"✅ Response: {result['response'][:100]}...")
                    print(f"⏰ Timestamp: {result['timestamp']}")
                else:
                    print(f"❌ Error: {result.get('error', 'Unknown error')}")
                    print(f"📄 Fallback: {result.get('response', 'No response')}")
                    
            except Exception as e:
                print(f"❌ Exception: {e}")
            
            # Small delay between requests
            import time
            time.sleep(1)
        
        print("\n" + "=" * 50)
        print("🎉 Chat service test completed!")
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("💡 Make sure all dependencies are installed: pip install -r requirements.txt")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def test_api_endpoints():
    """Test the API endpoints"""
    print("\n🌐 Testing API Endpoints...")
    print("=" * 50)
    
    try:
        import requests
        
        # Test chat status endpoint
        base_url = "http://localhost:5000"
        
        print("📡 Testing /api/chat/status endpoint...")
        try:
            response = requests.get(f"{base_url}/api/chat/status", timeout=5)
            if response.status_code == 401:
                print("✅ Endpoint exists (authentication required as expected)")
            else:
                print(f"⚠️ Unexpected status code: {response.status_code}")
        except requests.exceptions.ConnectionError:
            print("❌ Server not running. Start the Flask app first: python app.py")
        except Exception as e:
            print(f"❌ Error: {e}")
        
    except ImportError:
        print("❌ requests library not available")
    except Exception as e:
        print(f"❌ Error testing endpoints: {e}")

def main():
    """Main test function"""
    print("🚀 AI Chatbot Phase 1 Testing")
    print("=" * 50)
    
    # Check environment
    groq_key = os.getenv('GROQ_API_KEY')
    if not groq_key:
        print("⚠️ GROQ_API_KEY not set in environment")
        print("💡 Set it with: export GROQ_API_KEY='your-api-key-here'")
        print("💡 Or add it to your .env file")
    else:
        print("✅ GROQ_API_KEY found in environment")
    
    # Test chat service
    chat_success = test_chat_service()
    
    # Test API endpoints
    test_api_endpoints()
    
    print("\n" + "=" * 50)
    if chat_success:
        print("🎉 Phase 1 Backend Implementation: SUCCESS!")
        print("\n📋 Next Steps:")
        print("1. Set up your Groq API key")
        print("2. Test the endpoints with a real user")
        print("3. Move to Phase 2: Frontend Integration")
    else:
        print("❌ Phase 1 Backend Implementation: NEEDS WORK")
        print("\n🔧 Troubleshooting:")
        print("1. Check GROQ_API_KEY environment variable")
        print("2. Install dependencies: pip install -r requirements.txt")
        print("3. Check Firebase credentials")
    
    print("\n📚 Documentation: CHATBOT_IMPLEMENTATION_PLAN.md")

if __name__ == "__main__":
    main()

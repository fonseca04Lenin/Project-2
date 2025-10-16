#!/usr/bin/env python3
"""
Test script to verify Groq API configuration
"""

import os
from groq import Groq

def test_groq_api():
    """Test if Groq API is properly configured"""
    print("🧪 Testing Groq API Configuration...")
    
    # Check if API key exists
    api_key = os.getenv('GROQ_API_KEY')
    if not api_key:
        print("❌ GROQ_API_KEY not found in environment variables")
        return False
    
    print(f"✅ GROQ_API_KEY found (length: {len(api_key)})")
    
    try:
        # Initialize Groq client
        client = Groq(api_key=api_key)
        print("✅ Groq client initialized successfully")
        
        # Test a simple API call
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "user", "content": "Say 'Hello, Groq API is working!'"}
            ],
            max_tokens=50
        )
        
        result = response.choices[0].message.content
        print(f"✅ Groq API test successful: {result}")
        return True
        
    except Exception as e:
        print(f"❌ Groq API test failed: {e}")
        return False

if __name__ == "__main__":
    test_groq_api()

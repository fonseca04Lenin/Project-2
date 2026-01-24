#!/usr/bin/env python3
"""
Quick test script to verify Gemini API setup
Run this to check if Gemini is configured correctly
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

print("🔍 Testing Gemini API Setup...")
print("-" * 50)

# Check API Key
api_key = os.getenv('GEMINI_API_KEY')
if not api_key:
    print("GEMINI_API_KEY not found in environment")
    sys.exit(1)
else:
    print(f"GEMINI_API_KEY found: {api_key[:20]}...")

# Test import
try:
    import google.generativeai as genai
    print("google-generativeai imported successfully")
except ImportError as e:
    print(f"Failed to import google-generativeai: {e}")
    sys.exit(1)

# Test configuration
try:
    genai.configure(api_key=api_key)
    print("Gemini API configured")
except Exception as e:
    print(f"Failed to configure Gemini: {e}")
    sys.exit(1)

# Test model creation
try:
    model = genai.GenerativeModel('gemini-1.5-flash')
    print("Gemini model created")
except Exception as e:
    print(f"Failed to create model: {e}")
    sys.exit(1)

# Test API call
try:
    response = model.generate_content("Say 'Hello, Gemini is working!'")
    if hasattr(response, 'text'):
        print(f"API call successful: {response.text}")
    else:
        print(f"API call successful (no text attribute)")
except Exception as e:
    print(f"API call failed: {e}")
    sys.exit(1)

print("-" * 50)
print("All tests passed! Gemini is ready to use.")


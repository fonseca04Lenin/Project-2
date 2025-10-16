#!/usr/bin/env python3
"""
Test script to debug authentication flow for watchlist
"""

import requests
import json

# Test endpoints
base_url = "https://stock-watchlist-backend-8bea295dd646.herokuapp.com"

def test_auth_endpoints():
    """Test authentication endpoints"""
    print("🔐 Testing Authentication Endpoints")
    print("-" * 40)
    
    # Test login endpoint
    try:
        response = requests.post(f"{base_url}/api/auth/login", 
                               json={"test": "data"}, 
                               timeout=10)
        print(f"Login endpoint: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Login test failed: {e}")
    
    # Test user endpoint
    try:
        response = requests.get(f"{base_url}/api/auth/user", timeout=10)
        print(f"User endpoint: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"User test failed: {e}")

def test_watchlist_with_fake_auth():
    """Test watchlist with fake authentication headers"""
    print("\n🔐 Testing Watchlist with Fake Auth Headers")
    print("-" * 40)
    
    headers = {
        'Authorization': 'Bearer fake-token-for-testing',
        'X-User-ID': 'test-user-123',
        'Content-Type': 'application/json'
    }
    
    # Test GET watchlist
    try:
        response = requests.get(f"{base_url}/api/watchlist", 
                              headers=headers, 
                              timeout=10)
        print(f"GET Watchlist: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    except Exception as e:
        print(f"GET Watchlist test failed: {e}")
    
    # Test POST watchlist
    try:
        response = requests.post(f"{base_url}/api/watchlist", 
                               headers=headers,
                               json={
                                   "symbol": "AAPL",
                                   "company_name": "Apple Inc."
                               },
                               timeout=10)
        print(f"POST Watchlist: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    except Exception as e:
        print(f"POST Watchlist test failed: {e}")

def test_cors_headers():
    """Test CORS preflight"""
    print("\n🌐 Testing CORS Headers")
    print("-" * 40)
    
    headers = {
        'Origin': 'https://stock-watchlist-frontend.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization,X-User-ID,Content-Type'
    }
    
    try:
        response = requests.options(f"{base_url}/api/watchlist", 
                                  headers=headers, 
                                  timeout=10)
        print(f"CORS Preflight: {response.status_code}")
        print("CORS Headers:")
        for header, value in response.headers.items():
            if 'access-control' in header.lower():
                print(f"  {header}: {value}")
    except Exception as e:
        print(f"CORS test failed: {e}")

def test_authentication_debug():
    """Test authentication with debug info"""
    print("\n🔍 Testing Authentication Debug")
    print("-" * 40)
    
    # Test with various header combinations
    test_cases = [
        {
            'name': 'No headers',
            'headers': {}
        },
        {
            'name': 'Only Authorization',
            'headers': {'Authorization': 'Bearer test-token'}
        },
        {
            'name': 'Only X-User-ID',
            'headers': {'X-User-ID': 'test-user'}
        },
        {
            'name': 'Both headers',
            'headers': {
                'Authorization': 'Bearer test-token',
                'X-User-ID': 'test-user'
            }
        }
    ]
    
    for test_case in test_cases:
        try:
            response = requests.get(f"{base_url}/api/watchlist", 
                                  headers=test_case['headers'], 
                                  timeout=5)
            print(f"{test_case['name']}: {response.status_code} - {response.json()}")
        except Exception as e:
            print(f"{test_case['name']}: Error - {e}")

def main():
    print("🧪 Testing Authentication Flow for Watchlist")
    print("=" * 60)
    
    test_auth_endpoints()
    test_watchlist_with_fake_auth()
    test_cors_headers()
    test_authentication_debug()
    
    print("\n" + "=" * 60)
    print("📊 DIAGNOSIS")
    print("=" * 60)
    print("Based on the tests above:")
    print("1. If all requests return 401 'Authentication required' - authentication is working")
    print("2. If CORS headers are missing - frontend can't make authenticated requests")
    print("3. If authentication fails with valid headers - Firebase token verification issue")
    print("4. If specific errors appear - those need to be addressed")

if __name__ == "__main__":
    main()
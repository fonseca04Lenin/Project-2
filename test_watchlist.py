#!/usr/bin/env python3
"""
Test script to debug watchlist functionality
"""

import requests
import json

# Test endpoints
base_url = "https://stock-watchlist-backend-8bea295dd646.herokuapp.com"

def test_health():
    """Test if the app is running"""
    try:
        response = requests.get(f"{base_url}/health", timeout=10)
        print(f"Health check: {response.status_code} - {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Health check failed: {e}")
        return False

def test_watchlist_service():
    """Test the watchlist service test endpoint"""
    try:
        response = requests.get(f"{base_url}/api/test/watchlist-service", timeout=10)
        print(f"Watchlist service test: {response.status_code}")
        if response.status_code == 200:
            print(f"Response: {response.json()}")
        else:
            print(f"Error response: {response.text}")
        return response.status_code == 200
    except Exception as e:
        print(f"Watchlist service test failed: {e}")
        return False

def test_unauthenticated_watchlist():
    """Test watchlist without authentication"""
    try:
        response = requests.get(f"{base_url}/api/watchlist", timeout=10)
        print(f"Unauthenticated watchlist: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 401  # Should be unauthorized
    except Exception as e:
        print(f"Unauthenticated watchlist test failed: {e}")
        return False

def test_stock_search():
    """Test stock search functionality"""
    try:
        response = requests.post(f"{base_url}/api/search", 
                               json={"symbol": "AAPL"}, 
                               timeout=10)
        print(f"Stock search: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Found stock: {data.get('symbol')} - {data.get('name')}")
        else:
            print(f"Search error: {response.text}")
        return response.status_code == 200
    except Exception as e:
        print(f"Stock search test failed: {e}")
        return False

def main():
    print("🧪 Testing Watchlist Functionality")
    print("=" * 50)
    
    # Test 1: Health check
    print("\n1. Testing app health...")
    health_ok = test_health()
    
    # Test 2: Watchlist service
    print("\n2. Testing watchlist service...")
    service_ok = test_watchlist_service()
    
    # Test 3: Unauthenticated access
    print("\n3. Testing authentication...")
    auth_ok = test_unauthenticated_watchlist()
    
    # Test 4: Stock search
    print("\n4. Testing stock search...")
    search_ok = test_stock_search()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    print(f"Health Check: {'✅ PASS' if health_ok else '❌ FAIL'}")
    print(f"Watchlist Service: {'✅ PASS' if service_ok else '❌ FAIL'}")
    print(f"Authentication: {'✅ PASS' if auth_ok else '❌ FAIL'}")
    print(f"Stock Search: {'✅ PASS' if search_ok else '❌ FAIL'}")
    
    if not service_ok:
        print("\n⚠️  WATCHLIST SERVICE ISSUE DETECTED!")
        print("This suggests a Firebase/Firestore connection problem.")
    
    if all([health_ok, service_ok, auth_ok, search_ok]):
        print("\n🎉 ALL BASIC TESTS PASSED!")
        print("The issue might be with frontend-backend communication or authentication flow.")
    else:
        print("\n❌ SOME TESTS FAILED - Backend issues detected.")

if __name__ == "__main__":
    main()
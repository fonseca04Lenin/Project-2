#!/usr/bin/env python3
"""
Comprehensive API Testing Script
Tests all endpoints to ensure they work correctly
"""
import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://web-production-2e2e.up.railway.app"
# For local testing, use: BASE_URL = "http://localhost:5000"

# Test results
results = {
    'passed': [],
    'failed': [],
    'skipped': []
}

def test_endpoint(name, method, endpoint, data=None, headers=None, expected_status=200, requires_auth=False):
    """Test a single API endpoint"""
    url = f"{BASE_URL}{endpoint}"
    print(f"\n{'='*80}")
    print(f"Testing: {name}")
    print(f"URL: {url}")
    print(f"Method: {method}")
    
    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, timeout=10)
        elif method == 'POST':
            response = requests.post(url, json=data, headers=headers, timeout=10)
        elif method == 'PUT':
            response = requests.put(url, json=data, headers=headers, timeout=10)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=10)
        elif method == 'OPTIONS':
            response = requests.options(url, headers=headers, timeout=10)
        else:
            results['skipped'].append(f"{name} - Unknown method: {method}")
            return
        
        status_ok = response.status_code == expected_status
        print(f"Status: {response.status_code} (Expected: {expected_status}) {'' if status_ok else ''}")
        
        try:
            response_data = response.json()
            print(f"Response: {json.dumps(response_data, indent=2)[:200]}...")
        except:
            print(f"Response: {response.text[:200]}...")
        
        if status_ok:
            results['passed'].append(name)
            print(f"PASSED: {name}")
        else:
            if requires_auth and response.status_code == 401:
                results['skipped'].append(f"{name} - Requires authentication (expected)")
                print(f"SKIPPED: {name} (requires auth)")
            else:
                results['failed'].append(f"{name} - Status {response.status_code}")
                print(f"FAILED: {name}")
                
    except requests.exceptions.Timeout:
        results['failed'].append(f"{name} - Timeout")
        print(f"FAILED: {name} - Request timeout")
    except requests.exceptions.ConnectionError:
        results['failed'].append(f"{name} - Connection error")
        print(f"FAILED: {name} - Connection error (service may be down)")
    except Exception as e:
        results['failed'].append(f"{name} - {str(e)}")
        print(f"FAILED: {name} - {str(e)}")

def main():
    print("="*80)
    print("API TESTING SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().isoformat()}")
    print("="*80)
    
    # 1. Health Check (CRITICAL - must work)
    test_endpoint("Health Check", "GET", "/api/health", expected_status=200)
    
    # 2. Root endpoints
    test_endpoint("Root Endpoint", "GET", "/")
    test_endpoint("API Root", "GET", "/api")
    
    # 3. Search endpoints (no auth required)
    test_endpoint("Search Stocks (GET)", "GET", "/api/search/stocks?q=AAPL")
    test_endpoint("Search Companies", "GET", "/api/search/companies?q=Apple")
    
    # 4. Market endpoints (no auth required)
    test_endpoint("Market Status", "GET", "/api/market-status")
    test_endpoint("Market News", "GET", "/api/news/market")
    test_endpoint("Company News", "GET", "/api/news/company/AAPL")
    test_endpoint("Top Performer", "GET", "/api/market/top-performer")
    test_endpoint("Earnings", "GET", "/api/market/earnings")
    
    # 5. Stock data endpoints (no auth required)
    test_endpoint("Stock Info", "GET", "/api/stock/AAPL")
    test_endpoint("Company Info", "GET", "/api/company/AAPL")
    test_endpoint("Stock Chart", "GET", "/api/chart/AAPL")
    test_endpoint("Insider Trading", "GET", "/api/market/insider-trading/AAPL")
    test_endpoint("Analyst Ratings", "GET", "/api/market/analyst-ratings/AAPL")
    test_endpoint("Options Data", "GET", "/api/market/options/AAPL")
    
    # 6. OPTIONS requests (CORS preflight)
    test_endpoint("Health OPTIONS", "OPTIONS", "/api/health")
    test_endpoint("Watchlist OPTIONS", "OPTIONS", "/api/watchlist")
    test_endpoint("Market Status OPTIONS", "OPTIONS", "/api/market-status")
    
    # 7. Endpoints that require authentication (will return 401, which is expected)
    test_endpoint("Watchlist GET (Auth Required)", "GET", "/api/watchlist", requires_auth=True)
    test_endpoint("Watchlist POST (Auth Required)", "POST", "/api/watchlist", data={"symbol": "AAPL"}, requires_auth=True)
    test_endpoint("Alerts GET (Auth Required)", "GET", "/api/alerts", requires_auth=True)
    test_endpoint("Chat POST (Auth Required)", "POST", "/api/chat", data={"message": "test"}, requires_auth=True)
    test_endpoint("Chat History (Auth Required)", "GET", "/api/chat/history", requires_auth=True)
    test_endpoint("Chat Status (Auth Required)", "GET", "/api/chat/status", requires_auth=True)
    test_endpoint("Alpaca Status (Auth Required)", "GET", "/api/alpaca/status", requires_auth=True)
    test_endpoint("Alpaca Positions (Auth Required)", "GET", "/api/alpaca/positions", requires_auth=True)
    
    # 8. Test endpoints (if available)
    test_endpoint("Watchlist Service Test", "GET", "/api/test/watchlist-service")
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Passed: {len(results['passed'])}")
    print(f"Failed: {len(results['failed'])}")
    print(f"Skipped: {len(results['skipped'])}")
    print(f"Total: {len(results['passed']) + len(results['failed']) + len(results['skipped'])}")
    print("="*80)
    
    if results['failed']:
        print("\nFAILED TESTS:")
        for failure in results['failed']:
            print(f"  {failure}")
    
    if results['skipped']:
        print("\nSKIPPED TESTS:")
        for skipped in results['skipped']:
            print(f"  {skipped}")
    
    # Exit code
    if results['failed']:
        print("\nSome tests failed!")
        sys.exit(1)
    else:
        print("\nAll tests passed!")
        sys.exit(0)

if __name__ == '__main__':
    main()

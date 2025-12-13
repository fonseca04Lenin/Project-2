#!/usr/bin/env python3
"""
Test Firestore Rules Deployment
Tests that rules are properly deployed and working
"""
import requests
import json
import sys

BASE_URL = "https://web-production-2e2e.up.railway.app"

def test_app_functionality():
    """Test that app still works after rules deployment"""
    print("="*80)
    print("TESTING APP FUNCTIONALITY AFTER RULES DEPLOYMENT")
    print("="*80)
    
    results = {'passed': [], 'failed': []}
    
    # Test 1: Health check (should work - no auth needed)
    try:
        r = requests.get(f"{BASE_URL}/api/health", timeout=5)
        if r.status_code == 200:
            results['passed'].append("Health check")
            print("✅ Health check: PASSED")
        else:
            results['failed'].append(f"Health check: {r.status_code}")
            print(f"❌ Health check: FAILED ({r.status_code})")
    except Exception as e:
        results['failed'].append(f"Health check: {str(e)}")
        print(f"❌ Health check: ERROR - {e}")
    
    # Test 2: Market status (should work - no auth needed)
    try:
        r = requests.get(f"{BASE_URL}/api/market-status", timeout=10)
        if r.status_code == 200:
            results['passed'].append("Market status")
            print("✅ Market status: PASSED")
        else:
            results['failed'].append(f"Market status: {r.status_code}")
            print(f"❌ Market status: FAILED ({r.status_code})")
    except Exception as e:
        results['failed'].append(f"Market status: {str(e)}")
        print(f"❌ Market status: ERROR - {e}")
    
    # Test 3: Watchlist without auth (should return 401)
    try:
        r = requests.get(f"{BASE_URL}/api/watchlist", timeout=10)
        if r.status_code == 401:
            results['passed'].append("Watchlist auth check (401 expected)")
            print("✅ Watchlist without auth: CORRECTLY DENIED (401)")
        else:
            results['failed'].append(f"Watchlist auth: Expected 401, got {r.status_code}")
            print(f"⚠️ Watchlist without auth: Expected 401, got {r.status_code}")
    except Exception as e:
        results['failed'].append(f"Watchlist auth: {str(e)}")
        print(f"❌ Watchlist auth: ERROR - {e}")
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ Passed: {len(results['passed'])}")
    for test in results['passed']:
        print(f"   ✅ {test}")
    
    print(f"\n❌ Failed: {len(results['failed'])}")
    for test in results['failed']:
        print(f"   ❌ {test}")
    
    print("\n" + "="*80)
    print("📝 NOTES:")
    print("   - These tests verify the app is still functional")
    print("   - Rules protect direct Firestore client access")
    print("   - Backend API uses Admin SDK (bypasses rules - correct)")
    print("   - To fully test rules, use Firebase Console Rules Simulator")
    print("="*80)
    
    return len(results['failed']) == 0

if __name__ == '__main__':
    success = test_app_functionality()
    sys.exit(0 if success else 1)

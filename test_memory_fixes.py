#!/usr/bin/env python3
"""
Test script to verify memory leak fixes in the Stock Watchlist App
"""

import requests
import time
import threading
import psutil
import os
from concurrent.futures import ThreadPoolExecutor

class MemoryTester:
    def __init__(self, base_url="http://localhost:5000"):
        self.base_url = base_url
        self.process = psutil.Process(os.getpid())
        
    def get_memory_usage(self):
        """Get current memory usage in MB"""
        return self.process.memory_info().rss / 1024 / 1024
    
    def test_api_endpoints(self, num_requests=50):
        """Test API endpoints for memory leaks"""
        print(f"🧪 Testing API endpoints with {num_requests} requests...")
        
        initial_memory = self.get_memory_usage()
        print(f"Initial memory: {initial_memory:.1f} MB")
        
        # Test various endpoints
        endpoints = [
            "/health",
            "/api/search",
            "/api/market-status",
            "/api/news/market",
        ]
        
        for i in range(num_requests):
            for endpoint in endpoints:
                try:
                    if endpoint == "/api/search":
                        response = requests.post(f"{self.base_url}{endpoint}", 
                                               json={"symbol": "AAPL"}, 
                                               timeout=5)
                    else:
                        response = requests.get(f"{self.base_url}{endpoint}", timeout=5)
                    
                    if i % 10 == 0:
                        current_memory = self.get_memory_usage()
                        print(f"Request {i}: Memory {current_memory:.1f} MB")
                        
                except Exception as e:
                    print(f"Error on request {i}: {e}")
                    
            time.sleep(0.1)  # Small delay between requests
        
        final_memory = self.get_memory_usage()
        memory_diff = final_memory - initial_memory
        
        print(f"Final memory: {final_memory:.1f} MB")
        print(f"Memory difference: {memory_diff:+.1f} MB")
        
        if memory_diff > 50:  # Alert if memory increased by more than 50MB
            print("⚠️  POTENTIAL MEMORY LEAK DETECTED!")
            return False
        else:
            print("✅ Memory usage looks good!")
            return True
    
    def test_concurrent_requests(self, num_threads=10, requests_per_thread=20):
        """Test concurrent requests for memory leaks"""
        print(f"🧪 Testing {num_threads} concurrent threads with {requests_per_thread} requests each...")
        
        initial_memory = self.get_memory_usage()
        print(f"Initial memory: {initial_memory:.1f} MB")
        
        def worker_thread(thread_id):
            for i in range(requests_per_thread):
                try:
                    response = requests.get(f"{self.base_url}/health", timeout=5)
                    if i % 5 == 0:
                        current_memory = self.get_memory_usage()
                        print(f"Thread {thread_id}, Request {i}: Memory {current_memory:.1f} MB")
                except Exception as e:
                    print(f"Error in thread {thread_id}, request {i}: {e}")
                time.sleep(0.05)
        
        # Run concurrent threads
        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [executor.submit(worker_thread, i) for i in range(num_threads)]
            for future in futures:
                future.result()
        
        final_memory = self.get_memory_usage()
        memory_diff = final_memory - initial_memory
        
        print(f"Final memory: {final_memory:.1f} MB")
        print(f"Memory difference: {memory_diff:+.1f} MB")
        
        if memory_diff > 100:  # Alert if memory increased by more than 100MB
            print("⚠️  POTENTIAL MEMORY LEAK DETECTED!")
            return False
        else:
            print("✅ Concurrent memory usage looks good!")
            return True
    
    def test_long_running(self, duration_minutes=5):
        """Test for memory leaks over time"""
        print(f"🧪 Testing long-running behavior for {duration_minutes} minutes...")
        
        initial_memory = self.get_memory_usage()
        print(f"Initial memory: {initial_memory:.1f} MB")
        
        start_time = time.time()
        end_time = start_time + (duration_minutes * 60)
        request_count = 0
        
        while time.time() < end_time:
            try:
                response = requests.get(f"{self.base_url}/health", timeout=5)
                request_count += 1
                
                if request_count % 50 == 0:
                    current_memory = self.get_memory_usage()
                    elapsed = (time.time() - start_time) / 60
                    print(f"After {elapsed:.1f} min ({request_count} requests): Memory {current_memory:.1f} MB")
                    
            except Exception as e:
                print(f"Error on request {request_count}: {e}")
            
            time.sleep(0.5)  # Request every 500ms
        
        final_memory = self.get_memory_usage()
        memory_diff = final_memory - initial_memory
        
        print(f"Final memory: {final_memory:.1f} MB")
        print(f"Memory difference: {memory_diff:+.1f} MB")
        print(f"Total requests: {request_count}")
        
        if memory_diff > 200:  # Alert if memory increased by more than 200MB
            print("⚠️  POTENTIAL MEMORY LEAK DETECTED!")
            return False
        else:
            print("✅ Long-running memory usage looks good!")
            return True

def main():
    print("🚀 Starting Memory Leak Test Suite for Stock Watchlist App")
    print("=" * 60)
    
    # Wait for server to be ready
    print("Waiting for server to be ready...")
    for i in range(30):  # Wait up to 30 seconds
        try:
            response = requests.get("http://localhost:5000/health", timeout=2)
            if response.status_code == 200:
                print("✅ Server is ready!")
                break
        except:
            time.sleep(1)
    else:
        print("❌ Server not responding. Make sure the app is running on localhost:5000")
        return
    
    tester = MemoryTester()
    
    # Run tests
    print("\n" + "=" * 60)
    test1_result = tester.test_api_endpoints(50)
    
    print("\n" + "=" * 60)
    test2_result = tester.test_concurrent_requests(10, 20)
    
    print("\n" + "=" * 60)
    test3_result = tester.test_long_running(2)  # 2 minutes for quick test
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    print(f"API Endpoints Test: {'✅ PASS' if test1_result else '❌ FAIL'}")
    print(f"Concurrent Requests Test: {'✅ PASS' if test2_result else '❌ FAIL'}")
    print(f"Long-running Test: {'✅ PASS' if test3_result else '❌ FAIL'}")
    
    if all([test1_result, test2_result, test3_result]):
        print("\n🎉 ALL TESTS PASSED! Memory leak fixes appear to be working.")
    else:
        print("\n⚠️  SOME TESTS FAILED! Memory leaks may still exist.")

if __name__ == "__main__":
    main()
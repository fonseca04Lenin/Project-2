#!/usr/bin/env python3
"""
Simple test script to verify Railway deployment
"""

import os
import sys
from flask import Flask, jsonify
from datetime import datetime

# Create a minimal Flask app for testing
app = Flask(__name__)

@app.route('/')
def root():
    return jsonify({
        'message': 'Railway Test App',
        'status': 'running',
        'timestamp': datetime.now().isoformat(),
        'environment': os.environ.get('RAILWAY_ENVIRONMENT', 'unknown')
    })

@app.route('/api/health')
def health():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'port': os.environ.get('PORT', '5000')
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"🚀 Starting Railway test app on port {port}")
    print(f"🌍 Environment: {os.environ.get('RAILWAY_ENVIRONMENT', 'unknown')}")
    
    try:
        app.run(host='0.0.0.0', port=port, debug=False)
    except Exception as e:
        print(f"❌ Failed to start: {e}")
        sys.exit(1)

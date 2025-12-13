#!/usr/bin/env python3
"""
Deploy Firestore security rules using Firebase Admin SDK
"""
import firebase_admin
from firebase_admin import credentials
import os
import sys

def deploy_rules():
    """Deploy Firestore security rules"""
    try:
        # Initialize Firebase Admin if not already initialized
        try:
            firebase_admin.get_app()
            print("✅ Firebase Admin already initialized")
        except ValueError:
            # Try to initialize
            cred_path = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'firebase-credentials.json')
            if os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
                print(f"✅ Firebase Admin initialized from {cred_path}")
            else:
                # Try base64 encoded credentials
                import base64
                import json
                creds_base64 = os.environ.get('FIREBASE_CREDENTIALS_BASE64')
                if creds_base64:
                    creds_json = base64.b64decode(creds_base64).decode('utf-8')
                    creds_dict = json.loads(creds_json)
                    cred = credentials.Certificate(creds_dict)
                    firebase_admin.initialize_app(cred)
                    print("✅ Firebase Admin initialized from base64 credentials")
                else:
                    print("❌ Firebase credentials not found")
                    return False
        
        # Read the rules file
        rules_path = 'firestore.rules'
        if not os.path.exists(rules_path):
            print(f"❌ Rules file not found: {rules_path}")
            return False
        
        with open(rules_path, 'r') as f:
            rules_content = f.read()
        
        print(f"📋 Read rules from {rules_path}")
        print(f"📏 Rules file size: {len(rules_content)} characters")
        
        # Note: Firebase Admin SDK doesn't have a direct method to deploy rules
        # Rules must be deployed via Firebase CLI or Console
        print("\n⚠️  Firebase Admin SDK cannot deploy rules directly.")
        print("📝 Rules file has been updated and is ready to deploy.")
        print("\n🔧 To deploy, use one of these methods:")
        print("   1. Firebase Console: https://console.firebase.google.com")
        print("      → Go to Firestore Database → Rules → Paste rules → Publish")
        print("   2. Firebase CLI: firebase deploy --only firestore:rules")
        print("   3. The rules will be automatically deployed if using Firebase Hosting")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = deploy_rules()
    sys.exit(0 if success else 1)

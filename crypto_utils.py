"""
Encryption utilities for securely storing sensitive user data like API keys
"""
import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend

def get_encryption_key():
    """Get or generate encryption key from environment variable"""
    key_str = os.getenv('ENCRYPTION_KEY')
    
    if not key_str:
        # Generate a key if not set (for development only - should be set in production)
        print("⚠️ ENCRYPTION_KEY not set, generating temporary key (not secure for production)")
        key = Fernet.generate_key()
        return key
    
    # If key is base64 encoded, decode it
    try:
        if len(key_str) == 44:  # Fernet keys are 44 chars when base64 encoded
            return key_str.encode()
        else:
            # Derive key from password using PBKDF2HMAC
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=b'stock_watchlist_salt',  # In production, use a random salt per user
                iterations=100000,
                backend=default_backend()
            )
            return base64.urlsafe_b64encode(kdf.derive(key_str.encode()))
    except Exception as e:
        print(f"❌ Error processing encryption key: {e}")
        return None

def encrypt_data(data: str) -> str:
    """Encrypt sensitive data"""
    try:
        key = get_encryption_key()
        if not key:
            raise Exception("Encryption key not available")
        
        f = Fernet(key)
        encrypted = f.encrypt(data.encode())
        return base64.urlsafe_b64encode(encrypted).decode()
    except Exception as e:
        print(f"❌ Encryption error: {e}")
        raise

def decrypt_data(encrypted_data: str) -> str:
    """Decrypt sensitive data"""
    try:
        key = get_encryption_key()
        if not key:
            raise Exception("Encryption key not available")
        
        f = Fernet(key)
        decoded = base64.urlsafe_b64decode(encrypted_data.encode())
        decrypted = f.decrypt(decoded)
        return decrypted.decode()
    except Exception as e:
        print(f"❌ Decryption error: {e}")
        raise


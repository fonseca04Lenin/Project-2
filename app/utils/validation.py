"""
Utility functions for input validation and sanitization
"""
import re
from typing import Optional

def sanitize_input(input_string: str, max_length: int = 100) -> str:
    """
    Sanitize user input to prevent injection attacks and XSS
    
    Args:
        input_string: The input string to sanitize
        max_length: Maximum allowed length
        
    Returns:
        Sanitized string
    """
    if not isinstance(input_string, str):
        return ''
    
    # Remove potentially dangerous characters
    # Allow alphanumeric, spaces, hyphens, underscores, and common punctuation
    sanitized = re.sub(r'[^a-zA-Z0-9\s\-_.,!?@#$%&*()+=:;]', '', input_string)
    
    # Trim and limit length
    sanitized = sanitized.strip()[:max_length]
    
    return sanitized

def sanitize_stock_symbol(symbol: str) -> str:
    """
    Sanitize stock symbol (letters, numbers, dots only)
    
    Args:
        symbol: Stock symbol to sanitize
        
    Returns:
        Sanitized symbol in uppercase
    """
    if not isinstance(symbol, str):
        return ''
    
    # Remove everything except letters, numbers, and dots
    sanitized = re.sub(r'[^A-Za-z0-9.]', '', symbol)
    
    # Uppercase and limit length
    sanitized = sanitized.upper()[:10]
    
    return sanitized

def sanitize_search_query(query: str, max_length: int = 100) -> str:
    """
    Sanitize search query
    
    Args:
        query: Search query to sanitize
        max_length: Maximum allowed length
        
    Returns:
        Sanitized query
    """
    if not isinstance(query, str):
        return ''
    
    # Allow more characters for search queries
    # Alphanumeric, spaces, hyphens, apostrophes, commas, periods
    sanitized = re.sub(r'[^a-zA-Z0-9\s\-\',.]', '', query)
    
    # Trim whitespace and limit length
    sanitized = ' '.join(sanitized.split())
    sanitized = sanitized[:max_length]
    
    return sanitized

def sanitize_email(email: str) -> str:
    """
    Basic email sanitization (for display purposes only, not validation)
    
    Args:
        email: Email address
        
    Returns:
        Sanitized email
    """
    if not isinstance(email, str):
        return ''
    
    # Basic sanitization - remove dangerous characters
    sanitized = re.sub(r'[^a-zA-Z0-9@._-]', '', email)
    
    return sanitized.lower()

def sanitize_username(username: str) -> str:
    """
    Sanitize username
    
    Args:
        username: Username to sanitize
        
    Returns:
        Sanitized username
    """
    if not isinstance(username, str):
        return ''
    
    # Allow letters, numbers, underscores, hyphens
    sanitized = re.sub(r'[^a-zA-Z0-9_-]', '', username)
    
    # Limit length
    sanitized = sanitized[:20]
    
    return sanitized

def validate_stock_symbol(symbol: str) -> bool:
    """
    Validate if a string is a valid stock symbol
    
    Args:
        symbol: Stock symbol to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not isinstance(symbol, str) or not symbol.strip():
        return False
    
    # Check length
    if len(symbol) > 10:
        return False
    
    # Check pattern (letters, numbers, dots only)
    if not re.match(r'^[A-Z0-9.]+$', symbol.upper()):
        return False
    
    return True

def validate_search_length(query: str, min_length: int = 2, max_length: int = 100) -> bool:
    """
    Validate search query length
    
    Args:
        query: Search query
        min_length: Minimum length
        max_length: Maximum length
        
    Returns:
        True if valid, False otherwise
    """
    if not isinstance(query, str):
        return False
    
    query_length = len(query.strip())
    
    return min_length <= query_length <= max_length

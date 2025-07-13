from celery import Celery
from firebase_service import FirebaseService
from stock import Stock, YahooFinanceAPI
from datetime import datetime, timedelta
import os

# Initialize Celery
celery = Celery('stockwatchlist')
celery.conf.update(
    broker_url=os.environ.get('REDIS_URL', 'redis://localhost:6379'),
    result_backend=os.environ.get('REDIS_URL', 'redis://localhost:6379'),
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)

@celery.task
def check_price_alerts():
    """Background task to check all price alerts"""
    try:
        # Get all active alerts from Firebase
        # Note: This is a simplified version since we don't have user context
        # In a real implementation, you'd iterate through all users
        print("Checking price alerts...")
        
        # For demo purposes, we'll just log that the task ran
        # In production, you'd implement proper user iteration
        print("Alert checking task completed")
        
    except Exception as e:
        print(f"Error checking alerts: {e}")

@celery.task
def update_watchlist_prices():
    """Background task to update watchlist prices"""
    try:
        # Get all unique symbols from watchlists
        # Note: This is a simplified version since we don't have user context
        print("Updating watchlist prices...")
        
        # For demo purposes, we'll just log that the task ran
        # In production, you'd implement proper user iteration
        print("Price update task completed")
        
    except Exception as e:
        print(f"Error updating prices: {e}")

@celery.task
def cleanup_old_alerts():
    """Clean up old triggered alerts (older than 30 days)"""
    try:
        # Clean up old alerts from Firebase
        # Note: This is a simplified version since we don't have user context
        print("Cleaning up old alerts...")
        
        # For demo purposes, we'll just log that the task ran
        # In production, you'd implement proper cleanup logic
        print("Cleanup task completed")
        
    except Exception as e:
        print(f"Error cleaning up alerts: {e}")

# Schedule tasks
@celery.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    # Check alerts every 5 minutes
    sender.add_periodic_task(300.0, check_price_alerts.s(), name='check-alerts')
    
    # Update prices every 10 minutes
    sender.add_periodic_task(600.0, update_watchlist_prices.s(), name='update-prices')
    
    # Cleanup old alerts daily
    sender.add_periodic_task(86400.0, cleanup_old_alerts.s(), name='cleanup-alerts') 
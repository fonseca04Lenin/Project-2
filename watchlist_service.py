"""
Comprehensive Watchlist Service for Stock Watchlist Application
Replaces the old watchlist.py and FirebaseService watchlist methods with a modern, feature-rich implementation.
"""

import firebase_admin
from firebase_admin import firestore
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import uuid
import logging
import signal
import threading

logger = logging.getLogger(__name__)

class WatchlistItem:
    """Represents a single stock in a user's watchlist"""

    def __init__(self, symbol: str, company_name: str, **kwargs):
        self.symbol = symbol.upper()
        self.company_name = company_name
        self.category = kwargs.get('category', 'General')
        self.notes = kwargs.get('notes', '')
        self.priority = kwargs.get('priority', 'medium')  # low, medium, high
        self.added_at = kwargs.get('added_at', datetime.utcnow())
        self.last_updated = kwargs.get('last_updated', datetime.utcnow())
        self.tags = kwargs.get('tags', [])  # List of custom tags
        self.target_price = kwargs.get('target_price', None)
        self.stop_loss = kwargs.get('stop_loss', None)
        self.alert_enabled = kwargs.get('alert_enabled', True)
        self.original_price = kwargs.get('original_price', None)  # Price when added to watchlist

    def to_dict(self) -> Dict[str, Any]:
        """Convert to Firestore-compatible dictionary"""
        return {
            'symbol': self.symbol,
            'company_name': self.company_name,
            'category': self.category,
            'notes': self.notes,
            'priority': self.priority,
            'added_at': self.added_at,
            'last_updated': self.last_updated,
            'tags': self.tags,
            'target_price': self.target_price,
            'stop_loss': self.stop_loss,
            'alert_enabled': self.alert_enabled,
            'original_price': self.original_price
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'WatchlistItem':
        """Create WatchlistItem from Firestore document"""
        return cls(
            symbol=data.get('symbol', ''),
            company_name=data.get('company_name', ''),
            category=data.get('category', 'General'),
            notes=data.get('notes', ''),
            priority=data.get('priority', 'medium'),
            added_at=data.get('added_at', datetime.utcnow()),
            last_updated=data.get('last_updated', datetime.utcnow()),
            tags=data.get('tags', []),
            target_price=data.get('target_price'),
            stop_loss=data.get('stop_loss'),
            alert_enabled=data.get('alert_enabled', True),
            original_price=data.get('original_price')
        )


class WatchlistService:
    """
    Comprehensive watchlist management service using Firestore.
    Features:
    - User-specific watchlists with advanced organization
    - Categories and tags for better organization
    - Priority levels and notes
    - Target prices and stop losses
    - Usage limits and validation
    - Migration support for existing data
    """

    # Configuration constants
    MAX_WATCHLIST_SIZE = 1000  # Maximum stocks per user (increased from 100)
    MAX_CATEGORIES = 50  # Maximum categories per user (increased from 20)
    MAX_TAGS_PER_STOCK = 20  # Maximum tags per stock (increased from 10)
    MAX_NOTES_LENGTH = 1000  # Maximum notes length (increased from 500)

    def __init__(self, db_client=None):
        """Initialize with Firestore client"""
        self.db = db_client or firestore.client()
        self._ensure_indexes()

    def _ensure_indexes(self):
        """Ensure necessary Firestore indexes exist (handled by firestore.indexes.json)"""
        pass

    def _validate_user_watchlist_limit(self, user_id: str) -> bool:
        """Check if user has reached watchlist limit"""
        try:
            watchlist_ref = self.db.collection('users').document(user_id).collection('watchlist')
            count = len(list(watchlist_ref.limit(self.MAX_WATCHLIST_SIZE + 1).stream()))
            return count < self.MAX_WATCHLIST_SIZE
        except Exception as e:
            logger.error(f"Error checking watchlist limit for user {user_id}: {e}")
            return False

    def _validate_watchlist_item(self, item: WatchlistItem) -> List[str]:
        """Validate watchlist item data"""
        errors = []

        if not item.symbol or len(item.symbol) > 10:
            errors.append("Invalid stock symbol")

        if not item.company_name or len(item.company_name) > 100:
            errors.append("Invalid company name")

        if len(item.notes) > self.MAX_NOTES_LENGTH:
            errors.append(f"Notes too long (max {self.MAX_NOTES_LENGTH} characters)")

        if len(item.tags) > self.MAX_TAGS_PER_STOCK:
            errors.append(f"Too many tags (max {self.MAX_TAGS_PER_STOCK})")

        valid_priorities = ['low', 'medium', 'high']
        if item.priority not in valid_priorities:
            errors.append(f"Invalid priority. Must be one of: {valid_priorities}")

        return errors

    def add_stock(self, user_id: str, symbol: str, company_name: str, current_price: float = None, **kwargs) -> Dict[str, Any]:
        """
        Add a stock to user's watchlist with enhanced features

        Args:
            user_id: Firebase user ID
            symbol: Stock symbol
            company_name: Company name
            current_price: Current stock price (will be stored as original_price)
            **kwargs: Additional options (category, notes, priority, tags, etc.)

        Returns:
            Dict with success status and message
        """
        try:
            print(f"🔍 WatchlistService.add_stock called - User: {user_id}, Symbol: {symbol}, Company: {company_name}")
            print(f"🔍 Firestore client available: {self.db is not None}")
            # Check if user has reached limit
            if not self._validate_user_watchlist_limit(user_id):
                return {
                    'success': False,
                    'message': f'Watchlist limit reached (max {self.MAX_WATCHLIST_SIZE} stocks)'
                }

            # Check if stock already exists
            existing = self.get_stock(user_id, symbol)
            if existing:
                return {
                    'success': False,
                    'message': f'{symbol} is already in your watchlist'
                }

            # Create watchlist item with original price
            item = WatchlistItem(symbol, company_name, original_price=current_price, **kwargs)

            # Validate item
            errors = self._validate_watchlist_item(item)
            if errors:
                return {
                    'success': False,
                    'message': '; '.join(errors)
                }

            # Add to Firestore
            print(f"🔍 Adding to Firestore - Collection: users/{user_id}/watchlist, Document: {symbol}")
            watchlist_ref = self.db.collection('users').document(user_id).collection('watchlist')
            watchlist_ref.document(symbol).set(item.to_dict())
            print(f"✅ Successfully added {symbol} to Firestore")

            # Update user's watchlist metadata
            self._update_watchlist_metadata(user_id)

            logger.info(f"Added {symbol} to watchlist for user {user_id}")
            print(f"✅ WatchlistService.add_stock completed successfully for {symbol}")
            return {
                'success': True,
                'message': f'{company_name} added to watchlist',
                'item': item.to_dict()
            }

        except Exception as e:
            logger.error(f"Error adding {symbol} to watchlist for user {user_id}: {e}")
            print(f"❌ WatchlistService.add_stock failed for {symbol}: {e}")
            return {
                'success': False,
                'message': 'Failed to add stock to watchlist'
            }

    def remove_stock(self, user_id: str, symbol: str) -> Dict[str, Any]:
        """Remove a stock from user's watchlist"""
        try:
            symbol = symbol.upper()
            watchlist_ref = self.db.collection('users').document(user_id).collection('watchlist')
            doc_ref = watchlist_ref.document(symbol)

            # Check if stock exists
            if not doc_ref.get().exists:
                return {
                    'success': False,
                    'message': f'{symbol} not found in watchlist'
                }

            # Remove from Firestore
            doc_ref.delete()

            # Update metadata
            self._update_watchlist_metadata(user_id)

            logger.info(f"Removed {symbol} from watchlist for user {user_id}")
            return {
                'success': True,
                'message': f'{symbol} removed from watchlist'
            }

        except Exception as e:
            logger.error(f"Error removing {symbol} from watchlist for user {user_id}: {e}")
            return {
                'success': False,
                'message': 'Failed to remove stock from watchlist'
            }

    def get_watchlist(self, user_id: str, category: Optional[str] = None,
                     priority: Optional[str] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get user's watchlist with optional filtering"""
        try:
            watchlist_ref = self.db.collection('users').document(user_id).collection('watchlist')

            # Apply filters
            query = watchlist_ref
            if category:
                query = query.where(filter=firestore.FieldFilter('category', '==', category))
            if priority:
                query = query.where(filter=firestore.FieldFilter('priority', '==', priority))

            # Always apply a limit to prevent hanging on large collections
            # Default to 100 if no limit specified
            if limit is None:
                limit = 100
                logger.info(f"No limit specified, using default limit of {limit}")
            
            # Apply limit to query
            query = query.limit(limit)
            
            print(f"🔍 Executing Firestore query with limit={limit}...")
            
            # Convert stream to list immediately with timeout protection
            # This prevents the stream from hanging indefinitely
            watchlist = []
            try:
                # Get documents and convert to list immediately
                # Using list() conversion to force immediate execution
                docs = list(query.stream())
                print(f"✅ Firestore query completed, retrieved {len(docs)} documents")
                
                for doc in docs:
                    item_data = doc.to_dict()
                    item_data['id'] = doc.id
                    
                    # Ensure symbol field exists (use id as fallback)
                    if 'symbol' not in item_data and doc.id:
                        item_data['symbol'] = doc.id
                        logger.warning(f"Stock missing 'symbol' field, using doc.id: {doc.id}")
                    
                    watchlist.append(item_data)
                    
            except Exception as stream_error:
                logger.error(f"Error streaming Firestore documents: {stream_error}")
                print(f"❌ Firestore stream error: {stream_error}")
                # Return empty list if stream fails
                return []

            # Sort by priority and added date
            priority_order = {'high': 0, 'medium': 1, 'low': 2}
            watchlist.sort(key=lambda x: (priority_order.get(x.get('priority', 'medium'), 1), x.get('added_at', datetime.max)))

            logger.info(f"Retrieved {len(watchlist)} items from watchlist for user {user_id}")
            # Log first few symbols for debugging
            if watchlist:
                symbols = [item.get('symbol', 'NO_SYMBOL') for item in watchlist[:5]]
                logger.info(f"First 5 symbols: {symbols}")
            return watchlist

        except Exception as e:
            logger.error(f"Error getting watchlist for user {user_id}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            print(f"❌ Error getting watchlist: {e}")
            return []

    def get_stock(self, user_id: str, symbol: str) -> Optional[Dict[str, Any]]:
        """Get a specific stock from user's watchlist"""
        try:
            symbol = symbol.upper()
            doc = self.db.collection('users').document(user_id).collection('watchlist').document(symbol).get()

            if doc.exists:
                item_data = doc.to_dict()
                item_data['id'] = doc.id
                return item_data

            return None

        except Exception as e:
            logger.error(f"Error getting stock {symbol} for user {user_id}: {e}")
            return None

    def update_stock(self, user_id: str, symbol: str, **updates) -> Dict[str, Any]:
        """Update a stock in the watchlist"""
        try:
            symbol = symbol.upper()
            watchlist_ref = self.db.collection('users').document(user_id).collection('watchlist')
            doc_ref = watchlist_ref.document(symbol)

            # Check if stock exists
            if not doc_ref.get().exists:
                return {
                    'success': False,
                    'message': f'{symbol} not found in watchlist'
                }

            # Validate updates
            current_data = doc_ref.get().to_dict()
            updated_item = WatchlistItem.from_dict({**current_data, **updates, 'last_updated': datetime.utcnow()})

            errors = self._validate_watchlist_item(updated_item)
            if errors:
                return {
                    'success': False,
                    'message': '; '.join(errors)
                }

            # Update in Firestore
            update_data = updates.copy()
            update_data['last_updated'] = datetime.utcnow()
            doc_ref.update(update_data)

            logger.info(f"Updated {symbol} in watchlist for user {user_id}")
            return {
                'success': True,
                'message': f'{symbol} updated successfully',
                'item': updated_item.to_dict()
            }

        except Exception as e:
            logger.error(f"Error updating {symbol} for user {user_id}: {e}")
            return {
                'success': False,
                'message': 'Failed to update stock'
            }

    def get_categories(self, user_id: str) -> List[str]:
        """Get all categories used by user"""
        try:
            watchlist = self.get_watchlist(user_id)
            categories = set()

            for item in watchlist:
                categories.add(item.get('category', 'General'))

            return sorted(list(categories))

        except Exception as e:
            logger.error(f"Error getting categories for user {user_id}: {e}")
            return ['General']

    def get_watchlist_stats(self, user_id: str) -> Dict[str, Any]:
        """Get statistics about user's watchlist"""
        try:
            watchlist = self.get_watchlist(user_id)

            stats = {
                'total_stocks': len(watchlist),
                'categories': {},
                'priorities': {'high': 0, 'medium': 0, 'low': 0},
                'recent_additions': 0,
                'with_notes': 0,
                'with_alerts': 0
            }

            # Count by category and priority
            for item in watchlist:
                category = item.get('category', 'General')
                priority = item.get('priority', 'medium')

                stats['categories'][category] = stats['categories'].get(category, 0) + 1
                stats['priorities'][priority] += 1

                # Check recent additions (last 7 days)
                added_at = item.get('added_at')
                if added_at and isinstance(added_at, datetime):
                    if (datetime.utcnow() - added_at) < timedelta(days=7):
                        stats['recent_additions'] += 1

                # Check for notes and alerts
                if item.get('notes'):
                    stats['with_notes'] += 1
                if item.get('alert_enabled', True):
                    stats['with_alerts'] += 1

            return stats

        except Exception as e:
            logger.error(f"Error getting watchlist stats for user {user_id}: {e}")
            return {}

    def _update_watchlist_metadata(self, user_id: str):
        """Update user's watchlist metadata"""
        try:
            metadata = {
                'last_updated': datetime.utcnow(),
                'total_stocks': len(self.get_watchlist(user_id))
            }

            self.db.collection('users').document(user_id).collection('metadata').document('watchlist').set(metadata, merge=True)

        except Exception as e:
            logger.error(f"Error updating watchlist metadata for user {user_id}: {e}")

    def migrate_legacy_watchlist(self, user_id: str, legacy_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Migrate legacy watchlist data to new format
        This handles migration from old FirebaseService format or pickle format
        """
        try:
            migrated_count = 0
            skipped_count = 0
            errors = []

            for item in legacy_data:
                try:
                    # Handle different legacy formats
                    if 'symbol' in item and 'company_name' in item:
                        symbol = item['symbol']
                        company_name = item.get('company_name', item.get('name', ''))

                        # Skip if already exists
                        if self.get_stock(user_id, symbol):
                            skipped_count += 1
                            continue

                        # Create new format item
                        new_item = WatchlistItem(
                            symbol=symbol,
                            company_name=company_name,
                            added_at=item.get('added_at', datetime.utcnow()),
                            last_updated=item.get('last_updated', datetime.utcnow()),
                            category=item.get('category', 'General'),
                            notes=item.get('notes', ''),
                            priority=item.get('priority', 'medium')
                        )

                        # Add to new watchlist
                        result = self.add_stock(
                            user_id,
                            new_item.symbol,
                            new_item.company_name,
                            category=new_item.category,
                            notes=new_item.notes,
                            priority=new_item.priority
                        )

                        if result['success']:
                            migrated_count += 1
                        else:
                            errors.append(f"Failed to migrate {symbol}: {result['message']}")

                    else:
                        errors.append(f"Invalid legacy item format: {item}")

                except Exception as e:
                    errors.append(f"Error migrating item {item.get('symbol', 'unknown')}: {str(e)}")

            # Mark migration as complete
            migration_status = {
                'completed_at': datetime.utcnow(),
                'migrated_count': migrated_count,
                'skipped_count': skipped_count,
                'errors': errors
            }

            self.db.collection('users').document(user_id).collection('metadata').document('migration').set(migration_status)

            return {
                'success': True,
                'message': f'Migrated {migrated_count} items, skipped {skipped_count}',
                'details': migration_status
            }

        except Exception as e:
            logger.error(f"Error migrating watchlist for user {user_id}: {e}")
            return {
                'success': False,
                'message': 'Migration failed',
                'error': str(e)
            }

    def clear_watchlist(self, user_id: str) -> Dict[str, Any]:
        """Clear all stocks from user's watchlist"""
        try:
            watchlist_ref = self.db.collection('users').document(user_id).collection('watchlist')
            docs = watchlist_ref.stream()

            deleted_count = 0
            for doc in docs:
                doc.reference.delete()
                deleted_count += 1

            # Update metadata
            self._update_watchlist_metadata(user_id)

            logger.info(f"Cleared {deleted_count} items from watchlist for user {user_id}")
            return {
                'success': True,
                'message': f'Cleared {deleted_count} stocks from watchlist'
            }

        except Exception as e:
            logger.error(f"Error clearing watchlist for user {user_id}: {e}")
            return {
                'success': False,
                'message': 'Failed to clear watchlist'
            }

    def batch_update(self, user_id: str, updates: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """
        Batch update multiple stocks in watchlist
        updates format: {'SYMBOL': {'field': 'value', ...}, ...}
        """
        try:
            batch = self.db.batch()
            updated_count = 0

            for symbol, update_data in updates.items():
                symbol = symbol.upper()
                doc_ref = self.db.collection('users').document(user_id).collection('watchlist').document(symbol)

                # Check if stock exists
                if doc_ref.get().exists:
                    update_data['last_updated'] = datetime.utcnow()
                    batch.update(doc_ref, update_data)
                    updated_count += 1

            batch.commit()

            # Update metadata
            self._update_watchlist_metadata(user_id)

            logger.info(f"Batch updated {updated_count} stocks for user {user_id}")
            return {
                'success': True,
                'message': f'Updated {updated_count} stocks successfully'
            }

        except Exception as e:
            logger.error(f"Error batch updating watchlist for user {user_id}: {e}")
            return {
                'success': False,
                'message': 'Batch update failed'
            }

    def update_legacy_stocks(self, user_id: str, stock_prices: Dict[str, float]) -> Dict[str, Any]:
        """
        Update legacy stocks that don't have original_price set
        This is called when displaying watchlist details for stocks without original price data
        """
        try:
            watchlist = self.get_watchlist(user_id)
            updated_count = 0
            
            for item in watchlist:
                symbol = item.get('symbol')
                if symbol and not item.get('original_price') and symbol in stock_prices:
                    # Update the stock with current price as original price
                    result = self.update_stock(
                        user_id, 
                        symbol, 
                        original_price=stock_prices[symbol]
                    )
                    if result['success']:
                        updated_count += 1
            
            logger.info(f"Updated {updated_count} legacy stocks for user {user_id}")
            return {
                'success': True,
                'message': f'Updated {updated_count} legacy stocks',
                'updated_count': updated_count
            }
            
        except Exception as e:
            logger.error(f"Error updating legacy stocks for user {user_id}: {e}")
            return {
                'success': False,
                'message': 'Failed to update legacy stocks'
            }


# Singleton instance for use throughout the application
_watchlist_service = None

def get_watchlist_service(db_client=None) -> WatchlistService:
    """Get singleton instance of WatchlistService"""
    global _watchlist_service
    if _watchlist_service is None:
        _watchlist_service = WatchlistService(db_client)
    return _watchlist_service

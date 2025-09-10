#!/usr/bin/env python3
"""
Migration script to move existing watchlist data from old FirebaseService format
to the new WatchlistService format.

This script should be run once after deploying the new watchlist system.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from firebase_service import FirebaseService, initialize_firebase
from watchlist_service import get_watchlist_service
from datetime import datetime
import logging
from firebase_admin import firestore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_all_users():
    """Migrate watchlist data for all users"""
    try:
        # Initialize Firebase
        if not initialize_firebase():
            logger.error("Failed to initialize Firebase")
            return False

        # Initialize services
        watchlist_service = get_watchlist_service()

        logger.info("Starting watchlist migration...")

        # Get all users with watchlists
        users_with_watchlists = []

        # Since Firestore doesn't have a direct way to query all collections,
        # we'll need to get users who have watchlist data
        # For now, we'll create a simple migration that can be called per user
        # or we can add a migration endpoint to the API

        logger.info("Migration script created successfully")
        logger.info("To migrate a specific user, use the migrate_user_watchlist function")

        return True

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False

def migrate_user_watchlist(user_id: str):
    """
    Migrate watchlist data for a specific user

    Args:
        user_id: Firebase user ID

    Returns:
        Dict with migration results
    """
    try:
        # Initialize Firebase
        if not initialize_firebase():
            return {
                'success': False,
                'message': 'Failed to initialize Firebase'
            }

        # Initialize services
        watchlist_service = get_watchlist_service()

        logger.info(f"Migrating watchlist for user: {user_id}")

        # Get existing watchlist using old FirebaseService method
        legacy_watchlist = FirebaseService.get_watchlist(user_id)

        if not legacy_watchlist:
            return {
                'success': True,
                'message': 'No existing watchlist found - nothing to migrate',
                'migrated_count': 0
            }

        logger.info(f"Found {len(legacy_watchlist)} items in legacy watchlist")

        # Check if user already has data in new format
        new_watchlist = watchlist_service.get_watchlist(user_id)
        if new_watchlist:
            logger.warning(f"User {user_id} already has {len(new_watchlist)} items in new format")
            return {
                'success': False,
                'message': 'User already has data in new format. Manual migration required.',
                'legacy_count': len(legacy_watchlist),
                'new_count': len(new_watchlist)
            }

        # Migrate the data
        migration_result = watchlist_service.migrate_legacy_watchlist(user_id, legacy_watchlist)

        if migration_result['success']:
            logger.info(f"Successfully migrated {migration_result['details']['migrated_count']} items for user {user_id}")

            # Optionally clean up old data (commented out for safety)
            # _cleanup_legacy_watchlist(user_id)

        return migration_result

    except Exception as e:
        logger.error(f"Migration failed for user {user_id}: {e}")
        return {
            'success': False,
            'message': f'Migration failed: {str(e)}'
        }

def _cleanup_legacy_watchlist(user_id: str):
    """
    Clean up legacy watchlist data after successful migration
    WARNING: This will permanently delete the old data
    """
    try:
        # This would delete the old watchlist collection
        # Only run this after confirming migration was successful
        logger.warning(f"Legacy cleanup requested for user {user_id} - NOT IMPLEMENTED FOR SAFETY")
        # Uncomment and implement if needed:
        # db = firestore.client()
        # batch = db.batch()
        # docs = db.collection('users').document(user_id).collection('watchlist').stream()
        # for doc in docs:
        #     batch.delete(doc.reference)
        # batch.commit()
        # logger.info(f"Cleaned up legacy watchlist for user {user_id}")

    except Exception as e:
        logger.error(f"Failed to cleanup legacy data for user {user_id}: {e}")

def check_migration_status(user_id: str):
    """Check if a user has been migrated"""
    try:
        if not initialize_firebase():
            return None

        db = firestore.client()
        migration_doc = db.collection('users').document(user_id).collection('metadata').document('migration').get()

        if migration_doc.exists:
            return migration_doc.to_dict()
        else:
            return None

    except Exception as e:
        logger.error(f"Failed to check migration status for user {user_id}: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python migrate_watchlist.py <user_id>")
        print("Example: python migrate_watchlist.py abc123def456")
        sys.exit(1)

    user_id = sys.argv[1]
    result = migrate_user_watchlist(user_id)

    print("\nMigration Result:")
    print(f"Success: {result['success']}")
    print(f"Message: {result['message']}")

    if 'details' in result:
        details = result['details']
        print(f"Migrated: {details.get('migrated_count', 0)}")
        print(f"Skipped: {details.get('skipped_count', 0)}")
        if details.get('errors'):
            print(f"Errors: {len(details['errors'])}")
            for error in details['errors'][:5]:  # Show first 5 errors
                print(f"  - {error}")

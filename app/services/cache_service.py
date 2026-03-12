"""
Persistent AI response cache backed by Firestore.

Collection: ai_cache/{key}
Document fields:
  data        – JSON-serialized payload (string)
  cached_at   – UTC timestamp of when it was stored
  ttl_seconds – TTL used when writing (informational only; TTL is enforced on read)
"""

import json
import logging
from datetime import datetime, timezone

from app.services.firebase_service import get_firestore_client

logger = logging.getLogger(__name__)

COLLECTION = 'ai_cache'


def cache_get(key: str, ttl_seconds: int):
    """Return cached data if it exists and is within TTL, else None."""
    try:
        db = get_firestore_client()
        if not db:
            return None

        doc = db.collection(COLLECTION).document(key).get()
        if not doc.exists:
            return None

        entry = doc.to_dict()
        cached_at = entry.get('cached_at')
        if not cached_at:
            return None

        # Firestore timestamps come back as timezone-aware datetimes
        now = datetime.now(timezone.utc)
        if hasattr(cached_at, 'tzinfo') and cached_at.tzinfo is None:
            # naive datetime — treat as UTC
            from datetime import timezone as tz
            cached_at = cached_at.replace(tzinfo=tz.utc)

        age = (now - cached_at).total_seconds()
        if age > ttl_seconds:
            return None

        raw = entry.get('data')
        if raw is None:
            return None

        return json.loads(raw)

    except Exception as e:
        logger.warning("cache_get failed for key=%s: %s", key, e)
        return None


def cache_set(key: str, data, ttl_seconds: int) -> None:
    """Persist data to Firestore cache. Silently no-ops on failure."""
    try:
        db = get_firestore_client()
        if not db:
            return

        db.collection(COLLECTION).document(key).set({
            'data': json.dumps(data, default=str),
            'cached_at': datetime.now(timezone.utc),
            'ttl_seconds': ttl_seconds,
        })

    except Exception as e:
        logger.warning("cache_set failed for key=%s: %s", key, e)

"""
Subscription service — server-side enforcement of Stripe-based paywalls.

All tier checks happen here. The frontend is NEVER trusted for subscription state.
"""
import os
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Plan definitions
# ---------------------------------------------------------------------------
PLANS = {
    'free': {
        'chat_daily_limit': 5,
        'ai_suite': False,
        'label': 'Free',
    },
    'pro': {
        'chat_daily_limit': 50,
        'ai_suite': True,
        'label': 'Pro',
    },
    'elite': {
        'chat_daily_limit': None,   # None = unlimited
        'ai_suite': True,
        'label': 'Elite',
    },
}

ACTIVE_STATUSES = {'active', 'trialing'}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_db():
    from app.services.firebase_service import get_firestore_client
    return get_firestore_client()


def get_user_subscription(user_id: str) -> dict:
    """
    Reads the user's subscription from Firestore.
    Always falls back to 'free' if data is missing or status is not active.
    """
    try:
        db = _get_db()
        doc = db.collection('users').document(user_id).get()
        if not doc.exists:
            return {'tier': 'free', 'status': None, 'trial_end': None, 'current_period_end': None}
        data = doc.to_dict() or {}
        tier = data.get('subscription_tier', 'free')
        status = data.get('subscription_status')
        # Downgrade to free if subscription lapses
        if tier != 'free' and status not in ACTIVE_STATUSES:
            tier = 'free'
        return {
            'tier': tier,
            'status': status,
            'stripe_customer_id': data.get('stripe_customer_id'),
            'stripe_subscription_id': data.get('stripe_subscription_id'),
            'trial_end': data.get('trial_end'),
            'current_period_end': data.get('current_period_end'),
        }
    except Exception as e:
        logger.error("Error fetching subscription for %s: %s", user_id, e)
        return {'tier': 'free', 'status': None, 'trial_end': None, 'current_period_end': None}


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def get_daily_chat_usage(user_id: str) -> int:
    """Returns today's chat message count from Firestore."""
    today = _today_utc()
    try:
        db = _get_db()
        doc = db.collection('daily_usage').document(user_id).get()
        if not doc.exists:
            return 0
        return int((doc.to_dict() or {}).get(today, 0))
    except Exception as e:
        logger.error("Error fetching daily usage for %s: %s", user_id, e)
        return 0


def _increment_chat_usage(user_id: str) -> int:
    """Atomically increments today's usage and returns the new count."""
    from google.cloud.firestore_v1 import Increment
    today = _today_utc()
    try:
        db = _get_db()
        ref = db.collection('daily_usage').document(user_id)
        ref.set({today: Increment(1)}, merge=True)
        doc = ref.get()
        return int((doc.to_dict() or {}).get(today, 1))
    except Exception as e:
        logger.error("Error incrementing usage for %s: %s", user_id, e)
        return 1


def check_and_increment_chat_usage(user_id: str) -> dict:
    """
    Gate for chat messages. Checks daily limit then atomically increments.
    Returns dict with: allowed, used, limit, tier, upgrade_required.

    CALL THIS before processing any chat message.
    """
    sub = get_user_subscription(user_id)
    tier = sub['tier']
    plan = PLANS.get(tier, PLANS['free'])
    limit = plan['chat_daily_limit']
    used = get_daily_chat_usage(user_id)

    if limit is not None and used >= limit:
        return {
            'allowed': False,
            'used': used,
            'limit': limit,
            'tier': tier,
            'upgrade_required': True,
        }

    new_count = _increment_chat_usage(user_id)
    return {
        'allowed': True,
        'used': new_count,
        'limit': limit,
        'tier': tier,
        'upgrade_required': False,
    }


def check_hourly_rate_limit(user_id: str, limit: int = 60) -> dict:
    """
    Checks and atomically increments per-user hourly request count in Firestore.
    Collection: hourly_usage/{user_id}  Field: 'YYYY-MM-DD-HH'

    Returns dict with: allowed, used, limit.
    Fails open (allowed=True) on any Firestore error.
    """
    from google.cloud.firestore_v1 import Increment
    hour_key = datetime.now(timezone.utc).strftime('%Y-%m-%d-%H')
    try:
        db = _get_db()
        ref = db.collection('hourly_usage').document(user_id)
        doc = ref.get()
        count = int(((doc.to_dict() or {}) if doc.exists else {}).get(hour_key, 0))
        if count >= limit:
            return {'allowed': False, 'used': count, 'limit': limit}
        ref.set({hour_key: Increment(1)}, merge=True)
        return {'allowed': True, 'used': count + 1, 'limit': limit}
    except Exception as e:
        logger.error("Error checking hourly rate for %s: %s", user_id, e)
        return {'allowed': True, 'used': 0, 'limit': limit}


def check_ai_suite_access(user_id: str) -> dict:
    """
    Gate for AI Suite features (Morning Brief, Thesis, Health Score, Sector Rotation).
    Returns dict with: allowed, tier, upgrade_required.

    CALL THIS before processing any AI suite request.
    """
    sub = get_user_subscription(user_id)
    tier = sub['tier']
    allowed = PLANS.get(tier, PLANS['free'])['ai_suite']
    return {
        'allowed': allowed,
        'tier': tier,
        'upgrade_required': not allowed,
    }


# ---------------------------------------------------------------------------
# Stripe helpers
# ---------------------------------------------------------------------------

def _stripe():
    import stripe
    stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
    if not stripe.api_key:
        raise RuntimeError("STRIPE_SECRET_KEY not configured")
    return stripe


def create_checkout_session(user_id: str, user_email: str, price_id: str,
                            success_url: str, cancel_url: str) -> str:
    """Creates a Stripe Checkout session and returns the hosted URL."""
    stripe = _stripe()
    sub = get_user_subscription(user_id)
    customer_id = sub.get('stripe_customer_id')

    if not customer_id:
        customer = stripe.Customer.create(
            email=user_email,
            metadata={'firebase_uid': user_id}
        )
        customer_id = customer.id
        _get_db().collection('users').document(user_id).set(
            {'stripe_customer_id': customer_id}, merge=True
        )

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=['card'],
        line_items=[{'price': price_id, 'quantity': 1}],
        mode='subscription',
        allow_promotion_codes=True,
        subscription_data={
            'trial_period_days': 7,
            'metadata': {'firebase_uid': user_id},
        },
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={'firebase_uid': user_id},
    )
    return session.url


def create_portal_session(user_id: str, return_url: str) -> str:
    """Creates a Stripe Customer Portal session and returns the URL."""
    stripe = _stripe()
    sub = get_user_subscription(user_id)
    customer_id = sub.get('stripe_customer_id')
    if not customer_id:
        raise ValueError("No Stripe customer found for this user")
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


def handle_stripe_webhook(payload: bytes, sig_header: str) -> bool:
    """
    Verifies and processes Stripe webhook events.
    Updates subscription tier in Firestore. Returns True on success.
    """
    stripe = _stripe()
    webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET')
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except Exception as e:
        logger.warning("Stripe webhook verification failed: %s", e)
        return False

    event_type = event['type']
    logger.info("Stripe webhook received: %s", event_type)

    if event_type in (
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
    ):
        _sync_subscription(event['data']['object'])
    elif event_type == 'checkout.session.completed':
        session = event['data']['object']
        if session.get('subscription'):
            sub = stripe.Subscription.retrieve(session['subscription'])
            _sync_subscription(sub)
    elif event_type == 'invoice.payment_failed':
        # Payment failed — sync the subscription so status becomes past_due,
        # which causes get_user_subscription() to downgrade the user to free tier.
        invoice = event['data']['object']
        if invoice.get('subscription'):
            sub = stripe.Subscription.retrieve(invoice['subscription'])
            _sync_subscription(sub)
            logger.warning(
                "Payment failed for subscription %s (customer %s) — tier downgraded if status is past_due",
                invoice['subscription'], invoice.get('customer')
            )

    return True


def _sync_subscription(subscription) -> None:
    """Writes a Stripe subscription's tier and status to Firestore."""
    firebase_uid = (
        (subscription.get('metadata') or {}).get('firebase_uid')
        or _find_uid_by_customer(subscription.get('customer'))
    )
    if not firebase_uid:
        logger.warning("Cannot find firebase_uid for subscription %s", subscription.get('id'))
        return

    status = subscription.get('status', 'canceled')
    price_id = None
    try:
        price_id = subscription['items']['data'][0]['price']['id']
    except (KeyError, IndexError):
        pass

    tier = _price_to_tier(price_id)
    _get_db().collection('users').document(firebase_uid).set({
        'subscription_tier': tier,
        'subscription_status': status,
        'stripe_subscription_id': subscription.get('id'),
        'stripe_customer_id': subscription.get('customer'),
        'trial_end': subscription.get('trial_end'),
        'current_period_end': subscription.get('current_period_end'),
        'subscription_updated_at': datetime.now(timezone.utc).isoformat(),
    }, merge=True)
    logger.info("Synced subscription: uid=%s tier=%s status=%s", firebase_uid, tier, status)


def _find_uid_by_customer(customer_id: str):
    """Looks up Firebase UID by Stripe customer ID in Firestore."""
    if not customer_id:
        return None
    try:
        docs = _get_db().collection('users').where('stripe_customer_id', '==', customer_id).limit(1).get()
        for doc in docs:
            return doc.id
    except Exception as e:
        logger.error("Error finding uid by customer %s: %s", customer_id, e)
    return None


def _price_to_tier(price_id) -> str:
    """Maps a Stripe price ID to a subscription tier name."""
    if not price_id:
        return 'free'
    pro_prices = {
        os.environ.get('STRIPE_PRO_MONTHLY_PRICE_ID'),
        os.environ.get('STRIPE_PRO_YEARLY_PRICE_ID'),
    } - {None}

    elite_prices = {
        os.environ.get('STRIPE_ELITE_MONTHLY_PRICE_ID'),
        os.environ.get('STRIPE_ELITE_YEARLY_PRICE_ID'),
    } - {None}
    if price_id in pro_prices:
        return 'pro'
    if price_id in elite_prices:
        return 'elite'
    return 'free'

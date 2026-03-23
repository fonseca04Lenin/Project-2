"""
Billing routes — Stripe checkout, customer portal, and webhook processing.
"""
import logging
import os

from flask import Blueprint, request, jsonify

from app.services.services import authenticate_request

logger = logging.getLogger(__name__)

billing_bp = Blueprint('billing', __name__, url_prefix='/api/billing')

_raw = os.environ.get('FRONTEND_URL', 'https://aistocksage.com').strip().rstrip('/')
_FRONTEND_URL = _raw if _raw.startswith(('http://', 'https://')) else f'https://{_raw}'
logger.info("Billing module loaded — FRONTEND_URL resolved to: %s", _FRONTEND_URL)


def _allowed_price_ids():
    ids = {
        os.environ.get('STRIPE_PRO_MONTHLY_PRICE_ID'),
        os.environ.get('STRIPE_PRO_YEARLY_PRICE_ID'),
        os.environ.get('STRIPE_ELITE_MONTHLY_PRICE_ID'),
        os.environ.get('STRIPE_ELITE_YEARLY_PRICE_ID'),
    }
    return ids - {None}


@billing_bp.route('/subscription', methods=['GET'])
def get_subscription():
    """Returns the authenticated user's current subscription info."""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    from app.services.subscription_service import get_user_subscription, get_daily_chat_usage, PLANS

    sub = get_user_subscription(user.id)
    tier = sub['tier']
    plan = PLANS.get(tier, PLANS['free'])
    used = get_daily_chat_usage(user.id)
    limit = plan['chat_daily_limit']

    return jsonify({
        'tier': tier,
        'status': sub.get('status'),
        'label': plan['label'],
        'chat_daily_limit': limit,
        'chat_used_today': used,
        'ai_suite_access': plan['ai_suite'],
        'can_send_chat': limit is None or used < limit,
        'trial_end': sub.get('trial_end'),
        'current_period_end': sub.get('current_period_end'),
    })


@billing_bp.route('/create-checkout', methods=['POST'])
def create_checkout():
    """Creates a Stripe Checkout session. Returns the redirect URL."""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    body = request.get_json(silent=True) or {}
    price_id = (body.get('price_id') or '').strip()
    if not price_id:
        return jsonify({'error': 'price_id is required'}), 400

    # Whitelist check — never allow arbitrary Stripe price IDs
    if price_id not in _allowed_price_ids():
        return jsonify({'error': 'Invalid price ID'}), 400

    try:
        from app.services.subscription_service import create_checkout_session
        email = getattr(user, 'email', '') or ''
        url = create_checkout_session(
            user_id=user.id,
            user_email=email,
            price_id=price_id,
            success_url=f"{_FRONTEND_URL}/?checkout=success",
            cancel_url=f"{_FRONTEND_URL}/pricing?checkout=canceled",
        )
        return jsonify({'checkout_url': url})
    except Exception as e:
        import traceback
        logger.error("Checkout error for %s: %s\n%s", user.id, e, traceback.format_exc())
        return jsonify({'error': 'Failed to create checkout session'}), 500


@billing_bp.route('/portal', methods=['POST'])
def customer_portal():
    """Creates a Stripe Customer Portal session for managing subscriptions."""
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    try:
        from app.services.subscription_service import create_portal_session
        url = create_portal_session(user.id, return_url=f"{_FRONTEND_URL}/")
        return jsonify({'portal_url': url})
    except ValueError:
        return jsonify({'error': 'No subscription found. Please upgrade first.'}), 400
    except Exception as e:
        import traceback
        logger.error("Portal error for %s: %s\n%s", user.id, e, traceback.format_exc())
        return jsonify({'error': 'Failed to create portal session'}), 500


@billing_bp.route('/webhook', methods=['POST'])
def stripe_webhook():
    """
    Stripe webhook endpoint. No Firebase auth — verified via Stripe-Signature header.
    Updates subscription tier in Firestore upon subscription events.
    """
    import os
    if not os.environ.get('STRIPE_WEBHOOK_SECRET'):
        logger.error("STRIPE_WEBHOOK_SECRET is not configured — webhook rejected")
        return jsonify({'error': 'Webhook not configured'}), 500

    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature', '')
    if not sig_header:
        logger.warning("Stripe webhook received without Stripe-Signature header")
        return jsonify({'error': 'Missing signature'}), 400

    from app.services.subscription_service import handle_stripe_webhook
    success = handle_stripe_webhook(payload, sig_header)
    if success:
        return jsonify({'received': True}), 200
    return jsonify({'error': 'Webhook processing failed'}), 400

"""
Centralized AI provider gateway for simple text generation.

Covers all prompt → text calls across ai_features, chat routes, etc.
Does NOT replace ChatService._call_grok_api (Responses API + tool calling).

Usage:
    from app.services.ai_gateway import generate

    text = generate(
        prompt,
        max_tokens=600,
        temperature=0.75,
        providers=['grok', 'groq', 'gemini'],   # tried in order
        user_id=user.id,                          # for token logging
        endpoint='morning_brief',                 # for token logging
    )

Provider fallback: tries each provider in `providers` order, moves to next on any error.
Token logging: writes to Firestore ai_token_usage/{user_id} — fails silently.
"""

import logging
import os
import requests as http_requests
from datetime import datetime, timezone
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model config — change here to swap models across the whole app
# ---------------------------------------------------------------------------
GROK_MODEL = 'grok-3-fast'            # xAI chat completions (simple, fast)
GROQ_MODEL = 'llama-3.3-70b-versatile'
GEMINI_MODEL = 'gemini-1.5-flash'

_GROK_URL = 'https://api.x.ai/v1/chat/completions'
_GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

DEFAULT_CHAIN = ['grok', 'groq', 'gemini']


# ---------------------------------------------------------------------------
# Provider callables  (each returns (text, total_tokens))
# ---------------------------------------------------------------------------

def _call_grok(prompt: str, max_tokens: int, temperature: float) -> Tuple[str, int]:
    api_key = os.environ.get('XAI_API_KEY')
    if not api_key:
        raise RuntimeError("XAI_API_KEY not configured")
    resp = http_requests.post(
        _GROK_URL,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        json={
            'model': GROK_MODEL,
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': temperature,
            'max_tokens': max_tokens,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data['choices'][0]['message']['content'].strip()
    tokens = (data.get('usage') or {}).get('total_tokens', 0)
    return text, tokens


def _call_groq(prompt: str, max_tokens: int, temperature: float) -> Tuple[str, int]:
    api_key = os.environ.get('GROQ_API_KEY')
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not configured")
    resp = http_requests.post(
        _GROQ_URL,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        json={
            'model': GROQ_MODEL,
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': temperature,
            'max_tokens': max_tokens,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data['choices'][0]['message']['content'].strip()
    tokens = (data.get('usage') or {}).get('total_tokens', 0)
    return text, tokens


def _call_gemini(prompt: str, max_tokens: int, temperature: float) -> Tuple[str, int]:
    import google.generativeai as genai
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        ),
    )
    text = response.text.strip()
    tokens = getattr(response.usage_metadata, 'total_token_count', 0) or 0
    return text, tokens


_PROVIDERS = {
    'grok': _call_grok,
    'groq': _call_groq,
    'gemini': _call_gemini,
}


# ---------------------------------------------------------------------------
# Token logging
# ---------------------------------------------------------------------------

def _log_tokens(user_id: str, endpoint: str, provider: str, tokens: int) -> None:
    """Write token usage to Firestore. Silently no-ops on any failure."""
    if not user_id or not endpoint or tokens <= 0:
        return
    try:
        from app.services.firebase_service import get_firestore_client
        from google.cloud.firestore_v1 import Increment
        db = get_firestore_client()
        if not db:
            return
        date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        # Flat keys like "2026-03-11.morning_brief.tokens" work with Increment
        db.collection('ai_token_usage').document(user_id).set(
            {
                f'{date}.{endpoint}.tokens': Increment(tokens),
                f'{date}.{endpoint}.calls': Increment(1),
            },
            merge=True,
        )
    except Exception as e:
        logger.warning("Token log failed (user=%s endpoint=%s): %s", user_id, endpoint, e)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate(
    prompt: str,
    max_tokens: int = 600,
    temperature: float = 0.75,
    providers: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    endpoint: Optional[str] = None,
) -> str:
    """
    Generate text from the first provider in `providers` that succeeds.

    Args:
        prompt:      The prompt string.
        max_tokens:  Max tokens to generate.
        temperature: Sampling temperature.
        providers:   Ordered list of providers to try. Defaults to DEFAULT_CHAIN.
        user_id:     Firebase UID for token logging (optional).
        endpoint:    Feature name for token logging (optional), e.g. 'morning_brief'.

    Returns:
        Generated text string.

    Raises:
        RuntimeError: If all providers fail.
    """
    chain = providers if providers is not None else DEFAULT_CHAIN
    last_err: Optional[Exception] = None

    for provider in chain:
        fn = _PROVIDERS.get(provider)
        if fn is None:
            logger.warning("ai_gateway: unknown provider '%s', skipping", provider)
            continue
        try:
            text, tokens = fn(prompt, max_tokens, temperature)
            logger.debug("ai_gateway: %s succeeded (%d tokens, endpoint=%s)", provider, tokens, endpoint)
            _log_tokens(user_id, endpoint, provider, tokens)
            return text
        except Exception as e:
            logger.warning("ai_gateway: %s failed (%s) — trying next provider", provider, e)
            last_err = e

    raise RuntimeError(f"All AI providers failed. Last error: {last_err}")

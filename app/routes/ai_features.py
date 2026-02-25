import logging
import os
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify

from app.services.services import authenticate_request, ensure_watchlist_service, yahoo_finance_api

logger = logging.getLogger(__name__)

ai_features_bp = Blueprint('ai_features', __name__, url_prefix='/api/ai')

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
_ai_suite_cache = {}


def _is_cache_fresh(key, ttl_seconds):
    entry = _ai_suite_cache.get(key)
    if not entry or entry.get('data') is None or entry.get('timestamp') is None:
        return False
    age = (datetime.now() - entry['timestamp']).total_seconds()
    return age < ttl_seconds


def _set_cache(key, data):
    _ai_suite_cache[key] = {'data': data, 'timestamp': datetime.now()}


def _get_cache(key):
    return _ai_suite_cache.get(key, {}).get('data')


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_RULES_BLOCK = """
RULES:
- Write as a senior financial professional, not an AI system
- No phrases: "As an AI", "Based on available data", "It's worth noting", "It's important to note"
- State conclusions, not hedges. Use declarative present-tense sentences.
- Reference the actual numbers provided — no generic observations
- No markdown, no bullet characters in prose sections
"""


def _call_groq(prompt, max_tokens=600, temperature=0.75):
    import requests as http_requests
    groq_api_key = os.environ.get('GROQ_API_KEY')
    if not groq_api_key:
        raise RuntimeError("GROQ_API_KEY not configured")

    resp = http_requests.post(
        'https://api.groq.com/openai/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {groq_api_key}',
            'Content-Type': 'application/json'
        },
        json={
            'model': 'llama-3.3-70b-versatile',
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': temperature,
            'max_tokens': max_tokens
        },
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']['content'].strip()


def _call_gemini(prompt, max_tokens=800, temperature=0.7):
    """Call Gemini, returns text or raises."""
    import google.generativeai as genai
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
    )
    return response.text.strip()


def _get_user_watchlist_symbols(user_id):
    service = ensure_watchlist_service()
    wl = service.get_watchlist(user_id, limit=500)
    symbols = []
    for item in wl:
        s = item.get('symbol') or item.get('id')
        if s and isinstance(s, str):
            symbols.append(s.upper())
    return symbols


# ---------------------------------------------------------------------------
# Endpoint 1: Morning Brief
# ---------------------------------------------------------------------------

@ai_features_bp.route('/morning-brief', methods=['GET'])
def morning_brief():
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    force_refresh = request.args.get('refresh') == '1'
    cache_key = f'morning_brief_{user.id}'
    ttl = 6 * 3600  # 6 hours

    if not force_refresh and _is_cache_fresh(cache_key, ttl):
        return jsonify(_get_cache(cache_key))

    try:
        import yfinance as yf
        import pandas as pd

        symbols = _get_user_watchlist_symbols(user.id)
        if not symbols:
            return jsonify({'error': 'Your watchlist is empty. Add some stocks first.'}), 422

        # Batch download 5 days of data
        data = yf.download(symbols, period='5d', progress=False, threads=True)
        closes = data['Close'] if 'Close' in data.columns else data

        movers = []
        for sym in symbols:
            try:
                col = closes[sym] if sym in closes.columns else closes
                if hasattr(col, 'dropna'):
                    col = col.dropna()
                else:
                    continue
                if len(col) < 2:
                    continue
                pct = ((col.iloc[-1] - col.iloc[0]) / col.iloc[0]) * 100
                movers.append({'symbol': sym, 'change': round(float(pct), 2), 'price': round(float(col.iloc[-1]), 2)})
            except Exception:
                continue

        movers.sort(key=lambda x: abs(x['change']), reverse=True)
        top_movers = movers[:3]

        # Fetch headlines for top movers
        for m in top_movers:
            try:
                ticker = yf.Ticker(m['symbol'])
                news = ticker.news or []
                m['headline'] = news[0].get('title', '') if news else ''
            except Exception:
                m['headline'] = ''

        # Earnings calendar - next 7 days filtered to user symbols
        earnings_this_week = []
        try:
            from app.services.services import finnhub_api
            raw_earnings = finnhub_api.get_earnings_calendar() or []
            today = datetime.now().date()
            cutoff = today + timedelta(days=7)
            user_set = set(symbols)
            for e in raw_earnings:
                if e.get('symbol') in user_set:
                    try:
                        ed = datetime.strptime(e['date'], '%Y-%m-%d').date()
                        if today <= ed <= cutoff:
                            earnings_this_week.append({'symbol': e['symbol'], 'date': e['date']})
                    except Exception:
                        pass
        except Exception:
            pass

        today_str = datetime.now().strftime('%B %d, %Y')
        movers_text = '\n'.join(
            f"  {m['symbol']}: {'+' if m['change'] >= 0 else ''}{m['change']}% at ${m['price']}"
            + (f" — \"{m['headline']}\"" if m.get('headline') else '')
            for m in top_movers
        ) or '  No significant movers'

        earnings_text = ', '.join(f"{e['symbol']} ({e['date']})" for e in earnings_this_week) or 'none this week'

        prompt = f"""You are writing the daily portfolio morning brief for {today_str}.

WATCHLIST TOP MOVERS (5-day):
{movers_text}

UPCOMING EARNINGS FROM WATCHLIST (next 7 days):
{earnings_text}

Write a 120-word morning brief in newsletter style. Open with today's date. Reference the actual stocks and moves. Flag any earnings coming up. Close with one specific thing to watch today.
{_RULES_BLOCK}"""

        narrative = _call_groq(prompt, max_tokens=700, temperature=0.75)

        top_headline = ''
        for m in top_movers:
            if m.get('headline'):
                top_headline = m['headline']
                break

        result = {
            'brief': {
                'date_label': today_str,
                'narrative': narrative,
                'movers': top_movers,
                'earnings_this_week': earnings_this_week,
                'top_headline': top_headline
            }
        }
        _set_cache(cache_key, result)
        return jsonify(result)

    except Exception as e:
        logger.error("Error generating morning brief: %s", e)
        return jsonify({'error': 'Failed to generate morning brief. Try again shortly.'}), 500


# ---------------------------------------------------------------------------
# Endpoint 2: Thesis Builder
# ---------------------------------------------------------------------------

@ai_features_bp.route('/thesis', methods=['POST'])
def thesis_builder():
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    body = request.get_json(silent=True) or {}
    symbol = (body.get('symbol') or '').upper().strip()
    if not symbol:
        return jsonify({'error': 'symbol is required'}), 400

    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol)
        info = ticker.info or {}

        current_price = info.get('currentPrice') or info.get('regularMarketPrice') or 0
        pe_ratio = info.get('trailingPE')
        market_cap = info.get('marketCap', 0)
        sector = info.get('sector', 'Unknown')
        company_name = info.get('longName') or info.get('shortName') or symbol
        week52_high = info.get('fiftyTwoWeekHigh', 0)
        week52_low = info.get('fiftyTwoWeekLow', 0)
        revenue_growth = info.get('revenueGrowth')

        # 3-month history for return calc
        hist = ticker.history(period='3mo')
        three_month_return = None
        if not hist.empty and len(hist) >= 2:
            three_month_return = round(((hist['Close'].iloc[-1] - hist['Close'].iloc[0]) / hist['Close'].iloc[0]) * 100, 2)

        # Market cap label
        if market_cap >= 1e12:
            mc_label = f"${market_cap/1e12:.1f}T"
        elif market_cap >= 1e9:
            mc_label = f"${market_cap/1e9:.1f}B"
        elif market_cap > 0:
            mc_label = f"${market_cap/1e6:.0f}M"
        else:
            mc_label = 'N/A'

        # 5 recent headlines
        news = ticker.news or []
        headlines = [n.get('title', '') for n in news[:5] if n.get('title')]

        metrics_text = f"""Symbol: {symbol} ({company_name})
Sector: {sector}
Current Price: ${current_price:.2f}
P/E Ratio: {pe_ratio if pe_ratio else 'N/A'}
Market Cap: {mc_label}
52-Week Range: ${week52_low:.2f} – ${week52_high:.2f}
3-Month Return: {f'{three_month_return:+.1f}%' if three_month_return is not None else 'N/A'}
Revenue Growth (YoY): {f'{revenue_growth*100:.1f}%' if revenue_growth is not None else 'N/A'}"""

        headlines_text = '\n'.join(f"- {h}" for h in headlines) if headlines else '- No recent headlines'

        prompt = f"""You are a senior equity analyst writing an investment thesis for {symbol}.

COMPANY DATA:
{metrics_text}

RECENT HEADLINES:
{headlines_text}

Return a JSON object ONLY (no prose before or after) with this exact structure:
{{
  "bull_case": [
    {{"title": "...", "body": "..."}},
    {{"title": "...", "body": "..."}},
    {{"title": "...", "body": "..."}}
  ],
  "bear_case": [
    {{"title": "...", "body": "..."}},
    {{"title": "...", "body": "..."}},
    {{"title": "...", "body": "..."}}
  ]
}}

Each title: 3-5 words. Each body: 1-2 sentences anchored to the actual data provided. Bull case highlights growth catalysts. Bear case highlights real risks.
{_RULES_BLOCK}"""

        # Try Gemini first, fallback to Groq
        raw_text = None
        try:
            raw_text = _call_gemini(prompt, max_tokens=800, temperature=0.7)
        except Exception as gem_err:
            logger.warning("Gemini failed for thesis, using Groq: %s", gem_err)
            raw_text = _call_groq(prompt, max_tokens=800, temperature=0.7)

        # Parse JSON from response
        import json
        import re
        json_match = re.search(r'\{[\s\S]*\}', raw_text)
        thesis = {'bull_case': [], 'bear_case': []}
        if json_match:
            try:
                thesis = json.loads(json_match.group())
            except Exception:
                pass

        result = {
            'symbol': symbol,
            'company_name': company_name,
            'sector': sector,
            'current_price': current_price,
            'pe_ratio': pe_ratio,
            'three_month_return': three_month_return,
            'market_cap_label': mc_label,
            'thesis': thesis
        }
        return jsonify(result)

    except Exception as e:
        logger.error("Error generating thesis for %s: %s", symbol, e)
        return jsonify({'error': f'Failed to generate thesis for {symbol}. Try again.'}), 500


# ---------------------------------------------------------------------------
# Endpoint 3: Portfolio Health Score
# ---------------------------------------------------------------------------

@ai_features_bp.route('/health-score', methods=['GET'])
def health_score():
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    force_refresh = request.args.get('refresh') == '1'
    cache_key = f'health_score_{user.id}'
    ttl = 6 * 3600

    if not force_refresh and _is_cache_fresh(cache_key, ttl):
        return jsonify(_get_cache(cache_key))

    try:
        import yfinance as yf
        import pandas as pd
        import numpy as np

        symbols = _get_user_watchlist_symbols(user.id)
        if not symbols:
            return jsonify({'error': 'Your watchlist is empty. Add some stocks first.'}), 422

        # Batch 3mo price data
        data = yf.download(symbols, period='3mo', progress=False, threads=True)
        closes = data['Close'] if 'Close' in data.columns else data

        # Compute annualized volatility per stock
        volatilities = {}
        for sym in symbols:
            try:
                col = closes[sym].dropna() if sym in closes.columns else None
                if col is None or len(col) < 10:
                    continue
                daily_ret = col.pct_change().dropna()
                ann_vol = float(daily_ret.std() * (252 ** 0.5) * 100)
                volatilities[sym] = ann_vol
            except Exception:
                continue

        valid_symbols = list(volatilities.keys())
        avg_volatility = round(sum(volatilities.values()) / len(volatilities), 1) if volatilities else 0

        # Correlation matrix — max correlation between any two stocks
        max_correlation = 0.0
        if len(valid_symbols) >= 2:
            try:
                price_df = closes[valid_symbols].dropna()
                if len(price_df) >= 5:
                    corr_matrix = price_df.corr()
                    np_corr = corr_matrix.values
                    np.fill_diagonal(np_corr, 0)
                    max_correlation = round(float(np.max(np_corr)), 2)
            except Exception:
                pass

        # Sector breakdown via yfinance info
        sector_map = {}
        for sym in valid_symbols:
            try:
                info = yahoo_finance_api.get_info(sym)
                sec = info.get('sector') or 'Other'
                sector_map[sym] = sec
            except Exception:
                sector_map[sym] = 'Other'

        sector_counts = {}
        for sec in sector_map.values():
            sector_counts[sec] = sector_counts.get(sec, 0) + 1

        sector_count = len(sector_counts)
        total = len(valid_symbols) or 1
        top_sector = max(sector_counts, key=sector_counts.get) if sector_counts else 'Unknown'
        top_sector_pct = round((sector_counts.get(top_sector, 0) / total) * 100, 1)

        sector_breakdown = sorted(
            [{'sector': s, 'count': c, 'pct': round(c / total * 100, 1)} for s, c in sector_counts.items()],
            key=lambda x: x['count'],
            reverse=True
        )

        # Deterministic grade
        if sector_count >= 5 and top_sector_pct < 30 and avg_volatility < 25:
            grade = 'A'
            grade_color = '#00D924'
        elif sector_count >= 3 and top_sector_pct < 50 and avg_volatility < 40:
            grade = 'B'
            grade_color = '#7FE832'
        elif sector_count >= 2 or top_sector_pct < 70:
            grade = 'C'
            grade_color = '#FFB800'
        else:
            grade = 'D'
            grade_color = '#FF6B35'

        metrics_text = f"""Portfolio grade: {grade}
Total stocks analyzed: {len(valid_symbols)}
Sector count: {sector_count}
Top sector: {top_sector} ({top_sector_pct}% of portfolio)
Average annualized volatility: {avg_volatility}%
Max pairwise correlation: {max_correlation}
Sector breakdown: {', '.join(f"{s['sector']} {s['pct']}%" for s in sector_breakdown[:5])}"""

        prompt = f"""You are a portfolio analyst reviewing a client's stock portfolio.

PORTFOLIO METRICS:
{metrics_text}

Write 2-3 sentences of advisor-voice narrative explaining what this grade means for the client. Then provide exactly 2-3 specific, actionable suggestions as a JSON array called "suggestions" — each suggestion is a single concise sentence starting with a verb.

Return ONLY valid JSON with this structure:
{{"narrative": "...", "suggestions": ["...", "...", "..."]}}
{_RULES_BLOCK}"""

        raw = _call_groq(prompt, max_tokens=500, temperature=0.65)

        import json
        import re
        narrative = ''
        suggestions = []
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                narrative = parsed.get('narrative', '')
                suggestions = parsed.get('suggestions', [])
            except Exception:
                narrative = raw

        result = {
            'grade': grade,
            'grade_color': grade_color,
            'metrics': {
                'sector_count': sector_count,
                'top_sector': top_sector,
                'top_sector_pct': top_sector_pct,
                'avg_volatility_pct': avg_volatility,
                'max_correlation': max_correlation
            },
            'sector_breakdown': sector_breakdown,
            'narrative': narrative,
            'suggestions': suggestions
        }
        _set_cache(cache_key, result)
        return jsonify(result)

    except Exception as e:
        logger.error("Error computing health score: %s", e)
        return jsonify({'error': 'Failed to compute health score. Try again shortly.'}), 500


# ---------------------------------------------------------------------------
# Endpoint 4: Sector Rotation
# ---------------------------------------------------------------------------

SECTOR_ETFS = {
    'XLK': 'Technology', 'XLF': 'Financials', 'XLE': 'Energy',
    'XLV': 'Healthcare', 'XLY': 'Consumer Discretionary',
    'XLP': 'Consumer Staples', 'XLI': 'Industrials',
    'XLB': 'Materials', 'XLU': 'Utilities',
    'XLRE': 'Real Estate', 'XLC': 'Communication Services'
}


@ai_features_bp.route('/sector-rotation', methods=['GET'])
def sector_rotation():
    user = authenticate_request()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    force_refresh = request.args.get('refresh') == '1'
    cache_key = 'sector_rotation'
    ttl = 2 * 3600  # 2 hours

    if not force_refresh and _is_cache_fresh(cache_key, ttl):
        return jsonify(_get_cache(cache_key))

    try:
        import yfinance as yf
        import pandas as pd

        etfs = list(SECTOR_ETFS.keys())
        data = yf.download(etfs, period='3mo', progress=False, threads=True)
        closes = data['Close'] if 'Close' in data.columns else data

        sectors_raw = []
        for etf, sector_name in SECTOR_ETFS.items():
            try:
                col = closes[etf].dropna() if etf in closes.columns else None
                if col is None or len(col) < 5:
                    continue

                # 1W return (~5 trading days)
                c1w = ((col.iloc[-1] - col.iloc[-6]) / col.iloc[-6]) * 100 if len(col) >= 6 else None
                # 1M return (~21 trading days)
                c1m = ((col.iloc[-1] - col.iloc[-22]) / col.iloc[-22]) * 100 if len(col) >= 22 else None
                # 3M return (full period)
                c3m = ((col.iloc[-1] - col.iloc[0]) / col.iloc[0]) * 100

                sectors_raw.append({
                    'etf': etf,
                    'name': sector_name,
                    'change_1w': round(float(c1w), 2) if c1w is not None else None,
                    'change_1m': round(float(c1m), 2) if c1m is not None else None,
                    'change_3m': round(float(c3m), 2)
                })
            except Exception:
                continue

        if not sectors_raw:
            return jsonify({'error': 'Unable to fetch sector data right now'}), 500

        # Compute ranks (1 = best)
        def rank_by(key):
            sorted_items = sorted([s for s in sectors_raw if s.get(key) is not None], key=lambda x: x[key], reverse=True)
            return {s['etf']: i + 1 for i, s in enumerate(sorted_items)}

        rank_1w = rank_by('change_1w')
        rank_1m = rank_by('change_1m')
        rank_3m = rank_by('change_3m')

        # Compute rotation signals
        for s in sectors_raw:
            etf = s['etf']
            r1w = rank_1w.get(etf, 99)
            r1m = rank_1m.get(etf, 99)
            r3m = rank_3m.get(etf, 99)
            s['rank_1w'] = r1w

            if r1w <= 3 and r1m <= 3:
                s['signal'] = 'Building Momentum'
                s['signal_color'] = '#00D924'
            elif r1w < r1m < r3m:
                s['signal'] = 'Rotating In'
                s['signal_color'] = '#7FE832'
            elif r1w > r1m and r1m > r3m:
                s['signal'] = 'Rotating Out'
                s['signal_color'] = '#FF6B35'
            else:
                s['signal'] = 'Neutral'
                s['signal_color'] = 'rgba(255,255,255,0.5)'

        # Sort by 1W performance for default display
        sectors_raw.sort(key=lambda x: (x.get('change_1w') or -999), reverse=True)

        # Build table text for prompt
        table_lines = ['Sector | ETF | 1W% | 1M% | 3M% | Signal']
        for s in sectors_raw:
            table_lines.append(
                f"{s['name']} | {s['etf']} | "
                f"{'+' if (s.get('change_1w') or 0) >= 0 else ''}{s.get('change_1w', 'N/A')}% | "
                f"{'+' if (s.get('change_1m') or 0) >= 0 else ''}{s.get('change_1m', 'N/A')}% | "
                f"{'+' if s['change_3m'] >= 0 else ''}{s['change_3m']}% | "
                f"{s['signal']}"
            )
        table_text = '\n'.join(table_lines)

        prompt = f"""You are a market strategist writing a weekly sector rotation note.

SECTOR PERFORMANCE DATA:
{table_text}

Write a 140-word strategist note identifying which sectors are gaining institutional interest, which are losing momentum, and where the rotation is heading. Name specific sectors and reference their actual numbers.
{_RULES_BLOCK}"""

        narrative = _call_groq(prompt, max_tokens=400, temperature=0.78)

        result = {
            'narrative': narrative,
            'sectors': sectors_raw
        }
        _set_cache(cache_key, result)
        return jsonify(result)

    except Exception as e:
        logger.error("Error computing sector rotation: %s", e)
        return jsonify({'error': 'Failed to compute sector rotation. Try again shortly.'}), 500

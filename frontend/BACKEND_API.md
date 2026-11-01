# Backend API Reference (snapshot 2026-10-31)

73 HTTP routes + 16 SocketIO events. Source of truth is `/Users/leninfonseca/Project-2/app/routes/` — if a route disagrees, trust the code.

Base URL: `https://web-production-2e2e.up.railway.app` (prod). Local dev: `http://localhost:5000`.

CORS allowlist (`app/__init__.py:63`): `aistocksage.com`, `www.aistocksage.com`, `stock-watchlist-frontend.vercel.app`, plus `FRONTEND_URL` env.

Auth tiers:
- **open** — no credentials.
- **login_required** — Flask-Login session cookie, backed by Firebase ID token (see `app/auth.py:12-14` user_loader).
- **sub-gated** — login_required + subscription tier check.
- **webhook** — Stripe signature.

Common headers the frontend sends: `Authorization: Bearer <firebaseIdToken>`, `X-User-ID: <uid>`, `Content-Type: application/json`. Credentials: `include` for session cookie.

---

## Auth (`/api/auth/*`) — `app/auth.py`

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| POST | `/api/auth/register` | open | `{name, email, idToken}` | `{message, user:{id,name,email}}` |
| POST | `/api/auth/login` | open | `{idToken, isGoogleSignIn?}` | `{message, user, needsUsername?}` |
| POST | `/api/auth/logout` | login | — | `{message}` |
| POST | `/api/auth/set-username` | open | `{idToken, username(3-20)}` | `{message, user}` |
| GET | `/api/auth/user` | login | — | `{user:{id,name,email,username?}}` |

## Core (`app/routes/core.py`)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/` | open | status |
| GET | `/api` | open | version + endpoints |
| GET | `/api/health` | open | `{status, timestamp}` |
| GET | `/api/stats` | login | server stats |
| GET | `/api/user/profile-picture` | login | `{profile_picture: base64\|null}` |
| POST | `/api/user/profile-picture` | login | `{profile_picture: data:image/...}` |
| DELETE | `/api/user/profile-picture` | login | `{success}` |

## Watchlist (`app/routes/watchlist.py`)

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| GET | `/api/watchlist` | login | `?limit` | `StockItem[]` |
| POST | `/api/watchlist` | login | `{symbol, category?, notes?, priority?, target_price?, stop_loss?, alert_enabled?, company_name?}` | `{success, item}` |
| DELETE | `/api/watchlist/<symbol>` | login | — | `{message}` |
| PUT | `/api/watchlist/<symbol>` | login | partial update | `{message, item}` |
| PUT | `/api/watchlist/<symbol>/notes` | login | `{notes}` | `{message, notes}` |
| GET | `/api/watchlist/categories` | login | — | `{categories}` |
| GET | `/api/watchlist/stats` | login | — | stats |
| DELETE | `/api/watchlist/clear` | login | — | `{message}` |
| PUT | `/api/watchlist/batch` | login | `{updates:[]}` | `{message}` |
| GET | `/api/watchlist/<symbol>/details` | login | — | full detail |

## Stock data (`app/routes/stock_data.py`)

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| POST | `/api/search` | open | `{symbol}` | stock quote |
| GET | `/api/stock/<symbol>` | login | — | quote + alerts |
| GET | `/api/search/stocks` | open | `?q` | `{results[], query}` |
| GET | `/api/search/ceo` | open | `?q` | `{ceo_name, company_name, symbol}[]` |
| GET | `/api/search/companies` | open | `?q` | `{results[]}` |
| GET | `/api/chart/<symbol>` | open | `?range=1D\|5D\|1W\|1M\|3M\|6M\|YTD\|1Y\|5Y\|ALL` | OHLCV[] |
| GET | `/api/company/<symbol>` | open | — | company info |
| GET | `/api/company/<symbol>/network` | open | — | `{center, nodes}` |

## Market (`app/routes/market.py`)

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| GET | `/api/market-status` | open | — | `{isOpen, status}` |
| GET | `/api/market/analysis` | open | — | AI analysis |
| GET | `/api/market/top-performer` | login | `?date&universe&limit` | top symbol |
| GET | `/api/market/earnings` | open | — | earnings[] |
| GET | `/api/market/insider-trading/<symbol>` | open | — | trades[] |
| GET | `/api/market/analyst-ratings/<symbol>` | open | — | ratings |
| POST | `/api/sectors/batch` | login | `{symbols:[]}` | `{SYM: sector}` |
| GET | `/api/screener/<type>` | open | types: `upcoming-earnings\|daily-price-jumps\|daily-price-dips\|analyst-picks\|highest-implied-volatility` | `{results[]}` |
| POST | `/api/stocks/correlation` | login | `{symbols:[], max 20}` | `{matrix}` |

## News & social (`app/routes/news_social.py`)

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| GET | `/api/news/market` | open | `?limit&page&q` | `{articles[]}` |
| GET | `/api/news/company/<symbol>` | open | `?limit&page` | `{articles[], hasMore}` |
| GET | `/api/stocktwits/<symbol>` | open | `?limit&max` | `{messages[], cursor}` |
| GET | `/api/stocktwits/<symbol>/sentiment` | open | — | `{sentiment}` |
| GET | `/api/stocktwits/trending` | open | `?limit` | `{trending[]}` |

## Alerts (`app/routes/alerts_routes.py`)

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| GET | `/api/alerts` | login | `?symbol` | alerts[] |
| POST | `/api/alerts` | login | `{symbol, target_price, alert_type: above\|below}` | `{alert_id}` |
| DELETE | `/api/alerts/<alert_id>` | login | — | `{message}` |

## Chat / AI (`app/routes/chat.py`)

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| POST | `/api/chat` | login+ratelimit | `{message, thread_id?}` | `{response, usage}` |
| POST | `/api/chat/stream` | login+ratelimit | `{message, thread_id?}` | SSE chunks |
| GET | `/api/chat/threads` | login | — | threads[] |
| POST | `/api/chat/threads` | login | `{title?}` | `{thread}` |
| DELETE | `/api/chat/threads/<id>` | login | — | `{success}` |
| PATCH | `/api/chat/threads/<id>` | login | `{title}` | `{success}` |
| GET | `/api/chat/threads/<id>/history` | login | `?limit` | history[] |
| GET | `/api/chat/history` | login | `?limit` | history[] |
| DELETE | `/api/chat/clear` | login | — | `{success}` |
| GET | `/api/chat/status` | login | — | `{rate_limit}` |
| GET | `/api/stock/<sym>/ai-analysis` | sub-gated | — | analysis |
| GET | `/api/stock/<sym>/ai-insight` | sub-gated | `?period=7d\|1mo\|6mo\|1y` | insight |

## AI Suite (`app/routes/ai_features.py`) — all sub-gated

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/ai/morning-brief` | `?refresh` | brief |
| POST | `/api/ai/thesis` | `{symbol}` body | thesis |
| GET | `/api/ai/health-score` | `?refresh` | `{grade, metrics, suggestions[]}` |
| GET | `/api/ai/sector-rotation` | `?refresh` | sectors[] |
| GET | `/api/ai/earnings-breakdown` | `?symbol` | analysis |
| GET | `/api/ai/portfolio-guidance` | `?refresh` | guidance[] |

## Paper trading (`app/routes/paper_trading.py`)

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| GET | `/api/paper-trading/portfolio` | login | — | portfolio |
| POST | `/api/paper-trading/orders` | login | `{symbol, side, quantity, order_type, limit_price?}` | `{order}` |
| GET | `/api/paper-trading/orders` | login | `?status&limit` | orders[] |
| DELETE | `/api/paper-trading/orders/<id>` | login | — | `{success}` |
| GET | `/api/paper-trading/trades` | login | `?limit` | trades[] |
| GET | `/api/paper-trading/analytics` | login | — | analytics |
| GET | `/api/paper-trading/history` | login | `?limit` | history[] |
| POST | `/api/paper-trading/reset` | login | — | fresh portfolio |

## Billing (`app/routes/billing.py`)

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| GET | `/api/billing/subscription` | login | — | sub info |
| POST | `/api/billing/create-checkout` | login | `{price_id}` | `{checkout_url}` |
| POST | `/api/billing/portal` | login | — | `{portal_url}` |
| POST | `/api/billing/webhook` | stripe-sig | Stripe payload | `{received}` |

## Stock notes (`app/routes/stock_notes.py`)

| Method | Path | Auth | Body/Query | Returns |
|---|---|---|---|---|
| GET | `/api/stock-notes/<symbol>` | login | — | `{note, updated_at}` |
| PUT | `/api/stock-notes/<symbol>` | login | `{note}` | `{note, updated_at}` |
| DELETE | `/api/stock-notes/<symbol>` | login | — | `{message}` |

## Companies map (`app/routes/map_companies.py`)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/companies/locations` | open | `{companies[], count}` |

## YouTube (`app/routes/youtube.py`)

| Method | Path | Auth | Query | Returns |
|---|---|---|---|---|
| GET | `/api/youtube/search` | open | `?q&max_results` | `{videos[]}` |

---

## SocketIO events (`app/socketio_events.py`, `app/routes/chat.py`)

Transport: `/socket.io` over websocket (fallback polling). Namespace: default.

### Client → Server
- `connect` — automatic.
- `disconnect` — automatic.
- `join_user_room` — `{user_id}`. Joins personal room for private updates.
- `join_watchlist_updates` — `{user_id}`. Subscribes to price updates for user's watchlist.
- `join_market_updates` — no payload. Market room.
- `join_news_updates` — no payload. News room.
- `track_stock_view` — `{user_id, symbol}`. Mark symbol as high-priority (user viewing).
- `untrack_stock_view` — `{user_id, symbol}`.
- `track_search_stock` — `{user_id, symbols:[]}`. Elevate searched symbols.
- `chat_message` — `{user_id, message}`.

### Server → Client
- `connected` — `{message}` on connect.
- `watchlist_updated` — `{prices:[{symbol, price, price_change, price_change_percent, change_percent, priceChangePercent, last_updated, _fresh}], timestamp}`.
- `market_status_updated` — market status object.
- `chat_response` — `{success, response, timestamp}`.
- `chat_error` — `{error, response}`.

---

## Stripe prices (hardcoded in old `index.html`)

```
PRO_MONTHLY   = 'price_1T9FCtDDgxuIufn0XuEgkYV5'
PRO_YEARLY    = 'price_1T9FHjDDgxuIufn0fgS9CrpC'
ELITE_MONTHLY = 'price_1T9FEQDDgxuIufn0mt4Ytley'
ELITE_YEARLY  = 'price_1T9FI9DDgxuIufn0aF0cDIVy'
```

Move to `VITE_STRIPE_*` env vars in Vercel so they're not hardcoded.

## Firebase config (public — safe to embed)

```
apiKey: AIzaSyCB_8dEiQH0AxqUq7qXneOWOdXeJw-GFOQ
authDomain: stock-watcher-bbb20.firebaseapp.com
projectId: stock-watcher-bbb20
storageBucket: stock-watcher-bbb20.firebasestorage.app
messagingSenderId: 745996753351
appId: 1:745996753351:web:c4506624bb8dc058ffe1e2
measurementId: G-MSV396NJ1V
```

Firebase web config keys are public by design; access is governed by Firestore rules (`firestore.rules`) and backend token verification.

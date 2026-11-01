# Frontend Rebuild Plan — AI Stock Sage

Status: **in progress**
Started: 2026-10-31

## Goal

Rebuild the frontend to replace the brittle `window.*` globals + per-file esbuild IIFE build with a proper Vite + ESM project. Preserve:
- All visual output (same CSS files reused verbatim).
- All API endpoints and real-time wiring.
- Hand-written feel of the JSX (no AI-generated rewrites — bodies carried over as-is).

Backend is NOT changing. Target: feature parity with `frontend-vercel/`.

## Deployment target

Vercel. Backend: Railway at `https://web-production-2e2e.up.railway.app`. Backend origin is already allowlisted in `app/__init__.py:63-67` for:
- `https://aistocksage.com`
- `https://www.aistocksage.com`
- `https://stock-watchlist-frontend.vercel.app`

Any new preview URL must be added there (or allowed via `FRONTEND_URL` env).

## Directory layout

```
frontend/
├── REBUILD_PLAN.md         <- this doc, source of truth for resume
├── PROGRESS.md             <- running checklist (updated per phase)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html              <- Vite entry; links CSS, mounts React
├── vercel.json
├── public/
│   ├── favicon.svg
│   ├── manifest.json
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── Gemini_Generated_Image_...png
│   └── static/css/         <- 5 CSS files copied verbatim (~15.6K LOC)
└── src/
    ├── main.tsx            <- ReactDOM.createRoot + <AuthProvider><App/></AuthProvider>
    ├── App.tsx             <- React Router routes
    ├── config.ts           <- API_BASE_URL, STRIPE prices (from import.meta.env)
    ├── types/
    │   ├── models.ts       <- copied verbatim from old src/types/models.ts
    │   └── window.d.ts     <- minimal: only true browser-global declarations
    ├── lib/
    │   ├── firebase.ts     <- initialize Firebase SDK (npm, not CDN)
    │   ├── auth.tsx        <- <AuthProvider>, useAuth(), getAuthHeaders()
    │   ├── api.ts          <- typed fetch client for all 73 endpoints
    │   ├── socket.ts       <- socket.io-client wrapper for 16 events
    │   ├── notifications.tsx  <- <ToastProvider>, useNotify()
    │   └── events.ts       <- app-level event bus (navigate, pt:prefill, etc.)
    ├── pages/              <- route-level screens
    │   ├── LandingPage.tsx
    │   ├── PricingPage.tsx
    │   ├── StockDetailsPage.tsx
    │   └── CompanyNetworkPage.tsx
    ├── views/              <- dashboard tabs
    │   ├── Overview.tsx
    │   ├── Watchlist.tsx
    │   ├── Screener.tsx
    │   ├── News.tsx
    │   ├── WhatsWhat.tsx
    │   ├── AISuite.tsx
    │   ├── Intelligence.tsx
    │   ├── Map.tsx
    │   └── AIAssistant.tsx
    └── components/
        ├── Dashboard.tsx            <- the big shell (was dashboard-redesign.tsx)
        ├── widgets/
        │   ├── SparklineChart.tsx
        │   ├── TopMoversWidget.tsx
        │   ├── MarketOverview.tsx
        │   └── MarketIntelligenceWidget.tsx
        ├── chat/AIChat.tsx
        ├── chart/StockChart.tsx
        ├── modals/
        │   ├── StockDetailsModal.tsx
        │   └── UpgradeModal.tsx
        ├── notes/WatchlistNotes.tsx
        └── trading/PaperTrading.tsx
```

## Migration policy (critical — read before editing)

1. **JSX bodies**: Carry over verbatim. Only touch imports, auth/config/API wiring, and `window.X` reads/writes.
2. **No new UI styles**: all CSS files are reused unchanged from `frontend-vercel/`. Any class string in the current app must still exist.
3. **window.*  reads** → replace with an import from `src/lib/*` or `src/config.ts`.
4. **window.X = Component** writes → delete the write; export the component as default (or named).
5. **Custom events** (`app:navigate`, `pt:prefill`, `watchlistChanged`): keep for now via `src/lib/events.ts` (thin EventTarget wrapper). Converting to proper React state is out of scope — that would change feel.
6. **Firebase**: use the `firebase` npm package. Compat mode so existing call sites (`firebase.auth()`) keep working.
7. **No feature additions. No visual redesigns.** If something looks tempting to improve — don't. Note it in `PROGRESS.md` under "deferred".

## Backend API — full endpoint reference

See `BACKEND_API.md` (sibling file). 73 HTTP routes, 16 SocketIO events. Produced by Explore at migration-start; treat as snapshot. If a route 404s during integration, trust the backend code at `/Users/leninfonseca/Project-2/app/routes/` over this doc.

Quick index:
- Auth: `/api/auth/{register,login,logout,set-username,user}`
- Watchlist: `/api/watchlist[/*]` (10 routes)
- Stock data/search: `/api/{search,stock,search/stocks,search/ceo,search/companies,chart,company}` (8)
- Market: `/api/market/*`, `/api/screener/*`, `/api/sectors/batch`, `/api/stocks/correlation`, `/api/market-status` (9)
- News/social: `/api/news/{market,company}`, `/api/stocktwits/*` (5)
- Alerts: `/api/alerts[/*]` (3)
- Chat: `/api/chat[/*]`, `/api/stock/<sym>/ai-{analysis,insight}` (12)
- AI Suite: `/api/ai/{morning-brief,thesis,health-score,sector-rotation,earnings-breakdown,portfolio-guidance}` (6)
- Paper trading: `/api/paper-trading/*` (7)
- Billing: `/api/billing/*` (4)
- Stock notes: `/api/stock-notes/<sym>` (3)
- Misc: `/api/companies/locations`, `/api/youtube/search`, core/debug (10)

SocketIO:
- Client → Server: `connect`, `disconnect`, `join_user_room`, `join_watchlist_updates`, `join_market_updates`, `join_news_updates`, `track_stock_view`, `untrack_stock_view`, `track_search_stock`, `chat_message`.
- Server → Client: `connected`, `watchlist_updated`, `market_status_updated`, `chat_response`, `chat_error`.

## Globals → modules mapping

| Old global | New source |
|---|---|
| `window.AppAuth.useAuth()` | `useAuth()` from `src/lib/auth.tsx` |
| `window.AppAuth.getCurrentUser()` | `useAuth().currentUser` or `getCurrentUser()` from `src/lib/auth.tsx` |
| `window.AppAuth.getAuthHeaders(user?)` | `getAuthHeaders(user?)` from `src/lib/auth.tsx` |
| `window.AppAuth.signOut()` | `signOut()` from `src/lib/auth.tsx` |
| `window.CONFIG.API_BASE_URL` | `API_BASE_URL` from `src/config.ts` |
| `window.API_BASE_URL` | same |
| `window.STRIPE_CONFIG` | `STRIPE_PRICES` from `src/config.ts` |
| `window.firebaseAuth` | `firebaseAuth` from `src/lib/firebase.ts` |
| `window.showNotification(msg, type)` | `useNotify()` hook, or `notify(msg, type)` export |
| `window.showUpgradeModal(reason)` | event bus `events.emit('upgrade:show', { reason })` consumed by `<UpgradeModal>` mounted in Dashboard |
| `window.openStockDetailsModalReact(sym, from?)` | event bus `events.emit('stock-details:open', { symbol, isFromWatchlist })` |
| `window.closeStockDetailsModalReact()` | event bus `events.emit('stock-details:close')` |
| `window.refreshWatchlist()` | event bus `events.emit('watchlist:refresh')` |
| `window.trackStockView` / `window.untrackStockView` | socket helpers in `src/lib/socket.ts` |
| `window.__guestMode` | React Router state / query param |
| `window.__reloadSubscriptionInfo` | event bus `events.emit('subscription:reload')` |
| `window.OverviewView`, `window.WatchlistView`, ...all 14 views | `import` normally |
| `window.SparklineChart`, `window.TopMoversWidget`, ...all widgets | `import` normally |
| `window.React`, `window.ReactDOM`, `window.Chart`, `window.io`, `window.firebase` | npm packages (`react`, `react-dom`, `chart.js`, `socket.io-client`, `firebase`) |

## Progress — resume contract

Every time a phase completes, update `PROGRESS.md`:
1. Check off the phase.
2. Write a 2-line "what works now" summary.
3. List the next file(s) to touch, with absolute paths.
4. If any wiring is intentionally stubbed, list it under "KNOWN STUBS".
5. If any assumption changed, write it under "DECISIONS LOG".

If a new session starts: read `REBUILD_PLAN.md` (this file) + `PROGRESS.md` + `BACKEND_API.md`. Do NOT re-explore the old codebase unless `PROGRESS.md` says to. Pick up at the first unchecked phase.

## Phases

- [x] Phase 0: Catalog endpoints + globals (done by Explore agents, see BACKEND_API.md).
- [ ] **Phase 1**: Scaffold Vite project — `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `vercel.json`, copy public assets + CSS.
- [ ] **Phase 2**: Infrastructure modules — `config.ts`, `lib/firebase.ts`, `lib/auth.tsx`, `lib/api.ts`, `lib/socket.ts`, `lib/notifications.tsx`, `lib/events.ts`, `types/models.ts`.
- [ ] **Phase 3**: Top-level pages — `LandingPage.tsx`, `PricingPage.tsx`, `StockDetailsPage.tsx`, `CompanyNetworkPage.tsx`.
- [ ] **Phase 4**: Dashboard views (9 files) — Overview, Watchlist, Screener, News, WhatsWhat, AISuite, Intelligence, Map, AIAssistant.
- [ ] **Phase 5**: Big files — Dashboard shell (2.6K LOC), StockDetailsModal (2.5K LOC), widgets, chart, chat, upgrade modal, notes, paper trading.
- [ ] **Phase 6**: Router wiring in `App.tsx` + `main.tsx`, verify `npm run build`, grep for stray `window.` reads, update `vercel.json`.

## Verification plan (end of Phase 6)

1. `cd frontend && npm install && npm run build` must exit 0.
2. `grep -rn 'window\.' src/` must only match: `window.location`, `window.history`, `window.addEventListener`, `window.dispatchEvent`, `window.setTimeout`, `window.clearTimeout`, `window.innerWidth`, `window.devicePixelRatio`, `window.open`, `window.confirm`, `window.prompt`, `window.scrollTo`, `window.matchMedia`. No app-specific globals.
3. `tsc --noEmit` must exit 0 (allowing `any` in migrated bodies; strict mode off for the first pass).
4. Spot-check routes in a local `vite preview`: landing renders, login redirects, dashboard shell renders views, stock details modal opens.
5. Backend hit test: `curl $API_BASE/api/health` from browser console with auth header — should 200.

## Deferred (NOT doing now)

- Converting custom-event bus to proper React state/context (would change feel).
- Splitting the 2.6K / 2.5K LOC files.
- Replacing the global CSS with CSS modules.
- Removing dead widget code (CorrelationHeatmap, CEODetailsModal, etc.).
- Mobile folder revival.
- Backend changes.

## File-size reality check

The two big files (`dashboard-redesign.tsx` 2613 LOC, `stock-details-modal.tsx` 2518 LOC) are the main token-sinks. They must be migrated last and in one shot — opening them read-first, then a single Write with the top imports swapped and `window.X =` lines removed. Do NOT rewrite internals.

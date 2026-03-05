import json
import logging
import os
import re
import threading
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List

import requests

logger = logging.getLogger(__name__)


class StockSymbolIndexService:
    """Server-side stock symbol/name index with SEC-backed refresh and fuzzy search."""

    SEC_TICKERS_EXCHANGE_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
    SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

    def __init__(self):
        self._lock = threading.RLock()
        self._entries: List[Dict] = []
        self._query_cache: Dict[str, tuple] = {}
        self._last_refresh_ts: float = 0.0
        self._last_refresh_source: str = "seed"

        self._refresh_interval_seconds = int(os.getenv("SYMBOL_INDEX_REFRESH_SECONDS", "43200"))
        self._query_cache_ttl_seconds = int(os.getenv("SYMBOL_INDEX_QUERY_CACHE_SECONDS", "300"))
        self._request_timeout_seconds = float(os.getenv("SYMBOL_INDEX_REQUEST_TIMEOUT_SECONDS", "8"))
        self._max_cache_entries = int(os.getenv("SYMBOL_INDEX_MAX_QUERY_CACHE_ENTRIES", "1000"))
        self._cache_path = Path(os.getenv("SYMBOL_INDEX_CACHE_PATH", "/tmp/stock_symbol_index_cache.json"))
        self._user_agent = os.getenv(
            "SEC_API_USER_AGENT",
            "AIStockSage/1.0 (support@aistocksage.com)",
        )

        self._bootstrap()
        self._start_background_refresh()

    def search(self, query: str, limit: int = 10) -> List[Dict]:
        query = (query or "").strip()
        if not query:
            return []

        normalized_query = self._normalize_text(query)
        if not normalized_query:
            return []

        limit = max(1, min(limit, 50))
        cache_key = f"{normalized_query}:{limit}"
        now = time.time()

        with self._lock:
            cached = self._query_cache.get(cache_key)
            if cached and (now - cached[0]) <= self._query_cache_ttl_seconds:
                return cached[1]
            entries = list(self._entries)

        if not entries:
            return []

        scored_results = []
        for entry in entries:
            score = self._score_entry(entry, normalized_query)
            if score <= 0:
                continue
            scored_results.append((score, entry))

        scored_results.sort(
            key=lambda pair: (
                -pair[0],
                pair[1]["symbol"],
                pair[1]["name"],
            )
        )

        results = [self._public_entry(item[1]) for item in scored_results[:limit]]

        with self._lock:
            if len(self._query_cache) >= self._max_cache_entries:
                # Drop oldest item to keep memory bounded.
                oldest_key = min(self._query_cache.items(), key=lambda kv: kv[1][0])[0]
                self._query_cache.pop(oldest_key, None)
            self._query_cache[cache_key] = (now, results)

        return results

    def stats(self) -> Dict:
        with self._lock:
            return {
                "entries": len(self._entries),
                "last_refresh_ts": self._last_refresh_ts,
                "last_refresh_source": self._last_refresh_source,
                "query_cache_entries": len(self._query_cache),
            }

    def refresh_now(self) -> bool:
        return self._refresh_index(force_network=True)

    def _bootstrap(self) -> None:
        loaded_count = 0

        loaded_count = self._load_from_cache_file()
        if loaded_count > 0:
            logger.info("[SYMBOL-INDEX] Loaded %s entries from cache file", loaded_count)
        else:
            self._set_entries(self._seed_entries(), source="seed")
            logger.info("[SYMBOL-INDEX] Loaded seed entries (cache/network unavailable)")

    def _start_background_refresh(self) -> None:
        def loop():
            # Initial refresh attempt after service starts; non-blocking for app boot.
            self._refresh_index(force_network=True)
            while True:
                time.sleep(max(300, self._refresh_interval_seconds))
                self._refresh_index(force_network=True)

        thread = threading.Thread(target=loop, daemon=True, name="symbol-index-refresh")
        thread.start()

    def _refresh_index(self, force_network: bool = False) -> bool:
        now = time.time()
        with self._lock:
            should_refresh = force_network or (
                (now - self._last_refresh_ts) >= self._refresh_interval_seconds
            )
        if not should_refresh:
            return False

        entries = self._fetch_sec_exchange_index()
        source = "sec_company_tickers_exchange"

        if not entries:
            entries = self._fetch_sec_tickers_index()
            source = "sec_company_tickers"

        if not entries:
            logger.warning("[SYMBOL-INDEX] SEC refresh failed, retaining existing in-memory index")
            return False

        self._set_entries(entries, source=source)
        self._save_to_cache_file(entries, source=source)
        logger.info("[SYMBOL-INDEX] Refreshed %s entries from %s", len(entries), source)
        return True

    def _fetch_sec_exchange_index(self) -> List[Dict]:
        try:
            response = requests.get(
                self.SEC_TICKERS_EXCHANGE_URL,
                timeout=self._request_timeout_seconds,
                headers={"User-Agent": self._user_agent, "Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()

            fields = payload.get("fields", [])
            rows = payload.get("data", [])
            if not isinstance(fields, list) or not isinstance(rows, list):
                return []

            field_index = {field.lower(): idx for idx, field in enumerate(fields)}
            idx_symbol = field_index.get("ticker")
            idx_name = field_index.get("name")
            idx_exchange = field_index.get("exchange")

            if idx_symbol is None or idx_name is None:
                return []

            entries = []
            for row in rows:
                if not isinstance(row, list):
                    continue
                symbol = str(row[idx_symbol]).strip().upper() if idx_symbol < len(row) else ""
                name = str(row[idx_name]).strip() if idx_name < len(row) else ""
                exchange = str(row[idx_exchange]).strip().upper() if idx_exchange is not None and idx_exchange < len(row) else ""
                if not symbol or not name:
                    continue
                entries.append(
                    {
                        "symbol": symbol,
                        "name": name,
                        "exchange": exchange or "US",
                        "type": "EQUITY",
                    }
                )

            return self._dedupe_and_prepare(entries)
        except Exception as exc:
            logger.warning("[SYMBOL-INDEX] Failed SEC exchange index fetch: %s", exc)
            return []

    def _fetch_sec_tickers_index(self) -> List[Dict]:
        try:
            response = requests.get(
                self.SEC_TICKERS_URL,
                timeout=self._request_timeout_seconds,
                headers={"User-Agent": self._user_agent, "Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()

            entries = []
            if isinstance(payload, dict):
                for value in payload.values():
                    if not isinstance(value, dict):
                        continue
                    symbol = str(value.get("ticker", "")).strip().upper()
                    name = str(value.get("title", "")).strip()
                    if not symbol or not name:
                        continue
                    entries.append(
                        {
                            "symbol": symbol,
                            "name": name,
                            "exchange": "US",
                            "type": "EQUITY",
                        }
                    )

            return self._dedupe_and_prepare(entries)
        except Exception as exc:
            logger.warning("[SYMBOL-INDEX] Failed SEC tickers fallback fetch: %s", exc)
            return []

    def _load_from_cache_file(self) -> int:
        if not self._cache_path.exists():
            return 0

        try:
            payload = json.loads(self._cache_path.read_text(encoding="utf-8"))
            entries = payload.get("entries", [])
            source = payload.get("source", "cache_file")
            refreshed_at = float(payload.get("refreshed_at", 0))
            prepared = self._dedupe_and_prepare(entries)
            if not prepared:
                return 0

            with self._lock:
                self._entries = prepared
                self._query_cache.clear()
                self._last_refresh_ts = refreshed_at or time.time()
                self._last_refresh_source = source
            return len(prepared)
        except Exception as exc:
            logger.warning("[SYMBOL-INDEX] Failed to load cache file: %s", exc)
            return 0

    def _save_to_cache_file(self, entries: List[Dict], source: str) -> None:
        payload = {
            "refreshed_at": time.time(),
            "source": source,
            "entries": [
                {
                    "symbol": item.get("symbol", ""),
                    "name": item.get("name", ""),
                    "exchange": item.get("exchange", ""),
                    "type": item.get("type", "EQUITY"),
                }
                for item in entries
            ],
        }

        try:
            self._cache_path.parent.mkdir(parents=True, exist_ok=True)
            self._cache_path.write_text(json.dumps(payload), encoding="utf-8")
        except Exception as exc:
            logger.warning("[SYMBOL-INDEX] Failed to write cache file: %s", exc)

    def _set_entries(self, entries: List[Dict], source: str) -> None:
        prepared = self._dedupe_and_prepare(entries)
        if not prepared:
            return

        with self._lock:
            self._entries = prepared
            self._query_cache.clear()
            self._last_refresh_ts = time.time()
            self._last_refresh_source = source

    def _dedupe_and_prepare(self, entries: List[Dict]) -> List[Dict]:
        seen = {}
        for entry in entries:
            symbol = str(entry.get("symbol", "")).strip().upper()
            name = self._clean_name(str(entry.get("name", "")).strip())
            exchange = str(entry.get("exchange", "")).strip().upper() or "US"
            asset_type = str(entry.get("type", "EQUITY")).strip().upper() or "EQUITY"

            if not symbol or not name:
                continue

            key = symbol
            previous = seen.get(key)
            if previous:
                # Prefer entries with a richer company name/exchange.
                if len(name) > len(previous["name"]) or (
                    previous.get("exchange") in ("", "US") and exchange not in ("", "US")
                ):
                    seen[key] = {
                        "symbol": symbol,
                        "name": name,
                        "exchange": exchange,
                        "type": asset_type,
                    }
            else:
                seen[key] = {
                    "symbol": symbol,
                    "name": name,
                    "exchange": exchange,
                    "type": asset_type,
                }

        prepared = []
        for row in seen.values():
            name_norm = self._normalize_text(row["name"])
            symbol_norm = self._normalize_text(row["symbol"])
            prepared.append(
                {
                    **row,
                    "_name_norm": name_norm,
                    "_symbol_norm": symbol_norm,
                    "_tokens": [token for token in name_norm.split() if token],
                }
            )

        prepared.sort(key=lambda item: (item["symbol"], item["name"]))
        return prepared

    def _score_entry(self, entry: Dict, query_norm: str) -> int:
        symbol = entry.get("_symbol_norm", "")
        name = entry.get("_name_norm", "")
        tokens = entry.get("_tokens", [])
        score = 0

        aliases = self._aliases()
        alias_symbol = aliases.get(query_norm)
        if alias_symbol and symbol == alias_symbol:
            score += 500

        if symbol == query_norm:
            score += 1000
        elif symbol.startswith(query_norm):
            score += 700
        elif query_norm in symbol:
            score += 450

        if name == query_norm:
            score += 900
        elif name.startswith(query_norm):
            score += 620
        elif query_norm in name:
            score += 360

        token_prefix_hits = sum(1 for token in tokens if token.startswith(query_norm))
        if token_prefix_hits:
            score += min(token_prefix_hits, 3) * 170

        query_tokens = [token for token in query_norm.split() if token]
        if len(query_tokens) > 1:
            token_match = sum(1 for token in query_tokens if token in name)
            score += token_match * 130

        if score < 350 and len(query_norm) >= 3:
            ratio = SequenceMatcher(None, query_norm, name[: max(40, len(query_norm) * 3)]).ratio()
            if ratio >= 0.74:
                score += int(ratio * 220)

        return score

    def _public_entry(self, entry: Dict) -> Dict:
        return {
            "symbol": entry.get("symbol", ""),
            "name": entry.get("name", ""),
            "exchange": entry.get("exchange", ""),
            "type": entry.get("type", "EQUITY"),
        }

    def _seed_entries(self) -> List[Dict]:
        return [
            {"symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "GOOGL", "name": "Alphabet Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "GOOG", "name": "Alphabet Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "AMZN", "name": "Amazon.com Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "TSLA", "name": "Tesla Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "META", "name": "Meta Platforms Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "NFLX", "name": "Netflix Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "AMD", "name": "Advanced Micro Devices Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "INTC", "name": "Intel Corporation", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "IBM", "name": "International Business Machines Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "ORCL", "name": "Oracle Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "CRM", "name": "Salesforce Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "JPM", "name": "JPMorgan Chase & Co.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "BAC", "name": "Bank of America Corporation", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "WMT", "name": "Walmart Inc.", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "KO", "name": "The Coca-Cola Company", "exchange": "NYSE", "type": "EQUITY"},
            {"symbol": "PEP", "name": "PepsiCo Inc.", "exchange": "NASDAQ", "type": "EQUITY"},
            {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "exchange": "NYSEARCA", "type": "ETF"},
            {"symbol": "QQQ", "name": "Invesco QQQ Trust", "exchange": "NASDAQ", "type": "ETF"},
            {"symbol": "VTI", "name": "Vanguard Total Stock Market ETF", "exchange": "NYSEARCA", "type": "ETF"},
            {"symbol": "IWM", "name": "iShares Russell 2000 ETF", "exchange": "NYSEARCA", "type": "ETF"},
            {"symbol": "DIA", "name": "SPDR Dow Jones Industrial Average ETF Trust", "exchange": "NYSEARCA", "type": "ETF"},
        ]

    @staticmethod
    def _clean_name(name: str) -> str:
        return re.sub(r"\s+", " ", name).strip()

    @staticmethod
    def _normalize_text(value: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", value.upper())).strip()

    @staticmethod
    def _aliases() -> Dict[str, str]:
        return {
            "GOOGLE": "GOOGL",
            "FACEBOOK": "META",
            "MICROSOFT": "MSFT",
            "APPLE": "AAPL",
            "TESLA": "TSLA",
            "NVIDIA": "NVDA",
            "AMAZON": "AMZN",
            "NETFLIX": "NFLX",
        }

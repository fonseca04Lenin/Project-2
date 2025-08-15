export interface Stock {
  symbol: string;
  name: string;
  price: number;
  lastMonthPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  triggeredAlerts?: Alert[];
}

export interface Alert {
  id: string;
  symbol: string;
  target_price: number;
  alert_type: 'above' | 'below';
  created_at: string;
  triggered?: boolean;
}

export interface NewsItem {
  title: string;
  link: string;
  published_at: string;
  source: string;
  summary?: string;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  priceChange?: number;
  priceChangePercent?: number;
  performance?: 'up' | 'down' | 'flat';
  lastUpdated?: string;
}

export interface MarketStatus {
  status: 'open' | 'closed' | 'unknown';
  message: string;
}

export interface WebSocketPriceUpdate {
  symbol: string;
  name: string;
  price: number;
  price_change: number;
  price_change_percent: number;
  last_updated: string;
}

export interface WebSocketWatchlistUpdate {
  prices: WebSocketPriceUpdate[];
}

export interface WebSocketAlertTriggered {
  symbol: string;
  alerts: Alert[];
} 
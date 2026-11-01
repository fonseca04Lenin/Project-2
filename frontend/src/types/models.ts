// Shared data model interfaces.
// Carried over verbatim from frontend-vercel/src/types/models.ts.

export interface StockItem {
    symbol: string;
    name?: string;
    company_name?: string;
    current_price?: number;
    price?: number;
    change_percent?: number;
    change?: number;
    price_change?: number;
    priceChangePercent?: number;
    category?: string;
    volume?: number;
    _updated?: boolean;
    _fresh?: boolean;
    _last_updated?: string;
    _updating?: boolean;
}

export interface Preferences {
    theme: 'dark' | 'light';
    defaultTimeRange: string;
    autoRefresh: boolean;
    refreshInterval: number;
    priceFormat: 'standard' | 'compact';
    showSparklines: boolean;
    defaultCategory: string;
    currency: 'USD' | 'EUR' | 'GBP' | 'JPY';
    dateFormat: string;
    compactNumbers: boolean;
    showPercentChange: boolean;
}

export interface MarketStatus {
    isOpen: boolean;
    status: string;
}

export interface SubscriptionInfo {
    tier: 'free' | 'pro' | 'elite';
    label?: string;
    status?: 'active' | 'trialing' | 'canceled' | 'past_due';
    chat_daily_limit?: number;
    chat_used_today?: number;
    ai_suite_access?: boolean;
    can_send_chat?: boolean;
    trial_end?: string | null;
    current_period_end?: string | null;
}

export interface NewsArticle {
    title?: string;
    headline?: string;
    summary?: string;
    url?: string;
    source?: string;
    publishedAt?: string;
    datetime?: number;
    image?: string;
}

export interface Mover {
    symbol: string;
    name?: string;
    price: number;
    change: number;
    sector?: string;
}

export interface IndexQuote {
    symbol: string;
    name: string;
    shortName: string;
    price: number | null;
    change: number | null;
    changePercent: number | null;
}

export interface ScreenerRow {
    symbol: string;
    name?: string;
    price?: number;
    volume?: number;
    change_pct?: number;
    earnings_date?: string;
    buy_score?: number;
    implied_volatility?: number;
    [key: string]: unknown;
}

export interface SparklineChartProps {
    symbol: string;
    isPositive?: boolean;
    width?: number;
    height?: number;
    data?: number[];
}

export interface OverviewViewProps {
    watchlistData: StockItem[];
    marketStatus: MarketStatus;
    onNavigate: (view: string) => void;
    onNavigateToAiTool?: (tab: string) => void;
    onStockHover?: (symbol: string) => void;
    preferences?: Partial<Preferences>;
}

export interface WatchlistViewProps {
    watchlistData: StockItem[];
    onOpenDetails?: (symbol: string) => void;
    onRemove?: (symbol: string) => void;
    onAdd?: (symbol: string) => void;
    selectedCategory: string;
    onCategoryChange?: (category: string) => void;
    categories: string[];
    onAddFirstStock?: () => void;
    onStockHover?: (symbol: string) => void;
    updatingStocks?: Set<string>;
    preferences?: Partial<Preferences>;
}

export interface ScreenerViewProps {
    screenerType: string | null;
    onNavigate: (view: string) => void;
    onChangeScreener: (type: string) => void;
}

export interface CEODetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    ceoName: string;
    companyName: string;
    companySymbol: string;
}

export interface DashboardProps {
    routeView?: string;
    onRouteChange?: (view: string) => void;
}

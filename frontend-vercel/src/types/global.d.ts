// Global ambient declarations for the AI Stock Sage frontend.
// Covers CDN-loaded React/ReactDOM, Firebase, Socket.IO, Leaflet,
// and every window.* global the codebase reads or writes.

import type * as ReactNS from 'react';
import type {
  StockItem,
  Preferences,
  MarketStatus,
  SparklineChartProps,
  OverviewViewProps,
  WatchlistViewProps,
  ScreenerViewProps,
  CEODetailsModalProps,
  DashboardProps,
} from './models';

export {};

// ── Global type declarations ──────────────────────────────────────────────────
// NOTE: `React` is NOT declared here — allowUmdGlobalAccess in tsconfig.json
// makes the UMD global `React` from @types/react visible in module files
// without TS2686. ReactDOM and io are not UMD exports, so they live in
// declare global below.

declare global {
  // ReactDOM (CDN-loaded)
  var ReactDOM: {
    createRoot(
      container: Element | DocumentFragment
    ): { render(element: ReactNS.ReactNode): void };
    createPortal(
      children: ReactNS.ReactNode,
      container: Element | DocumentFragment
    ): ReactNS.ReactPortal;
  };

  // Socket.IO factory (CDN-loaded)
  function io(
    url: string,
    opts?: { transports?: string[]; withCredentials?: boolean }
  ): SocketIOClient;

  // Firebase (CDN-loaded)
  interface FirebaseUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL?: string | null;
    getIdToken(forceRefresh?: boolean): Promise<string>;
  }

  interface FirebaseAuth {
    currentUser: FirebaseUser | null;
    onAuthStateChanged(
      callback: (user: FirebaseUser | null) => void
    ): () => void;
    signOut(): Promise<void>;
  }

  // Socket.IO client
  interface SocketIOClient {
    connected: boolean;
    on(event: string, callback: (...args: unknown[]) => void): void;
    emit(event: string, data?: unknown): void;
    disconnect(): void;
  }

  // Leaflet (CDN-loaded)
  interface LeafletStatic {
    [key: string]: unknown;
  }

  // AppAuth public API
  interface AppAuthInterface {
    useAuth(): { authReady: boolean; currentUser: FirebaseUser | null };
    getCurrentUser(): FirebaseUser | null;
    isReady(): boolean;
    getClient(): FirebaseAuth | null;
    getAuthHeaders(user?: FirebaseUser | null): Promise<Record<string, string>>;
    signOut(): Promise<void>;
  }

  interface Window {
    // Auth
    AppAuth: AppAuthInterface;
    firebaseAuth?: FirebaseAuth;

    // Config
    API_BASE_URL?: string;
    CONFIG?: { API_BASE_URL: string };
    STRIPE_CONFIG?: {
      PRO_MONTHLY: string;
      PRO_YEARLY: string;
      ELITE_MONTHLY: string;
      ELITE_YEARLY: string;
    };

    // Internal state flags
    __defaultTimeRange: string;
    __guestMode: boolean;
    __reloadSubscriptionInfo?: () => void;
    __setIntelTab?: (tab: string) => void;

    // Page-level React components
    DashboardRedesign: ReactNS.ComponentType<DashboardProps> & {
      trackStockView?: (symbol: string) => void;
      untrackStockView?: (symbol: string) => void;
    };
    StockWatchlistLandingPage: ReactNS.ComponentType;
    StockDetailsPage: ReactNS.ComponentType<{
      symbol: string;
      isFromWatchlist?: boolean;
      onNavigateBack: () => void;
    }>;
    PricingPage: ReactNS.ComponentType;
    PaperTradingView?: ReactNS.ComponentType;

    // View components (loaded via <script defer> before dashboard shell)
    OverviewView: ReactNS.ComponentType<OverviewViewProps>;
    WatchlistView: ReactNS.ComponentType<WatchlistViewProps>;
    ScreenerView: ReactNS.ComponentType<ScreenerViewProps>;
    NewsView: ReactNS.ComponentType;
    WhatsWhatView: ReactNS.ComponentType;
    AISuiteView: ReactNS.ComponentType<{ watchlistData: StockItem[] }>;
    IntelligenceView: ReactNS.ComponentType<{ watchlistData: StockItem[] }>;
    MapView: ReactNS.ComponentType;
    AIAssistantView: ReactNS.ComponentType;

    // Widget components
    SparklineChart: ReactNS.ComponentType<SparklineChartProps>;
    TopMoversWidget: ReactNS.ComponentType;
    MarketOverview: ReactNS.ComponentType<{ marketStatus: MarketStatus }>;
    MarketIntelligenceWidget: ReactNS.ComponentType<{
      onNavigate: (view: string) => void;
    }>;
    CorrelationHeatmap: ReactNS.ComponentType<{ watchlistData: StockItem[] }>;

    // Modal components
    StockDetailsModal: ReactNS.ComponentType<Record<string, unknown>>;
    StockNotesSection: ReactNS.ComponentType<{ symbol: string }>;
    WatchlistNotesSection: ReactNS.ComponentType<{ symbol: string; initialNotes?: string }>;
    CEODetailsModal?: ReactNS.ComponentType<CEODetailsModalProps>;

    // Chart
    StockChart: ReactNS.ComponentType<{
      symbol: string;
      data?: unknown;
      isModal?: boolean;
      onClose?: () => void;
    }>;

    // Imperative functions
    openStockDetailsModalReact?: (
      symbol: string,
      isFromWatchlist?: boolean
    ) => void;
    openStockDetailsModalLegacy?: (
      symbol: string,
      isFromWatchlist?: boolean
    ) => void;
    closeStockDetailsModalReact?: () => void;
    showNotification?: (message: string, type: string) => void;
    showUpgradeModal?: (reason?: string) => void;
    hideUpgradeModal?: () => void;
    viewChart?: (symbol: string) => Promise<void>;
    refreshWatchlist?: () => void;
    renderWatchlistNotes?: (symbol: string, notes: string) => void;
    unmountWatchlistNotes?: () => void;
    trackStockView?: (symbol: string) => void;
    untrackStockView?: (symbol: string) => void;

    // Third-party CDN libraries
    L?: LeafletStatic;
  }
}

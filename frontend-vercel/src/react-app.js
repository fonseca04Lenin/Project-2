const {
    BrowserRouter,
    Navigate,
    Routes,
    Route,
    useLocation,
    useNavigate,
    useParams,
} = require('react-router-dom');
const AuthContext = React.createContext({ authReady: false, currentUser: null });
const authStateRef = { current: { authReady: false, currentUser: null } };

window.AppAuth = window.AppAuth || {};
window.AppAuth.useAuth = function useSharedAuth() {
    return React.useContext(AuthContext);
};
window.AppAuth.getCurrentUser = function getCurrentUser() {
    return authStateRef.current.currentUser;
};
window.AppAuth.isReady = function isReady() {
    return authStateRef.current.authReady;
};
window.AppAuth.getClient = function getClient() {
    return window.firebaseAuth || null;
};
window.AppAuth.getAuthHeaders = async function getAuthHeaders(user = null) {
    const activeUser = user || authStateRef.current.currentUser;
    if (!activeUser) {
        return {};
    }
    const token = await activeUser.getIdToken();
    return {
        'Authorization': `Bearer ${token}`,
        'X-User-ID': activeUser.uid,
    };
};
window.AppAuth.signOut = async function signOut() {
    const client = window.firebaseAuth;
    if (client) {
        await client.signOut();
    }
};

const DASHBOARD_VIEWS = new Set([
    'overview',
    'watchlist',
    'intelligence',
    'news',
    'whatswhat',
    'map',
    'assistant',
    'aisuite',
    'paper',
    'screener',
]);

function normalizeDashboardView(view) {
    return DASHBOARD_VIEWS.has(view) ? view : 'overview';
}

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error, info) {
        console.error('[AppErrorBoundary]', error, info);
    }
    render() {
        if (this.state.hasError) {
            return React.createElement('div', {
                style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fff', textAlign: 'center', padding: '2rem', gap: '1rem' }
            },
                React.createElement('h2', null, 'Something went wrong.'),
                React.createElement('p', { style: { color: '#aaa' } }, 'Please refresh the page to continue.'),
                React.createElement('button', {
                    onClick: () => window.location.reload(),
                    style: { padding: '0.75rem 1.5rem', background: '#00D924', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }
                }, 'Refresh Page')
            );
        }
        return this.props.children;
    }
}

function AuthProvider({ children }) {
    const [authReady, setAuthReady] = React.useState(false);
    const [currentUser, setCurrentUser] = React.useState(() => window.firebaseAuth?.currentUser || null);

    React.useEffect(() => {
        if (!window.firebaseAuth) {
            setAuthReady(true);
            return undefined;
        }

        const unsubscribe = window.firebaseAuth.onAuthStateChanged((user) => {
            setCurrentUser(user);
            setAuthReady(true);
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    React.useEffect(() => {
        authStateRef.current = { authReady, currentUser };
    }, [authReady, currentUser]);

    return React.createElement(
        AuthContext.Provider,
        { value: { authReady, currentUser } },
        children,
    );
}

function useAuthState() {
    return React.useContext(AuthContext);
}

function StockRoute() {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const symbol = (params.symbol || '').toUpperCase();
    const isFromWatchlist = Boolean(location.state && location.state.isFromWatchlist);

    return React.createElement(window.StockDetailsPage, {
        symbol,
        isFromWatchlist,
        onNavigateBack: () => navigate('/app/overview'),
    });
}

function DashboardRoute() {
    const navigate = useNavigate();
    const params = useParams();
    const routeView = normalizeDashboardView(params.view || 'overview');

    return React.createElement(window.DashboardRedesign, {
        routeView,
        onRouteChange: (view) => navigate(`/app/${normalizeDashboardView(view)}`),
    });
}

function PricingRoute() {
    return React.createElement(window.PricingPage);
}

function LandingRoute() {
    return React.createElement(window.StockWatchlistLandingPage);
}

function AppRouter() {
    const { authReady, currentUser } = useAuthState();
    const navigate = useNavigate();
    const location = useLocation();

    React.useEffect(() => {
        if (!authReady) return;
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
    }, [authReady]);

    React.useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('checkout') !== 'success') {
            return;
        }

        window.history.replaceState({}, document.title, location.pathname);

        const timer = window.setTimeout(() => {
            if (window.showNotification) {
                window.showNotification('Welcome to Pro! Your subscription is now active.', 'success');
            }
            if (window.__reloadSubscriptionInfo) {
                window.__reloadSubscriptionInfo();
            }
        }, 150);

        return () => window.clearTimeout(timer);
    }, [location.pathname, location.search]);

    React.useEffect(() => {
        const handleAppNavigate = (event) => {
            const detail = event.detail || {};
            const path = detail.path || '/';
            const state = detail.state || undefined;
            const replace = Boolean(detail.replace);
            navigate(path, { state, replace });
        };

        window.addEventListener('app:navigate', handleAppNavigate);

        return () => {
            window.removeEventListener('app:navigate', handleAppNavigate);
        };
    }, [navigate]);

    React.useEffect(() => {
        if (!authReady) return;

        const isAppRoute = location.pathname === '/app' || location.pathname.startsWith('/app/');
        const isRootRoute = location.pathname === '/';

        if (currentUser && isRootRoute) {
            navigate('/app/overview', { replace: true });
            return;
        }

        if (!currentUser && !window.__guestMode && isAppRoute) {
            navigate('/', { replace: true });
        }
    }, [authReady, currentUser, location.pathname, navigate]);

    if (!authReady) return null;

    return React.createElement(Routes, null,
        React.createElement(Route, {
            path: '/',
            element: React.createElement(LandingRoute),
        }),
        React.createElement(Route, {
            path: '/pricing',
            element: React.createElement(PricingRoute),
        }),
        React.createElement(Route, {
            path: '/stock/:symbol',
            element: React.createElement(StockRoute),
        }),
        React.createElement(Route, {
            path: '/app',
            element: React.createElement(Navigate, { to: '/app/overview', replace: true }),
        }),
        React.createElement(Route, {
            path: '/app/:view',
            element: React.createElement(DashboardRoute),
        }),
        React.createElement(Route, {
            path: '*',
            element: React.createElement(Navigate, { to: '/', replace: true }),
        }),
    );
}

function RouterApp() {
    if (!window.StockWatchlistLandingPage || !window.DashboardRedesign || !window.StockDetailsPage || !window.PricingPage) {
        return React.createElement('div', {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fff', textAlign: 'center', gap: '1rem' }
        },
            React.createElement('p', { style: { color: '#aaa' } }, 'Loading...'),
            React.createElement('button', {
                onClick: () => window.location.reload(),
                style: { background: 'none', border: 'none', color: '#00D924', cursor: 'pointer', fontSize: '14px' }
            }, 'Click here if this takes too long')
        );
    }

    return React.createElement(
        AppErrorBoundary,
        null,
        React.createElement(BrowserRouter, null,
            React.createElement(AuthProvider, null, React.createElement(AppRouter)),
        ),
    );
}

const routerRootElement = document.getElementById('router-root');
if (routerRootElement) {
    const root = ReactDOM.createRoot(routerRootElement);
    root.render(React.createElement(RouterApp));
}

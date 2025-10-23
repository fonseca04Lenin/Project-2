// React Header Component
// Modern header with market status, welcome message, and logout functionality

const { useState, useEffect } = React;

const ModernHeader = () => {
    const [marketStatus, setMarketStatus] = useState({
        isOpen: false,
        status: 'MARKET IS CLOSED',
        indicatorColor: '#ef4444'
    });
    const [userName, setUserName] = useState('Investor');
    const [isLoading, setIsLoading] = useState(true);

    const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';

    // Load user name from Firebase auth
    useEffect(() => {
        const unsubscribe = window.firebaseAuth?.onAuthStateChanged((user) => {
            if (user) {
                // Try to get display name, fallback to email, then to 'Investor'
                const name = user.displayName || user.email?.split('@')[0] || 'Investor';
                setUserName(name);
                setIsLoading(false);
            } else {
                setUserName('Investor');
                setIsLoading(false);
            }
        });

        return () => unsubscribe && unsubscribe();
    }, []);

    // Update market status
    const updateMarketStatus = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/market-status`, {
                credentials: 'include'
            });
            const data = await response.json();

            setMarketStatus({
                isOpen: data.isOpen,
                status: data.isOpen ? 'MARKET IS OPEN' : 'MARKET IS CLOSED',
                indicatorColor: data.isOpen ? '#22c55e' : '#ef4444'
            });
        } catch (error) {
            console.error('Error fetching market status:', error);
            setMarketStatus({
                isOpen: false,
                status: 'MARKET IS CLOSED',
                indicatorColor: '#ef4444'
            });
        }
    };

    // Update market status on component mount and set interval
    useEffect(() => {
        updateMarketStatus();
        
        // Update every minute
        const interval = setInterval(updateMarketStatus, 60000);
        
        return () => clearInterval(interval);
    }, []);

    // Handle logout
    const handleLogout = async () => {
        try {
            // Sign out from Firebase if authenticated
            if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                await window.firebaseAuth.signOut();
            }
            
            // Also sign out from backend
            const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
                credentials: 'include'
            });
            
            // Always treat logout as successful to clear frontend state
            if (window.showNotification) {
                window.showNotification('Logout successful', 'success');
            }
            
            // Clear all user data and forms
            localStorage.removeItem('user');
            sessionStorage.clear();
            
            // Redirect to login page
            window.location.reload();
            
        } catch (error) {
            console.error('Logout error:', error);
            // Even if there's an error, clear the frontend state
            window.location.reload();
        }
    };

    return (
        <header className="modern-header">
            <div className="header-container">
                {/* Left Section - Brand */}
                <div className="header-left">
                    <div className="app-brand">
                        <i className="fas fa-chart-line brand-icon"></i>
                        <h1 className="brand-title">Watchlist Pro</h1>
                    </div>
                </div>
                
                {/* Right Section - Market Status, Welcome, and Logout */}
                <div className="header-right">
                    <div className="user-profile">
                        {/* Market Status */}
                        <div className="market-status-display">
                            <span 
                                className="market-indicator"
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    color: '#fff',
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '16px',
                                    fontSize: '0.8rem',
                                    fontWeight: '400',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    opacity: '0.8'
                                }}
                            >
                                <span 
                                    style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        background: marketStatus.isOpen ? '#22c55e' : '#ef4444',
                                        display: 'inline-block',
                                        opacity: '0.9'
                                    }}
                                ></span>
                                {marketStatus.isOpen ? 'Market Open' : 'Market Closed'}
                            </span>
                        </div>
                        
                        {/* Welcome Message */}
                        <div className="user-welcome">
                            Welcome, {userName}!
                        </div>
                        
                        {/* Logout Button */}
                        <button 
                            onClick={handleLogout}
                            className="modern-logout-btn"
                        >
                            <i className="fas fa-sign-out-alt"></i>
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

// Render the component
const headerContainer = document.getElementById('header-root');
if (headerContainer) {
    console.log('Rendering Modern Header React component...');
    const root = ReactDOM.createRoot(headerContainer);
    root.render(<ModernHeader />);
} else {
    console.error('Header container not found!');
}

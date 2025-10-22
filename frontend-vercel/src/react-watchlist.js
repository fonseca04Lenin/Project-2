// React Watchlist Integration
// This file integrates the React Watchlist component into the existing vanilla JS app

const { useState, useEffect } = React;

// WatchlistComponent - React component that matches the exact design
const WatchlistComponent = () => {
    const [watchlistData, setWatchlistData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Load watchlist from API
        loadWatchlistFromAPI();
        
        // Listen for authentication state changes
        const unsubscribe = window.firebase && window.firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                // User logged in, reload watchlist
                loadWatchlistFromAPI();
            } else {
                // User logged out, clear watchlist
                setWatchlistData([]);
                setLoading(false);
            }
        });
        
        // Cleanup listener on unmount
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const loadWatchlistFromAPI = async () => {
        try {
            setLoading(true);
            console.log('🔄 Loading watchlist from API...');
            
            // Check if user is authenticated
            if (window.firebase && window.firebase.auth().currentUser) {
                const user = window.firebase.auth().currentUser;
                console.log('✅ User authenticated:', user.email);
                const token = await user.getIdToken();
                
                const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';
                console.log('🌐 Fetching from:', `${API_BASE_URL}/api/watchlist`);
                
                const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log('📡 API Response status:', response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('📊 Watchlist data received:', data);
                    setWatchlistData(data.watchlist || []);
                } else {
                    console.error('❌ API failed with status:', response.status);
                    const errorText = await response.text();
                    console.error('❌ API error:', errorText);
                    // If API fails, show empty state
                    setWatchlistData([]);
                }
            } else {
                console.log('❌ User not authenticated');
                // User not authenticated, show empty state
                setWatchlistData([]);
            }
        } catch (error) {
            console.error('💥 Error loading watchlist:', error);
            // Show empty state on error
            setWatchlistData([]);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveStock = async (symbol) => {
        try {
            // Optimistically update UI
            setWatchlistData(prev => prev.filter(stock => stock.symbol !== symbol));
            
            // Call API to remove from backend
            if (window.firebase && window.firebase.auth().currentUser) {
                const user = window.firebase.auth().currentUser;
                const token = await user.getIdToken();
                
                const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';
                const response = await fetch(`${API_BASE_URL}/api/watchlist/${symbol}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    // If API call fails, revert the UI change
                    loadWatchlistFromAPI();
                    console.error('Failed to remove stock from backend');
                }
            }
        } catch (error) {
            console.error('Error removing stock:', error);
            // Revert UI change on error
            loadWatchlistFromAPI();
        }
    };

    const handleViewChart = (symbol) => {
        // This would integrate with the existing chart functionality
        console.log('View chart for:', symbol);
        // You can call the existing viewChart function here
        if (window.viewChart) {
            window.viewChart(symbol);
        }
    };

    const handleClearWatchlist = async () => {
        if (confirm('Are you sure you want to clear your entire watchlist?')) {
            try {
                // Optimistically update UI
                setWatchlistData([]);
                
                // Call API to clear backend
                if (window.firebase && window.firebase.auth().currentUser) {
                    const user = window.firebase.auth().currentUser;
                    const token = await user.getIdToken();
                    
                    const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';
                    
                    // Remove each stock individually
                    for (const stock of watchlistData) {
                        const response = await fetch(`${API_BASE_URL}/api/watchlist/${stock.symbol}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (!response.ok) {
                            console.error(`Failed to remove ${stock.symbol} from backend`);
                        }
                    }
                }
            } catch (error) {
                console.error('Error clearing watchlist:', error);
                // Revert UI change on error
                loadWatchlistFromAPI();
            }
        }
    };

    const formatPrice = (price) => {
        return `$${price.toFixed(2)}`;
    };

    const formatChange = (changePercent) => {
        const sign = changePercent >= 0 ? '+' : '';
        return `${sign}${changePercent.toFixed(2)}% today`;
    };

    const getChangeClass = (changePercent) => {
        if (changePercent > 0) return 'watchlist-perf-up';
        if (changePercent < 0) return 'watchlist-perf-down';
        return 'watchlist-perf-flat';
    };

    if (loading) {
        return React.createElement('section', { className: 'watchlist-section' },
            React.createElement('div', { className: 'section-header' },
                React.createElement('div', { className: 'flex items-center gap-2' },
                    React.createElement('svg', {
                        xmlns: 'http://www.w3.org/2000/svg',
                        width: '24',
                        height: '24',
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        stroke: 'currentColor',
                        strokeWidth: '2',
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round',
                        className: 'text-primary'
                    },
                        React.createElement('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' })
                    ),
                    React.createElement('h2', { className: 'font-semibold text-lg' }, 'My Watchlist')
                ),
                React.createElement('button', { 
                    className: 'clear-watchlist-btn', 
                    title: 'Clear All Stocks' 
                },
                    React.createElement('svg', {
                        xmlns: 'http://www.w3.org/2000/svg',
                        width: '18',
                        height: '18',
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        stroke: 'currentColor',
                        strokeWidth: '2',
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round'
                    },
                        React.createElement('path', { d: 'M3 6h18' }),
                        React.createElement('path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }),
                        React.createElement('path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' })
                    )
                )
            ),
            React.createElement('div', { className: 'watchlist-container' },
                React.createElement('div', { className: 'loading-state' },
                    React.createElement('i', { className: 'fas fa-spinner fa-spin' }),
                    React.createElement('p', null, 'Loading watchlist...')
                )
            )
        );
    }

    return React.createElement('section', { className: 'watchlist-section' },
        React.createElement('div', { className: 'section-header' },
            React.createElement('div', { className: 'flex items-center gap-2' },
                React.createElement('svg', {
                    xmlns: 'http://www.w3.org/2000/svg',
                    width: '24',
                    height: '24',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: '2',
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                    className: 'text-primary'
                },
                    React.createElement('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' })
                ),
                React.createElement('h2', { className: 'font-semibold text-lg' }, 'My Watchlist')
            ),
            React.createElement('button', { 
                className: 'clear-watchlist-btn', 
                title: 'Clear All Stocks',
                onClick: handleClearWatchlist
            },
                React.createElement('svg', {
                    xmlns: 'http://www.w3.org/2000/svg',
                    width: '18',
                    height: '18',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: '2',
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round'
                },
                    React.createElement('path', { d: 'M3 6h18' }),
                    React.createElement('path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }),
                    React.createElement('path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' })
                )
            )
        ),
        React.createElement('div', { className: 'watchlist-container space-y-4' },
            watchlistData.length === 0 ? 
                React.createElement('div', { className: 'empty-state' },
                    React.createElement('i', { className: 'fas fa-chart-line' }),
                    React.createElement('p', null, 'Start building your portfolio'),
                    React.createElement('small', null, 'Search for companies like Apple, Tesla, or Microsoft to add them to your watchlist')
                ) :
                watchlistData.map((stock) => 
                    React.createElement('div', { 
                        key: stock.symbol, 
                        className: 'p-4 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-colors' 
                    },
                        React.createElement('div', { className: 'flex items-start justify-between mb-3' },
                            React.createElement('div', null,
                                React.createElement('h3', { className: 'font-semibold text-lg text-foreground' }, stock.company_name || stock.name || stock.symbol),
                                React.createElement('p', { className: 'text-sm text-muted-foreground' }, stock.symbol)
                            ),
                            React.createElement('div', { className: 'text-right' },
                                React.createElement('p', { className: 'text-2xl font-bold text-primary' }, `$${formatPrice(stock.price)}`),
                                React.createElement('span', { 
                                    className: `badge ${stock.change_percent >= 0 ? 'bg-primary' : 'bg-destructive'}` 
                                }, `${stock.change_percent >= 0 ? '+' : ''}${formatChange(stock.change_percent)}`)
                            )
                        ),
                        React.createElement('div', { className: 'flex gap-2' },
                            React.createElement('button', { 
                                className: 'btn btn-outline btn-sm flex-1', 
                                onClick: () => handleViewChart(stock.symbol)
                            },
                                React.createElement('svg', {
                                    xmlns: 'http://www.w3.org/2000/svg',
                                    width: '16',
                                    height: '16',
                                    viewBox: '0 0 24 24',
                                    fill: 'none',
                                    stroke: 'currentColor',
                                    strokeWidth: '2',
                                    strokeLinecap: 'round',
                                    strokeLinejoin: 'round',
                                    className: 'mr-2'
                                },
                                    React.createElement('polyline', { points: '22 12 18 12 15 21 9 3 6 12 2 12' })
                                ),
                                ' Chart'
                            ),
                            React.createElement('button', { 
                                className: 'btn btn-outline btn-sm flex-1', 
                                onClick: () => handleRemoveStock(stock.symbol)
                            },
                                React.createElement('svg', {
                                    xmlns: 'http://www.w3.org/2000/svg',
                                    width: '16',
                                    height: '16',
                                    viewBox: '0 0 24 24',
                                    fill: 'none',
                                    stroke: 'currentColor',
                                    strokeWidth: '2',
                                    strokeLinecap: 'round',
                                    strokeLinejoin: 'round',
                                    className: 'mr-2'
                                },
                                    React.createElement('path', { d: 'M3 6h18' }),
                                    React.createElement('path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' })
                                ),
                                ' Remove'
                            )
                        )
                    )
                )
        )
    );
};

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    // Find the watchlist container
    const watchlistContainer = document.getElementById('watchlistContainer');
    const watchlistSection = document.querySelector('.watchlist-section');
    
    if (watchlistContainer && watchlistSection) {
        // Create a new container for React
        const reactContainer = document.createElement('div');
        reactContainer.id = 'react-watchlist-root';
        
        // Replace the existing watchlist container with React container
        watchlistSection.replaceChild(reactContainer, watchlistContainer);
        
        // Render React component
        const root = ReactDOM.createRoot(reactContainer);
        root.render(React.createElement(WatchlistComponent));
        
        console.log('✅ React Watchlist component loaded successfully');
    } else {
        console.warn('⚠️ Watchlist container not found, React component not loaded');
    }
});

// Export for potential use in other parts of the app
window.WatchlistComponent = WatchlistComponent;

// Export refresh function for integration with existing app
window.refreshWatchlist = () => {
    console.log('🔄 Manual watchlist refresh triggered');
    const watchlistRoot = document.getElementById('react-watchlist-root');
    if (watchlistRoot) {
        const root = ReactDOM.createRoot(watchlistRoot);
        root.render(React.createElement(WatchlistComponent));
    }
};

// Export function to manually reload watchlist data
window.reloadWatchlistData = () => {
    console.log('🔄 Manual watchlist data reload triggered');
    // Find the React component instance and trigger reload
    const watchlistRoot = document.getElementById('react-watchlist-root');
    if (watchlistRoot && watchlistRoot._reactInternalFiber) {
        // This is a bit hacky but works for manual refresh
        window.refreshWatchlist();
    }
};

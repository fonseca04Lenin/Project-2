/**
 * Modern Interactive Stock Chart Component
 * Built with React and Recharts for superior interactivity and performance
 */

const { useState, useEffect, useRef, useMemo } = React;

// Check if Recharts is available
if (typeof Recharts === 'undefined') {
    console.error('Recharts library not loaded. Please ensure Recharts is included before this script.');
    
    // Fallback chart component
    window.StockChart = ({ symbol, data, isModal = false, onClose }) => {
        const [chartData, setChartData] = useState([]);
        
        useEffect(() => {
            if (data && Array.isArray(data)) {
                setChartData(data);
            }
        }, [data]);
        
        const maxPrice = Math.max(...chartData.map(d => d.price));
        const minPrice = Math.min(...chartData.map(d => d.price));
        const priceRange = maxPrice - minPrice;
        
        return React.createElement('div', {
            style: { 
                width: '100%',
                height: isModal ? '300px' : '400px',
                backgroundColor: 'rgba(16, 18, 27, 0.8)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                position: 'relative'
            }
        }, [
            React.createElement('div', {
                key: 'header',
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid rgba(34, 197, 94, 0.2)'
                }
            }, [
                React.createElement('h3', {
                    key: 'title',
                    style: {
                        fontSize: '20px',
                        fontWeight: '700',
                        color: '#22c55e',
                        margin: 0
                    }
                }, `${symbol} - Price Chart`),
                isModal && React.createElement('button', {
                    key: 'close',
                    onClick: onClose,
                    style: {
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        color: '#ef4444',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer'
                    }
                }, '✕')
            ]),
            React.createElement('div', {
                key: 'chart',
                style: {
                    height: isModal ? '200px' : '280px',
                    position: 'relative',
                    backgroundColor: 'rgba(34, 197, 94, 0.05)',
                    borderRadius: '8px',
                    border: '1px solid rgba(34, 197, 94, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: '12px'
                }
            }, [
                React.createElement('div', {
                    key: 'icon',
                    style: { fontSize: '48px', opacity: 0.3 }
                }, '📈'),
                React.createElement('div', {
                    key: 'message',
                    style: { 
                        color: '#a1a1aa', 
                        fontSize: '16px',
                        textAlign: 'center'
                    }
                }, 'Chart library loading...'),
                React.createElement('div', {
                    key: 'submessage',
                    style: { 
                        color: '#6b7280', 
                        fontSize: '14px',
                        textAlign: 'center'
                    }
                }, 'Please refresh the page if this persists')
            ])
        ]);
    };
} else {
    const { 
        LineChart, 
        Line, 
        XAxis, 
        YAxis, 
        CartesianGrid, 
        Tooltip, 
        ResponsiveContainer, 
        ReferenceLine,
        Area,
        AreaChart,
        Brush
    } = Recharts;

    const StockChart = ({ symbol, data, isModal = false, onClose }) => {
    const [chartData, setChartData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [timeRange, setTimeRange] = useState('30d');
    const [showVolume, setShowVolume] = useState(false);
    const [priceRange, setPriceRange] = useState({ min: 0, max: 0 });
    const chartRef = useRef(null);

    // Process chart data
    useEffect(() => {
        if (data && Array.isArray(data)) {
            const processedData = data.map((item, index) => ({
                ...item,
                date: new Date(item.date),
                formattedDate: formatDate(item.date),
                price: parseFloat(item.price),
                volume: item.volume || Math.random() * 1000000, // Mock volume if not available
                index: index
            }));

            setChartData(processedData);
            
            // Calculate price range for reference lines
            const prices = processedData.map(d => d.price);
            setPriceRange({
                min: Math.min(...prices),
                max: Math.max(...prices)
            });
            
            setIsLoading(false);
            setError(null);
        } else {
            setError('No chart data available');
            setIsLoading(false);
        }
    }, [data]);

    // Format date for display
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
        });
    };

    // Format price for tooltip
    const formatPrice = (value) => {
        return `$${value.toFixed(2)}`;
    };

    // Format volume for tooltip
    const formatVolume = (value) => {
        if (value >= 1000000) {
            return `${(value / 1000000).toFixed(1)}M`;
        } else if (value >= 1000) {
            return `${(value / 1000).toFixed(1)}K`;
        }
        return value.toString();
    };

    // Custom tooltip component
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                React.createElement('div', {
                    className: 'chart-tooltip',
                    style: {
                        backgroundColor: 'rgba(16, 18, 27, 0.95)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                        backdropFilter: 'blur(10px)',
                        color: 'white',
                        fontSize: '14px',
                        minWidth: '200px'
                    }
                }, [
                    React.createElement('div', {
                        key: 'date',
                        style: { 
                            fontWeight: '600', 
                            marginBottom: '8px',
                            color: '#22c55e'
                        }
                    }, data.formattedDate),
                    React.createElement('div', {
                        key: 'price',
                        style: { 
                            fontSize: '18px', 
                            fontWeight: '700',
                            marginBottom: '4px'
                        }
                    }, `$${data.price.toFixed(2)}`),
                    showVolume && React.createElement('div', {
                        key: 'volume',
                        style: { 
                            fontSize: '12px', 
                            color: '#a1a1aa'
                        }
                    }, `Volume: ${formatVolume(data.volume)}`)
                ])
            );
        }
        return null;
    };

    // Calculate price change
    const priceChange = useMemo(() => {
        if (chartData.length < 2) return { value: 0, percentage: 0 };
        const firstPrice = chartData[0].price;
        const lastPrice = chartData[chartData.length - 1].price;
        const change = lastPrice - firstPrice;
        const percentage = (change / firstPrice) * 100;
        return { value: change, percentage };
    }, [chartData]);

    // Loading component
    if (isLoading) {
        return React.createElement('div', {
            className: 'chart-loading',
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: isModal ? '300px' : '400px',
                backgroundColor: 'rgba(16, 18, 27, 0.5)',
                borderRadius: '12px',
                border: '1px solid rgba(34, 197, 94, 0.2)'
            }
        }, [
            React.createElement('div', {
                key: 'spinner',
                className: 'spinner',
                style: {
                    width: '40px',
                    height: '40px',
                    border: '3px solid rgba(34, 197, 94, 0.3)',
                    borderTop: '3px solid #22c55e',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }
            }),
            React.createElement('div', {
                key: 'text',
                style: {
                    marginLeft: '12px',
                    color: '#a1a1aa',
                    fontSize: '14px'
                }
            }, 'Loading chart data...')
        ]);
    }

    // Error component
    if (error) {
        return React.createElement('div', {
            className: 'chart-error',
            style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: isModal ? '300px' : '400px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '12px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444'
            }
        }, [
            React.createElement('div', {
                key: 'icon',
                style: { fontSize: '24px', marginBottom: '8px' }
            }, '📊'),
            React.createElement('div', {
                key: 'text',
                style: { fontSize: '16px', fontWeight: '600' }
            }, 'Chart Unavailable'),
            React.createElement('div', {
                key: 'subtext',
                style: { fontSize: '14px', opacity: 0.7, marginTop: '4px' }
            }, error)
        ]);
    }

    // Main chart component
    return React.createElement('div', {
        className: 'modern-stock-chart',
        style: {
            width: '100%',
            height: isModal ? '300px' : '400px',
            backgroundColor: 'rgba(16, 18, 27, 0.8)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            backdropFilter: 'blur(10px)'
        }
    }, [
        // Chart Header
        React.createElement('div', {
            key: 'header',
            style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid rgba(34, 197, 94, 0.2)'
            }
        }, [
            React.createElement('div', {
                key: 'title',
                style: { display: 'flex', alignItems: 'center', gap: '8px' }
            }, [
                React.createElement('h3', {
                    key: 'symbol',
                    style: {
                        fontSize: '20px',
                        fontWeight: '700',
                        color: '#22c55e',
                        margin: 0
                    }
                }, symbol),
                React.createElement('span', {
                    key: 'range',
                    style: {
                        fontSize: '14px',
                        color: '#a1a1aa',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        padding: '4px 8px',
                        borderRadius: '6px'
                    }
                }, `${timeRange.toUpperCase()} Price History`)
            ]),
            React.createElement('div', {
                key: 'controls',
                style: { display: 'flex', alignItems: 'center', gap: '8px' }
            }, [
                React.createElement('button', {
                    key: 'volume-toggle',
                    onClick: () => setShowVolume(!showVolume),
                    style: {
                        backgroundColor: showVolume ? '#22c55e' : 'rgba(34, 197, 94, 0.2)',
                        color: showVolume ? 'white' : '#22c55e',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }
                }, 'Volume'),
                isModal && React.createElement('button', {
                    key: 'close',
                    onClick: onClose,
                    style: {
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        color: '#ef4444',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }
                }, '✕')
            ])
        ]),

        // Price Change Indicator
        React.createElement('div', {
            key: 'price-change',
            style: {
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px',
                padding: '8px 12px',
                backgroundColor: priceChange.value >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                border: `1px solid ${priceChange.value >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
            }
        }, [
            React.createElement('span', {
                key: 'change-icon',
                style: {
                    fontSize: '16px',
                    color: priceChange.value >= 0 ? '#22c55e' : '#ef4444'
                }
            }, priceChange.value >= 0 ? '↗' : '↘'),
            React.createElement('span', {
                key: 'change-value',
                style: {
                    fontSize: '16px',
                    fontWeight: '600',
                    color: priceChange.value >= 0 ? '#22c55e' : '#ef4444'
                }
            }, `${priceChange.value >= 0 ? '+' : ''}${priceChange.value.toFixed(2)}`),
            React.createElement('span', {
                key: 'change-percentage',
                style: {
                    fontSize: '14px',
                    color: '#a1a1aa'
                }
            }, `(${priceChange.percentage >= 0 ? '+' : ''}${priceChange.percentage.toFixed(2)}%)`)
        ]),

        // Chart Container
        React.createElement(ResponsiveContainer, {
            key: 'chart',
            width: '100%',
            height: isModal ? '200px' : '280px'
        }, React.createElement(AreaChart, {
            data: chartData,
            margin: { top: 10, right: 30, left: 0, bottom: 0 }
        }, [
            React.createElement(CartesianGrid, {
                key: 'grid',
                strokeDasharray: '3 3',
                stroke: 'rgba(34, 197, 94, 0.1)'
            }),
            React.createElement(XAxis, {
                key: 'x-axis',
                dataKey: 'formattedDate',
                stroke: '#a1a1aa',
                fontSize: 12,
                tickLine: false,
                axisLine: false
            }),
            React.createElement(YAxis, {
                key: 'y-axis',
                stroke: '#a1a1aa',
                fontSize: 12,
                tickLine: false,
                axisLine: false,
                tickFormatter: formatPrice
            }),
            React.createElement(Tooltip, {
                key: 'tooltip',
                content: CustomTooltip
            }),
            React.createElement(Area, {
                key: 'area',
                type: 'monotone',
                dataKey: 'price',
                stroke: '#22c55e',
                strokeWidth: 2,
                fill: 'url(#colorGradient)',
                dot: false,
                activeDot: {
                    r: 4,
                    stroke: '#22c55e',
                    strokeWidth: 2,
                    fill: 'rgba(16, 18, 27, 0.8)'
                }
            }),
            React.createElement('defs', {
                key: 'gradient'
            }, React.createElement('linearGradient', {
                id: 'colorGradient',
                x1: '0',
                y1: '0',
                x2: '0',
                y2: '1'
            }, [
                React.createElement('stop', {
                    key: 'stop1',
                    offset: '5%',
                    stopColor: '#22c55e',
                    stopOpacity: 0.3
                }),
                React.createElement('stop', {
                    key: 'stop2',
                    offset: '95%',
                    stopColor: '#22c55e',
                    stopOpacity: 0
                })
            ]))
        ]))
    ]);
};

    // Export for use in other components
    window.StockChart = StockChart;
}

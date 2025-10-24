/**
 * Modern Interactive Stock Chart Component
 * Built with Chart.js for superior reliability and performance
 */

const { useState, useEffect, useRef } = React;

// Modern Chart.js implementation
window.StockChart = ({ symbol, data, isModal = false, onClose }) => {
    const [chartData, setChartData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [priceChange, setPriceChange] = useState({ value: 0, percentage: 0 });
    const [timeRange, setTimeRange] = useState('30d');
    const [isLoadingNewData, setIsLoadingNewData] = useState(false);
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);

    // Process chart data
    useEffect(() => {
        if (data && Array.isArray(data)) {
            const processedData = data.map((item, index) => ({
                ...item,
                date: new Date(item.date),
                formattedDate: formatDate(item.date),
                price: parseFloat(item.price),
                index: index
            }));

            setChartData(processedData);
            
            // Calculate price change
            if (processedData.length >= 2) {
                const firstPrice = processedData[0].price;
                const lastPrice = processedData[processedData.length - 1].price;
                const change = lastPrice - firstPrice;
                const percentage = (change / firstPrice) * 100;
                setPriceChange({ value: change, percentage });
            }
            
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

    // Fetch new chart data for different time ranges
    const fetchChartData = async (range) => {
        setIsLoadingNewData(true);
        try {
            console.log(`🔄 Fetching ${range} data for ${symbol}`);
            const response = await fetch(`${window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app'}/api/chart/${symbol}?range=${range}`, {
                credentials: 'include'
            });
            const newData = await response.json();
            
            console.log(`📊 Received ${newData.length} data points for ${range}`);
            
            if (response.ok) {
                const processedData = newData.map((item, index) => ({
                    ...item,
                    date: new Date(item.date),
                    formattedDate: formatDateForRange(item.date, range),
                    price: parseFloat(item.price),
                    index: index
                }));
                
                console.log(`✅ Processed data:`, processedData.slice(0, 3), '...');
                
                setChartData(processedData);
                
                // Calculate price change
                if (processedData.length >= 2) {
                    const firstPrice = processedData[0].price;
                    const lastPrice = processedData[processedData.length - 1].price;
                    const change = lastPrice - firstPrice;
                    const percentage = (change / firstPrice) * 100;
                    setPriceChange({ value: change, percentage });
                    console.log(`📈 Price change: ${change.toFixed(2)} (${percentage.toFixed(2)}%)`);
                }
                
                setError(null);
            } else {
                console.error(`❌ Error loading ${range} data:`, newData.error);
                setError(newData.error || 'Error loading chart data');
            }
        } catch (error) {
            console.error('❌ Error fetching chart data:', error);
            setError('Failed to load chart data');
        } finally {
            setIsLoadingNewData(false);
        }
    };

    // Format date based on time range
    const formatDateForRange = (dateString, range) => {
        const date = new Date(dateString);
        
        if (range === '5y' || range === 'all') {
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                year: '2-digit' 
            });
        } else if (range === '1y') {
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            });
        } else {
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            });
        }
    };

    // Handle time range change
    const handleTimeRangeChange = (newRange) => {
        if (newRange !== timeRange) {
            setTimeRange(newRange);
            fetchChartData(newRange);
        }
    };

    // Create or update chart
    useEffect(() => {
        if (chartData.length === 0 || !chartRef.current) return;

        const ctx = chartRef.current.getContext('2d');
        
        try {
            // If chart exists, update data instead of recreating
            if (chartInstanceRef.current) {
                chartInstanceRef.current.data.labels = chartData.map(item => item.formattedDate);
                chartInstanceRef.current.data.datasets[0].data = chartData.map(item => item.price);
                chartInstanceRef.current.data.datasets[0].label = `${symbol} Price`;
                chartInstanceRef.current.data.datasets[0].pointRadius = 0; // No circles for any time range
                chartInstanceRef.current.update('active');
            } else {
                // Create new chart
                chartInstanceRef.current = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: chartData.map(item => item.formattedDate),
                        datasets: [{
                            label: `${symbol} Price`,
                            data: chartData.map(item => item.price),
                            borderColor: '#22c55e',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointRadius: timeRange === '30d' ? 0 : 0, // No circles for any time range
                            pointHoverRadius: 6,
                            pointHoverBackgroundColor: '#22c55e',
                            pointHoverBorderColor: '#ffffff',
                            pointHoverBorderWidth: 2
                        }]
                    },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            left: 40,
                            right: 20,
                            top: 20,
                            bottom: 30
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(16, 18, 27, 0.95)',
                            titleColor: '#22c55e',
                            bodyColor: '#ffffff',
                            borderColor: 'rgba(34, 197, 94, 0.3)',
                            borderWidth: 1,
                            cornerRadius: 8,
                            displayColors: false,
                            titleFont: {
                                size: 14,
                                weight: 'bold'
                            },
                            bodyFont: {
                                size: 16,
                                weight: '600'
                            },
                            padding: 12,
                            callbacks: {
                                title: function(context) {
                                    return context[0].label;
                                },
                                label: function(context) {
                                    return `$${context.parsed.y.toFixed(2)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            grid: {
                                color: 'rgba(34, 197, 94, 0.1)',
                                drawBorder: false
                            },
                            ticks: {
                                color: '#a1a1aa',
                                font: {
                                    size: 12
                                },
                                maxTicksLimit: 8,
                                padding: 15
                            }
                        },
                        y: {
                            display: true,
                            grid: {
                                color: 'rgba(34, 197, 94, 0.1)',
                                drawBorder: false
                            },
                            ticks: {
                                color: '#a1a1aa',
                                font: {
                                    size: 12
                                },
                                padding: 20,
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        }
                    },
                    elements: {
                        point: {
                            hoverBackgroundColor: '#22c55e',
                            hoverBorderColor: '#ffffff',
                            hoverBorderWidth: 2,
                            hoverRadius: 6
                        }
                    }
                }
            });
            }
        } catch (error) {
            console.error('Chart creation error:', error);
            setError('Failed to create chart');
        }
    }, [chartData, symbol, timeRange]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
            }
        };
    }, []);

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
                // Time Range Buttons
                React.createElement('div', {
                    key: 'time-range-buttons',
                    style: { display: 'flex', gap: '4px' }
                }, [
                    ['30d', '1y', '5y', 'all'].map(range => 
                        React.createElement('button', {
                            key: range,
                            onClick: () => handleTimeRangeChange(range),
                            disabled: isLoadingNewData,
                            style: {
                                backgroundColor: timeRange === range ? '#22c55e' : 'rgba(34, 197, 94, 0.2)',
                                color: timeRange === range ? 'white' : '#22c55e',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '600',
                                cursor: isLoadingNewData ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                opacity: isLoadingNewData ? 0.6 : 1
                            }
                        }, range.toUpperCase())
                    )
                ]),
                React.createElement('button', {
                    key: 'close',
                    onClick: onClose || (() => {
                        const chartSection = document.getElementById('chartSection');
                        if (chartSection) chartSection.style.display = 'none';
                    }),
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
        React.createElement('div', {
            key: 'chart',
            style: {
                height: isModal ? '200px' : '280px',
                position: 'relative'
            }
        }, [
            isLoadingNewData && React.createElement('div', {
                key: 'loading-overlay',
                style: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(16, 18, 27, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    borderRadius: '8px'
                }
            }, [
                React.createElement('div', {
                    key: 'spinner',
                    style: {
                        width: '30px',
                        height: '30px',
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
                }, 'Loading...')
            ]),
            React.createElement('canvas', {
                ref: chartRef,
                style: { width: '100%', height: '100%' }
            })
        ])
    ]);
};
/**
 * Modern Interactive Stock Chart Component
 * Enhanced with Candlestick, Volume, Indicators
 * Inspired by Robinhood & Yahoo Finance
 */

const { useState, useEffect, useRef, useCallback } = React;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatPrice = (price) => {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return price.toFixed(2);
};

const formatVolume = (volume) => {
    if (volume >= 1e9) return (volume / 1e9).toFixed(2) + 'B';
    if (volume >= 1e6) return (volume / 1e6).toFixed(2) + 'M';
    if (volume >= 1e3) return (volume / 1e3).toFixed(1) + 'K';
    return volume.toString();
};

const formatDateForRange = (dateString, range) => {
    const date = new Date(dateString);
    if (range === '1D' || range === '5D' || range === '1W') {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (range === '5Y' || range === 'ALL') {
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
};

// Calculate Simple Moving Average
const calculateSMA = (data, period) => {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
            }
            sma.push(sum / period);
        }
    }
    return sma;
};

// ============================================================================
// CHART COLORS & THEME (Robinhood/Yahoo Finance Inspired)
// ============================================================================

const CHART_COLORS = {
    background: '#0f0f0f',
    cardBg: 'rgba(18, 18, 18, 0.95)',
    gridLine: 'rgba(255, 255, 255, 0.06)',
    textPrimary: '#e4e4e4',
    textSecondary: '#737373',
    positive: '#00c805',
    positiveLight: 'rgba(0, 200, 5, 0.15)',
    negative: '#ff5000',
    negativeLight: 'rgba(255, 80, 0, 0.15)',
    volumeUp: 'rgba(0, 200, 5, 0.4)',
    volumeDown: 'rgba(255, 80, 0, 0.4)',
    sma20: '#f59e0b',
    sma50: '#3b82f6',
    sma200: '#a855f7',
    border: 'rgba(255, 255, 255, 0.1)',
    accent: '#00c805'
};

// ============================================================================
// MAIN CHART COMPONENT
// ============================================================================

window.StockChart = ({ symbol, data, isModal = false, onClose }) => {
    // State
    const [chartData, setChartData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [priceChange, setPriceChange] = useState({ value: 0, percentage: 0 });
    const [timeRange, setTimeRange] = useState(window.__defaultTimeRange || '1D');
    const [chartType, setChartType] = useState('line'); // 'line' | 'candle'
    const [isLoadingNewData, setIsLoadingNewData] = useState(false);
    const [showVolume, setShowVolume] = useState(true);
    const [showSMA, setShowSMA] = useState({ sma20: false, sma50: false, sma200: false });
    const [hoveredData, setHoveredData] = useState(null);
    const [currentPrice, setCurrentPrice] = useState(null);

    // Refs
    const chartRef = useRef(null);
    const volumeChartRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const volumeChartInstanceRef = useRef(null);
    const containerRef = useRef(null);

    // Time range options
    const timeRanges = ['1D', '5D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];

    // ========================================================================
    // DATA PROCESSING
    // ========================================================================

    const processData = useCallback((rawData) => {
        if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
            return [];
        }

        return rawData.map((item, index) => ({
            ...item,
            date: new Date(item.date),
            formattedDate: formatDateForRange(item.date, timeRange),
            open: parseFloat(item.open || item.price || item.close),
            high: parseFloat(item.high || item.price || item.close),
            low: parseFloat(item.low || item.price || item.close),
            close: parseFloat(item.close || item.price),
            volume: parseInt(item.volume) || 0,
            price: parseFloat(item.close || item.price),
            index
        }));
    }, [timeRange]);

    // Process initial data
    useEffect(() => {
        if (data && Array.isArray(data)) {
            const processed = processData(data);
            setChartData(processed);

            if (processed.length >= 2) {
                const firstPrice = processed[0].close;
                const lastPrice = processed[processed.length - 1].close;
                const change = lastPrice - firstPrice;
                const percentage = (change / firstPrice) * 100;
                setPriceChange({ value: change, percentage });
                setCurrentPrice(lastPrice);
            }

            setIsLoading(false);
            setError(null);
        } else {
            setError('No chart data available');
            setIsLoading(false);
        }
    }, [data, processData]);

    // ========================================================================
    // DATA FETCHING
    // ========================================================================

    const fetchChartData = async (range) => {
        setIsLoadingNewData(true);
        try {
            const apiBase = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';
            const response = await fetch(`${apiBase}/api/chart/${symbol}?range=${range}`, {
                credentials: 'include'
            });
            const newData = await response.json();

            if (response.ok && Array.isArray(newData)) {
                const processed = processData(newData);
                setChartData(processed);

                if (processed.length >= 2) {
                    const firstPrice = processed[0].close;
                    const lastPrice = processed[processed.length - 1].close;
                    const change = lastPrice - firstPrice;
                    const percentage = (change / firstPrice) * 100;
                    setPriceChange({ value: change, percentage });
                    setCurrentPrice(lastPrice);
                }
                setError(null);
            } else {
                setError(newData.error || 'Error loading chart data');
            }
        } catch (err) {
            console.error('[StockChart] Fetch error:', err);
            setError('Failed to load chart data');
        } finally {
            setIsLoadingNewData(false);
        }
    };

    const handleTimeRangeChange = (newRange) => {
        if (newRange !== timeRange) {
            setTimeRange(newRange);
            fetchChartData(newRange);
        }
    };

    // ========================================================================
    // CHART RENDERING
    // ========================================================================

    useEffect(() => {
        if (chartData.length === 0 || !chartRef.current) return;

        const ChartLib = window.Chart || (typeof Chart !== 'undefined' ? Chart : null);
        if (!ChartLib) {
            console.error('[StockChart] Chart.js not available');
            return;
        }

        const ctx = chartRef.current.getContext('2d');
        const isPositiveOverall = priceChange.value >= 0;
        const mainColor = isPositiveOverall ? CHART_COLORS.positive : CHART_COLORS.negative;

        // Prepare datasets
        const datasets = [];

        if (chartType === 'line') {
            // Line chart dataset
            datasets.push({
                label: `${symbol} Price`,
                data: chartData.map(item => item.close),
                borderColor: mainColor,
                backgroundColor: isPositiveOverall ? CHART_COLORS.positiveLight : CHART_COLORS.negativeLight,
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: mainColor,
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 2
            });
        } else {
            // Candlestick-style using bar chart (workaround for Chart.js)
            // We'll use floating bars for OHLC representation
            const candleData = chartData.map((item, i) => {
                const isUp = item.close >= item.open;
                return {
                    x: i,
                    y: [item.low, item.high],
                    open: item.open,
                    close: item.close,
                    isUp
                };
            });

            // High-Low line (wick)
            datasets.push({
                label: 'High-Low',
                data: chartData.map(item => item.high),
                borderColor: CHART_COLORS.textSecondary,
                backgroundColor: 'transparent',
                borderWidth: 1,
                pointRadius: 0,
                showLine: true,
                tension: 0
            });

            // Close prices as line
            datasets.push({
                label: `${symbol} Price`,
                data: chartData.map(item => item.close),
                borderColor: mainColor,
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: mainColor,
                fill: false,
                tension: 0
            });

            // Candle bodies as segment colors
            datasets.push({
                label: 'Candle Body',
                data: chartData.map(item => item.open),
                borderColor: chartData.map(item => item.close >= item.open ? CHART_COLORS.positive : CHART_COLORS.negative),
                backgroundColor: chartData.map(item => item.close >= item.open ? CHART_COLORS.positive : CHART_COLORS.negative),
                borderWidth: 1,
                pointRadius: 3,
                pointStyle: 'rect',
                showLine: false
            });
        }

        // Add SMA overlays
        if (showSMA.sma20) {
            const sma20Data = calculateSMA(chartData, 20);
            datasets.push({
                label: 'SMA 20',
                data: sma20Data,
                borderColor: CHART_COLORS.sma20,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderDash: [],
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
        }

        if (showSMA.sma50) {
            const sma50Data = calculateSMA(chartData, 50);
            datasets.push({
                label: 'SMA 50',
                data: sma50Data,
                borderColor: CHART_COLORS.sma50,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
        }

        if (showSMA.sma200 && chartData.length >= 200) {
            const sma200Data = calculateSMA(chartData, 200);
            datasets.push({
                label: 'SMA 200',
                data: sma200Data,
                borderColor: CHART_COLORS.sma200,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
        }

        // Calculate price range for Y axis
        const prices = chartData.map(d => [d.high, d.low]).flat();
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        const padding = priceRange * 0.05;

        // Chart configuration
        const config = {
            type: 'line',
            data: {
                labels: chartData.map(item => item.formattedDate),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { left: 10, right: 15, top: 10, bottom: 5 }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: CHART_COLORS.cardBg,
                        titleColor: CHART_COLORS.textPrimary,
                        bodyColor: CHART_COLORS.textPrimary,
                        borderColor: CHART_COLORS.border,
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            title: (context) => {
                                const idx = context[0].dataIndex;
                                const item = chartData[idx];
                                return item ? new Date(item.date).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                }) : '';
                            },
                            label: (context) => {
                                const idx = context.dataIndex;
                                const item = chartData[idx];
                                if (!item) return '';

                                if (chartType === 'candle' && context.dataset.label === `${symbol} Price`) {
                                    return [
                                        `Open: $${formatPrice(item.open)}`,
                                        `High: $${formatPrice(item.high)}`,
                                        `Low: $${formatPrice(item.low)}`,
                                        `Close: $${formatPrice(item.close)}`,
                                        `Volume: ${formatVolume(item.volume)}`
                                    ];
                                }

                                if (context.dataset.label === `${symbol} Price`) {
                                    return `$${formatPrice(context.parsed.y)}`;
                                }

                                if (context.dataset.label.includes('SMA')) {
                                    return `${context.dataset.label}: $${formatPrice(context.parsed.y)}`;
                                }

                                return null;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            color: CHART_COLORS.gridLine,
                            drawBorder: false
                        },
                        ticks: {
                            color: CHART_COLORS.textSecondary,
                            font: { size: 11 },
                            maxTicksLimit: 8,
                            maxRotation: 0
                        }
                    },
                    y: {
                        display: true,
                        position: 'right',
                        grid: {
                            color: CHART_COLORS.gridLine,
                            drawBorder: false
                        },
                        ticks: {
                            color: CHART_COLORS.textSecondary,
                            font: { size: 11 },
                            callback: (value) => '$' + formatPrice(value)
                        },
                        min: minPrice - padding,
                        max: maxPrice + padding
                    }
                },
                onHover: (event, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        setHoveredData(chartData[idx]);
                    } else {
                        setHoveredData(null);
                    }
                }
            }
        };

        // Create or update chart
        if (chartInstanceRef.current) {
            chartInstanceRef.current.data = config.data;
            chartInstanceRef.current.options = config.options;
            chartInstanceRef.current.update('none');
        } else {
            chartInstanceRef.current = new ChartLib(ctx, config);
        }

    }, [chartData, chartType, showSMA, symbol, priceChange.value]);

    // ========================================================================
    // VOLUME CHART RENDERING
    // ========================================================================

    useEffect(() => {
        if (!showVolume || chartData.length === 0 || !volumeChartRef.current) return;

        const ChartLib = window.Chart || (typeof Chart !== 'undefined' ? Chart : null);
        if (!ChartLib) return;

        const ctx = volumeChartRef.current.getContext('2d');

        const volumeColors = chartData.map((item, i) => {
            if (i === 0) return CHART_COLORS.volumeUp;
            return item.close >= chartData[i - 1].close ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown;
        });

        const config = {
            type: 'bar',
            data: {
                labels: chartData.map(item => item.formattedDate),
                datasets: [{
                    label: 'Volume',
                    data: chartData.map(item => item.volume),
                    backgroundColor: volumeColors,
                    borderColor: 'transparent',
                    borderWidth: 0,
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { left: 10, right: 15, top: 0, bottom: 0 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: CHART_COLORS.cardBg,
                        titleColor: CHART_COLORS.textPrimary,
                        bodyColor: CHART_COLORS.textPrimary,
                        borderColor: CHART_COLORS.border,
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => `Volume: ${formatVolume(context.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        display: false,
                        grid: { display: false }
                    },
                    y: {
                        display: true,
                        position: 'right',
                        grid: {
                            color: CHART_COLORS.gridLine,
                            drawBorder: false
                        },
                        ticks: {
                            color: CHART_COLORS.textSecondary,
                            font: { size: 10 },
                            callback: (value) => formatVolume(value),
                            maxTicksLimit: 3
                        }
                    }
                }
            }
        };

        if (volumeChartInstanceRef.current) {
            volumeChartInstanceRef.current.data = config.data;
            volumeChartInstanceRef.current.options = config.options;
            volumeChartInstanceRef.current.update('none');
        } else {
            volumeChartInstanceRef.current = new ChartLib(ctx, config);
        }

    }, [chartData, showVolume]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
                chartInstanceRef.current = null;
            }
            if (volumeChartInstanceRef.current) {
                volumeChartInstanceRef.current.destroy();
                volumeChartInstanceRef.current = null;
            }
        };
    }, []);

    // ========================================================================
    // RENDER HELPERS
    // ========================================================================

    const displayData = hoveredData || (chartData.length > 0 ? chartData[chartData.length - 1] : null);
    const isPositive = priceChange.value >= 0;

    // Loading state
    if (isLoading) {
        return React.createElement('div', {
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: isModal ? '400px' : '500px',
                backgroundColor: CHART_COLORS.cardBg,
                borderRadius: '12px',
                border: `1px solid ${CHART_COLORS.border}`
            }
        }, [
            React.createElement('div', {
                key: 'spinner',
                style: {
                    width: '40px',
                    height: '40px',
                    border: `3px solid ${CHART_COLORS.border}`,
                    borderTop: `3px solid ${CHART_COLORS.positive}`,
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }
            }),
            React.createElement('span', {
                key: 'text',
                style: { marginLeft: '12px', color: CHART_COLORS.textSecondary }
            }, 'Loading chart...')
        ]);
    }

    // Error state
    if (error) {
        return React.createElement('div', {
            style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: isModal ? '400px' : '500px',
                backgroundColor: CHART_COLORS.cardBg,
                borderRadius: '12px',
                border: `1px solid ${CHART_COLORS.negative}`,
                color: CHART_COLORS.negative
            }
        }, [
            React.createElement('i', { key: 'icon', className: 'fas fa-chart-line', style: { fontSize: '32px', marginBottom: '12px', opacity: 0.5 } }),
            React.createElement('div', { key: 'title', style: { fontSize: '16px', fontWeight: '600' } }, 'Chart Unavailable'),
            React.createElement('div', { key: 'msg', style: { fontSize: '14px', opacity: 0.7, marginTop: '4px' } }, error)
        ]);
    }

    // ========================================================================
    // MAIN RENDER
    // ========================================================================

    return React.createElement('div', {
        ref: containerRef,
        className: 'stock-chart-container',
        style: {
            width: '100%',
            backgroundColor: CHART_COLORS.cardBg,
            borderRadius: '12px',
            border: `1px solid ${CHART_COLORS.border}`,
            overflow: 'hidden'
        }
    }, [
        // Header Section
        React.createElement('div', {
            key: 'header',
            style: {
                padding: '16px 20px',
                borderBottom: `1px solid ${CHART_COLORS.border}`
            }
        }, [
            // Top row: Symbol, Price, Change
            React.createElement('div', {
                key: 'top-row',
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '16px'
                }
            }, [
                // Left: Symbol & Price
                React.createElement('div', { key: 'left' }, [
                    React.createElement('div', {
                        key: 'symbol',
                        style: {
                            fontSize: '14px',
                            fontWeight: '600',
                            color: CHART_COLORS.textSecondary,
                            marginBottom: '4px'
                        }
                    }, symbol),
                    React.createElement('div', {
                        key: 'price',
                        style: {
                            fontSize: '32px',
                            fontWeight: '700',
                            color: CHART_COLORS.textPrimary,
                            lineHeight: '1.1'
                        }
                    }, displayData ? `$${formatPrice(displayData.close)}` : '-'),
                    React.createElement('div', {
                        key: 'change',
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '6px'
                        }
                    }, [
                        React.createElement('span', {
                            key: 'value',
                            style: {
                                fontSize: '16px',
                                fontWeight: '600',
                                color: isPositive ? CHART_COLORS.positive : CHART_COLORS.negative
                            }
                        }, `${isPositive ? '+' : ''}${priceChange.value.toFixed(2)}`),
                        React.createElement('span', {
                            key: 'pct',
                            style: {
                                fontSize: '16px',
                                fontWeight: '600',
                                color: isPositive ? CHART_COLORS.positive : CHART_COLORS.negative
                            }
                        }, `(${isPositive ? '+' : ''}${priceChange.percentage.toFixed(2)}%)`),
                        React.createElement('span', {
                            key: 'period',
                            style: {
                                fontSize: '13px',
                                color: CHART_COLORS.textSecondary
                            }
                        }, timeRange)
                    ])
                ]),
                // Right: Close button (if not modal)
                !isModal && onClose && React.createElement('button', {
                    key: 'close',
                    onClick: onClose,
                    style: {
                        background: 'none',
                        border: 'none',
                        color: CHART_COLORS.textSecondary,
                        fontSize: '20px',
                        cursor: 'pointer',
                        padding: '4px',
                        lineHeight: '1'
                    }
                }, '×')
            ]),

            // Time Range Selector
            React.createElement('div', {
                key: 'time-selector',
                style: {
                    display: 'flex',
                    gap: '4px',
                    flexWrap: 'wrap'
                }
            }, timeRanges.map(range =>
                React.createElement('button', {
                    key: range,
                    onClick: () => handleTimeRangeChange(range),
                    disabled: isLoadingNewData,
                    style: {
                        padding: '6px 12px',
                        fontSize: '13px',
                        fontWeight: '600',
                        borderRadius: '20px',
                        border: 'none',
                        cursor: isLoadingNewData ? 'not-allowed' : 'pointer',
                        backgroundColor: timeRange === range ? (isPositive ? CHART_COLORS.positive : CHART_COLORS.negative) : 'transparent',
                        color: timeRange === range ? '#000' : CHART_COLORS.textSecondary,
                        transition: 'all 0.2s',
                        opacity: isLoadingNewData ? 0.5 : 1
                    }
                }, range)
            ))
        ]),

        // Chart Controls
        React.createElement('div', {
            key: 'controls',
            style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 20px',
                borderBottom: `1px solid ${CHART_COLORS.border}`,
                backgroundColor: 'rgba(255, 255, 255, 0.02)'
            }
        }, [
            // Chart Type Toggle
            React.createElement('div', {
                key: 'chart-type',
                style: { display: 'flex', gap: '8px' }
            }, [
                React.createElement('button', {
                    key: 'line',
                    onClick: () => setChartType('line'),
                    style: {
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        borderRadius: '6px',
                        border: `1px solid ${chartType === 'line' ? CHART_COLORS.positive : CHART_COLORS.border}`,
                        backgroundColor: chartType === 'line' ? CHART_COLORS.positiveLight : 'transparent',
                        color: chartType === 'line' ? CHART_COLORS.positive : CHART_COLORS.textSecondary,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }
                }, [
                    React.createElement('i', { key: 'icon', className: 'fas fa-chart-line', style: { fontSize: '11px' } }),
                    'Line'
                ]),
                React.createElement('button', {
                    key: 'candle',
                    onClick: () => setChartType('candle'),
                    style: {
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        borderRadius: '6px',
                        border: `1px solid ${chartType === 'candle' ? CHART_COLORS.positive : CHART_COLORS.border}`,
                        backgroundColor: chartType === 'candle' ? CHART_COLORS.positiveLight : 'transparent',
                        color: chartType === 'candle' ? CHART_COLORS.positive : CHART_COLORS.textSecondary,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }
                }, [
                    React.createElement('i', { key: 'icon', className: 'fas fa-chart-bar', style: { fontSize: '11px' } }),
                    'Candle'
                ])
            ]),

            // Indicators Toggle
            React.createElement('div', {
                key: 'indicators',
                style: { display: 'flex', gap: '6px', alignItems: 'center' }
            }, [
                React.createElement('span', {
                    key: 'label',
                    style: { fontSize: '12px', color: CHART_COLORS.textSecondary, marginRight: '4px' }
                }, 'MA:'),
                ['20', '50', '200'].map(period => {
                    const key = `sma${period}`;
                    const isActive = showSMA[key];
                    const color = period === '20' ? CHART_COLORS.sma20 : period === '50' ? CHART_COLORS.sma50 : CHART_COLORS.sma200;
                    return React.createElement('button', {
                        key: period,
                        onClick: () => setShowSMA(prev => ({ ...prev, [key]: !prev[key] })),
                        style: {
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: '600',
                            borderRadius: '4px',
                            border: `1px solid ${isActive ? color : CHART_COLORS.border}`,
                            backgroundColor: isActive ? `${color}20` : 'transparent',
                            color: isActive ? color : CHART_COLORS.textSecondary,
                            cursor: 'pointer'
                        }
                    }, period);
                }),
                // Volume toggle
                React.createElement('button', {
                    key: 'volume',
                    onClick: () => setShowVolume(!showVolume),
                    style: {
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: '600',
                        borderRadius: '4px',
                        border: `1px solid ${showVolume ? CHART_COLORS.positive : CHART_COLORS.border}`,
                        backgroundColor: showVolume ? CHART_COLORS.positiveLight : 'transparent',
                        color: showVolume ? CHART_COLORS.positive : CHART_COLORS.textSecondary,
                        cursor: 'pointer',
                        marginLeft: '8px'
                    }
                }, 'Vol')
            ])
        ]),

        // Loading overlay
        isLoadingNewData && React.createElement('div', {
            key: 'loading-overlay',
            style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10
            }
        }, React.createElement('div', {
            style: {
                width: '32px',
                height: '32px',
                border: `3px solid ${CHART_COLORS.border}`,
                borderTop: `3px solid ${CHART_COLORS.positive}`,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }
        })),

        // Main Chart Area
        React.createElement('div', {
            key: 'chart-area',
            style: {
                padding: '0 0 0 0',
                position: 'relative'
            }
        }, [
            // Price Chart
            React.createElement('div', {
                key: 'price-chart',
                style: {
                    height: showVolume ? (isModal ? '280px' : '340px') : (isModal ? '360px' : '420px'),
                    position: 'relative'
                }
            }, React.createElement('canvas', { ref: chartRef })),

            // Volume Chart
            showVolume && React.createElement('div', {
                key: 'volume-chart',
                style: {
                    height: '80px',
                    borderTop: `1px solid ${CHART_COLORS.border}`,
                    position: 'relative'
                }
            }, [
                React.createElement('div', {
                    key: 'vol-label',
                    style: {
                        position: 'absolute',
                        top: '8px',
                        left: '12px',
                        fontSize: '11px',
                        color: CHART_COLORS.textSecondary,
                        fontWeight: '500',
                        zIndex: 1
                    }
                }, 'Volume'),
                React.createElement('canvas', { key: 'canvas', ref: volumeChartRef })
            ])
        ]),

        // OHLC Data Bar (when hovering or showing current)
        displayData && React.createElement('div', {
            key: 'ohlc-bar',
            style: {
                display: 'flex',
                justifyContent: 'center',
                gap: '24px',
                padding: '12px 20px',
                borderTop: `1px solid ${CHART_COLORS.border}`,
                backgroundColor: 'rgba(255, 255, 255, 0.02)'
            }
        }, [
            ['O', 'open'],
            ['H', 'high'],
            ['L', 'low'],
            ['C', 'close'],
            ['V', 'volume']
        ].map(([label, key]) =>
            React.createElement('div', {
                key: label,
                style: { textAlign: 'center' }
            }, [
                React.createElement('div', {
                    key: 'label',
                    style: { fontSize: '11px', color: CHART_COLORS.textSecondary, marginBottom: '2px' }
                }, label),
                React.createElement('div', {
                    key: 'value',
                    style: { fontSize: '13px', fontWeight: '600', color: CHART_COLORS.textPrimary }
                }, key === 'volume' ? formatVolume(displayData[key]) : `$${formatPrice(displayData[key])}`)
            ])
        ))
    ]);
};

// Ensure spin animation exists
if (typeof document !== 'undefined' && !document.getElementById('chart-spin-style')) {
    const style = document.createElement('style');
    style.id = 'chart-spin-style';
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

// console.log('[StockChart] Enhanced chart component loaded with candlestick, volume, and indicators');

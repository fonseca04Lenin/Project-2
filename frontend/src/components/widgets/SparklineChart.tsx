import { useEffect, useRef, useState } from 'react';
import type { SparklineChartProps } from '../../types/models';
import { api } from '../../lib/api';

export function SparklineChart({ symbol, width = 100, height = 40 }: SparklineChartProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [chartData, setChartData] = useState<number[] | null>(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;

        (async () => {
            try {
                const data = await api.stocks.chart(symbol, '1D');
                if (cancelled) return;
                if (Array.isArray(data) && data.length > 0) {
                    const prices = data.map((d: any) => parseFloat(String(d.close ?? d.price))).filter((p) => !isNaN(p));
                    if (prices.length > 0) {
                        setChartData(prices);
                        setHasError(false);
                    } else {
                        setHasError(true);
                    }
                } else {
                    setHasError(true);
                }
            } catch {
                if (!cancelled) setHasError(true);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [symbol]);

    useEffect(() => {
        if (!chartData || !canvasRef.current || chartData.length < 2) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        (ctx as any).imageSmoothingQuality = 'high';
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.clearRect(0, 0, width, height);

        const paddingX = 4;
        const paddingY = 6;
        const min = Math.min(...chartData);
        const max = Math.max(...chartData);
        const range = max - min || 1;
        const stepX = (width - paddingX * 2) / (chartData.length - 1);
        const effectiveHeight = height - paddingY * 2;

        const trendPositive = chartData[chartData.length - 1] >= chartData[0];
        const lineColor = trendPositive ? '#00c805' : '#ff5000';
        const fillStart = trendPositive ? 'rgba(0, 200, 5, 0.25)' : 'rgba(255, 80, 0, 0.25)';
        const fillEnd = trendPositive ? 'rgba(0, 200, 5, 0.02)' : 'rgba(255, 80, 0, 0.02)';

        const points = chartData.map((price, i) => ({
            x: paddingX + i * stepX,
            y: paddingY + effectiveHeight - ((price - min) / range) * effectiveHeight,
        }));

        const drawSmooth = (c: CanvasRenderingContext2D, pts: { x: number; y: number }[], tension = 0.3) => {
            if (pts.length < 2) return;
            c.moveTo(pts[0].x, pts[0].y);
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i === 0 ? i : i - 1];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[i + 2 >= pts.length ? i + 1 : i + 2];
                const cp1x = p1.x + (p2.x - p0.x) * tension;
                const cp1y = p1.y + (p2.y - p0.y) * tension;
                const cp2x = p2.x - (p3.x - p1.x) * tension;
                const cp2y = p2.y - (p3.y - p1.y) * tension;
                c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
        };

        ctx.beginPath();
        drawSmooth(ctx, points, 0.25);
        ctx.lineTo(points[points.length - 1].x, height);
        ctx.lineTo(points[0].x, height);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, fillStart);
        grad.addColorStop(1, fillEnd);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawSmooth(ctx, points, 0.25);
        ctx.stroke();

        const last = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = trendPositive ? 'rgba(0, 200, 5, 0.3)' : 'rgba(255, 80, 0, 0.3)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();
    }, [chartData, width, height]);

    if (isLoading) {
        return <div className="sparkline-loading" style={{ width: `${width}px`, height: `${height}px` }} />;
    }

    if (hasError || !chartData || chartData.length < 2) {
        return (
            <div className="sparkline-error" style={{ width: `${width}px`, height: `${height}px` }}>
                <i className="fas fa-chart-line" style={{ opacity: 0.3 }}></i>
            </div>
        );
    }

    return <canvas ref={canvasRef} className="sparkline-chart" style={{ width: `${width}px`, height: `${height}px` }} />;
}

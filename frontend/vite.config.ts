import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Dev proxy sends /api and /socket.io to the backend set in VITE_API_PROXY_TARGET
// (defaults to the Railway prod URL so a fresh clone can poke the real backend
// without running Flask locally).
export default defineConfig(({ mode }) => {
    const proxyTarget = process.env.VITE_API_PROXY_TARGET || 'https://web-production-2e2e.up.railway.app';
    return {
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            },
        },
        server: {
            port: 8080,
            strictPort: false,
            proxy: {
                '/api': {
                    target: proxyTarget,
                    changeOrigin: true,
                    secure: true,
                },
                '/socket.io': {
                    target: proxyTarget,
                    changeOrigin: true,
                    ws: true,
                    secure: true,
                },
            },
        },
        build: {
            outDir: 'dist',
            sourcemap: mode !== 'production',
            target: 'es2020',
            rollupOptions: {
                output: {
                    manualChunks: {
                        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                        'firebase-vendor': ['firebase/compat/app', 'firebase/compat/auth'],
                        'chart-vendor': ['chart.js', 'recharts'],
                        'socket-vendor': ['socket.io-client'],
                    },
                },
            },
        },
    };
});

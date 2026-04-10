// esbuild build script — pre-compiles JSX to plain JS, eliminates Babel in browser
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outdir = path.join(__dirname, 'dist', 'src');
if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
}

const componentEntries = [
    // Dashboard shell + extracted view/widget files (load order matters: widgets before views, views before shell)
    'src/react-dashboard-widgets.tsx',
    'src/react-view-overview.tsx',
    'src/react-view-watchlist.tsx',
    'src/react-view-screener.tsx',
    'src/react-view-news.tsx',
    'src/react-view-whatswhat.tsx',
    'src/react-view-aisuite.tsx',
    'src/react-view-intelligence.tsx',
    'src/react-view-map.tsx',
    'src/react-view-aiassistant.tsx',
    'src/react-dashboard-redesign.tsx',
    // Other app components
    'src/react-paper-trading.tsx',
    'src/react-upgrade-modal.tsx',
    'src/react-landing-page.tsx',
    'src/react-pricing.tsx',
    'src/react-ai-chat.tsx',
    'src/react-chart.tsx',
    'src/react-watchlist-notes.tsx',
    'src/react-stock-details-modal.tsx',
    'src/react-stock-details-page.tsx',
];

const sharedConfig = {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    loader: { '.js': 'jsx', '.ts': 'ts', '.tsx': 'tsx' },
    format: 'iife',
    minify: true,
    logLevel: 'info',
};

Promise.all([
    // Components — no bundling, React/ReactDOM stay as CDN globals
    esbuild.build({
        ...sharedConfig,
        entryPoints: componentEntries,
        outdir: 'dist/src',
        bundle: false,
    }),
    // App router — bundle react-router-dom; shims redirect react/react-dom to CDN globals
    esbuild.build({
        ...sharedConfig,
        entryPoints: ['src/react-app.tsx'],
        outdir: 'dist/src',
        bundle: true,
        alias: {
            'react': path.resolve(__dirname, 'src/shims/react.js'),
            'react-dom': path.resolve(__dirname, 'src/shims/react-dom.js'),
        },
    }),
]).then(() => {
    console.log(`✓ Built ${componentEntries.length + 1} files → dist/src/`);
}).catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});

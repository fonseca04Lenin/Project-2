// esbuild build script — pre-compiles JSX to plain JS, eliminates Babel in browser
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outdir = path.join(__dirname, 'dist', 'src');
if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
}

const componentEntries = [
    'src/react-dashboard-redesign.js',
    'src/react-paper-trading.js',
    'src/react-upgrade-modal.js',
    'src/react-landing-page.js',
    'src/react-pricing.js',
    'src/react-ai-chat.js',
    'src/react-chart.js',
    'src/react-watchlist-notes.js',
    'src/react-stock-details-modal.js',
    'src/react-stock-details-page.js',
];

const sharedConfig = {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    loader: { '.js': 'jsx' },
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
        entryPoints: ['src/react-app.js'],
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

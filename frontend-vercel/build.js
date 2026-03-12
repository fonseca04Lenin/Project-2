// esbuild build script — pre-compiles JSX to plain JS, eliminates Babel in browser
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outdir = path.join(__dirname, 'dist', 'src');
if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
}

const entries = [
    'src/react-dashboard-redesign.js',
    'src/react-paper-trading.js',
    'src/react-upgrade-modal.js',
    'src/react-landing-page.js',
    'src/react-ai-chat.js',
    'src/react-chart.js',
    'src/react-watchlist-notes.js',
    'src/react-stock-details-modal.js',
    'src/react-stock-details-page.js',
];

esbuild.build({
    entryPoints: entries,
    outdir: 'dist/src',
    bundle: false,          // no bundling — React stays as CDN global
    minify: true,
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    loader: { '.js': 'jsx' },
    logLevel: 'info',
}).then(() => {
    console.log(`✓ Built ${entries.length} files → dist/src/`);
}).catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});

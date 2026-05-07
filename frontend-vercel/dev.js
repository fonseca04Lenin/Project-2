// Dev server: esbuild watch + live reload (no extra npm packages needed)
const esbuild = require('esbuild');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = __dirname;

// ── SSE live reload ──────────────────────────────────────────────────────────
const clients = new Set();

function broadcast() {
    for (const res of clients) {
        try { res.write('data: reload\n\n'); } catch (_) {}
    }
}

// ── Static file server ───────────────────────────────────────────────────────
const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    '.woff': 'font/woff', '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
    // SSE endpoint for live reload
    if (req.url === '/__livereload') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });
        res.write('data: connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
    }

    let urlPath = req.url.split('?')[0];
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            // SPA fallback
            fs.readFile(path.join(ROOT, 'index.html'), (err2, html) => {
                if (err2) { res.writeHead(404); res.end('Not found'); return; }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(injectLiveReload(html.toString()));
            });
            return;
        }

        const ext = path.extname(filePath);
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });

        if (ext === '.html') {
            res.end(injectLiveReload(data.toString()));
        } else {
            res.end(data);
        }
    });
});

function injectLiveReload(html) {
    const script = `<script>
(function(){
    var es = new EventSource('/__livereload');
    es.onmessage = function(e){ if(e.data==='reload') location.reload(); };
    es.onerror = function(){ setTimeout(function(){ location.reload(); }, 1000); };
})();
</script>`;
    return html.replace('</body>', script + '</body>');
}

// ── esbuild watch contexts ────────────────────────────────────────────────────
const componentEntries = [
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
    minify: false,
    logLevel: 'silent',
    plugins: [{
        name: 'live-reload',
        setup(build) {
            build.onEnd(result => {
                if (result.errors.length === 0) {
                    console.log(`[${new Date().toLocaleTimeString()}] rebuilt → broadcasting reload`);
                    broadcast();
                } else {
                    result.errors.forEach(e => console.error('[esbuild]', e.text));
                }
            });
        }
    }],
};

async function start() {
    const outdir = path.join(ROOT, 'dist', 'src');
    if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });

    // Watch TSX components
    const ctxComponents = await esbuild.context({
        ...sharedConfig,
        entryPoints: componentEntries,
        outdir: 'dist/src',
        bundle: false,
    });

    // Watch app router
    const ctxApp = await esbuild.context({
        ...sharedConfig,
        entryPoints: ['src/react-app.tsx'],
        outdir: 'dist/src',
        bundle: true,
        alias: {
            'react': path.resolve(ROOT, 'src/shims/react.js'),
            'react-dom': path.resolve(ROOT, 'src/shims/react-dom.js'),
        },
    });

    await ctxComponents.watch();
    await ctxApp.watch();

    // Watch CSS files — reload browser when they change
    const cssDir = path.join(ROOT, 'static', 'css');
    fs.watch(cssDir, { recursive: true }, (_, filename) => {
        if (filename && filename.endsWith('.css')) {
            console.log(`[${new Date().toLocaleTimeString()}] CSS changed: ${filename} → reloading`);
            broadcast();
        }
    });

    server.listen(PORT, () => {
        console.log(`\n  Dev server running at http://localhost:${PORT}`);
        console.log('  Watching .tsx and .css files for changes...\n');
    });
}

start().catch(err => { console.error(err); process.exit(1); });

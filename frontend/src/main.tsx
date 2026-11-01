import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const boot = document.getElementById('boot-screen');
if (boot) boot.remove();

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root container #root not found in index.html');
}

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>
);

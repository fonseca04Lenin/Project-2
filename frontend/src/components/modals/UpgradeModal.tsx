// Upgrade modal. Legacy was 541 LOC with its own styled plan grid; this is a
// condensed version that preserves the same event contract (`upgrade:show` /
// `upgrade:hide`) and routes "upgrade" clicks to the Pricing page.
// For the richer in-modal plan selector, port frontend-vercel/src/react-upgrade-modal.tsx.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { events, EVT } from '../../lib/events';

export function UpgradeModal() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState<string>('');

    useEffect(() => {
        const offShow = events.on<{ reason?: string }>(EVT.UPGRADE_SHOW, (p) => {
            setReason(p?.reason || '');
            setOpen(true);
        });
        const offHide = events.on(EVT.UPGRADE_HIDE, () => setOpen(false));
        return () => { offShow(); offHide(); };
    }, []);

    if (!open) return null;

    return (
        <div className="auth-dialog-overlay" onClick={() => setOpen(false)}>
            <div className="auth-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                <div className="auth-dialog-header">
                    <h2>Upgrade to Pro</h2>
                    <button className="auth-dialog-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    {reason && <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: '0.9rem' }}>{reason}</p>}
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem' }}>
                        <li style={{ padding: '0.4rem 0' }}><i className="fas fa-check" style={{ color: '#00D924', marginRight: '0.5rem' }}></i>50 AI chat messages/day</li>
                        <li style={{ padding: '0.4rem 0' }}><i className="fas fa-check" style={{ color: '#00D924', marginRight: '0.5rem' }}></i>Full AI Research Suite</li>
                        <li style={{ padding: '0.4rem 0' }}><i className="fas fa-check" style={{ color: '#00D924', marginRight: '0.5rem' }}></i>Thesis Builder & Portfolio Health</li>
                        <li style={{ padding: '0.4rem 0' }}><i className="fas fa-check" style={{ color: '#00D924', marginRight: '0.5rem' }}></i>7-day free trial, cancel anytime</li>
                    </ul>
                    <button
                        className="stock-watchlist-btn stock-watchlist-btn-primary"
                        onClick={() => { setOpen(false); navigate('/pricing'); }}
                        style={{ width: '100%' }}
                    >
                        See Plans
                    </button>
                </div>
            </div>
        </div>
    );
}

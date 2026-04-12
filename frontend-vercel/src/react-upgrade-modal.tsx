export {};
// Upgrade Modal — shown when a user hits a paywall
// Matches AIStockSage dashboard design language

const { useState, useEffect, useCallback } = React;

const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';

interface Plan {
    id: string;
    label: string;
    accentColor: string;
    monthlyPrice: number;
    yearlyPrice: number;
    yearlyMonthly: number;
    savings: string;
    tagline: string;
    features: string[];
    monthlyPriceId: string;
    yearlyPriceId: string;
}

const PLANS: Plan[] = [
    {
        id: 'pro',
        label: 'Pro',
        accentColor: '#00D924',
        monthlyPrice: 12,
        yearlyPrice: 99,
        yearlyMonthly: 8.25,
        savings: '31%',
        tagline: 'For investors who want a real edge.',
        features: [
            '50 AI messages per day',
            'Morning Brief — daily AI portfolio briefing',
            'Thesis Builder — AI bull & bear cases',
            'Portfolio Health Score & grade',
            'Sector Rotation tracker',
        ],
        monthlyPriceId: window.STRIPE_CONFIG?.PRO_MONTHLY || '',
        yearlyPriceId: window.STRIPE_CONFIG?.PRO_YEARLY || '',
    },
    {
        id: 'elite',
        label: 'Elite',
        accentColor: '#FFB800',
        monthlyPrice: 24,
        yearlyPrice: 199,
        yearlyMonthly: 16.58,
        savings: '31%',
        tagline: 'Unlimited AI. No ceiling.',
        features: [
            'Unlimited AI messages',
            'Everything in Pro',
            'Priority AI processing',
            'Early access to new features',
        ],
        monthlyPriceId: window.STRIPE_CONFIG?.ELITE_MONTHLY || '',
        yearlyPriceId: window.STRIPE_CONFIG?.ELITE_YEARLY || '',
    },
];

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    reason?: string;
}

const UpgradeModal = ({ isOpen, onClose, reason }: UpgradeModalProps) => {
    const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const handleUpgrade = useCallback(async (plan: Plan) => {
        const priceId = billing === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
        if (!priceId) {
            setError('Pricing not configured. Please contact support.');
            return;
        }

        const currentUser = window.AppAuth?.getCurrentUser?.() ?? null;
        if (!currentUser) {
            setError('Please sign in to upgrade.');
            return;
        }

        setLoading(plan.id);
        setError('');
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch(`${API_BASE_URL}/api/billing/create-checkout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ price_id: priceId }),
            });
            const data = await res.json();
            if (data.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                setError(data.error || 'Could not start checkout. Please try again.');
            }
        } catch (e) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(null);
        }
    }, [billing]);

    if (!isOpen) return null;

    const reasonText = reason || 'Unlock the full power of AI-driven stock analysis.';

    return (
        <div
            className="um-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="um-modal">

                {/* Close */}
                <button className="um-close" onClick={onClose} aria-label="Close">
                    <i className="fas fa-times"></i>
                </button>

                {/* Header */}
                <div className="um-header">
                    <div className="um-header-eyebrow">Upgrade required</div>
                    <h2 className="um-title">Unlock Pro Features</h2>
                    <p className="um-reason">{reasonText}</p>
                </div>

                {/* Billing toggle */}
                <div className="um-toggle-wrap">
                    <button
                        className={`um-toggle-btn ${billing === 'monthly' ? 'active' : ''}`}
                        onClick={() => setBilling('monthly')}
                    >Monthly</button>
                    <span className="um-toggle-sep">/</span>
                    <button
                        className={`um-toggle-btn ${billing === 'yearly' ? 'active' : ''}`}
                        onClick={() => setBilling('yearly')}
                    >Annual <span className="um-toggle-save">— save 31%</span></button>
                </div>

                {/* Plans */}
                <div className="um-plans">
                    {PLANS.map((plan, idx) => (
                        <div
                            key={plan.id}
                            className="um-plan-card"
                            style={{ '--accent': plan.accentColor } as any}
                        >
                            <div className="um-plan-accent-rule" />

                            <div className="um-plan-header">
                                <span className="um-plan-name">{plan.label}</span>
                                {idx === 0 && <span className="um-plan-rec">— recommended</span>}
                            </div>
                            <p className="um-plan-tagline">{plan.tagline}</p>

                            <div className="um-price-block">
                                {billing === 'yearly' ? (
                                    <>
                                        <div className="um-price-line">
                                            <span className="um-price-num">${plan.yearlyMonthly.toFixed(2)}</span>
                                            <span className="um-price-period"> / mo</span>
                                        </div>
                                        <div className="um-billed-note">
                                            billed ${plan.yearlyPrice} annually &mdash; {plan.savings} off
                                        </div>
                                    </>
                                ) : (
                                    <div className="um-price-line">
                                        <span className="um-price-num">${plan.monthlyPrice}</span>
                                        <span className="um-price-period"> / mo</span>
                                    </div>
                                )}
                            </div>

                            <ul className="um-feature-list">
                                {plan.features.map((f, i) => (
                                    <li key={i}>
                                        <span className="um-feat-mark" style={{ color: plan.accentColor }}>—</span>
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            <button
                                className={`um-cta-btn ${plan.id === 'pro' ? 'um-cta-green' : 'um-cta-amber'}`}
                                onClick={() => handleUpgrade(plan)}
                                disabled={loading !== null}
                            >
                                {loading === plan.id
                                    ? <><i className="fas fa-circle-notch fa-spin" style={{ marginRight: 7 }}></i>Redirecting</>
                                    : 'Start Free Trial'
                                }
                            </button>
                            <p className="um-trial-note">7 days free. Cancel anytime before.</p>
                        </div>
                    ))}
                </div>

                {error && (
                    <p className="um-error">
                        <i className="fas fa-exclamation-circle"></i> {error}
                    </p>
                )}

                <p className="um-footer-note">
                    <i className="fas fa-lock"></i> Secured by Stripe &mdash; no card charged until trial ends
                </p>
            </div>

            <style>{`
                .um-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 10000;
                    background: rgba(0,0,0,0.82);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    animation: umFadeIn 0.18s ease;
                }
                @keyframes umFadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }

                .um-modal {
                    background: #080808;
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 10px;
                    padding: 32px 28px 24px;
                    max-width: 620px;
                    width: 100%;
                    position: relative;
                    color: #fff;
                    animation: umSlideUp 0.22s ease;
                    max-height: 92vh;
                    overflow-y: auto;
                }
                @keyframes umSlideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }

                .um-close {
                    position: absolute;
                    top: 14px; right: 14px;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 5px;
                    width: 28px; height: 28px;
                    cursor: pointer;
                    color: rgba(255,255,255,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    transition: background 0.15s, color 0.15s;
                }
                .um-close:hover {
                    background: rgba(255,255,255,0.12);
                    color: rgba(255,255,255,0.8);
                }

                /* ── Header ── */
                .um-header {
                    margin-bottom: 24px;
                }
                .um-header-eyebrow {
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 3px;
                    color: rgba(255,255,255,0.25);
                    margin-bottom: 8px;
                }
                .um-title {
                    font-size: 22px;
                    font-weight: 400;
                    font-style: italic;
                    margin: 0 0 8px;
                    color: #fff;
                    letter-spacing: -0.3px;
                }
                .um-reason {
                    font-size: 13px;
                    color: rgba(255,255,255,0.45);
                    margin: 0;
                    line-height: 1.6;
                }

                /* ── Billing toggle ── */
                .um-toggle-wrap {
                    display: flex;
                    align-items: baseline;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .um-toggle-btn {
                    background: none;
                    border: none;
                    padding: 0 0 3px;
                    font-size: 12px;
                    font-weight: 600;
                    font-family: inherit;
                    color: rgba(255,255,255,0.3);
                    cursor: pointer;
                    border-bottom: 1px solid transparent;
                    transition: color 0.15s, border-color 0.15s;
                }
                .um-toggle-btn.active {
                    color: #fff;
                    border-bottom-color: #00D924;
                }
                .um-toggle-sep {
                    color: rgba(255,255,255,0.15);
                    font-size: 12px;
                }
                .um-toggle-save {
                    color: #00D924;
                    font-weight: 400;
                    font-style: italic;
                }

                /* ── Plans ── */
                .um-plans {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1px;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 8px;
                    overflow: hidden;
                    margin-bottom: 16px;
                }
                @media (max-width: 480px) {
                    .um-plans { grid-template-columns: 1fr; }
                }

                .um-plan-card {
                    background: #080808;
                    padding: 20px 18px 16px;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                }

                .um-plan-accent-rule {
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 2px;
                    background: var(--accent, rgba(255,255,255,0.1));
                }

                .um-plan-header {
                    display: flex;
                    align-items: baseline;
                    gap: 8px;
                    margin-bottom: 4px;
                }
                .um-plan-name {
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: rgba(255,255,255,0.9);
                }
                .um-plan-rec {
                    font-size: 11px;
                    font-style: italic;
                    color: #00D924;
                    font-weight: 400;
                }
                .um-plan-tagline {
                    font-size: 11px;
                    color: rgba(255,255,255,0.3);
                    margin: 0 0 14px;
                    font-style: italic;
                }

                /* Price */
                .um-price-block {
                    margin-bottom: 14px;
                }
                .um-price-line {
                    display: flex;
                    align-items: baseline;
                    gap: 2px;
                }
                .um-price-num {
                    font-size: 34px;
                    font-weight: 400;
                    font-style: italic;
                    letter-spacing: -1.5px;
                    line-height: 1;
                    color: #fff;
                }
                .um-price-period {
                    font-size: 12px;
                    color: rgba(255,255,255,0.3);
                }
                .um-billed-note {
                    font-size: 10px;
                    color: rgba(255,255,255,0.25);
                    margin-top: 3px;
                    font-style: italic;
                }

                /* Features */
                .um-feature-list {
                    list-style: none;
                    padding: 0;
                    margin: 0 0 16px;
                    flex: 1;
                }
                .um-feature-list li {
                    font-size: 12px;
                    color: rgba(255,255,255,0.6);
                    padding: 4px 0;
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    line-height: 1.4;
                }
                .um-feat-mark {
                    flex-shrink: 0;
                    font-size: 11px;
                    width: 10px;
                    margin-top: 1px;
                }

                /* CTA */
                .um-cta-btn {
                    width: 100%;
                    padding: 10px 14px;
                    border-radius: 5px;
                    font-size: 12.5px;
                    font-weight: 700;
                    font-family: inherit;
                    cursor: pointer;
                    transition: all 0.15s;
                    margin-bottom: 6px;
                }
                .um-cta-green {
                    background: #00D924;
                    border: 1px solid #00D924;
                    color: #000;
                }
                .um-cta-green:hover:not(:disabled) {
                    background: #00f028;
                    border-color: #00f028;
                }
                .um-cta-amber {
                    background: transparent;
                    border: 1px solid rgba(255,184,0,0.4);
                    color: #FFB800;
                }
                .um-cta-amber:hover:not(:disabled) {
                    background: rgba(255,184,0,0.08);
                    border-color: #FFB800;
                }
                .um-cta-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .um-trial-note {
                    font-size: 10px;
                    color: rgba(255,255,255,0.2);
                    margin: 0;
                    font-style: italic;
                    text-align: center;
                }

                /* Error & footer */
                .um-error {
                    color: #FF6B6B;
                    text-align: center;
                    font-size: 12px;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }
                .um-footer-note {
                    text-align: center;
                    font-size: 11px;
                    color: rgba(255,255,255,0.18);
                    margin: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }
            `}</style>
        </div>
    );
};

// Global controller so any component can trigger the modal
const UpgradeModalController = () => {
    const [modalState, setModalState] = useState({ isOpen: false, reason: '' });

    useEffect(() => {
        window.showUpgradeModal = (reason) => setModalState({ isOpen: true, reason: reason || '' });
        window.hideUpgradeModal = () => setModalState({ isOpen: false, reason: '' });
        return () => {
            delete window.showUpgradeModal;
            delete window.hideUpgradeModal;
        };
    }, []);

    return (
        <UpgradeModal
            isOpen={modalState.isOpen}
            reason={modalState.reason}
            onClose={() => setModalState({ isOpen: false, reason: '' })}
        />
    );
};

// Mount the modal controller globally
const upgradeModalRoot = document.getElementById('upgrade-modal-root');
if (upgradeModalRoot) {
    const root = ReactDOM.createRoot(upgradeModalRoot);
    root.render(<UpgradeModalController />);
}

// Upgrade Modal — shown when a user hits a paywall
// Mounts into #upgrade-modal-root or can be triggered via window.showUpgradeModal()

const { useState, useEffect, useCallback } = React;

const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';

const PLANS = [
    {
        id: 'pro',
        label: 'Pro',
        badge: 'Most Popular',
        badgeColor: '#00D4AA',
        monthlyPrice: 12,
        yearlyPrice: 99,
        yearlyMonthly: 8.25,
        savings: '31%',
        features: [
            '50 AI chat messages/day',
            'Morning Brief — daily AI portfolio briefing',
            'Thesis Builder — AI bull & bear cases',
            'Portfolio Health Score',
            'Sector Rotation tracker',
            'Real-time market data',
            'Priority support',
        ],
        monthlyPriceId: window.STRIPE_CONFIG?.PRO_MONTHLY || '',
        yearlyPriceId: window.STRIPE_CONFIG?.PRO_YEARLY || '',
        highlight: true,
    },
    {
        id: 'elite',
        label: 'Elite',
        badge: 'Best Value',
        badgeColor: '#FFB800',
        monthlyPrice: 24,
        yearlyPrice: 199,
        yearlyMonthly: 16.58,
        savings: '31%',
        features: [
            'Unlimited AI chat messages',
            'Everything in Pro',
            'Priority AI processing',
            'Early access to new features',
        ],
        monthlyPriceId: window.STRIPE_CONFIG?.ELITE_MONTHLY || '',
        yearlyPriceId: window.STRIPE_CONFIG?.ELITE_YEARLY || '',
        highlight: false,
    },
];

const UpgradeModal = ({ isOpen, onClose, reason }) => {
    const [billing, setBilling] = useState('yearly'); // 'monthly' | 'yearly'
    const [loading, setLoading] = useState(null); // plan id or null
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const handleUpgrade = useCallback(async (plan) => {
        const priceId = billing === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
        if (!priceId) {
            setError('Pricing not configured. Please contact support.');
            return;
        }

        const user = window.firebaseAuth?.currentUser;
        if (!user) {
            setError('Please sign in to upgrade.');
            return;
        }

        setLoading(plan.id);
        setError('');
        try {
            const token = await user.getIdToken();
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
        <div className="upgrade-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="upgrade-modal">
                {/* Close */}
                <button className="upgrade-modal-close" onClick={onClose} aria-label="Close">
                    <i className="fas fa-times"></i>
                </button>

                {/* Header */}
                <div className="upgrade-modal-header">
                    <div className="upgrade-modal-icon">
                        <i className="fas fa-crown"></i>
                    </div>
                    <h2>Upgrade Your Edge</h2>
                    <p className="upgrade-modal-reason">{reasonText}</p>
                    <p className="upgrade-trial-badge">
                        <i className="fas fa-gift"></i> 7-day free trial — cancel anytime
                    </p>
                </div>

                {/* Billing toggle */}
                <div className="upgrade-billing-toggle">
                    <button
                        className={`toggle-btn ${billing === 'monthly' ? 'active' : ''}`}
                        onClick={() => setBilling('monthly')}
                    >Monthly</button>
                    <button
                        className={`toggle-btn ${billing === 'yearly' ? 'active' : ''}`}
                        onClick={() => setBilling('yearly')}
                    >
                        Annual <span className="toggle-save-badge">Save up to 25%</span>
                    </button>
                </div>

                {/* Plans */}
                <div className="upgrade-plans">
                    {PLANS.map((plan) => (
                        <div
                            key={plan.id}
                            className={`upgrade-plan-card ${plan.highlight ? 'highlighted' : ''}`}
                        >
                            {plan.badge && (
                                <div className="plan-badge" style={{ background: plan.badgeColor }}>
                                    {plan.badge}
                                </div>
                            )}
                            <div className="plan-label">{plan.label}</div>
                            <div className="plan-price">
                                {billing === 'yearly' ? (
                                    <>
                                        <span className="price-amount">${plan.yearlyMonthly.toFixed(2)}</span>
                                        <span className="price-period">/mo</span>
                                        <div className="price-billed">
                                            Billed ${plan.yearlyPrice}/year &mdash; save {plan.savings}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className="price-amount">${plan.monthlyPrice}</span>
                                        <span className="price-period">/mo</span>
                                    </>
                                )}
                            </div>
                            <ul className="plan-features">
                                {plan.features.map((f, i) => (
                                    <li key={i}><i className="fas fa-check"></i> {f}</li>
                                ))}
                            </ul>
                            <button
                                className={`plan-cta-btn ${plan.highlight ? 'primary' : 'secondary'}`}
                                onClick={() => handleUpgrade(plan)}
                                disabled={loading !== null}
                            >
                                {loading === plan.id ? (
                                    <><i className="fas fa-spinner fa-spin"></i> Redirecting...</>
                                ) : (
                                    `Start Free Trial`
                                )}
                            </button>
                        </div>
                    ))}
                </div>

                {error && <p className="upgrade-error"><i className="fas fa-exclamation-circle"></i> {error}</p>}

                <p className="upgrade-footer-note">
                    <i className="fas fa-lock"></i> Secured by Stripe. No card charged until trial ends.
                </p>
            </div>

            <style>{`
                .upgrade-modal-overlay {
                    position: fixed; inset: 0; z-index: 10000;
                    background: rgba(0,0,0,0.75);
                    display: flex; align-items: center; justify-content: center;
                    padding: 16px;
                    animation: fadeInOverlay 0.2s ease;
                }
                @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }

                .upgrade-modal {
                    background: #0f1117;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 20px;
                    padding: 36px 32px 28px;
                    max-width: 660px;
                    width: 100%;
                    position: relative;
                    color: #fff;
                    animation: slideUp 0.25s ease;
                    max-height: 90vh;
                    overflow-y: auto;
                }
                @keyframes slideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

                .upgrade-modal-close {
                    position: absolute; top: 16px; right: 16px;
                    background: rgba(255,255,255,0.08); border: none; border-radius: 50%;
                    width: 32px; height: 32px; cursor: pointer; color: rgba(255,255,255,0.6);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 14px; transition: background 0.2s;
                }
                .upgrade-modal-close:hover { background: rgba(255,255,255,0.16); color: #fff; }

                .upgrade-modal-header { text-align: center; margin-bottom: 24px; }
                .upgrade-modal-icon {
                    width: 52px; height: 52px; border-radius: 50%;
                    background: linear-gradient(135deg, #FFB800, #FF6B35);
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 14px; font-size: 22px;
                }
                .upgrade-modal-header h2 { font-size: 24px; font-weight: 700; margin: 0 0 8px; }
                .upgrade-modal-reason { color: rgba(255,255,255,0.65); font-size: 14px; margin: 0 0 12px; }
                .upgrade-trial-badge {
                    display: inline-flex; align-items: center; gap: 6px;
                    background: rgba(0, 212, 170, 0.12); border: 1px solid rgba(0,212,170,0.3);
                    color: #00D4AA; border-radius: 20px; padding: 4px 14px; font-size: 13px;
                }

                .upgrade-billing-toggle {
                    display: flex; background: rgba(255,255,255,0.06);
                    border-radius: 10px; padding: 4px; margin-bottom: 24px; gap: 4px;
                }
                .toggle-btn {
                    flex: 1; padding: 8px 12px; border: none; border-radius: 8px;
                    background: transparent; color: rgba(255,255,255,0.55); cursor: pointer;
                    font-size: 13px; font-weight: 600; transition: all 0.2s;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                }
                .toggle-btn.active { background: rgba(255,255,255,0.12); color: #fff; }
                .toggle-save-badge {
                    background: rgba(0,212,170,0.2); color: #00D4AA;
                    border-radius: 20px; padding: 1px 7px; font-size: 11px;
                }

                .upgrade-plans { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
                @media (max-width: 500px) { .upgrade-plans { grid-template-columns: 1fr; } }

                .upgrade-plan-card {
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 14px; padding: 20px; position: relative;
                    display: flex; flex-direction: column;
                }
                .upgrade-plan-card.highlighted {
                    border-color: #00D4AA; background: rgba(0,212,170,0.05);
                }
                .plan-badge {
                    position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
                    border-radius: 20px; padding: 2px 12px; font-size: 11px; font-weight: 700;
                    color: #000; white-space: nowrap;
                }
                .plan-label { font-size: 17px; font-weight: 700; margin-bottom: 12px; margin-top: 4px; }
                .plan-price { margin-bottom: 16px; }
                .price-amount { font-size: 32px; font-weight: 800; }
                .price-period { font-size: 14px; color: rgba(255,255,255,0.5); margin-left: 2px; }
                .price-billed { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px; }
                .plan-features { list-style: none; padding: 0; margin: 0 0 20px; flex: 1; }
                .plan-features li {
                    font-size: 13px; color: rgba(255,255,255,0.75); padding: 5px 0;
                    display: flex; align-items: flex-start; gap: 8px;
                }
                .plan-features li i { color: #00D4AA; margin-top: 2px; flex-shrink: 0; font-size: 11px; }

                .plan-cta-btn {
                    width: 100%; padding: 11px; border-radius: 10px; border: none;
                    font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s;
                }
                .plan-cta-btn.primary {
                    background: linear-gradient(135deg, #00D4AA, #00A878);
                    color: #000;
                }
                .plan-cta-btn.primary:hover { filter: brightness(1.1); }
                .plan-cta-btn.secondary {
                    background: rgba(255,255,255,0.1); color: #fff;
                    border: 1px solid rgba(255,255,255,0.15);
                }
                .plan-cta-btn.secondary:hover { background: rgba(255,255,255,0.16); }
                .plan-cta-btn:disabled { opacity: 0.6; cursor: not-allowed; }

                .upgrade-error {
                    color: #FF6B6B; text-align: center; font-size: 13px; margin-bottom: 12px;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                }
                .upgrade-footer-note {
                    text-align: center; font-size: 12px; color: rgba(255,255,255,0.35);
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                    margin: 0;
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

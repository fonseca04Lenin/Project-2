export {};
// Pricing Page — editorial / terminal aesthetic
// Matches AIStockSage dashboard design language

const { useState, useEffect } = React;

const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';

interface PlanFeature {
    text: string;
    included: boolean;
}

interface PlanData {
    id: string;
    label: string;
    accentColor: string;
    monthlyPrice: number;
    yearlyPrice: number;
    yearlyMonthly?: number;
    savings?: string;
    tagline: string;
    popular?: boolean;
    features: PlanFeature[];
    cta: string;
    monthlyPriceId: string | null;
    yearlyPriceId: string | null;
}

const PLAN_DATA: PlanData[] = [
    {
        id: 'free',
        label: 'Free',
        accentColor: 'rgba(255,255,255,0.15)',
        monthlyPrice: 0,
        yearlyPrice: 0,
        tagline: 'Explore the platform at no cost.',
        features: [
            { text: '5 AI chat messages per day', included: true },
            { text: 'Watchlist & portfolio tracking', included: true },
            { text: 'Real-time market data', included: true },
            { text: 'Price alerts', included: true },
            { text: 'Morning Brief', included: false },
            { text: 'Thesis Builder', included: false },
            { text: 'Portfolio Health Score', included: false },
            { text: 'Sector Rotation tracker', included: false },
        ],
        cta: 'Get Started',
        monthlyPriceId: null,
        yearlyPriceId: null,
    },
    {
        id: 'pro',
        label: 'Pro',
        accentColor: '#00D924',
        monthlyPrice: 12,
        yearlyPrice: 99,
        yearlyMonthly: 8.25,
        savings: '31%',
        tagline: 'For investors who want a real edge.',
        popular: true,
        features: [
            { text: '50 AI chat messages per day', included: true },
            { text: 'Watchlist & portfolio tracking', included: true },
            { text: 'Real-time market data', included: true },
            { text: 'Price alerts', included: true },
            { text: 'Morning Brief — personalized daily AI brief', included: true },
            { text: 'Thesis Builder — AI bull & bear cases', included: true },
            { text: 'Portfolio Health Score & grade', included: true },
            { text: 'Sector Rotation tracker', included: true },
        ],
        cta: 'Start 7-Day Free Trial',
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
            { text: 'Unlimited AI chat messages', included: true },
            { text: 'Everything in Pro', included: true },
            { text: 'Priority AI processing', included: true },
            { text: 'Early access to new features', included: true },
            { text: 'Premium support', included: true },
        ],
        cta: 'Start 7-Day Free Trial',
        monthlyPriceId: window.STRIPE_CONFIG?.ELITE_MONTHLY || '',
        yearlyPriceId: window.STRIPE_CONFIG?.ELITE_YEARLY || '',
    },
];

const FAQS = [
    {
        q: 'Can I cancel anytime?',
        a: 'Yes. Cancel from your account settings with one click. You keep access until the end of your billing period.',
    },
    {
        q: 'What happens after the 7-day trial?',
        a: "Your card is charged at the end of the trial. We send a reminder 24 hours before. Cancel beforehand and you won't be charged.",
    },
    {
        q: 'Do daily AI message limits reset?',
        a: 'Limits reset every day at midnight UTC. Free users get 5 messages, Pro users get 50. Elite has no limit.',
    },
    {
        q: 'Is my payment secure?',
        a: 'All payments are processed by Stripe, PCI-DSS Level 1 certified. We never store your card details.',
    },
    {
        q: 'Can I switch plans?',
        a: 'Yes — upgrade or downgrade at any time from account settings. Prorated credits apply automatically.',
    },
];

const PricingPage = () => {
    const { currentUser } = window.AppAuth.useAuth();
    const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [currentTier, setCurrentTier] = useState<string | null>(null);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    useEffect(() => {
        const loadSub = async () => {
            if (!currentUser) return;
            try {
                const token = await currentUser.getIdToken();
                const res = await fetch(`${API_BASE_URL}/api/billing/subscription`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const data = await res.json();
                setCurrentTier(data.tier || 'free');
            } catch (e) {
                // ignore
            }
        };
        loadSub();
    }, [currentUser]);

    useEffect(() => {
        if (window.location.search.includes('checkout=success')) {
            window.history.replaceState({}, document.title, window.location.pathname);
            if (currentUser) {
                currentUser.getIdToken(true)
                    .then(token => fetch(`${API_BASE_URL}/api/billing/subscription`, {
                        headers: { 'Authorization': `Bearer ${token}` },
                    }))
                    .then(res => res.json())
                    .then(data => setCurrentTier(data.tier || 'free'))
                    .catch(() => {});
            }
        }
    }, [currentUser]);

    const handleCta = async (plan: PlanData) => {
        if (plan.id === 'free') {
            window.location.href = '/';
            return;
        }

        const priceId = billing === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
        if (!priceId) {
            setError('Pricing not configured. Contact support.');
            return;
        }

        if (!currentUser) {
            window.location.href = '/?redirect=pricing';
            return;
        }

        if (currentTier === plan.id) {
            setLoading(plan.id);
            try {
                const token = await currentUser.getIdToken();
                const res = await fetch(`${API_BASE_URL}/api/billing/portal`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.portal_url) window.location.href = data.portal_url;
            } catch (e) {
                setError('Could not open billing portal.');
            } finally {
                setLoading(null);
            }
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
                setError(data.error || 'Could not start checkout.');
            }
        } catch (e) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(null);
        }
    };

    const getCtaLabel = (plan: PlanData) => {
        if (plan.id === 'free') return 'Get Started';
        if (currentTier === plan.id) return 'Manage Subscription';
        return plan.cta;
    };

    return (
        <div className="pricing-page">

            {/* Hero */}
            <div className="pricing-hero">
                <h1 className="pricing-headline">
                    Intelligence that<br />pays for itself.
                </h1>
                <p className="pricing-sub">
                    Real-time market data, AI-generated insights, and portfolio analysis —<br />
                    built for investors who take precision seriously.
                </p>
            </div>

            {/* Billing toggle — editorial tab style */}
            <div className="pricing-toggle-wrap">
                <button
                    className={`ptoggle-btn ${billing === 'monthly' ? 'active' : ''}`}
                    onClick={() => setBilling('monthly')}
                >Monthly</button>
                <span className="ptoggle-sep">/</span>
                <button
                    className={`ptoggle-btn ${billing === 'yearly' ? 'active' : ''}`}
                    onClick={() => setBilling('yearly')}
                >Annual <span className="ptoggle-save">— save 31%</span></button>
            </div>

            {/* Plans grid */}
            <div className="pricing-plans-grid">
                {PLAN_DATA.map((plan) => (
                    <div
                        key={plan.id}
                        className={`pricing-plan-card ${currentTier === plan.id ? 'current' : ''}`}
                        style={{ '--accent': plan.accentColor } as any}
                    >
                        {/* Top accent rule */}
                        <div className="plan-accent-rule" />

                        {/* Header row */}
                        <div className="plan-header-row">
                            <span className="plan-tier-name">{plan.label}</span>
                            {plan.popular && <span className="plan-popular-mark">— recommended</span>}
                            {currentTier === plan.id && <span className="plan-current-mark">active</span>}
                        </div>

                        <p className="plan-tagline">{plan.tagline}</p>

                        {/* Price */}
                        <div className="plan-price-block">
                            {plan.monthlyPrice === 0 ? (
                                <div className="plan-price-line">
                                    <span className="plan-price-num">$0</span>
                                    <span className="plan-price-period"> / forever</span>
                                </div>
                            ) : billing === 'yearly' ? (
                                <>
                                    <div className="plan-price-line">
                                        <span className="plan-price-num">${plan.yearlyMonthly!.toFixed(2)}</span>
                                        <span className="plan-price-period"> / mo</span>
                                    </div>
                                    <div className="plan-billed-note">
                                        billed ${plan.yearlyPrice} annually &mdash; {plan.savings} off
                                    </div>
                                </>
                            ) : (
                                <div className="plan-price-line">
                                    <span className="plan-price-num">${plan.monthlyPrice}</span>
                                    <span className="plan-price-period"> / mo</span>
                                </div>
                            )}
                        </div>

                        {/* CTA */}
                        <button
                            className={`plan-cta-btn ${plan.id === 'pro' ? 'cta-primary' : plan.id === 'elite' ? 'cta-amber' : 'cta-ghost'}`}
                            onClick={() => handleCta(plan)}
                            disabled={loading !== null}
                        >
                            {loading === plan.id
                                ? <><i className="fas fa-circle-notch fa-spin" style={{ marginRight: 7 }}></i>Redirecting</>
                                : getCtaLabel(plan)
                            }
                        </button>

                        {plan.id !== 'free' && (
                            <p className="plan-trial-note">7-day free trial. No charge until it ends.</p>
                        )}

                        {/* Feature list */}
                        <div className="plan-divider" />
                        <ul className="plan-feature-list">
                            {plan.features.map((f, i) => (
                                <li key={i} className={f.included ? 'feat-in' : 'feat-out'}>
                                    <span className="feat-mark">{f.included ? '—' : '·'}</span>
                                    {f.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {error && (
                <p className="pricing-error-msg">
                    <i className="fas fa-exclamation-circle"></i> {error}
                </p>
            )}

            {/* FAQ */}
            <div className="pricing-faq">
                <div className="faq-heading-row">
                    <span className="faq-label">FAQ</span>
                    <div className="faq-heading-rule" />
                </div>
                {FAQS.map((faq, i) => (
                    <div key={i} className={`faq-item ${openFaq === i ? 'open' : ''}`}>
                        <button
                            className="faq-q"
                            onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        >
                            <span className="faq-num">{String(i + 1).padStart(2, '0')}</span>
                            <span className="faq-q-text">{faq.q}</span>
                            <i className={`fas fa-chevron-${openFaq === i ? 'up' : 'down'} faq-chevron`}></i>
                        </button>
                        {openFaq === i && (
                            <div className="faq-a">{faq.a}</div>
                        )}
                    </div>
                ))}
            </div>

            {/* Trust footer */}
            <div className="pricing-trust-line">
                <i className="fas fa-lock"></i> Payments secured by Stripe
                <span className="trust-sep">·</span>
                <i className="fas fa-times-circle"></i> Cancel anytime
                <span className="trust-sep">·</span>
                <i className="fas fa-headset"></i> Support included
            </div>

            <style>{`
                .pricing-page {
                    max-width: 1060px;
                    margin: 0 auto;
                    padding: 56px 24px 72px;
                    color: #fff;
                }

                /* ── Hero ── */
                .pricing-hero {
                    margin-bottom: 48px;
                }
                .pricing-headline {
                    font-size: clamp(32px, 5vw, 52px);
                    font-weight: 400;
                    font-style: italic;
                    line-height: 1.15;
                    letter-spacing: -0.5px;
                    margin: 0 0 16px;
                    color: #fff;
                }
                .pricing-sub {
                    font-size: 14px;
                    color: rgba(255,255,255,0.45);
                    line-height: 1.7;
                    margin: 0;
                    font-style: normal;
                }

                /* ── Billing toggle ── */
                .pricing-toggle-wrap {
                    display: flex;
                    align-items: baseline;
                    gap: 10px;
                    margin-bottom: 36px;
                }
                .ptoggle-btn {
                    background: none;
                    border: none;
                    padding: 0 0 4px;
                    font-size: 13px;
                    font-weight: 600;
                    font-family: inherit;
                    color: rgba(255,255,255,0.35);
                    cursor: pointer;
                    border-bottom: 1px solid transparent;
                    transition: color 0.15s, border-color 0.15s;
                    letter-spacing: 0.01em;
                }
                .ptoggle-btn.active {
                    color: #fff;
                    border-bottom-color: #00D924;
                }
                .ptoggle-sep {
                    color: rgba(255,255,255,0.2);
                    font-size: 13px;
                    user-select: none;
                }
                .ptoggle-save {
                    color: #00D924;
                    font-weight: 400;
                    font-style: italic;
                }

                /* ── Plans grid ── */
                .pricing-plans-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
                    gap: 1px;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 12px;
                    overflow: hidden;
                    margin-bottom: 48px;
                }

                /* ── Plan card ── */
                .pricing-plan-card {
                    background: #080808;
                    padding: 28px 24px 24px;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                }
                .pricing-plan-card.current {
                    background: #0a0a0a;
                }

                .plan-accent-rule {
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 2px;
                    background: var(--accent, rgba(255,255,255,0.1));
                }

                .plan-header-row {
                    display: flex;
                    align-items: baseline;
                    gap: 10px;
                    margin-bottom: 6px;
                }
                .plan-tier-name {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: rgba(255,255,255,0.9);
                }
                .plan-popular-mark {
                    font-size: 11px;
                    font-style: italic;
                    color: #00D924;
                    font-weight: 400;
                }
                .plan-current-mark {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #FFB800;
                    font-weight: 700;
                    padding: 2px 7px;
                    border: 1px solid rgba(255,184,0,0.3);
                    border-radius: 3px;
                }

                .plan-tagline {
                    font-size: 12px;
                    color: rgba(255,255,255,0.35);
                    margin: 0 0 20px;
                    font-style: italic;
                    line-height: 1.5;
                }

                /* ── Price ── */
                .plan-price-block {
                    margin-bottom: 20px;
                }
                .plan-price-line {
                    display: flex;
                    align-items: baseline;
                    gap: 2px;
                }
                .plan-price-num {
                    font-size: 44px;
                    font-weight: 400;
                    font-style: italic;
                    letter-spacing: -2px;
                    line-height: 1;
                    color: #fff;
                }
                .plan-price-period {
                    font-size: 13px;
                    color: rgba(255,255,255,0.35);
                    font-style: normal;
                }
                .plan-billed-note {
                    font-size: 11px;
                    color: rgba(255,255,255,0.3);
                    margin-top: 4px;
                    font-style: italic;
                }

                /* ── CTA buttons ── */
                .plan-cta-btn {
                    width: 100%;
                    padding: 11px 16px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 700;
                    font-family: inherit;
                    cursor: pointer;
                    transition: all 0.15s;
                    margin-bottom: 8px;
                    letter-spacing: 0.01em;
                }
                .cta-primary {
                    background: #00D924;
                    border: 1px solid #00D924;
                    color: #000;
                }
                .cta-primary:hover:not(:disabled) {
                    background: #00f028;
                    border-color: #00f028;
                }
                .cta-amber {
                    background: transparent;
                    border: 1px solid rgba(255,184,0,0.5);
                    color: #FFB800;
                }
                .cta-amber:hover:not(:disabled) {
                    background: rgba(255,184,0,0.08);
                    border-color: #FFB800;
                }
                .cta-ghost {
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.1);
                    color: rgba(255,255,255,0.45);
                }
                .cta-ghost:hover:not(:disabled) {
                    border-color: rgba(255,255,255,0.2);
                    color: rgba(255,255,255,0.7);
                }
                .plan-cta-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .plan-trial-note {
                    font-size: 11px;
                    color: rgba(255,255,255,0.25);
                    margin: 0 0 20px;
                    font-style: italic;
                    text-align: center;
                }

                /* ── Feature list ── */
                .plan-divider {
                    border: none;
                    border-top: 1px solid rgba(255,255,255,0.06);
                    margin: 0 0 16px;
                }
                .plan-feature-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    flex: 1;
                }
                .plan-feature-list li {
                    font-size: 12.5px;
                    line-height: 1.5;
                    padding: 5px 0;
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    color: rgba(255,255,255,0.55);
                }
                .plan-feature-list li.feat-in {
                    color: rgba(255,255,255,0.7);
                }
                .plan-feature-list li.feat-out {
                    color: rgba(255,255,255,0.2);
                }
                .feat-mark {
                    flex-shrink: 0;
                    font-size: 12px;
                    color: inherit;
                    width: 10px;
                    text-align: center;
                    margin-top: 1px;
                }
                .feat-in .feat-mark {
                    color: var(--accent, rgba(255,255,255,0.4));
                }

                /* ── Error ── */
                .pricing-error-msg {
                    text-align: center;
                    color: #FF6B6B;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    margin-bottom: 24px;
                }

                /* ── FAQ ── */
                .pricing-faq {
                    max-width: 660px;
                    margin: 0 auto 56px;
                }
                .faq-heading-row {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .faq-label {
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 3px;
                    color: rgba(255,255,255,0.3);
                    white-space: nowrap;
                }
                .faq-heading-rule {
                    flex: 1;
                    height: 1px;
                    background: rgba(255,255,255,0.06);
                }
                .faq-item {
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .faq-q {
                    width: 100%;
                    background: none;
                    border: none;
                    color: rgba(255,255,255,0.8);
                    font-family: inherit;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    padding: 15px 0;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    text-align: left;
                    transition: color 0.15s;
                }
                .faq-q:hover {
                    color: #fff;
                }
                .faq-num {
                    font-size: 10px;
                    font-style: italic;
                    color: rgba(255,255,255,0.2);
                    flex-shrink: 0;
                    font-weight: 400;
                    width: 20px;
                }
                .faq-q-text {
                    flex: 1;
                }
                .faq-chevron {
                    font-size: 10px;
                    color: rgba(255,255,255,0.25);
                    flex-shrink: 0;
                }
                .faq-a {
                    font-size: 12.5px;
                    color: rgba(255,255,255,0.45);
                    line-height: 1.7;
                    padding: 0 0 16px 34px;
                }

                /* ── Trust footer ── */
                .pricing-trust-line {
                    text-align: center;
                    font-size: 11px;
                    color: rgba(255,255,255,0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .trust-sep {
                    color: rgba(255,255,255,0.1);
                }

                @media (max-width: 680px) {
                    .pricing-plans-grid {
                        grid-template-columns: 1fr;
                    }
                    .pricing-headline {
                        font-size: 30px;
                    }
                    .plan-price-num {
                        font-size: 36px;
                    }
                }
            `}</style>
        </div>
    );
};

window.PricingPage = PricingPage;

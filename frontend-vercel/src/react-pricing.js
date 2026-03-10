// Pricing Page Component
// Full standalone pricing page with Stripe checkout integration

const { useState, useEffect } = React;

const API_BASE_URL = window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app';

const PLAN_DATA = [
    {
        id: 'free',
        label: 'Free',
        monthlyPrice: 0,
        yearlyPrice: 0,
        description: 'Get started with AI stock insights',
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
        cta: 'Get Started Free',
        highlight: false,
        monthlyPriceId: null,
        yearlyPriceId: null,
    },
    {
        id: 'pro',
        label: 'Pro',
        monthlyPrice: 12,
        yearlyPrice: 99,
        yearlyMonthly: 8.25,
        savings: '31%',
        description: 'For serious investors who want an edge',
        badge: 'Most Popular',
        badgeColor: '#00D4AA',
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
        highlight: true,
        monthlyPriceId: window.STRIPE_CONFIG?.PRO_MONTHLY || '',
        yearlyPriceId: window.STRIPE_CONFIG?.PRO_YEARLY || '',
    },
    {
        id: 'elite',
        label: 'Elite',
        monthlyPrice: 24,
        yearlyPrice: 199,
        yearlyMonthly: 16.58,
        savings: '31%',
        description: 'For professionals who need unlimited AI power',
        badge: 'Best Value',
        badgeColor: '#FFB800',
        features: [
            { text: 'Unlimited AI chat messages', included: true },
            { text: 'Everything in Pro', included: true },
            { text: 'Priority AI processing', included: true },
            { text: 'Early access to new features', included: true },
            { text: 'Premium support', included: true },
        ],
        cta: 'Start 7-Day Free Trial',
        highlight: false,
        monthlyPriceId: window.STRIPE_CONFIG?.ELITE_MONTHLY || '',
        yearlyPriceId: window.STRIPE_CONFIG?.ELITE_YEARLY || '',
    },
];

const FAQS = [
    {
        q: 'Can I cancel anytime?',
        a: 'Yes. Cancel from your account settings with one click. You keep access until the end of your billing period. No questions asked.',
    },
    {
        q: 'What happens after the 7-day trial?',
        a: "Your card is charged at the end of the trial period. We'll send a reminder email 24 hours before. Cancel before then and you won't be charged.",
    },
    {
        q: 'Do daily AI message limits reset?',
        a: 'Yes — limits reset every day at midnight UTC. Free users get 5 messages, Pro users get 50.',
    },
    {
        q: 'Is my payment secure?',
        a: 'All payments are processed by Stripe, a PCI-DSS Level 1 certified payment processor. We never store your card details.',
    },
    {
        q: 'Can I switch plans?',
        a: 'Yes, upgrade or downgrade at any time from your account settings. Prorated credits apply automatically.',
    },
];

const PricingPage = () => {
    const [billing, setBilling] = useState('yearly');
    const [loading, setLoading] = useState(null);
    const [error, setError] = useState('');
    const [currentTier, setCurrentTier] = useState(null);
    const [openFaq, setOpenFaq] = useState(null);

    useEffect(() => {
        // Load current subscription
        const loadSub = async () => {
            const user = window.firebaseAuth?.currentUser;
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch(`${API_BASE_URL}/api/billing/subscription`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const data = await res.json();
                setCurrentTier(data.tier || 'free');
            } catch (e) {
                // ignore
            }
        };

        const unsub = window.firebaseAuth?.onAuthStateChanged((user) => {
            if (user) loadSub();
        });
        return () => unsub && unsub();
    }, []);

    // Check for checkout=success in URL
    useEffect(() => {
        if (window.location.search.includes('checkout=success')) {
            // Show success state
            setCurrentTier(null); // will reload
        }
    }, []);

    const handleCta = async (plan) => {
        if (plan.id === 'free') {
            window.location.href = '/';
            return;
        }

        const priceId = billing === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
        if (!priceId) {
            setError('Pricing not configured. Contact support.');
            return;
        }

        const user = window.firebaseAuth?.currentUser;
        if (!user) {
            // Redirect to sign-in, then back to pricing
            window.location.href = '/?redirect=pricing';
            return;
        }

        if (currentTier === plan.id) {
            // Open customer portal to manage subscription
            setLoading(plan.id);
            try {
                const token = await user.getIdToken();
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
                setError(data.error || 'Could not start checkout.');
            }
        } catch (e) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(null);
        }
    };

    const getCtaLabel = (plan) => {
        if (plan.id === 'free') return 'Get Started Free';
        if (currentTier === plan.id) return 'Manage Subscription';
        return plan.cta;
    };

    return (
        <div className="pricing-page">
            {/* Hero */}
            <div className="pricing-hero">
                <div className="pricing-hero-tag">
                    <i className="fas fa-bolt"></i> AI-Powered Stock Intelligence
                </div>
                <h1>Invest smarter with AI on your side</h1>
                <p>Real-time market insights, personalized portfolio analysis, and AI-generated investment theses — all in one platform.</p>
            </div>

            {/* Billing toggle */}
            <div className="pricing-billing-toggle">
                <button
                    className={`billing-toggle-btn ${billing === 'monthly' ? 'active' : ''}`}
                    onClick={() => setBilling('monthly')}
                >Monthly</button>
                <button
                    className={`billing-toggle-btn ${billing === 'yearly' ? 'active' : ''}`}
                    onClick={() => setBilling('yearly')}
                >
                    Annual <span className="billing-save-chip">Save up to 25%</span>
                </button>
            </div>

            {/* Trial banner */}
            <div className="pricing-trial-banner">
                <i className="fas fa-gift"></i>
                All paid plans include a <strong>7-day free trial</strong> — no charge until the trial ends.
            </div>

            {/* Plans grid */}
            <div className="pricing-plans-grid">
                {PLAN_DATA.map((plan) => (
                    <div
                        key={plan.id}
                        className={`pricing-plan-card ${plan.highlight ? 'highlighted' : ''} ${currentTier === plan.id ? 'current' : ''}`}
                    >
                        {plan.badge && (
                            <div className="pricing-plan-badge" style={{ background: plan.badgeColor }}>
                                {plan.badge}
                            </div>
                        )}
                        {currentTier === plan.id && (
                            <div className="pricing-current-chip">Your Plan</div>
                        )}

                        <div className="pricing-plan-label">{plan.label}</div>
                        <p className="pricing-plan-desc">{plan.description}</p>

                        <div className="pricing-plan-price">
                            {plan.monthlyPrice === 0 ? (
                                <><span className="ppp-amount">$0</span><span className="ppp-period">/forever</span></>
                            ) : billing === 'yearly' ? (
                                <>
                                    <span className="ppp-amount">${plan.yearlyMonthly.toFixed(2)}</span>
                                    <span className="ppp-period">/mo</span>
                                    <div className="ppp-billed">Billed ${plan.yearlyPrice}/year — save {plan.savings}</div>
                                </>
                            ) : (
                                <>
                                    <span className="ppp-amount">${plan.monthlyPrice}</span>
                                    <span className="ppp-period">/mo</span>
                                </>
                            )}
                        </div>

                        <button
                            className={`pricing-cta-btn ${plan.highlight ? 'primary' : plan.id === 'free' ? 'ghost' : 'secondary'}`}
                            onClick={() => handleCta(plan)}
                            disabled={loading !== null}
                        >
                            {loading === plan.id
                                ? <><i className="fas fa-spinner fa-spin"></i> Redirecting...</>
                                : getCtaLabel(plan)
                            }
                        </button>

                        <ul className="pricing-feature-list">
                            {plan.features.map((f, i) => (
                                <li key={i} className={f.included ? '' : 'excluded'}>
                                    <i className={`fas ${f.included ? 'fa-check' : 'fa-times'}`}></i>
                                    {f.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {error && (
                <p className="pricing-error">
                    <i className="fas fa-exclamation-circle"></i> {error}
                </p>
            )}

            {/* Social proof */}
            <div className="pricing-social-proof">
                <div className="sp-stat"><span>10,000+</span><label>Active investors</label></div>
                <div className="sp-divider"></div>
                <div className="sp-stat"><span>4.8★</span><label>Average rating</label></div>
                <div className="sp-divider"></div>
                <div className="sp-stat"><span>$0</span><label>To get started</label></div>
            </div>

            {/* FAQ */}
            <div className="pricing-faq">
                <h3>Frequently Asked Questions</h3>
                {FAQS.map((faq, i) => (
                    <div key={i} className={`faq-item ${openFaq === i ? 'open' : ''}`}>
                        <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                            {faq.q}
                            <i className={`fas fa-chevron-${openFaq === i ? 'up' : 'down'}`}></i>
                        </button>
                        {openFaq === i && <div className="faq-answer">{faq.a}</div>}
                    </div>
                ))}
            </div>

            {/* Trust footer */}
            <div className="pricing-trust-footer">
                <i className="fas fa-lock"></i> Payments secured by Stripe &nbsp;·&nbsp;
                <i className="fas fa-shield-alt"></i> Cancel anytime &nbsp;·&nbsp;
                <i className="fas fa-headset"></i> Support included
            </div>

            <style>{`
                .pricing-page {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 40px 20px 60px;
                    color: #fff;
                    font-family: inherit;
                }
                .pricing-hero { text-align: center; margin-bottom: 36px; }
                .pricing-hero-tag {
                    display: inline-flex; align-items: center; gap: 6px;
                    background: rgba(0,212,170,0.1); border: 1px solid rgba(0,212,170,0.25);
                    color: #00D4AA; border-radius: 20px; padding: 5px 14px;
                    font-size: 12px; font-weight: 700; text-transform: uppercase;
                    letter-spacing: 0.5px; margin-bottom: 16px;
                }
                .pricing-hero h1 { font-size: clamp(26px, 4vw, 38px); font-weight: 800; margin: 0 0 12px; }
                .pricing-hero p { font-size: 16px; color: rgba(255,255,255,0.6); max-width: 540px; margin: 0 auto; }

                .pricing-billing-toggle {
                    display: flex; justify-content: center; gap: 4px;
                    background: rgba(255,255,255,0.06); border-radius: 12px; padding: 4px;
                    width: fit-content; margin: 0 auto 20px;
                }
                .billing-toggle-btn {
                    padding: 9px 20px; border: none; border-radius: 10px;
                    background: transparent; color: rgba(255,255,255,0.55);
                    cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s;
                    display: flex; align-items: center; gap: 8px;
                }
                .billing-toggle-btn.active { background: rgba(255,255,255,0.12); color: #fff; }
                .billing-save-chip {
                    background: rgba(0,212,170,0.2); color: #00D4AA;
                    border-radius: 20px; padding: 2px 8px; font-size: 11px;
                }

                .pricing-trial-banner {
                    text-align: center; font-size: 13px; color: rgba(255,255,255,0.55);
                    margin-bottom: 32px; display: flex; align-items: center;
                    justify-content: center; gap: 8px;
                }
                .pricing-trial-banner i { color: #00D4AA; }
                .pricing-trial-banner strong { color: rgba(255,255,255,0.85); }

                .pricing-plans-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 20px;
                    margin-bottom: 40px;
                }

                .pricing-plan-card {
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 18px; padding: 28px 24px; position: relative;
                    display: flex; flex-direction: column;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .pricing-plan-card:hover { border-color: rgba(255,255,255,0.16); }
                .pricing-plan-card.highlighted {
                    border-color: #00D4AA;
                    background: rgba(0,212,170,0.05);
                    box-shadow: 0 0 40px rgba(0,212,170,0.08);
                }
                .pricing-plan-card.current { border-color: #FFB800; }

                .pricing-plan-badge {
                    position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
                    border-radius: 20px; padding: 3px 14px; font-size: 11px;
                    font-weight: 700; color: #000; white-space: nowrap;
                }
                .pricing-current-chip {
                    position: absolute; top: -12px; right: 16px;
                    background: #FFB800; border-radius: 20px; padding: 3px 10px;
                    font-size: 11px; font-weight: 700; color: #000;
                }

                .pricing-plan-label { font-size: 20px; font-weight: 800; margin-bottom: 6px; margin-top: 8px; }
                .pricing-plan-desc { font-size: 13px; color: rgba(255,255,255,0.5); margin: 0 0 20px; }

                .pricing-plan-price { margin-bottom: 20px; }
                .ppp-amount { font-size: 38px; font-weight: 800; }
                .ppp-period { font-size: 15px; color: rgba(255,255,255,0.45); margin-left: 2px; }
                .ppp-billed { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px; }

                .pricing-cta-btn {
                    width: 100%; padding: 13px; border-radius: 10px; border: none;
                    font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s;
                    margin-bottom: 24px;
                }
                .pricing-cta-btn.primary {
                    background: linear-gradient(135deg, #00D4AA, #00A878); color: #000;
                }
                .pricing-cta-btn.primary:hover { filter: brightness(1.08); }
                .pricing-cta-btn.secondary {
                    background: rgba(255,255,255,0.1); color: #fff;
                    border: 1px solid rgba(255,255,255,0.18);
                }
                .pricing-cta-btn.secondary:hover { background: rgba(255,255,255,0.16); }
                .pricing-cta-btn.ghost {
                    background: transparent; color: rgba(255,255,255,0.55);
                    border: 1px solid rgba(255,255,255,0.12);
                }
                .pricing-cta-btn.ghost:hover { border-color: rgba(255,255,255,0.25); color: rgba(255,255,255,0.8); }
                .pricing-cta-btn:disabled { opacity: 0.6; cursor: not-allowed; }

                .pricing-feature-list { list-style: none; padding: 0; margin: 0; }
                .pricing-feature-list li {
                    font-size: 13px; color: rgba(255,255,255,0.7);
                    padding: 6px 0; display: flex; align-items: flex-start; gap: 9px;
                    border-bottom: 1px solid rgba(255,255,255,0.04);
                }
                .pricing-feature-list li:last-child { border-bottom: none; }
                .pricing-feature-list li i { flex-shrink: 0; margin-top: 2px; font-size: 11px; }
                .pricing-feature-list li i.fa-check { color: #00D4AA; }
                .pricing-feature-list li i.fa-times { color: rgba(255,255,255,0.2); }
                .pricing-feature-list li.excluded { color: rgba(255,255,255,0.3); }

                .pricing-error {
                    text-align: center; color: #FF6B6B; font-size: 13px;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                    margin-bottom: 24px;
                }

                .pricing-social-proof {
                    display: flex; justify-content: center; align-items: center;
                    gap: 32px; padding: 28px; margin-bottom: 40px;
                    background: rgba(255,255,255,0.03); border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.06);
                }
                .sp-stat { text-align: center; }
                .sp-stat span { display: block; font-size: 24px; font-weight: 800; color: #fff; }
                .sp-stat label { font-size: 12px; color: rgba(255,255,255,0.4); }
                .sp-divider { width: 1px; height: 40px; background: rgba(255,255,255,0.08); }

                .pricing-faq { max-width: 680px; margin: 0 auto 48px; }
                .pricing-faq h3 { font-size: 22px; font-weight: 700; text-align: center; margin-bottom: 24px; }
                .faq-item {
                    border-bottom: 1px solid rgba(255,255,255,0.07);
                }
                .faq-question {
                    width: 100%; background: none; border: none; color: #fff;
                    font-size: 14px; font-weight: 600; cursor: pointer;
                    padding: 16px 0; display: flex; justify-content: space-between;
                    align-items: center; gap: 12px; text-align: left;
                }
                .faq-question i { color: rgba(255,255,255,0.4); font-size: 12px; flex-shrink: 0; }
                .faq-answer {
                    font-size: 13px; color: rgba(255,255,255,0.55);
                    padding: 0 0 16px; line-height: 1.6;
                }

                .pricing-trust-footer {
                    text-align: center; font-size: 12px; color: rgba(255,255,255,0.3);
                    display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px;
                }
                .pricing-trust-footer i { color: rgba(255,255,255,0.4); }
            `}</style>
        </div>
    );
};

const pricingRoot = document.getElementById('pricing-page-root');
if (pricingRoot) {
    const root = ReactDOM.createRoot(pricingRoot);
    root.render(<PricingPage />);
}

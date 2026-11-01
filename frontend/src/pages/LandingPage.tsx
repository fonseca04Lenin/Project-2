import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { firebase, firebaseAuth } from '../lib/firebase';
import { serverLogin, serverRegister, serverSetUsername } from '../lib/auth';

interface AuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: string;
    onModeChange: (mode: string) => void;
}

function LandingHeader() {
    return (
        <header className="landing-header">
            <div className="landing-header-container">
                <div className="landing-header-left">
                    <div className="landing-brand">
                        <i className="fas fa-chart-line landing-brand-icon"></i>
                        <span className="landing-brand-text">AI Stock Sage</span>
                    </div>
                </div>

                <div className="landing-header-right">
                    <nav className="landing-nav" style={{ display: 'none' }}>
                        <a href="#features" className="landing-nav-link">Features</a>
                        <a href="#platform" className="landing-nav-link">Platform</a>
                        <a href="#performance" className="landing-nav-link">Performance</a>
                        <a href="#access" className="landing-nav-link">Access</a>
                    </nav>
                </div>
            </div>
        </header>
    );
}

function AuthDialog({ open, onOpenChange, mode, onModeChange }: AuthDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({ name: '', email: '', password: '' });

    useEffect(() => {
        if (open) {
            setError('');
            setFormData({ name: '', email: '', password: '' });
        }
    }, [open, mode]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.currentTarget;
        setFormData((prev) => ({ ...prev, [name]: value }));
        setError('');
    };

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setError('');

        try {
            if (!firebaseAuth) throw new Error('Firebase authentication not available. Please refresh the page.');

            const provider = new firebase.auth.GoogleAuthProvider();
            provider.addScope('email');
            provider.addScope('profile');

            const result = await firebaseAuth.signInWithPopup(provider);
            const user = result.user;
            if (!user) throw new Error('Google sign-in returned no user.');

            const idToken = await user.getIdToken();
            const login = await serverLogin(idToken, true);
            if (!login.ok) throw new Error(login.error || 'Google sign-in failed');

            if (login.needsUsername) {
                showUsernameDialog(login.user, idToken);
                return;
            }

            onOpenChange(false);
        } catch (err: any) {
            console.error('Google sign-in error:', err);
            let errorMessage = err.message || 'Google sign-in failed';
            if (err.code === 'auth/popup-closed-by-user') errorMessage = 'Sign-in was cancelled. Please try again.';
            else if (err.code === 'auth/popup-blocked') errorMessage = 'Popup was blocked. Please allow popups and try again.';
            else if (err.code === 'auth/account-exists-with-different-credential')
                errorMessage = 'An account already exists with this email using a different sign-in method.';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const showUsernameDialog = (user: any, idToken: string) => {
        const username = prompt(`Welcome ${user?.name ?? ''}! Please choose a username (3-20 characters):`);
        if (!username) { setError('Username is required to complete sign-up'); return; }
        if (username.length < 3) { setError('Username must be at least 3 characters long'); return; }
        if (username.length > 20) { setError('Username must be less than 20 characters'); return; }
        setUsernameForGoogleUser(idToken, username);
    };

    const setUsernameForGoogleUser = async (idToken: string, username: string) => {
        setIsLoading(true);
        setError('');
        try {
            const res = await serverSetUsername(idToken, username);
            if (!res.ok) throw new Error(res.error || 'Failed to set username');
            onOpenChange(false);
        } catch (err: any) {
            console.error('Set username error:', err);
            setError(err.message || 'Failed to set username. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            if (!firebaseAuth) throw new Error('Firebase authentication not available. Please refresh the page.');

            if (mode === 'signup') {
                if (!formData.name.trim()) throw new Error('Please enter your full name');
                if (!formData.email.trim()) throw new Error('Please enter your email address');
                if (formData.password.length < 6) throw new Error('Password must be at least 6 characters long');

                const userCredential = await firebaseAuth.createUserWithEmailAndPassword(formData.email, formData.password);
                await userCredential.user?.updateProfile({ displayName: formData.name });
                const idToken = await userCredential.user!.getIdToken();

                const reg = await serverRegister(formData.name, formData.email, idToken);
                if (!reg.ok) throw new Error(reg.error || 'Registration failed');

                onOpenChange(false);
                setFormData({ name: '', email: '', password: '' });
                setError('');
            } else {
                if (!formData.email.trim()) throw new Error('Please enter your email address');
                if (!formData.password.trim()) throw new Error('Please enter your password');

                let userCredential;
                try {
                    userCredential = await firebaseAuth.signInWithEmailAndPassword(formData.email, formData.password);
                } catch (authError: any) {
                    if (authError.code === 'auth/invalid-login-credentials')
                        throw new Error("Invalid email or password. If you signed up with Google, please use the 'Continue with Google' button.");
                    if (authError.code === 'auth/user-not-found')
                        throw new Error('No account found with this email. Please create an account first.');
                    if (authError.code === 'auth/wrong-password') throw new Error('Incorrect password. Please try again.');
                    if (authError.code === 'auth/invalid-email') throw new Error('Please enter a valid email address.');
                    throw new Error(`Authentication failed: ${authError.message}`);
                }

                const idToken = await userCredential.user!.getIdToken();
                const login = await serverLogin(idToken, false);
                if (!login.ok) throw new Error(login.error || 'Login failed');

                onOpenChange(false);
                setFormData({ name: '', email: '', password: '' });
                setError('');
            }
        } catch (err: any) {
            console.error('Auth error:', err);
            let errorMessage = err.message || 'Authentication failed';
            if (err.code === 'auth/email-already-in-use') errorMessage = 'This email is already registered. Please sign in instead.';
            else if (err.code === 'auth/weak-password') errorMessage = 'Password is too weak. Please choose a stronger password.';
            else if (err.code === 'auth/invalid-email') errorMessage = 'Please enter a valid email address.';
            else if (err.code === 'auth/user-not-found') errorMessage = 'No account found with this email. Please create an account.';
            else if (err.code === 'auth/wrong-password') errorMessage = 'Incorrect password. Please try again.';
            else if (err.code === 'auth/too-many-requests') errorMessage = 'Too many failed attempts. Please try again later.';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div className="auth-dialog-overlay" onClick={() => onOpenChange(false)}>
            <div className="auth-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="auth-dialog-header">
                    <h2>{mode === 'signup' ? 'Create Account' : 'Sign In'}</h2>
                    <button className="auth-dialog-close" onClick={() => onOpenChange(false)} aria-label="Close">×</button>
                </div>

                <div className="auth-dialog-tabs">
                    <button className={`auth-tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => onModeChange('signin')}>Sign In</button>
                    <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => onModeChange('signup')}>Create Account</button>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {mode === 'signup' && (
                        <div className="auth-field">
                            <label htmlFor="name">Full Name</label>
                            <input type="text" id="name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Enter your full name" required />
                        </div>
                    )}

                    <div className="auth-field">
                        <label htmlFor="email">Email Address</label>
                        <input type="email" id="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="Enter your email" required />
                    </div>

                    <div className="auth-field">
                        <label htmlFor="password">Password</label>
                        <input type="password" id="password" name="password" value={formData.password} onChange={handleInputChange} placeholder="Enter your password" required minLength={6} />
                        <div className="auth-field-footer">
                            <a href="#forgot" className="forgot-password-link">Forgot Password?</a>
                        </div>
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <button type="submit" className="auth-submit-btn" disabled={isLoading}>
                        {isLoading ? (
                            <div className="auth-spinner">
                                <div className="spinner"></div>
                                {mode === 'signup' ? 'Creating Account...' : 'Signing In...'}
                            </div>
                        ) : (
                            mode === 'signup' ? 'Create Account' : 'Sign In'
                        )}
                    </button>

                    <div className="auth-divider"><span className="auth-divider-text">or</span></div>

                    <button type="button" className="auth-google-btn" onClick={handleGoogleSignIn} disabled={isLoading}>
                        <svg className="auth-google-icon" viewBox="0 0 24 24" width="20" height="20">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                    </button>
                </form>
            </div>
        </div>
    );
}

function HeroSection() {
    const [authOpen, setAuthOpen] = useState(false);
    const [authMode, setAuthMode] = useState('signup');
    const navigate = useNavigate();

    const handleAuthClick = (mode: string) => {
        setAuthMode(mode);
        setAuthOpen(true);
    };

    return (
        <>
            <section className="stock-watchlist-hero">
                <div className="stock-watchlist-container">
                    <h1 className="stock-watchlist-title">AI Stock Sage</h1>

                    <p className="stock-watchlist-subtitle">AI-POWERED STOCK RESEARCH & GUIDANCE</p>

                    <p className="stock-watchlist-description">
                        Stop guessing. Start researching. AI Stock Sage gives you{' '}
                        <span className="stock-watchlist-highlight">institutional-grade analysis</span> on any
                        stock — earnings breakdowns, risk factors, investment theses, and plain-language
                        guidance — all powered by AI and delivered in seconds.
                    </p>

                    <div className="stock-watchlist-actions">
                        <button onClick={() => handleAuthClick('signup')} className="stock-watchlist-btn stock-watchlist-btn-primary">Get Started</button>
                        <button onClick={() => handleAuthClick('signin')} className="stock-watchlist-btn stock-watchlist-btn-secondary">Sign In</button>
                        <button
                            onClick={() => {
                                try { sessionStorage.setItem('guestMode', '1'); } catch { /* ignore */ }
                                navigate('/app/overview');
                            }}
                            className="stock-watchlist-btn stock-watchlist-btn-ghost"
                        >
                            Continue as Guest
                        </button>
                    </div>
                </div>
            </section>

            <AuthDialog open={authOpen} onOpenChange={setAuthOpen} mode={authMode} onModeChange={setAuthMode} />
        </>
    );
}

function AIUsageSection() {
    const features = [
        { number: '01', title: 'AI Research Reports', desc: "Get a full breakdown of any stock — fundamentals, catalysts, risks — written by AI in plain language." },
        { number: '02', title: 'Investment Thesis Guidance', desc: 'Tell the AI your thesis. It stress-tests it, finds the gaps, and tells you what the data actually supports.' },
        { number: '03', title: 'Earnings Intelligence', desc: "AI reads every earnings report so you don't have to — surfacing what moved the stock and what to watch next." },
        { number: '04', title: 'Ask the AI Anything', desc: 'A research assistant that knows the market. Ask about any stock, sector, or macro trend and get a sourced answer.' },
    ];

    return (
        <section className="ai-section">
            <div className="ai-section-inner">
                <div className="ai-section-left">
                    <span className="ai-section-eyebrow">Research Suite</span>
                    <h2 className="ai-section-headline">
                        Research smarter.<br />Decide with confidence.
                    </h2>
                    <p className="ai-section-aside">
                        Every feature is built around one goal: giving you a clear, well-researched answer before you commit.
                    </p>
                </div>
                <div className="ai-section-right">
                    {features.map((f, i) => (
                        <div className="ai-feature-row" key={i}>
                            <span className="ai-feature-num">{f.number}</span>
                            <div className="ai-feature-body">
                                <span className="ai-feature-title">{f.title}</span>
                                <span className="ai-feature-desc">{f.desc}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default function LandingPage() {
    return (
        <div className="stock-watchlist-landing">
            <LandingHeader />
            <HeroSection />
            <AIUsageSection />
        </div>
    );
}

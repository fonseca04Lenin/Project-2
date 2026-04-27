export {};
const { useState, useEffect } = React;

function navigateApp(path: string, state: Record<string, unknown> = {}, replace = false) {
  window.dispatchEvent(new CustomEvent('app:navigate', {
    detail: { path, state, replace }
  }));
}

function getAuthClient() {
  return window.AppAuth?.getClient ? window.AppAuth.getClient() : null;
}

function emitAuthenticatedUser() {
  const user = window.AppAuth?.getCurrentUser ? window.AppAuth.getCurrentUser() : null;
  if (!user) return;
  window.dispatchEvent(new CustomEvent('userAuthenticated', {
    detail: { user }
  }));
}

// Header Component
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
          <nav className="landing-nav">
            <a href="#approach" className="landing-nav-link">Approach</a>
            <a href="#features" className="landing-nav-link">Platform</a>
            <a href="#discipline" className="landing-nav-link">Discipline</a>
          </nav>
        </div>
      </div>
    </header>
  );
}

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: string;
  onModeChange: (mode: string) => void;
}

// Auth Dialog Component
function AuthDialog({ open, onOpenChange, mode, onModeChange }: AuthDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  });

  useEffect(() => {
    if (open) {
      setError("");
      setFormData({ name: "", email: "", password: "" });
    }
  }, [open, mode]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError("");
  };

  // Determine backend URL based on environment
  const getBackendUrl = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    } else {
      return 'https://web-production-2e2e.up.railway.app';
    }
  };

  // Google Sign-In handler
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");

    try {
      const authClient = getAuthClient() as any;
      if (!authClient) {
        throw new Error("Firebase authentication not available. Please refresh the page.");
      }

      // Create Google provider
      const provider = new (window as any).firebase.auth.GoogleAuthProvider();

      // Add scopes if needed
      provider.addScope('email');
      provider.addScope('profile');

      // Sign in with Google
      const result = await authClient.signInWithPopup(provider);
      const user = result.user;

      // Get ID token and send to backend
      const idToken = await user.getIdToken();

      const response = await fetch(`${getBackendUrl()}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          idToken: idToken,
          isGoogleSignIn: true
        })
      });

      const result_data = await response.json();

      if (!response.ok) {
        throw new Error(result_data.error || 'Google sign-in failed');
      }

      // Check if username is required for new Google users
      if (result_data.needsUsername) {
        // Show username collection dialog
        showUsernameDialog(result_data.user, idToken);
        return;
      }

      // Success - close dialog and trigger main app authentication
      onOpenChange(false);

      // Trigger main app authentication state change
      setTimeout(() => {
        emitAuthenticatedUser();
      }, 100);

    } catch (error: any) {
      console.error('Google sign-in error:', error);

      let errorMessage = error.message || 'Google sign-in failed';

      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in was cancelled. Please try again.';
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = 'Popup was blocked. Please allow popups and try again.';
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = 'An account already exists with this email using a different sign-in method.';
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Username collection dialog for Google users
  const showUsernameDialog = (user: any, idToken: string) => {
    const username = prompt(`Welcome ${user.name}! Please choose a username (3-20 characters):`);

    if (!username) {
      setError('Username is required to complete sign-up');
      return;
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters long');
      return;
    }

    if (username.length > 20) {
      setError('Username must be less than 20 characters');
      return;
    }

    // Set username via API
    setUsernameForGoogleUser(idToken, username);
  };

  const setUsernameForGoogleUser = async (idToken: string, username: string) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${getBackendUrl()}/api/auth/set-username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          idToken: idToken,
          username: username
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to set username');
      }

      // Success - close dialog and trigger main app authentication
      onOpenChange(false);

      // Trigger main app authentication state change
      setTimeout(() => {
        emitAuthenticatedUser();
      }, 100);

    } catch (error: any) {
      console.error('Set username error:', error);
      setError(error.message || 'Failed to set username. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const authClient = getAuthClient() as any;
      if (!authClient) {
        throw new Error("Firebase authentication not available. Please refresh the page.");
      }

      if (mode === "signup") {
        // Validate form data
        if (!formData.name.trim()) {
          throw new Error("Please enter your full name");
        }
        if (!formData.email.trim()) {
          throw new Error("Please enter your email address");
        }
        if (formData.password.length < 6) {
          throw new Error("Password must be at least 6 characters long");
        }

        // Create user with Firebase Auth
        const userCredential = await authClient.createUserWithEmailAndPassword(
          formData.email,
          formData.password
        );

        // Update display name
        await userCredential.user.updateProfile({
          displayName: formData.name
        });

        // Get ID token and send to backend
        const idToken = await userCredential.user.getIdToken();

        const response = await fetch(`${getBackendUrl()}/api/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            idToken: idToken
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Registration failed');
        }

        // Success - close dialog and trigger main app authentication
        onOpenChange(false);

        // Clear form
        setFormData({ name: '', email: '', password: '' });
        setError('');

        // Trigger main app authentication state change
        setTimeout(() => {
          emitAuthenticatedUser();
        }, 100);

      } else {
        // Validate form data
        if (!formData.email.trim()) {
          throw new Error("Please enter your email address");
        }
        if (!formData.password.trim()) {
          throw new Error("Please enter your password");
        }

        // Sign in with Firebase Auth
        let userCredential: any;
        try {
          userCredential = await authClient.signInWithEmailAndPassword(
            formData.email,
            formData.password
          );
        } catch (authError: any) {
          // Handle specific Firebase auth errors
          if (authError.code === 'auth/invalid-login-credentials') {
            throw new Error("Invalid email or password. If you signed up with Google, please use the 'Continue with Google' button.");
          } else if (authError.code === 'auth/user-not-found') {
            throw new Error("No account found with this email. Please create an account first.");
          } else if (authError.code === 'auth/wrong-password') {
            throw new Error("Incorrect password. Please try again.");
          } else if (authError.code === 'auth/invalid-email') {
            throw new Error("Please enter a valid email address.");
          } else {
            throw new Error(`Authentication failed: ${authError.message}`);
          }
        }

        // Get ID token and send to backend
        const idToken = await userCredential.user.getIdToken();

        const response = await fetch(`${getBackendUrl()}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            idToken: idToken
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Login failed');
        }

        // Success - close dialog and trigger main app authentication
        onOpenChange(false);

        // Clear form
        setFormData({ name: '', email: '', password: '' });
        setError('');

        // Trigger main app authentication state change
        setTimeout(() => {
          emitAuthenticatedUser();
        }, 100);
      }
    } catch (error: any) {
      console.error('Auth error:', error);

      // Handle specific Firebase errors
      let errorMessage = error.message || 'Authentication failed';

      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please sign in instead.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please choose a stronger password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email. Please create an account.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }

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
          <h2>{mode === "signup" ? "Create Account" : "Sign In"}</h2>
          <button
            className="auth-dialog-close"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="auth-dialog-tabs">
          <button
            className={`auth-tab ${mode === "signin" ? "active" : ""}`}
            onClick={() => onModeChange("signin")}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => onModeChange("signup")}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "signup" && (
            <div className="auth-field">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              required
              minLength={6}
            />
            <div className="auth-field-footer">
              <a href="#forgot" className="forgot-password-link">Forgot Password?</a>
            </div>
          </div>

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="auth-spinner">
                <div className="spinner"></div>
                {mode === "signup" ? "Creating Account..." : "Signing In..."}
              </div>
            ) : (
              mode === "signup" ? "Create Account" : "Sign In"
            )}
          </button>

          <div className="auth-divider">
            <span className="auth-divider-text">or</span>
          </div>

          <button
            type="button"
            className="auth-google-btn"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <svg className="auth-google-icon" viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}

// Hero Section Component
function HeroSection() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signup");

  const handleAuthClick = (mode: string) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <>
      <section className="stock-watchlist-hero prestige-hero" id="approach">
        <div className="stock-watchlist-container prestige-shell">
          <div className="prestige-hero-grid">
            <div className="prestige-copy">
              <p className="prestige-kicker">AI Stock Sage</p>
              <h1 className="stock-watchlist-title prestige-title">
                A more disciplined way
                <br />
                to follow quality businesses.
              </h1>

              <p className="stock-watchlist-description prestige-description">
                AI Stock Sage is a research-led watchlist for retail investors who prefer judgment over noise.
                Keep a focused list of names, review the market around them, and use AI to accelerate first-pass research
                without turning the product into a casino.
              </p>

              <div className="prestige-actions">
                <button
                  onClick={() => handleAuthClick("signup")}
                  className="stock-watchlist-btn stock-watchlist-btn-primary prestige-btn-primary"
                >
                  Open Your Watchlist
                </button>
                <button
                  onClick={() => handleAuthClick("signin")}
                  className="stock-watchlist-btn stock-watchlist-btn-secondary prestige-btn-secondary"
                >
                  Sign In
                </button>
              </div>

              <div className="prestige-footnote">
                Built for investors who want research, context, and continuity around the stocks they follow.
              </div>
            </div>

            <aside className="prestige-panel">
              <div className="prestige-panel-topline">Research brief</div>
              <div className="prestige-panel-rule"></div>
              <div className="prestige-panel-block">
                <span className="prestige-panel-label">Core use case</span>
                <p>Maintain a deliberate watchlist and revisit each position with current market context, notes, and AI-assisted analysis.</p>
              </div>
              <div className="prestige-panel-block">
                <span className="prestige-panel-label">Primary tools</span>
                <ul className="prestige-panel-list">
                  <li>Persistent watchlist</li>
                  <li>Morning brief and thesis builder</li>
                  <li>News, catalysts, and price tracking</li>
                </ul>
              </div>
              <div className="prestige-panel-meta">
                <div>
                  <span className="prestige-meta-value">01</span>
                  <span className="prestige-meta-label">watchlist first</span>
                </div>
                <div>
                  <span className="prestige-meta-value">02</span>
                  <span className="prestige-meta-label">research before action</span>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        mode={authMode}
        onModeChange={setAuthMode}
      />
    </>
  );
}

// AI Usage Section Component
function AIUsageSection() {
  const features = [
    {
      number: "01",
      title: "A watchlist with memory",
      desc: "Keep the companies you follow in one place, along with the notes, price levels, and context that make them worth revisiting."
    },
    {
      number: "02",
      title: "AI as a research assistant",
      desc: "Use briefs, thesis drafts, and direct prompts to accelerate your reading, not to outsource your conviction."
    },
    {
      number: "03",
      title: "Market context without clutter",
      desc: "Review news, movers, and surrounding market conditions without scattering your process across disconnected tools."
    },
    {
      number: "04",
      title: "Simulation kept in its place",
      desc: "Paper trading remains available as a secondary tool, after the research work has already been done."
    }
  ];

  return (
    <section className="ai-section" id="features">
      <div className="ai-section-inner">
        <div className="ai-section-left">
          <span className="ai-section-eyebrow">The Platform</span>
          <h2 className="ai-section-headline">
            The platform is organized
            <br />
            around investor discipline.
          </h2>
          <p className="ai-section-aside">
            The strongest investing tools make it easier to return to the same names with better context, better notes, and less distraction.
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

function FeaturePrioritySection() {
  const cards = [
    {
      title: "Fewer gimmicks, more continuity",
      body: "The watchlist is the center of gravity. The rest of the product exists to deepen the quality of attention around it."
    },
    {
      title: "AI in a supporting role",
      body: "The AI layer speeds up reading and synthesis, but the product still signals seriousness rather than prediction theater."
    },
    {
      title: "A calmer information surface",
      body: "Context arrives in a measured way: market news, price movement, and research tools are present without shouting over one another."
    },
    {
      title: "Built for repeat use",
      body: "The design is meant to feel reliable over time, closer to a private research desk than a hype-driven finance app."
    }
  ];

  return (
    <section className="priority-section" id="discipline">
      <div className="priority-shell">
        <div className="priority-intro">
          <span className="priority-eyebrow">Design Principle</span>
          <h2 className="priority-title">Prestige comes from restraint.</h2>
          <p className="priority-copy">
            The public face of the product should suggest patience, judgment, and continuity. That means cleaner language, quieter layout decisions, and a product story centered on research rather than stimulation.
          </p>
        </div>
        <div className="priority-grid">
          {cards.map((card) => (
            <article className="priority-card" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// Main Landing Page Component
function StockWatchlistLandingPage() {
  return (
    <div className="stock-watchlist-landing">
      <LandingHeader />
      <HeroSection />
      <AIUsageSection />
      <FeaturePrioritySection />
    </div>
  );
}

window.StockWatchlistLandingPage = StockWatchlistLandingPage;

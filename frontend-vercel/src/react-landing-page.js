"use strict";

const { useState, useEffect } = React;

// Header Component
function LandingHeader() {
  return (
    <header className="landing-header">
      <div className="landing-header-container">
        <div className="landing-header-left">
          <div className="landing-brand">
            <i className="fas fa-chart-line landing-brand-icon"></i>
            <span className="landing-brand-text">Stock Watchlist Pro</span>
          </div>
        </div>
        
        <div className="landing-header-right">
          <nav className="landing-nav">
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

// Auth Dialog Component
function AuthDialog({ open, onOpenChange, mode, onModeChange }) {
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      if (!window.firebaseAuth) {
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
        const userCredential = await window.firebaseAuth.createUserWithEmailAndPassword(
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

        // Success - redirect to main app
        console.log('Registration successful, redirecting...');
        window.location.reload();
        
      } else {
        // Validate form data
        if (!formData.email.trim()) {
          throw new Error("Please enter your email address");
        }
        if (!formData.password.trim()) {
          throw new Error("Please enter your password");
        }

        // Sign in with Firebase Auth
        const userCredential = await window.firebaseAuth.signInWithEmailAndPassword(
          formData.email,
          formData.password
        );

        // Get ID token and send to backend
        const idToken = await userCredential.user.getIdToken();
        
        const response = await fetch(`${getBackendUrl()}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idToken: idToken
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Login failed');
        }

        // Success - redirect to main app
        console.log('Login successful, redirecting...');
        window.location.reload();
      }
    } catch (error) {
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
              minLength="6"
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
        </form>

        <div className="auth-dialog-footer">
          {mode === "signin" ? (
            <p className="auth-switch-text">
              Don't have an account?{" "}
              <button 
                className="auth-switch-link"
                onClick={() => onModeChange("signup")}
              >
                Sign Up
              </button>
            </p>
          ) : (
            <p className="auth-switch-text">
              Already have an account?{" "}
              <button 
                className="auth-switch-link"
                onClick={() => onModeChange("signin")}
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Hero Section Component
function HeroSection() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signup");

  const handleAuthClick = (mode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <>
      <section className="stock-watchlist-hero">
        <div className="stock-watchlist-container">
          <h1 className="stock-watchlist-title">
            Stock Watchlist Pro
          </h1>

          <p className="stock-watchlist-subtitle">
            THE FUTURE OF MARKET INTELLIGENCE
          </p>

          <p className="stock-watchlist-description">
            A precision-built platform for high-performing traders and investors. Experience{" "}
            <span className="stock-watchlist-highlight">40% faster</span> information retrieval
            with real-time data visualization and a streamlined interface. This is not just another trading app—it's a
            digital command center for the ambitious.
          </p>

          <div className="stock-watchlist-actions">
            <button
              onClick={() => handleAuthClick("signup")}
              className="stock-watchlist-btn stock-watchlist-btn-primary"
            >
              Get Started
            </button>
            <button
              onClick={() => handleAuthClick("signin")}
              className="stock-watchlist-btn stock-watchlist-btn-secondary"
            >
              Sign In
            </button>
          </div>

          <div className="stock-watchlist-footer">
            <p className="stock-watchlist-tagline">
              THE ANTIDOTE TO NOISE
            </p>
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

// Main Landing Page Component
function StockWatchlistLandingPage() {
  return (
    <div className="stock-watchlist-landing">
      <LandingHeader />
      <HeroSection />
    </div>
  );
}

// Render the landing page
const rootElement = document.getElementById('marketpulse-root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<StockWatchlistLandingPage />);
} else {
  console.error('Root element not found');
}
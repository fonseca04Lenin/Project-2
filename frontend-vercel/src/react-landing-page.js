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

  // Google Sign-In handler
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");

    try {
      if (!window.firebaseAuth) {
        throw new Error("Firebase authentication not available. Please refresh the page.");
      }

      // Create Google provider
      const provider = new window.firebase.auth.GoogleAuthProvider();
      
      // Add scopes if needed
      provider.addScope('email');
      provider.addScope('profile');

      // Sign in with Google
      const result = await window.firebaseAuth.signInWithPopup(provider);
      const user = result.user;

      // Get ID token and send to backend
      const idToken = await user.getIdToken();
      
      const response = await fetch(`${getBackendUrl()}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        console.log('🆕 New Google user needs username');
        // Show username collection dialog
        showUsernameDialog(result_data.user, idToken);
        return;
      }

      // Success - close dialog and trigger main app authentication
      console.log('Google sign-in successful, closing dialog...');
      onOpenChange(false);
      
      // Trigger main app authentication state change
      setTimeout(() => {
        if (window.firebaseAuth && window.firebaseAuth.currentUser) {
          console.log('🔄 Triggering main app auth state change for Google sign-in');
          
          // Method 1: Call function directly if available
          if (typeof window.handleAuthStateChange === 'function') {
            window.handleAuthStateChange(window.firebaseAuth.currentUser);
          }
          
          // Method 2: Dispatch custom event
          const authEvent = new CustomEvent('userAuthenticated', {
            detail: { user: window.firebaseAuth.currentUser }
          });
          window.dispatchEvent(authEvent);
          console.log('📡 Dispatched userAuthenticated event');
        }
      }, 100);

    } catch (error) {
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
  const showUsernameDialog = (user, idToken) => {
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

  const setUsernameForGoogleUser = async (idToken, username) => {
    setIsLoading(true);
    setError("");
    
    try {
      const response = await fetch(`${getBackendUrl()}/api/auth/set-username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      console.log('Username set successfully, closing dialog...');
      onOpenChange(false);
      
      // Trigger main app authentication state change
      setTimeout(() => {
        if (window.firebaseAuth && window.firebaseAuth.currentUser) {
          console.log('🔄 Triggering main app auth state change after username set');
          
          // Method 1: Call function directly if available
          if (typeof window.handleAuthStateChange === 'function') {
            window.handleAuthStateChange(window.firebaseAuth.currentUser);
          }
          
          // Method 2: Dispatch custom event
          const authEvent = new CustomEvent('userAuthenticated', {
            detail: { user: window.firebaseAuth.currentUser }
          });
          window.dispatchEvent(authEvent);
          console.log('📡 Dispatched userAuthenticated event');
        }
      }, 100);

    } catch (error) {
      console.error('Set username error:', error);
      setError(error.message || 'Failed to set username. Please try again.');
    } finally {
      setIsLoading(false);
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

        // Success - close dialog and trigger main app authentication
        console.log('Registration successful, closing dialog...');
        onOpenChange(false);
        
        // Clear form
        setFormData({ name: '', email: '', password: '' });
        setError('');
        
        // Trigger main app authentication state change
        setTimeout(() => {
          if (window.firebaseAuth && window.firebaseAuth.currentUser) {
            console.log('🔄 Triggering main app auth state change for registration');
            
            // Method 1: Call function directly if available
            if (typeof window.handleAuthStateChange === 'function') {
              window.handleAuthStateChange(window.firebaseAuth.currentUser);
            }
            
            // Method 2: Dispatch custom event
            const authEvent = new CustomEvent('userAuthenticated', {
              detail: { user: window.firebaseAuth.currentUser }
            });
            window.dispatchEvent(authEvent);
            console.log('📡 Dispatched userAuthenticated event');
          }
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
        let userCredential;
        try {
          userCredential = await window.firebaseAuth.signInWithEmailAndPassword(
            formData.email,
            formData.password
          );
        } catch (authError) {
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
          body: JSON.stringify({
            idToken: idToken
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Login failed');
        }

        // Success - close dialog and trigger main app authentication
        console.log('Login successful, closing dialog...');
        onOpenChange(false);
        
        // Clear form
        setFormData({ name: '', email: '', password: '' });
        setError('');
        
        // Trigger main app authentication state change
        setTimeout(() => {
          if (window.firebaseAuth && window.firebaseAuth.currentUser) {
            console.log('🔄 Triggering main app auth state change for login');
            
            // Method 1: Call function directly if available
            if (typeof window.handleAuthStateChange === 'function') {
              window.handleAuthStateChange(window.firebaseAuth.currentUser);
            }
            
            // Method 2: Dispatch custom event
            const authEvent = new CustomEvent('userAuthenticated', {
              detail: { user: window.firebaseAuth.currentUser }
            });
            window.dispatchEvent(authEvent);
            console.log('📡 Dispatched userAuthenticated event');
          }
        }, 100);
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
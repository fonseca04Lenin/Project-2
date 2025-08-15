import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User } from '../types/user';

interface AuthProps {
  setUser: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ setUser }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useAuth();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await login(formData.username, formData.password);
      } else {
        await register(formData.username, formData.email, formData.password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const toggleForm = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData({ username: '', email: '', password: '' });
  };

  return (
    <div className="center-wrapper">
      <h1 className="app-title" style={{ marginBottom: '0.5rem' }}>
        Stock Watchlist Pro
      </h1>
      <p className="welcome-message" style={{ marginBottom: '2rem' }}>
        Track, analyze, and get alerts for your favorite stocks. Stay updated with real-time news and market intelligence—all in one place.
      </p>
      
      <div className="auth-container">
        <div className="auth-form">
          <h2>{isLogin ? 'Login' : 'Register'}</h2>
          
          {error && (
            <div className="notification error">
              <i className="fas fa-exclamation-circle"></i>
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={formData.username}
              onChange={handleInputChange}
              required
            />
            
            {!isLogin && (
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            )}
            
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleInputChange}
              required
            />
            
            <button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  {isLogin ? 'Logging in...' : 'Registering...'}
                </>
              ) : (
                isLogin ? 'Login' : 'Register'
              )}
            </button>
          </form>
          
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button" 
              onClick={toggleForm}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'var(--primary-color)', 
                textDecoration: 'none', 
                fontWeight: '600', 
                cursor: 'pointer',
                padding: 0,
                font: 'inherit'
              }}
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth; 
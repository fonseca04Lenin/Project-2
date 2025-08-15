import React, { useState, useEffect } from 'react';
import './App.css';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { User } from './types/user';
import { AuthProvider } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/user', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  if (loading) {
    return (
      <div className="loading-state">
        <i className="fas fa-spinner fa-spin"></i>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <AuthProvider>
      <WebSocketProvider>
        <div id="app">
          {user ? <Dashboard user={user} setUser={setUser} /> : <Auth setUser={setUser} />}
        </div>
      </WebSocketProvider>
    </AuthProvider>
  );
}

export default App;

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';

// Import socket.io-client using require to avoid TypeScript issues
const { io } = require('socket.io-client');

interface WebSocketContextType {
  socket: any;
  isConnected: boolean;
  joinUserRoom: (userId: string) => void;
  joinWatchlistUpdates: (userId: string) => void;
  joinMarketUpdates: () => void;
  joinNewsUpdates: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    // Create socket connection
    const newSocket = io('http://localhost:5000', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('🔌 Connected to WebSocket server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Disconnected from WebSocket server');
      setIsConnected(false);
    });

    newSocket.on('connected', (data: any) => {
      console.log('✅ WebSocket connection confirmed:', data);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  const joinUserRoom = useCallback((userId: string) => {
    if (socket && isConnected) {
      socket.emit('join_user_room', { user_id: userId });
      console.log(`👤 Joined user room for: ${userId}`);
    }
  }, [socket, isConnected]);

  const joinWatchlistUpdates = useCallback((userId: string) => {
    if (socket && isConnected) {
      socket.emit('join_watchlist_updates', { user_id: userId });
      console.log(`📊 Joined watchlist updates for: ${userId}`);
    }
  }, [socket, isConnected]);

  const joinMarketUpdates = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('join_market_updates');
      console.log('📈 Joined market updates');
    }
  }, [socket, isConnected]);

  const joinNewsUpdates = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('join_news_updates');
      console.log('📰 Joined news updates');
    }
  }, [socket, isConnected]);

  // Auto-join rooms when user is authenticated
  useEffect(() => {
    if (user && socket && isConnected) {
      joinUserRoom(user.id);
      joinWatchlistUpdates(user.id);
      joinMarketUpdates();
      joinNewsUpdates();
    }
  }, [user, socket, isConnected, joinUserRoom, joinWatchlistUpdates, joinMarketUpdates, joinNewsUpdates]);

  const value = {
    socket,
    isConnected,
    joinUserRoom,
    joinWatchlistUpdates,
    joinMarketUpdates,
    joinNewsUpdates,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}; 
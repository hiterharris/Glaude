import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setAccessToken } from '../services/github';

const TOKEN_KEY = 'glaude_github_token';

interface AuthContextValue {
  token: string | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored) {
          setAccessToken(stored);
          setToken(stored);
        }
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, []);

  const login = async (newToken: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    setAccessToken(newToken);
    setToken(newToken);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAccessToken('');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

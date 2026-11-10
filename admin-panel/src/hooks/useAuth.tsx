import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Admin } from '@/types';
import * as authService from '@/services/auth.service';
import { tokenStorage } from '@/services/tokenStorage';

interface AuthContextValue {
  admin: Admin | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProfile() {
    if (!tokenStorage.getAccessToken()) {
      setIsLoading(false);
      return;
    }
    try {
      const profile = await authService.getProfile();
      setAdmin(profile);
    } catch {
      tokenStorage.clear();
      setAdmin(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const { token, refreshToken, admin: loggedInAdmin } = await authService.login(email, password);
    tokenStorage.setTokens(token, refreshToken);
    setAdmin(loggedInAdmin);
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const session = await authService.changePassword(currentPassword, newPassword);
    tokenStorage.setTokens(session.token, session.refreshToken);
    setAdmin(session.admin);
  }

  async function logout() {
    try {
      await authService.logout();
    } finally {
      tokenStorage.clear();
      setAdmin(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{ admin, isLoading, isAuthenticated: !!admin, login, logout, changePassword, refreshProfile: loadProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

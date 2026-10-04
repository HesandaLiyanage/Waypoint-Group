import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  Role,
  SessionUser,
  getSession,
  login as apiLogin,
  loginOutlet as apiLoginOutlet,
  logout as apiLogout,
  pinLogin as apiPinLogin,
  setSessionLostHandler,
} from '../api/http';

interface AuthContextType {
  currentUser: SessionUser | null;
  activeRole: Role | null;
  login: (email: string, password: string) => Promise<void>;
  loginOutlet: (outletId: string, password: string) => Promise<void>;
  pinLogin: (identifier: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Identity comes only from the server: no role switching, no mock users.
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(() => getSession()?.user ?? null);

  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
    return () => setSessionLostHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser((await apiLogin(email, password)).user);
  }, []);
  const loginOutlet = useCallback(async (outletId: string, password: string) => {
    setUser((await apiLoginOutlet(outletId, password)).user);
  }, []);
  const pinLogin = useCallback(async (identifier: string, pin: string) => {
    setUser((await apiPinLogin(identifier, pin)).user);
  }, []);
  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser: user, activeRole: user?.role ?? null, login, loginOutlet, pinLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

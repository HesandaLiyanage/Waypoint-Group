import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '@waypoint/domain';

interface AuthContextType {
  currentUser: User;
  activeRole: UserRole;
  setRole: (role: UserRole) => void;
  token: string;
}

const mockRoleUsers: Record<UserRole, User> = {
  admin: {
    id: 'usr-0001-admin',
    email: 'admin@waypoint.local',
    name: 'Hesanda Liyanage (Admin)',
    role: 'admin',
    phone: '+94 11 234 5678',
    createdAt: new Date().toISOString(),
  },
  dispatcher: {
    id: 'usr-0002-dispatcher',
    email: 'dispatcher@waypoint.local',
    name: 'Kavindu Perera (Dispatcher)',
    role: 'dispatcher',
    phone: '+94 11 234 5679',
    createdAt: new Date().toISOString(),
  },
  field_agent: {
    id: 'usr-0003-field',
    email: 'field@waypoint.local',
    name: 'Nuwan Silva (Field Inspector)',
    role: 'field_agent',
    phone: '+94 77 123 4567',
    createdAt: new Date().toISOString(),
  },
  driver: {
    id: 'usr-0004-driver',
    email: 'driver@waypoint.local',
    name: 'Sunil Fernando (Logistics Driver)',
    role: 'driver',
    phone: '+94 71 987 6543',
    createdAt: new Date().toISOString(),
  },
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeRole, setActiveRole] = useState<UserRole>(() => {
    return (localStorage.getItem('wp_active_role') as UserRole) || 'admin';
  });

  const setRole = (role: UserRole) => {
    setActiveRole(role);
    localStorage.setItem('wp_active_role', role);
  };

  const currentUser = mockRoleUsers[activeRole];
  const token = `wp_token_${activeRole}_${currentUser.id}`;

  return (
    <AuthContext.Provider value={{ currentUser, activeRole, setRole, token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export type UserRole = 'admin' | 'dispatcher' | 'field_agent' | 'driver';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: User;
  expiresAt?: string;
}

// Single HTTP layer for the web app. Every operational screen goes through here:
// failures are thrown, never replaced by fixtures.

const BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';
const SESSION_KEY = 'wp_session';

export type Role = 'dispatcher' | 'loader' | 'driver' | 'store_manager';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  depot?: string | null;
  outlet_id?: string | null;
  vehicle_id?: string | null;
  locale?: string;
}

export interface Session {
  token: string;
  user: SessionUser;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly network = false) {
    super(message);
  }
}

let session: Session | null = readSession();
let onSessionLost: (() => void) | null = null;

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return session;
}

export function setSession(next: Session | null): void {
  session = next;
  try {
    if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

export function setSessionLostHandler(fn: (() => void) | null): void {
  onSessionLost = fn;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail || body.message || body.title || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function refresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
    if (!res.ok || !session) return false;
    const body = await res.json();
    setSession({ token: body.access_token, user: session.user });
    return true;
  } catch {
    return false;
  }
}

export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ApiError('Network unavailable', 0, true);
  }
  if (res.status === 401 && retry && session && !path.startsWith('/auth/')) {
    if (await refresh()) return request<T>(path, init, false);
    setSession(null);
    onSessionLost?.();
  }
  if (!res.ok) throw new ApiError(await parseError(res), res.status);
  return res.json() as Promise<T>;
}

interface AuthResponse {
  access_token: string;
  user: SessionUser;
}

const ROLES: Role[] = ['dispatcher', 'loader', 'driver', 'store_manager'];

function accept(res: AuthResponse): Session {
  if (!ROLES.includes(res.user.role)) throw new ApiError(`Role ${res.user.role} has no workspace`, 403);
  const next = { token: res.access_token, user: res.user };
  setSession(next);
  return next;
}

export async function login(email: string, password: string): Promise<Session> {
  return accept(await request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
}

export async function loginOutlet(outletId: string, password: string): Promise<Session> {
  return accept(await request<AuthResponse>('/auth/login-outlet', { method: 'POST', body: JSON.stringify({ outlet_id: outletId, password }) }));
}

export interface Facilities { depots: string[]; outlets: { outlet_id: string; district: string; brand: string; depot: string }[] }
export const getFacilities = () => request<Facilities>('/auth/facilities');
export const register = (body: { role: string; name: string; work_id: string; station: string; email: string; phone: string; password: string }) =>
  request<{ status: string; detail: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) });

export async function pinLogin(identifier: string, pin: string): Promise<Session> {
  return accept(await request<AuthResponse>('/auth/pin-login', { method: 'POST', body: JSON.stringify({ identifier, pin }) }));
}

export async function logout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' }, false);
  } catch {
    /* the local session is cleared regardless */
  }
  setSession(null);
}

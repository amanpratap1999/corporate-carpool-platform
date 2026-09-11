'use client';

/**
 * Client-side Authentication Manager
 * Real JWT-based auth only — no dev token fallbacks.
 */

const TOKEN_KEY = 'carpool_auth_token';
const USER_KEY = 'carpool_auth_user';

function safeLS(): Storage | null {
  try {
    return typeof window !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return safeLS()?.getItem(TOKEN_KEY) ?? null;
}

export interface StoredUser {
  id: string;
  email: string;
  full_name: string;
  organization_id: string;
  status?: string;
  work_department?: string;
  is_org_admin?: boolean;
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = safeLS()?.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(
  token: string,
  user: StoredUser
): void {
  const ls = safeLS();
  if (!ls) return;
  ls.setItem(TOKEN_KEY, token);
  ls.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredAuth(): void {
  const ls = safeLS();
  if (!ls) return;
  ls.removeItem(TOKEN_KEY);
  ls.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  const token = getStoredToken();
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Returns Authorization header object, or empty object if not authenticated */
export function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** Login with email + password. Returns success + user on success, error string on failure. */
export async function login(
  email: string,
  password: string
): Promise<{
  success: boolean;
  user?: StoredUser;
  error?: string;
}> {
  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      const storedUser: StoredUser = {
        ...data.user,
        is_org_admin: !!data.capabilities?.is_org_admin,
      };
      setStoredAuth(data.token, storedUser);
      return { success: true, user: storedUser };
    }
    return { success: false, error: data.detail || data.title || 'Invalid credentials' };
  } catch {
    return { success: false, error: 'Network error — could not reach server' };
  }
}

/** Activate an invited account using the single-use invitation token + chosen password. */
export async function activate(
  token: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/v1/auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      setStoredAuth(data.token, data.user);
      return { success: true };
    }
    return { success: false, error: data.detail || data.title || 'Activation failed' };
  } catch {
    return { success: false, error: 'Network error — could not reach server' };
  }
}

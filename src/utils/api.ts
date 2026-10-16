const TOKEN_STORAGE_KEY = 'aviator_session_token';

/**
 * Resolves the authoritative API Base URL:
 * 1. Checks VITE_API_BASE_URL environment variable.
 * 2. If running on a live website (e.g. *.run.app, *.workers.dev, *.pages.dev, custom domain)
 *    and VITE_API_BASE_URL contains 'localhost' or '127.0.0.1', discards the localhost address
 *    to prevent ERR_CONNECTION_REFUSED / Mixed Content blocking in production visitors' browsers.
 * 3. Enforces HTTPS if the client is on HTTPS and VITE_API_BASE_URL starts with http://.
 */
export function getApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return '';

  if (typeof window !== 'undefined' && window.location) {
    const isClientLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]';

    const isConfigLocal =
      configured.includes('localhost') ||
      configured.includes('127.0.0.1') ||
      configured.includes('[::1]');

    // If live production site is loaded, never call a local machine address
    if (!isClientLocal && isConfigLocal) {
      return '';
    }

    // Prevent mixed content blocking: upgrade http to https if current site is https
    if (window.location.protocol === 'https:' && configured.startsWith('http://') && !isConfigLocal) {
      return configured.replace(/^http:\/\//i, 'https://');
    }
  }

  return configured;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const baseUrl = getApiBaseUrl();
  const url = baseUrl && input.startsWith('/') ? `${baseUrl}${input}` : input;

  return fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });
}

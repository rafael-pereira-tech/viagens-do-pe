import type { Env } from '../../env';
import { LATAM_API_HOST, LATAM_SESSION_PATH } from './constants';
import type { LatamSession, LatamTokenResponse } from './types';

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

export function isDryRun(env: Env): boolean {
  return truthy(env.LATAM_DRY_RUN);
}

/** Locked BE-5 secrets. Both must be present for live collection. Not `LATAM_LOGIN` / `LATAM_PASSWORD`. */
export function hasLatamCredentials(env: Env): boolean {
  return Boolean(env.LATAM_PASS_LOGIN?.trim() && env.LATAM_PASS_PASSWORD);
}

export function isLiveEnabled(env: Env): boolean {
  return hasLatamCredentials(env);
}

export function apiHost(env: Env): string {
  if (env.LATAM_API_HOST?.trim()) return env.LATAM_API_HOST.replace(/\/$/, '');
  return LATAM_API_HOST;
}

export function sessionPath(env: Env): string {
  if (env.LATAM_LOGIN_PATH?.trim()) {
    const path = env.LATAM_LOGIN_PATH.trim();
    return path.startsWith('/') ? path : `/${path}`;
  }
  return LATAM_SESSION_PATH;
}

function readToken(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as LatamTokenResponse;
  const candidates = [body.token, body.accessToken, body.access_token];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (body.data && typeof body.data === 'object') {
    const nested = readToken(body.data);
    if (nested) return nested;
  }
  return null;
}

function cookieFromResponse(response: Response): string | undefined {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    const parts = getSetCookie
      .call(response.headers)
      .map((row) => row.split(';')[0]?.trim())
      .filter((part): part is string => Boolean(part));
    if (parts.length > 0) return parts.join('; ');
  }
  const single = response.headers.get('set-cookie');
  if (!single) return undefined;
  return single.split(';')[0]?.trim() || undefined;
}

interface SessionDeps {
  fetch: typeof fetch;
  headers: Headers;
}

/**
 * Member JWT/session via frozen `LATAM_PASS_LOGIN` / `LATAM_PASS_PASSWORD`.
 * Captcha/WAF may block password login — `LATAM_DRY_RUN=1` is the accepted
 * path until live credentials are provided privately.
 */
export async function resolveSession(env: Env, deps: SessionDeps): Promise<LatamSession | { error: string }> {
  const login = env.LATAM_PASS_LOGIN?.trim();
  const password = env.LATAM_PASS_PASSWORD;
  if (!login || !password) {
    return {
      error:
        'LATAM Pass collector is not configured. Set LATAM_PASS_LOGIN and LATAM_PASS_PASSWORD, or LATAM_DRY_RUN=1.',
    };
  }

  const session: LatamSession = {};

  const url = `${apiHost(env)}${sessionPath(env)}`;
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: 'POST',
      headers: (() => {
        const headers = new Headers(deps.headers);
        headers.set('Content-Type', 'application/json');
        return headers;
      })(),
      body: JSON.stringify({
        email: login,
        username: login,
        password,
        grantType: 'password',
      }),
    });
  } catch (err) {
    return { error: `LATAM login network error: ${err instanceof Error ? err.message : String(err)}` };
  }

  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    return { error: `LATAM login ${response.status} (auth_failed)` };
  }
  if (!response.ok) {
    return { error: `LATAM login ${response.status}: ${text.slice(0, 240)}` };
  }

  const cookie = cookieFromResponse(response);
  if (cookie) session.cookie = cookie;

  if (!text.trim()) {
    if (session.cookie) return session;
    return { error: 'LATAM login JSON missing access token' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (session.cookie) return session;
    return { error: 'LATAM login returned non-JSON' };
  }
  const token = readToken(payload);
  if (token) session.accessToken = token;
  if (!session.accessToken && !session.cookie) {
    return { error: 'LATAM login JSON missing access token' };
  }
  return session;
}

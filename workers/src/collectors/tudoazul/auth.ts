import type { Env } from '../../env';
import { AZUL_API_HOST, AZUL_TOKEN_PATH } from './constants';
import type { AzulSession, AzulTokenResponse } from './types';

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

export function isDryRun(env: Env): boolean {
  return truthy(env.TUDOAZUL_DRY_RUN);
}

/** Locked BE-4 secrets. Both must be present for live collection. */
export function hasTudoAzulCredentials(env: Env): boolean {
  return Boolean(env.TUDOAZUL_LOGIN?.trim() && env.TUDOAZUL_PASSWORD);
}

export function isLiveEnabled(env: Env): boolean {
  return hasTudoAzulCredentials(env);
}

export function apiHost(env: Env): string {
  if (env.AZUL_API_HOST?.trim()) return env.AZUL_API_HOST.replace(/\/$/, '');
  return AZUL_API_HOST;
}

function readToken(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as AzulTokenResponse;
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

interface TokenDeps {
  fetch: typeof fetch;
  headers: Headers;
}

/**
 * Member JWT via `TUDOAZUL_LOGIN` / `TUDOAZUL_PASSWORD` on the SPA token host.
 * Captcha/WAF may block password login — `TUDOAZUL_DRY_RUN=1` is the accepted
 * path until live credentials are provided privately.
 */
export async function resolveSession(env: Env, deps: TokenDeps): Promise<AzulSession | { error: string }> {
  const login = env.TUDOAZUL_LOGIN?.trim();
  const password = env.TUDOAZUL_PASSWORD;
  if (!login || !password) {
    return { error: 'TudoAzul collector is not configured. Set TUDOAZUL_LOGIN and TUDOAZUL_PASSWORD, or TUDOAZUL_DRY_RUN=1.' };
  }

  const session: AzulSession = {
    subscriptionKey: env.AZUL_SUBSCRIPTION_KEY?.trim() || undefined,
  };

  const url = `${apiHost(env)}${AZUL_TOKEN_PATH}`;
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: 'POST',
      headers: deps.headers,
      body: JSON.stringify({
        login,
        username: login,
        password,
        grantType: 'password',
      }),
    });
  } catch (err) {
    return { error: `TudoAzul login network error: ${err instanceof Error ? err.message : String(err)}` };
  }

  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    return { error: `TudoAzul login ${response.status} (auth_failed)` };
  }
  if (!response.ok) {
    return { error: `TudoAzul login ${response.status}: ${text.slice(0, 240)}` };
  }

  let payload: unknown;
  try {
    payload = text.trim() ? JSON.parse(text) : {};
  } catch {
    return { error: 'TudoAzul login returned non-JSON' };
  }
  const token = readToken(payload);
  if (!token) {
    return { error: 'TudoAzul login JSON missing access token' };
  }
  session.accessToken = token;
  return session;
}

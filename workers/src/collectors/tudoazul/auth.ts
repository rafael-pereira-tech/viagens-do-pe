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

export function isLiveEnabled(env: Env): boolean {
  return Boolean(
    env.AZUL_SUBSCRIPTION_KEY?.trim() ||
      env.AZUL_ACCESS_TOKEN?.trim() ||
      env.AZUL_COOKIE?.trim() ||
      truthy(env.TUDOAZUL_LIVE) ||
      truthy(env.AZUL_LIVE),
  );
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
 * Guest JWT from the public SPA token endpoint. Member login is not wired
 * (Auth0/captcha); pass `AZUL_ACCESS_TOKEN` / `AZUL_COOKIE` from a browser session.
 */
export async function resolveSession(env: Env, deps: TokenDeps): Promise<AzulSession | { error: string }> {
  const session: AzulSession = {
    cookie: env.AZUL_COOKIE?.trim() || env.TUDOAZUL_COOKIE?.trim() || undefined,
    accessToken: env.AZUL_ACCESS_TOKEN?.trim() || env.TUDOAZUL_ACCESS_TOKEN?.trim() || undefined,
    subscriptionKey: env.AZUL_SUBSCRIPTION_KEY?.trim() || undefined,
  };
  if (session.accessToken) return session;

  const url = `${apiHost(env)}${AZUL_TOKEN_PATH}`;
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: 'POST',
      headers: deps.headers,
      body: JSON.stringify({}),
    });
  } catch (err) {
    return { error: `Azul token network error: ${err instanceof Error ? err.message : String(err)}` };
  }

  const text = await response.text();
  if (response.status === 401) {
    return { error: `Azul token ${response.status} (auth_failed)` };
  }
  if (!response.ok) {
    return { error: `Azul token ${response.status}: ${text.slice(0, 240)}` };
  }

  let payload: unknown;
  try {
    payload = text.trim() ? JSON.parse(text) : {};
  } catch {
    return { error: 'Azul token returned non-JSON' };
  }
  const token = readToken(payload);
  if (!token) {
    return { error: 'Azul token JSON missing access token' };
  }
  session.accessToken = token;
  return session;
}

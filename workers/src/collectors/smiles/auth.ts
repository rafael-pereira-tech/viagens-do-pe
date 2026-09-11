import type { Env } from '../../env';
import { SMILES_LOGIN_HOSTS, SMILES_LOGIN_PATH, SMILES_ORIGIN } from './constants';
import type { SmilesEnvName, SmilesSession } from './types';
import { anySourceEnabled } from '../capabilities';

export function smilesEnvName(env: Env): SmilesEnvName {
  return env.SMILES_ENV?.trim().toLowerCase() === 'green' ? 'green' : 'blue';
}

export function hasMemberSession(env: Env, session: SmilesSession): boolean {
  return Boolean(session.cookie || session.accessToken || session.memberNumber || env.SMILES_INCLUDE_CLUB === '1');
}

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

export function isDryRun(env: Env): boolean {
  return truthy(env.SMILES_DRY_RUN);
}

export function isLiveEnabled(env: Env): boolean {
  return anySourceEnabled(env, 'smiles_points', 'gol_cash') || Boolean(env.SMILES_USER?.trim() || truthy(env.SMILES_LIVE));
}

export function loginHost(env: Env): string {
  if (env.SMILES_LOGIN_HOST?.trim()) return env.SMILES_LOGIN_HOST.replace(/\/$/, '');
  return SMILES_LOGIN_HOSTS[smilesEnvName(env)];
}

interface LoginDeps {
  fetch: typeof fetch;
}

export async function resolveSession(env: Env, deps: LoginDeps): Promise<SmilesSession | { error: string }> {
  const session: SmilesSession = {
    cookie: env.SMILES_COOKIE?.trim() || undefined,
    accessToken: env.SMILES_ACCESS_TOKEN?.trim() || undefined,
    memberNumber: env.SMILES_MEMBER_NUMBER?.trim() || undefined,
    includeClub: false,
  };
  session.includeClub = hasMemberSession(env, session);

  const user = env.SMILES_USER?.trim();
  const pass = env.SMILES_PASS;
  if (!user || !pass) return session;

  const url = `${loginHost(env)}${SMILES_LOGIN_PATH}`;
  const body: Record<string, string> = {
    username: user,
    password: pass,
    grant_type: 'http://auth0.com/oauth/grant-type/password-realm',
    realm: env.SMILES_AUTH_REALM?.trim() || 'smilesdb',
    audience: env.SMILES_AUTH_AUDIENCE?.trim() || 'https://smiles-shortlived.api',
    scope: 'openid profile',
  };
  if (env.SMILES_AUTH_CLIENT_ID?.trim()) body.client_id = env.SMILES_AUTH_CLIENT_ID.trim();

  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: SMILES_ORIGIN,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { error: `Smiles login network error: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (response.status === 401 || response.status === 403) {
    return { error: `Smiles login ${response.status} (auth_failed)` };
  }
  if (!response.ok) {
    const text = await response.text();
    return { error: `Smiles login ${response.status}: ${text.slice(0, 240)}` };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { error: 'Smiles login returned non-JSON' };
  }
  const token =
    payload && typeof payload === 'object'
      ? (payload as { access_token?: unknown }).access_token
      : undefined;
  if (typeof token !== 'string' || !token) {
    return { error: 'Smiles login JSON missing access_token' };
  }
  session.accessToken = token;
  session.includeClub = true;
  if (!session.memberNumber) session.memberNumber = user;
  return session;
}

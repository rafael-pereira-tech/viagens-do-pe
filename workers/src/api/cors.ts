import type { Env } from '../env';

export const PAGES_ORIGIN = 'https://viagens-do-pe.pages.dev';

const PAGES_PREVIEW = /^https:\/\/[a-z0-9-]+\.viagens-do-pe\.pages\.dev$/;
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function extraAllowedOrigins(env: Env): string[] {
  return (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string, env: Env = {}): boolean {
  if (!origin) return false;
  if (origin === PAGES_ORIGIN) return true;
  if (PAGES_PREVIEW.test(origin)) return true;
  if (LOCALHOST.test(origin)) return true;
  return extraAllowedOrigins(env).includes(origin);
}

export function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get('Origin');
  headers.append('Vary', 'Origin');
  if (origin && isAllowedOrigin(origin, env)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

export function applyCors(request: Request, env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  const extra = corsHeaders(request, env);
  extra.forEach((value, key) => {
    if (key.toLowerCase() === 'vary') {
      const existing = headers.get('Vary');
      headers.set('Vary', existing ? `${existing}, ${value}` : value);
      return;
    }
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function corsPreflight(request: Request, env: Env): Response {
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, env)) {
    return new Response(null, { status: 403, headers: corsHeaders(request, env) });
  }
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

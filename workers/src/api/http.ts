import type { ApiErrorBody } from './types';

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function jsonError(error: string, status: number, details?: string): Response {
  const body: ApiErrorBody = details ? { error, details } : { error };
  return json(body, status);
}

const JWT = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;
const BEARER = /Bearer\s+\S+/gi;

/** Strip tokens from upstream error text before returning it to clients. */
export function publicErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(BEARER, 'Bearer [redacted]').replace(JWT, '[redacted-jwt]').slice(0, 500);
}

import type { Env } from '../env';
import { jsonError } from './http';

const BEARER = /^Bearer\s+(\S+)\s*$/i;

export function readApiKey(env: Env): string {
  return env.READ_API_KEY?.trim() ?? '';
}

/**
 * Snapshot reads require `Authorization: Bearer <READ_API_KEY>`.
 *
 * - Not optional: without a Worker-held key the API refuses data (503).
 * - `INGEST_TRIGGER_SECRET` is for POST /run only and is never accepted here.
 * - Stub FE Entrar/Sair is not an auth check — this header is.
 */
export function authorizeRead(request: Request, env: Env): Response | null {
  const key = readApiKey(env);
  if (!key) {
    return jsonError('read_api_key_not_configured', 503, 'Set Worker secret READ_API_KEY. Do not reuse INGEST_TRIGGER_SECRET.');
  }

  const ingest = env.INGEST_TRIGGER_SECRET?.trim() ?? '';
  if (ingest && key === ingest) {
    return jsonError(
      'read_api_key_reuses_ingest_secret',
      503,
      'READ_API_KEY must be distinct from INGEST_TRIGGER_SECRET.',
    );
  }

  const presented = BEARER.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  if (!presented || presented !== key) {
    return jsonError('unauthorized', 401);
  }
  if (ingest && presented === ingest) {
    return jsonError('unauthorized', 401);
  }
  return null;
}

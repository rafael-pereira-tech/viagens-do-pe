import type { Env } from '../env';
import { jsonError } from './http';

/**
 * Optional Bearer gate for GET /api/v1/*.
 * When `API_READ_SECRET` is unset, CORS-restricted public reads are allowed —
 * the service role still stays on the Worker.
 */
export function authorizeRead(request: Request, env: Env): Response | null {
  const secret = env.API_READ_SECRET?.trim();
  if (!secret) return null;
  const header = request.headers.get('authorization') ?? '';
  if (header !== `Bearer ${secret}`) {
    return jsonError('unauthorized', 401);
  }
  return null;
}

import type { CollectParams } from '../types';
import type { Env } from '../../env';
import { isLiveEnabled, smilesEnvName } from './auth';
import {
  DEFAULT_DELAY_MS,
  MAX_RETRIES,
  SMILES_ORIGIN,
  SMILES_REFERER,
  SMILES_SEARCH_HOSTS,
  SMILES_SEARCH_PATH,
} from './constants';
import { applyBrowserClientHeaders, classifySearchHttpError } from './headers';
import { isRetryableStatus, parseRetryAfterMs, SequentialLimiter, waitMs } from './http';
import type { SmilesSearchResponse, SmilesSession } from './types';

export interface SearchRequest {
  params: CollectParams;
  session: SmilesSession;
}

export type SearchHttpResult =
  | { ok: true; status: number; payload: unknown }
  | { ok: false; status: number; error: string; kind: 'auth_failed' | 'scrape_failed' };

export interface SmilesClient {
  search(request: SearchRequest): Promise<SearchHttpResult>;
}

export function searchHost(env: Env): string {
  if (env.SMILES_SEARCH_HOST?.trim()) return env.SMILES_SEARCH_HOST.replace(/\/$/, '');
  return SMILES_SEARCH_HOSTS[smilesEnvName(env)];
}

export function requestDelayMs(env: Env): number {
  const raw = env.SMILES_REQUEST_DELAY_MS?.trim();
  if (!raw) return DEFAULT_DELAY_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DELAY_MS;
}

function searchHeaders(env: Env, session: SmilesSession): Headers {
  const headers = new Headers();
  applyBrowserClientHeaders(headers);
  headers.set('Origin', SMILES_ORIGIN);
  headers.set('Referer', SMILES_REFERER);
  headers.set('Channel', 'WEB');
  headers.set('Region', 'BRASIL');
  headers.set('Language', 'pt-BR');
  const apiKey = env.SMILES_API_KEY?.trim();
  if (apiKey) headers.set('x-api-key', apiKey);
  if (session.cookie) headers.set('Cookie', session.cookie);
  if (session.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);
  return headers;
}

function searchUrl(env: Env, params: CollectParams, session: SmilesSession): string {
  const url = new URL(`${searchHost(env)}${SMILES_SEARCH_PATH}`);
  url.searchParams.set('cabin', 'ALL');
  url.searchParams.set('originAirportCode', params.origin);
  url.searchParams.set('destinationAirportCode', params.destination);
  url.searchParams.set('departureDate', params.flightDate);
  // Empty memberNumber = guest. Club pricing needs a real 9-digit Smiles number.
  url.searchParams.set('memberNumber', session.memberNumber ?? '');
  url.searchParams.set('adults', '1');
  url.searchParams.set('children', '0');
  url.searchParams.set('infants', '0');
  url.searchParams.set('forceCongener', 'false');
  return url.toString();
}

export function createSmilesClient(
  env: Env,
  deps: {
    fetch: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    limiter?: SequentialLimiter;
  },
): SmilesClient {
  const sleep = deps.sleep ?? waitMs;
  const limiter = deps.limiter ?? new SequentialLimiter(requestDelayMs(env), sleep, deps.now ?? Date.now);

  return {
    async search(request) {
      if (!isLiveEnabled(env)) {
        return {
          ok: false,
          status: 0,
          error:
            'Smiles collector is not configured (set SMILES_API_KEY or SMILES_MEMBER_NUMBER + SMILES_PASSWORD, or SMILES_DRY_RUN=1)',
          kind: 'auth_failed',
        };
      }

      const url = searchUrl(env, request.params, request.session);
      const headers = searchHeaders(env, request.session);
      let attempt = 0;
      let lastError: Extract<SearchHttpResult, { ok: false }> | null = null;

      while (attempt < MAX_RETRIES) {
        attempt += 1;
        await limiter.waitTurn();
        let response: Response;
        try {
          response = await deps.fetch(url, { method: 'GET', headers });
        } catch (err) {
          lastError = {
            ok: false,
            status: 0,
            error: `Smiles search network error: ${err instanceof Error ? err.message : String(err)}`,
            kind: 'scrape_failed',
          };
          if (attempt < MAX_RETRIES) await sleep(500 * 2 ** (attempt - 1));
          continue;
        }

        const text = await response.text();
        if (response.ok) {
          if (!text.trim()) return { ok: true, status: response.status, payload: {} };
          try {
            return { ok: true, status: response.status, payload: JSON.parse(text) as SmilesSearchResponse };
          } catch {
            return {
              ok: false,
              status: response.status,
              error: `Smiles search returned non-JSON (${text.slice(0, 120)})`,
              kind: 'scrape_failed',
            };
          }
        }

        lastError = classifySearchHttpError('Smiles search', response.status, text);
        if (lastError.kind === 'auth_failed') return lastError;
        if (!isRetryableStatus(response.status) || attempt >= MAX_RETRIES) return lastError;
        const backoff = parseRetryAfterMs(response.headers.get('retry-after'), 500 * 2 ** (attempt - 1));
        await sleep(Math.min(backoff, 8_000));
      }

      return lastError ?? {
        ok: false,
        status: 0,
        error: 'Smiles search failed',
        kind: 'scrape_failed',
      };
    },
  };
}

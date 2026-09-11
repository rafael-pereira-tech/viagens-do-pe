import type { CollectParams } from '../types';
import type { Env } from '../../env';
import { isLiveEnabled, smilesEnvName } from './auth';
import {
  BROWSER_UA,
  DEFAULT_DELAY_MS,
  MAX_RETRIES,
  SMILES_ORIGIN,
  SMILES_REFERER,
  SMILES_SEARCH_HOSTS,
  SMILES_SEARCH_PATH,
  VOEGOL_API_HOST,
  VOEGOL_FLIGHTS_PATH,
  VOEGOL_ORIGIN,
} from './constants';
import { isRetryableStatus, looksLikeHtml, parseRetryAfterMs, SequentialLimiter, waitMs } from './http';
import type { SmilesSession } from './types';

export interface SearchRequest {
  params: CollectParams;
  session: SmilesSession;
}

export type SearchHttpResult =
  | { ok: true; status: number; payload: unknown }
  | { ok: false; status: number; error: string; kind: 'auth_failed' | 'scrape_failed' };

export interface SmilesClient {
  search(request: SearchRequest): Promise<SearchHttpResult>;
  searchCash(request: SearchRequest): Promise<SearchHttpResult>;
}

export function searchHost(env: Env): string {
  if (env.SMILES_SEARCH_HOST?.trim()) return env.SMILES_SEARCH_HOST.replace(/\/$/, '');
  return SMILES_SEARCH_HOSTS[smilesEnvName(env)];
}

export function voegolHost(env: Env): string {
  if (env.VOEGOL_API_HOST?.trim()) return env.VOEGOL_API_HOST.replace(/\/$/, '');
  return VOEGOL_API_HOST;
}

export function requestDelayMs(env: Env): number {
  const raw = env.SMILES_REQUEST_DELAY_MS?.trim();
  if (!raw) return DEFAULT_DELAY_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DELAY_MS;
}

function searchHeaders(env: Env, session: SmilesSession): Headers {
  const headers = new Headers();
  headers.set('Accept', 'application/json, text/plain, */*');
  headers.set('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.8');
  headers.set('Origin', SMILES_ORIGIN);
  headers.set('Referer', SMILES_REFERER);
  headers.set('User-Agent', BROWSER_UA);
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
  url.searchParams.set('memberNumber', session.memberNumber ?? '');
  url.searchParams.set('adults', '1');
  url.searchParams.set('children', '0');
  url.searchParams.set('infants', '0');
  url.searchParams.set('forceCongener', 'false');
  return url.toString();
}

/** Cash PLP: `https://www.voegol.com.br/itineraries?from=PET&to=CGH&departureDate=YYYY-MM-DD&numAdults=1`. */
export function voegolItinerariesUrl(params: CollectParams): string {
  const url = new URL(`${VOEGOL_ORIGIN}/itineraries`);
  url.searchParams.set('from', params.origin);
  url.searchParams.set('to', params.destination);
  url.searchParams.set('departureDate', params.flightDate);
  url.searchParams.set('numAdults', '1');
  return url.toString();
}

export function voegolSearchUrl(env: Env): string {
  const url = new URL(`${voegolHost(env)}${VOEGOL_FLIGHTS_PATH}`);
  url.searchParams.set('Flow', 'Issue');
  url.searchParams.set('context', 'B2C');
  return url.toString();
}

/**
 * Body the VoeGol SPA posts to sabre-default/flights.
 *
 * Cash UI: `https://www.voegol.com.br/itineraries?from=PET&to=CGH&departureDate=YYYY-MM-DD&numAdults=1`
 * Host: `POST {voegolHost}/api/sabre-default/flights?Flow=Issue&context=B2C`
 */
export function voegolSearchBody(params: CollectParams): Record<string, unknown> {
  return {
    origin: params.origin,
    destination: params.destination,
    departureDate: params.flightDate,
    adults: 1,
    children: 0,
    infants: 0,
    cabin: 'Economy',
    currencyCode: 'BRL',
    originDestinations: [
      {
        origin: params.origin,
        destination: params.destination,
        departureDate: params.flightDate,
      },
    ],
    passengers: [{ passengerTypeCode: 'ADT', quantity: 1 }],
  };
}

function cashHeaders(session: SmilesSession, params: CollectParams): Headers {
  const headers = new Headers();
  headers.set('Accept', 'application/json, text/plain, */*');
  headers.set('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.8');
  headers.set('Content-Type', 'application/json');
  headers.set('Origin', VOEGOL_ORIGIN);
  headers.set('Referer', voegolItinerariesUrl(params));
  headers.set('User-Agent', BROWSER_UA);
  if (session.cookie) headers.set('Cookie', session.cookie);
  if (session.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);
  return headers;
}

function classifyHttpError(
  label: string,
  status: number,
  body: string,
): Extract<SearchHttpResult, { ok: false }> {
  const snippet = body.slice(0, 240);
  const html = looksLikeHtml(body);
  if (status === 401) {
    return { ok: false, status, error: `${label} ${status}: ${snippet}`, kind: 'auth_failed' };
  }
  if (status === 403 && !html) {
    return { ok: false, status, error: `${label} ${status}: ${snippet}`, kind: 'auth_failed' };
  }
  return { ok: false, status, error: `${label} ${status}: ${snippet}`, kind: 'scrape_failed' };
}

export function createSmilesClient(
  env: Env,
  deps: {
    fetch: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  },
): SmilesClient {
  const sleep = deps.sleep ?? waitMs;
  const limiter = new SequentialLimiter(requestDelayMs(env), sleep, deps.now ?? Date.now);

  async function requestJson(opts: {
    label: string;
    url: string;
    method: string;
    headers: Headers;
    body?: string;
  }): Promise<SearchHttpResult> {
    if (!isLiveEnabled(env)) {
      return {
        ok: false,
        status: 0,
        error:
          'Smiles collector is not configured (set SMILES_API_KEY or SMILES_COOKIE, or SMILES_DRY_RUN=1)',
        kind: 'auth_failed',
      };
    }

    let attempt = 0;
    let lastError: Extract<SearchHttpResult, { ok: false }> | null = null;

    while (attempt < MAX_RETRIES) {
      attempt += 1;
      await limiter.waitTurn();
      let response: Response;
      try {
        response = await deps.fetch(opts.url, {
          method: opts.method,
          headers: opts.headers,
          body: opts.body,
        });
      } catch (err) {
        lastError = {
          ok: false,
          status: 0,
          error: `${opts.label} network error: ${err instanceof Error ? err.message : String(err)}`,
          kind: 'scrape_failed',
        };
        if (attempt < MAX_RETRIES) await sleep(500 * 2 ** (attempt - 1));
        continue;
      }

      const text = await response.text();
      if (response.ok) {
        if (!text.trim()) return { ok: true, status: response.status, payload: {} };
        if (looksLikeHtml(text)) {
          return {
            ok: false,
            status: response.status,
            error: `${opts.label} returned HTML (${text.slice(0, 120)})`,
            kind: 'scrape_failed',
          };
        }
        try {
          return { ok: true, status: response.status, payload: JSON.parse(text) as unknown };
        } catch {
          return {
            ok: false,
            status: response.status,
            error: `${opts.label} returned non-JSON (${text.slice(0, 120)})`,
            kind: 'scrape_failed',
          };
        }
      }

      lastError = classifyHttpError(opts.label, response.status, text);
      if (lastError.kind === 'auth_failed') return lastError;
      if (!isRetryableStatus(response.status) || attempt >= MAX_RETRIES) return lastError;
      const backoff = parseRetryAfterMs(response.headers.get('retry-after'), 500 * 2 ** (attempt - 1));
      await sleep(Math.min(backoff, 8_000));
    }

    return (
      lastError ?? {
        ok: false,
        status: 0,
        error: `${opts.label} failed`,
        kind: 'scrape_failed',
      }
    );
  }

  return {
    async search(request) {
      return requestJson({
        label: 'Smiles search',
        url: searchUrl(env, request.params, request.session),
        method: 'GET',
        headers: searchHeaders(env, request.session),
      });
    },
    async searchCash(request) {
      return requestJson({
        label: 'VoeGol search',
        url: voegolSearchUrl(env),
        method: 'POST',
        headers: cashHeaders(request.session, request.params),
        body: JSON.stringify(voegolSearchBody(request.params)),
      });
    },
  };
}

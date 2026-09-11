import type { CollectParams } from '../types';
import type { Env } from '../../env';
import { apiHost, isLiveEnabled } from './auth';
import {
  BROWSER_UA,
  DEFAULT_DELAY_MS,
  LATAM_ACTION_NAME,
  LATAM_APPLICATION_NAME,
  LATAM_COUNTRY,
  LATAM_LANG,
  LATAM_OC,
  LATAM_OFFERS_PATH,
  LATAM_OFFERS_UI,
  LATAM_ORIGIN,
  MAX_RETRIES,
} from './constants';
import { isRetryableStatus, looksLikeHtml, parseRetryAfterMs, SequentialLimiter, waitMs } from './http';
import type { LatamPricingMode, LatamSession } from './types';

export interface SearchRequest {
  params: CollectParams;
  session: LatamSession;
  pricingMode: LatamPricingMode;
}

export type SearchHttpResult =
  | { ok: true; status: number; payload: unknown }
  | { ok: false; status: number; error: string; kind: 'auth_failed' | 'scrape_failed' };

export interface LatamClient {
  search(request: SearchRequest): Promise<SearchHttpResult>;
}

export function requestDelayMs(env: Env): number {
  const raw = env.LATAM_REQUEST_DELAY_MS?.trim();
  if (!raw) return DEFAULT_DELAY_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DELAY_MS;
}

export function offersPath(env: Env): string {
  if (env.LATAM_OFFERS_PATH?.trim()) {
    const path = env.LATAM_OFFERS_PATH.trim();
    return path.startsWith('/') ? path : `/${path}`;
  }
  return LATAM_OFFERS_PATH;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `latam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Public PLP: `oferta-voos?...&trip=OW&cabin=Economy&redemption=true|false`. */
export function ofertaVoosUrl(params: CollectParams, pricingMode: LatamPricingMode): string {
  const url = new URL(LATAM_OFFERS_UI);
  url.searchParams.set('origin', params.origin);
  url.searchParams.set('outbound', `${params.flightDate}T00:00:00.000Z`);
  url.searchParams.set('destination', params.destination);
  url.searchParams.set('adt', '1');
  url.searchParams.set('chd', '0');
  url.searchParams.set('inf', '0');
  url.searchParams.set('trip', 'OW');
  url.searchParams.set('cabin', 'Economy');
  url.searchParams.set('redemption', pricingMode === 'miles' ? 'true' : 'false');
  url.searchParams.set('sort', 'RECOMMENDED');
  return url.toString();
}

/**
 * Query the voe LATAM SPA sends to air-offers search.
 *
 * Miles UI: `https://www.latamairlines.com/br/pt/oferta-voos?...&redemption=true`
 * Cash UI: same with `redemption=false`
 * Host: `GET {apiHost}/bff/air-offers/offers/search` (briefing 2026-09-11).
 * Override with `LATAM_OFFERS_PATH` for the SPA v2 alias.
 *
 * - `origin` / `destination` — IATA
 * - `outFrom` — `{YYYY-MM-DD}T00:00:00.000Z`
 * - `adult=1`, one-way (`inFrom=null`)
 * - `redemption` — LATAM Pass vs full cash
 */
export function searchUrl(env: Env, params: CollectParams, pricingMode: LatamPricingMode): string {
  const url = new URL(`${apiHost(env)}${offersPath(env)}`);
  url.searchParams.set('origin', params.origin);
  url.searchParams.set('destination', params.destination);
  url.searchParams.set('outFrom', `${params.flightDate}T00:00:00.000Z`);
  url.searchParams.set('outFlightDate', 'null');
  url.searchParams.set('outOfferId', 'null');
  url.searchParams.set('inFrom', 'null');
  url.searchParams.set('inFlightDate', 'null');
  url.searchParams.set('inOfferId', 'null');
  url.searchParams.set('sort', 'RECOMMENDED');
  url.searchParams.set('cabinType', 'Economy');
  url.searchParams.set('adult', '1');
  url.searchParams.set('child', '0');
  url.searchParams.set('infant', '0');
  url.searchParams.set('redemption', pricingMode === 'miles' ? 'true' : 'false');
  return url.toString();
}

export function requestHeaders(session: LatamSession, referer: string): Headers {
  const headers = new Headers();
  headers.set('Accept', 'application/json, text/plain, */*');
  headers.set('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.8');
  headers.set('Origin', LATAM_ORIGIN);
  headers.set('Referer', referer);
  headers.set('User-Agent', BROWSER_UA);
  headers.set('x-latam-application-country', LATAM_COUNTRY);
  headers.set('x-latam-application-lang', LATAM_LANG);
  headers.set('x-latam-application-name', LATAM_APPLICATION_NAME);
  headers.set('x-latam-application-oc', LATAM_OC);
  headers.set('x-latam-client-name', LATAM_APPLICATION_NAME);
  headers.set('x-latam-action-name', LATAM_ACTION_NAME);
  headers.set('x-latam-app-session-id', newId());
  headers.set('x-latam-request-id', newId());
  headers.set('x-latam-track-id', newId());
  if (session.cookie) headers.set('Cookie', session.cookie);
  if (session.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);
  return headers;
}

function classifyHttpError(status: number, body: string): Extract<SearchHttpResult, { ok: false }> {
  const snippet = body.slice(0, 240);
  const html = looksLikeHtml(body);
  if (status === 401) {
    return { ok: false, status, error: `LATAM offers ${status}: ${snippet}`, kind: 'auth_failed' };
  }
  if (status === 403 && !html) {
    return { ok: false, status, error: `LATAM offers ${status}: ${snippet}`, kind: 'auth_failed' };
  }
  return { ok: false, status, error: `LATAM offers ${status}: ${snippet}`, kind: 'scrape_failed' };
}

export function createLatamClient(
  env: Env,
  deps: {
    fetch: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  },
): LatamClient {
  const sleep = deps.sleep ?? waitMs;
  const limiter = new SequentialLimiter(requestDelayMs(env), sleep, deps.now ?? Date.now);

  return {
    async search(request) {
      if (!isLiveEnabled(env)) {
        return {
          ok: false,
          status: 0,
          error:
            'LATAM Pass collector is not configured (set LATAM_PASS_LOGIN and LATAM_PASS_PASSWORD, or LATAM_DRY_RUN=1)',
          kind: 'auth_failed',
        };
      }

      const url = searchUrl(env, request.params, request.pricingMode);
      const headers = requestHeaders(request.session, ofertaVoosUrl(request.params, request.pricingMode));
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
            error: `LATAM offers network error: ${err instanceof Error ? err.message : String(err)}`,
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
              error: `LATAM offers returned HTML (${text.slice(0, 120)})`,
              kind: 'scrape_failed',
            };
          }
          try {
            return { ok: true, status: response.status, payload: JSON.parse(text) as unknown };
          } catch {
            return {
              ok: false,
              status: response.status,
              error: `LATAM offers returned non-JSON (${text.slice(0, 120)})`,
              kind: 'scrape_failed',
            };
          }
        }

        lastError = classifyHttpError(response.status, text);
        if (lastError.kind === 'auth_failed') return lastError;
        if (!isRetryableStatus(response.status) || attempt >= MAX_RETRIES) return lastError;
        const backoff = parseRetryAfterMs(response.headers.get('retry-after'), 500 * 2 ** (attempt - 1));
        await sleep(Math.min(backoff, 8_000));
      }

      return (
        lastError ?? {
          ok: false,
          status: 0,
          error: 'LATAM offers failed',
          kind: 'scrape_failed',
        }
      );
    },
  };
}

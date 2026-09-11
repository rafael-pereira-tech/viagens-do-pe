import type { CollectParams } from '../types';
import type { Env } from '../../env';
import { apiHost, isLiveEnabled } from './auth';
import {
  AZUL_AVAILABILITY_PATH,
  AZUL_CULTURE,
  AZUL_DEVICE,
  AZUL_ORIGIN,
  AZUL_REFERER,
  BROWSER_UA,
  DEFAULT_DELAY_MS,
  MAX_RETRIES,
} from './constants';
import { isRetryableStatus, looksLikeHtml, parseRetryAfterMs, SequentialLimiter, waitMs } from './http';
import type { AzulPricingMode, AzulSession } from './types';

export interface SearchRequest {
  params: CollectParams;
  session: AzulSession;
  pricingMode: AzulPricingMode;
}

export type SearchHttpResult =
  | { ok: true; status: number; payload: unknown }
  | { ok: false; status: number; error: string; kind: 'auth_failed' | 'scrape_failed' };

export interface AzulClient {
  search(request: SearchRequest): Promise<SearchHttpResult>;
}

export function requestDelayMs(env: Env): number {
  const raw = env.AZUL_REQUEST_DELAY_MS?.trim() || env.TUDOAZUL_REQUEST_DELAY_MS?.trim();
  if (!raw) return DEFAULT_DELAY_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DELAY_MS;
}

function mmDdYyyy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

export function selecaoVooUrl(params: CollectParams, points: boolean): string {
  const url = new URL(AZUL_REFERER);
  url.searchParams.set('c[0].ds', params.origin);
  url.searchParams.set('c[0].std', mmDdYyyy(params.flightDate));
  url.searchParams.set('c[0].as', params.destination);
  url.searchParams.set('p[0].t', 'ADT');
  url.searchParams.set('p[0].c', '1');
  url.searchParams.set('p[0].cp', points ? 'true' : 'false');
  url.searchParams.set('f.dl', '0');
  url.searchParams.set('f.dr', '0');
  url.searchParams.set('cc', 'BRL');
  return url.toString();
}

/**
 * Body the voeazul SPA posts to availability v5.
 *
 * UI: `https://www.voeazul.com.br/br/pt/home/selecao-voo?...&p[0].cp={true|false}&cc=BRL`
 * Host: `POST {AZUL_API_HOST}/reservationavailability/api/reservation/availability/v5/availability`
 *
 * - `criteria[].stations.originStationCodes` / `destinationStationCodes` — IATA
 * - `criteria[].dates.beginDate` — `{YYYY-MM-DD}T00:00:00`
 * - `passengers.types` — one ADT
 * - `codes.currencyCode=BRL`
 * - `points` + `filters.loyalty` — TudoAzul vs full cash (`p[0].cp`)
 */
export function availabilityBody(params: CollectParams, points: boolean): Record<string, unknown> {
  return {
    criteria: [
      {
        stations: {
          originStationCodes: [params.origin],
          destinationStationCodes: [params.destination],
          searchOriginMacs: false,
          searchDestinationMacs: false,
        },
        dates: {
          beginDate: `${params.flightDate}T00:00:00`,
        },
        filters: {
          maxConnections: 20,
          compressionType: 1,
          exclusionType: 'Default',
          loyalty: points ? 'PointsAndMonetary' : 'MonetaryOnly',
        },
      },
    ],
    passengers: {
      types: [{ type: 'ADT', count: 1 }],
    },
    codes: {
      currencyCode: 'BRL',
    },
    taxesAndFees: 'TaxesAndFees',
    ssrs: [],
    numberOfFaresPerJourney: 10,
    points,
  };
}

export function requestHeaders(env: Env, session: AzulSession, referer: string): Headers {
  const headers = new Headers();
  headers.set('Accept', 'application/json, text/plain, */*');
  headers.set('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.8');
  headers.set('Content-Type', 'application/json');
  headers.set('Origin', AZUL_ORIGIN);
  headers.set('Referer', referer);
  headers.set('User-Agent', BROWSER_UA);
  headers.set('Culture', AZUL_CULTURE);
  headers.set('Device', AZUL_DEVICE);
  const key = session.subscriptionKey || env.AZUL_SUBSCRIPTION_KEY?.trim();
  if (key) headers.set('Ocp-Apim-Subscription-Key', key);
  if (session.cookie) headers.set('Cookie', session.cookie);
  if (session.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);
  return headers;
}

function classifyHttpError(status: number, body: string): Extract<SearchHttpResult, { ok: false }> {
  const snippet = body.slice(0, 240);
  const html = looksLikeHtml(body);
  if (status === 401) {
    return { ok: false, status, error: `Azul availability ${status}: ${snippet}`, kind: 'auth_failed' };
  }
  if (status === 403 && !html) {
    return { ok: false, status, error: `Azul availability ${status}: ${snippet}`, kind: 'auth_failed' };
  }
  return { ok: false, status, error: `Azul availability ${status}: ${snippet}`, kind: 'scrape_failed' };
}

export function createAzulClient(
  env: Env,
  deps: {
    fetch: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  },
): AzulClient {
  const sleep = deps.sleep ?? waitMs;
  const limiter = new SequentialLimiter(requestDelayMs(env), sleep, deps.now ?? Date.now);

  return {
    async search(request) {
      if (!isLiveEnabled(env)) {
        return {
          ok: false,
          status: 0,
          error:
            'TudoAzul collector is not configured (set TUDOAZUL_LOGIN and TUDOAZUL_PASSWORD, or TUDOAZUL_DRY_RUN=1)',
          kind: 'auth_failed',
        };
      }

      const points = request.pricingMode === 'points';
      const url = `${apiHost(env)}${AZUL_AVAILABILITY_PATH}`;
      const headers = requestHeaders(env, request.session, selecaoVooUrl(request.params, points));
      const body = JSON.stringify(availabilityBody(request.params, points));
      let attempt = 0;
      let lastError: Extract<SearchHttpResult, { ok: false }> | null = null;

      while (attempt < MAX_RETRIES) {
        attempt += 1;
        await limiter.waitTurn();
        let response: Response;
        try {
          response = await deps.fetch(url, { method: 'POST', headers, body });
        } catch (err) {
          lastError = {
            ok: false,
            status: 0,
            error: `Azul availability network error: ${err instanceof Error ? err.message : String(err)}`,
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
              error: `Azul availability returned HTML (${text.slice(0, 120)})`,
              kind: 'scrape_failed',
            };
          }
          try {
            return { ok: true, status: response.status, payload: JSON.parse(text) as unknown };
          } catch {
            return {
              ok: false,
              status: response.status,
              error: `Azul availability returned non-JSON (${text.slice(0, 120)})`,
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
          error: 'Azul availability failed',
          kind: 'scrape_failed',
        }
      );
    },
  };
}

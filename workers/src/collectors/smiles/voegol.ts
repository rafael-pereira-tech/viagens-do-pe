import type { CollectParams, Snapshot } from '../types';
import type { Env } from '../../env';
import { isLiveEnabled } from './auth';
import {
  DEFAULT_DELAY_MS,
  GOL_AIRLINE_CODES,
  MAX_RETRIES,
  VOEGOL_ORIGIN,
  VOEGOL_SEARCH_URL,
  VOEGOL_SOURCE,
} from './constants';
import { applyBrowserClientHeaders, classifySearchHttpError } from './headers';
import { isRetryableStatus, parseRetryAfterMs, SequentialLimiter, waitMs } from './http';
import { civilDateOf, departureTimeOf, quotedOrNull } from './parser';

export type VoegolHttpResult =
  | { ok: true; status: number; payload: unknown }
  | { ok: false; status: number; error: string; kind: 'auth_failed' | 'scrape_failed' };

export interface VoegolClient {
  search(params: CollectParams): Promise<VoegolHttpResult>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function offerAirlineCode(offer: Record<string, unknown>): string {
  const segments = Array.isArray(offer.segments) ? offer.segments : [];
  const first = asRecord(segments[0]);
  const candidates = [first?.airlineCode, first?.airline_code, offer.airlineCode, offer.airline_code];
  for (const code of candidates) {
    if (typeof code === 'string' && code.trim()) return code.trim().toUpperCase();
  }
  return 'G3';
}

function offerDepartureIso(offer: Record<string, unknown>): string | undefined {
  const segments = Array.isArray(offer.segments) ? offer.segments : [];
  const first = asRecord(segments[0]);
  const value = first?.departureDateTime ?? first?.departure ?? offer.departureDateTime ?? offer.departure;
  return typeof value === 'string' ? value : undefined;
}

function offerTotal(offer: Record<string, unknown>): { amount: unknown; currency: string } {
  const total = asRecord(offer.total) ?? asRecord(offer.price);
  const currencyRaw = total?.currency ?? offer.currency ?? 'BRL';
  const currency = typeof currencyRaw === 'string' ? currencyRaw.toUpperCase() : 'BRL';
  return { amount: total?.amount ?? offer.amount, currency };
}

export function offersFromVoegolPayload(payload: unknown): Record<string, unknown>[] {
  const body = asRecord(payload);
  if (!body) return [];
  const data = asRecord(body.data);
  const lists = [body.offers, data?.offers, body.flights];
  for (const list of lists) {
    if (Array.isArray(list)) {
      return list.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => item != null);
    }
  }
  return [];
}

export interface VoegolParseOutcome {
  snapshots: Snapshot[];
  skipped: number;
}

export function parseVoegolOffers(payload: unknown, params: CollectParams): VoegolParseOutcome {
  const snapshots: Snapshot[] = [];
  let skipped = 0;

  for (const offer of offersFromVoegolPayload(payload)) {
    const code = offerAirlineCode(offer);
    if (code && !GOL_AIRLINE_CODES.has(code)) {
      skipped += 1;
      continue;
    }
    const departureIso = offerDepartureIso(offer);
    const date = civilDateOf(departureIso);
    if (date && date !== params.flightDate) {
      skipped += 1;
      continue;
    }
    const { amount, currency } = offerTotal(offer);
    if (currency && currency !== 'BRL') {
      skipped += 1;
      continue;
    }
    const amountBrl = quotedOrNull(amount, 'money');
    if (amountBrl == null) {
      skipped += 1;
      continue;
    }
    snapshots.push({
      origin: params.origin,
      destination: params.destination,
      airline: params.airline,
      program: params.program,
      flight_date: params.flightDate,
      departure_time: departureTimeOf(departureIso),
      miles: null,
      amount_brl: amountBrl,
      taxes_brl: null,
      currency: 'BRL',
      source: VOEGOL_SOURCE,
      raw_payload: {
        offerId: offer.id ?? null,
        airline_code: code || null,
        total: offer.total ?? null,
        amount_brl_note: 'Full cash BRL from VoeGol. Not Smiles money/copay.',
      },
    });
  }

  return { snapshots, skipped };
}

function voegolHeaders(): Headers {
  const headers = new Headers();
  applyBrowserClientHeaders(headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Origin', VOEGOL_ORIGIN);
  headers.set('Referer', `${VOEGOL_ORIGIN}/itineraries`);
  return headers;
}

function voegolBody(params: CollectParams): Record<string, unknown> {
  return {
    origin: params.origin,
    destination: params.destination,
    departureDate: params.flightDate,
    adults: 1,
    children: 0,
    infants: 0,
  };
}

export function requestDelayMs(env: Env): number {
  const raw = env.SMILES_REQUEST_DELAY_MS?.trim();
  if (!raw) return DEFAULT_DELAY_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DELAY_MS;
}

export function createVoegolClient(
  env: Env,
  deps: {
    fetch: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    limiter?: SequentialLimiter;
  },
): VoegolClient {
  const sleep = deps.sleep ?? waitMs;
  const limiter = deps.limiter ?? new SequentialLimiter(requestDelayMs(env), sleep, deps.now ?? Date.now);

  return {
    async search(params) {
      if (!isLiveEnabled(env)) {
        return {
          ok: false,
          status: 0,
          error: 'VoeGol companion skipped (Smiles live config missing)',
          kind: 'auth_failed',
        };
      }

      const headers = voegolHeaders();
      headers.set(
        'Referer',
        `https://www.voegol.com.br/itineraries?from=${params.origin}&to=${params.destination}&departureDate=${params.flightDate}&numAdults=1`,
      );

      let attempt = 0;
      let lastError: VoegolHttpResult & { ok: false } | null = null;

      while (attempt < MAX_RETRIES) {
        attempt += 1;
        await limiter.waitTurn();
        let response: Response;
        try {
          response = await deps.fetch(VOEGOL_SEARCH_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(voegolBody(params)),
          });
        } catch (err) {
          lastError = {
            ok: false,
            status: 0,
            error: `VoeGol search network error: ${err instanceof Error ? err.message : String(err)}`,
            kind: 'scrape_failed',
          };
          if (attempt < MAX_RETRIES) await sleep(500 * 2 ** (attempt - 1));
          continue;
        }

        const text = await response.text();
        if (response.ok) {
          if (!text.trim()) return { ok: true, status: response.status, payload: {} };
          try {
            return { ok: true, status: response.status, payload: JSON.parse(text) as unknown };
          } catch {
            return {
              ok: false,
              status: response.status,
              error: `VoeGol search returned non-JSON (${text.slice(0, 120)})`,
              kind: 'scrape_failed',
            };
          }
        }

        lastError = classifySearchHttpError('VoeGol search', response.status, text);
        if (lastError.kind === 'auth_failed') return lastError;
        if (!isRetryableStatus(response.status) || attempt >= MAX_RETRIES) return lastError;
        const backoff = parseRetryAfterMs(response.headers.get('retry-after'), 500 * 2 ** (attempt - 1));
        await sleep(Math.min(backoff, 8_000));
      }

      return lastError ?? {
        ok: false,
        status: 0,
        error: 'VoeGol search failed',
        kind: 'scrape_failed',
      };
    },
  };
}

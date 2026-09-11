import type { Env } from '../../env';
import type { CollectParams, CollectResult, Collector, Snapshot } from '../types';
import { isDryRun, isLiveEnabled, resolveSession } from './auth';
import { LATAM_ORIGIN } from './constants';
import { createLatamClient, requestHeaders, type LatamClient } from './client';
import { SEARCH_PET_GRU_CASH, SEARCH_PET_GRU_MILES } from './fixtures';
import { waitMs } from './http';
import { latamBodyLooksLikeError, parseLatamOffers } from './parser';
import type { LatamPricingMode, LatamSession } from './types';

export interface LatamPassCollectorDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  client?: LatamClient;
}

function shiftDates(payload: unknown, fromDate: string, flightDate: string): unknown {
  const json = JSON.stringify(payload);
  return JSON.parse(json.replaceAll(fromDate, flightDate));
}

function mergeErrors(...parts: Array<string | undefined>): string | undefined {
  const text = parts.filter(Boolean).join('; ');
  return text || undefined;
}

function combine(miles: CollectResult, cash: CollectResult): CollectResult {
  const snapshots: Snapshot[] = [...miles.snapshots, ...cash.snapshots];
  const milesFailed = miles.status === 'auth_failed' || miles.status === 'scrape_failed';
  const cashFailed = cash.status === 'auth_failed' || cash.status === 'scrape_failed';
  const error = mergeErrors(miles.error, cash.error);

  if (milesFailed && cashFailed) {
    if (miles.status === cash.status) {
      return { status: miles.status, snapshots: [], error };
    }
    return { status: 'partial', snapshots, error };
  }

  if (milesFailed || cashFailed) {
    if (snapshots.length > 0) {
      return { status: 'partial', snapshots, error };
    }
    return { status: milesFailed ? miles.status : cash.status, snapshots: [], error };
  }

  if (snapshots.length === 0) return { status: 'empty', snapshots: [] };
  return { status: 'success', snapshots };
}

function resultFromParse(parsed: ReturnType<typeof parseLatamOffers>): CollectResult {
  if (parsed.snapshots.length === 0) return { status: 'empty', snapshots: [] };
  return { status: 'success', snapshots: parsed.snapshots };
}

export function createLatamPassCollector(env: Env, deps: LatamPassCollectorDeps = {}): Collector {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? waitMs;
  const client = deps.client ?? createLatamClient(env, { fetch: fetchImpl, sleep, now: deps.now });
  let sessionPromise: Promise<LatamSession | { error: string }> | null = null;

  async function searchMode(params: CollectParams, session: LatamSession, pricingMode: LatamPricingMode): Promise<CollectResult> {
    const http = await client.search({ params, session, pricingMode });
    if (!http.ok) {
      return { status: http.kind, snapshots: [], error: http.error };
    }
    const bodyError = latamBodyLooksLikeError(http.payload);
    if (bodyError) {
      const blocked = /something went wrong|access denied/i.test(bodyError);
      return {
        status: blocked ? 'scrape_failed' : 'auth_failed',
        snapshots: [],
        error: bodyError,
      };
    }
    return resultFromParse(parseLatamOffers(http.payload, params, pricingMode));
  }

  return {
    async collect(params: CollectParams): Promise<CollectResult> {
      // DOW preference is applied by the scheduler job order, not here.
      // Mon/Wed/Fri through 2026-10-31; Wed/Fri/Sat after — preference only.
      if (isDryRun(env)) {
        const milesParsed = parseLatamOffers(
          shiftDates(SEARCH_PET_GRU_MILES, '2026-09-16', params.flightDate),
          params,
          'miles',
        );
        const cashParsed = parseLatamOffers(
          shiftDates(SEARCH_PET_GRU_CASH, '2026-09-16', params.flightDate),
          params,
          'cash',
        );
        return combine(resultFromParse(milesParsed), resultFromParse(cashParsed));
      }

      if (!isLiveEnabled(env)) {
        return {
          status: 'auth_failed',
          snapshots: [],
          error:
            'LATAM Pass collector is not configured. Set LATAM_PASS_LOGIN and LATAM_PASS_PASSWORD, or LATAM_DRY_RUN=1 for fixtures.',
        };
      }

      if (!sessionPromise) {
        const headers = requestHeaders({}, LATAM_ORIGIN);
        sessionPromise = resolveSession(env, { fetch: fetchImpl, headers });
      }
      const session = await sessionPromise;
      if ('error' in session) {
        return { status: 'auth_failed', snapshots: [], error: session.error };
      }

      const miles = await searchMode(params, session, 'miles');
      const cash = await searchMode(params, session, 'cash');
      return combine(miles, cash);
    },
  };
}

/** Unconfigured default used only when tests import the module directly. */
export const latamPassCollector = createLatamPassCollector({});

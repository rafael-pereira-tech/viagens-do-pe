import type { Env } from '../../env';
import type { CollectParams, CollectResult, Collector, Snapshot } from '../types';
import { stampDryRunResult } from '../dry-run';
import { isDryRun, isLiveEnabled, resolveSession } from './auth';
import { LATAM_ORIGIN } from './constants';
import { createLatamClient, requestHeaders, type LatamClient } from './client';
import { SEARCH_PET_GRU_CASH, SEARCH_PET_GRU_MILES } from './fixtures';
import { waitMs } from './http';
import { latamBodyLooksLikeError, parseLatamOffers } from './parser';
import type { LatamPricingMode, LatamSession } from './types';
import { hasExplicitCapabilityFlags, sourceEnabled } from '../capabilities';

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
  // Cloudflare's global fetch requires the global object as its receiver.
  // Keep injected test clients untouched, but bind the production fallback.
  const fetchImpl: typeof fetch = deps.fetch ?? ((input, init) => fetch(input, init));
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
      // Scheduler orders by **brief** preference (Mon/Wed/Fri through Oct;
      // Wed/Fri/Sat after). Published network is not the sort key.
      // Empty inventory — including non-operating published DOWs — is `empty`,
      // not scrape_failed. The collector does not skip dates.
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
        return stampDryRunResult(combine(resultFromParse(milesParsed), resultFromParse(cashParsed)));
      }

      const pointsEnabled = sourceEnabled(env, 'latam_pass_points');
      const cashEnabled = sourceEnabled(env, 'latam_cash');
      if (!isLiveEnabled(env) && !hasExplicitCapabilityFlags(env)) {
        return {
          status: 'auth_failed',
          snapshots: [],
          error: 'LATAM collector is not configured. Set LATAM_PASS_LOGIN/LATAM_PASS_PASSWORD or LATAM_CASH_ENABLED.',
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

      const miles = pointsEnabled
        ? await searchMode(params, session, 'miles')
        : { status: 'empty' as const, snapshots: [] };
      const cash = cashEnabled
        ? await searchMode(params, session, 'cash')
        : { status: 'empty' as const, snapshots: [] };
      return combine(miles, cash);
    },
  };
}

/** Unconfigured default used only when tests import the module directly. */
export const latamPassCollector = createLatamPassCollector({});

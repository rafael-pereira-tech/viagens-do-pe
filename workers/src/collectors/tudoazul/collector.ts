import type { Env } from '../../env';
import type { CollectParams, CollectResult, Collector, Snapshot } from '../types';
import { isDryRun, isLiveEnabled, resolveSession } from './auth';
import { AZUL_CULTURE, AZUL_DEVICE, AZUL_ORIGIN, BROWSER_UA } from './constants';
import { createAzulClient, requestHeaders, type AzulClient } from './client';
import {
  SEARCH_PET_POA_CASH,
  SEARCH_PET_POA_POINTS,
  SEARCH_PET_VCP_CASH,
  SEARCH_PET_VCP_POINTS,
} from './fixtures';
import { waitMs } from './http';
import { azulBodyLooksLikeError, parseAzulAvailability } from './parser';
import type { AzulPricingMode, AzulSession } from './types';

export interface TudoAzulCollectorDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  client?: AzulClient;
}

function shiftDates(payload: unknown, fromDate: string, flightDate: string): unknown {
  const json = JSON.stringify(payload);
  return JSON.parse(json.replaceAll(fromDate, flightDate));
}

function dryRunPayloads(destination: string): { pointsDate: string; points: unknown; cash: unknown } {
  if (destination === 'POA') {
    return { pointsDate: '2026-09-16', points: SEARCH_PET_POA_POINTS, cash: SEARCH_PET_POA_CASH };
  }
  return { pointsDate: '2026-09-14', points: SEARCH_PET_VCP_POINTS, cash: SEARCH_PET_VCP_CASH };
}

function mergeErrors(...parts: Array<string | undefined>): string | undefined {
  const text = parts.filter(Boolean).join('; ');
  return text || undefined;
}

function combine(points: CollectResult, cash: CollectResult): CollectResult {
  const snapshots: Snapshot[] = [...points.snapshots, ...cash.snapshots];
  const pointsFailed = points.status === 'auth_failed' || points.status === 'scrape_failed';
  const cashFailed = cash.status === 'auth_failed' || cash.status === 'scrape_failed';
  const error = mergeErrors(points.error, cash.error);

  if (pointsFailed && cashFailed) {
    if (points.status === cash.status) {
      return { status: points.status, snapshots: [], error };
    }
    return { status: 'partial', snapshots, error };
  }

  if (pointsFailed || cashFailed) {
    if (snapshots.length > 0) {
      return { status: 'partial', snapshots, error };
    }
    return { status: pointsFailed ? points.status : cash.status, snapshots: [], error };
  }

  if (snapshots.length === 0) return { status: 'empty', snapshots: [] };
  return { status: 'success', snapshots };
}

function resultFromParse(parsed: ReturnType<typeof parseAzulAvailability>): CollectResult {
  if (parsed.snapshots.length === 0) return { status: 'empty', snapshots: [] };
  return { status: 'success', snapshots: parsed.snapshots };
}

export function createTudoAzulCollector(env: Env, deps: TudoAzulCollectorDeps = {}): Collector {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? waitMs;
  const client = deps.client ?? createAzulClient(env, { fetch: fetchImpl, sleep, now: deps.now });
  let sessionPromise: Promise<AzulSession | { error: string }> | null = null;

  async function searchMode(params: CollectParams, session: AzulSession, pricingMode: AzulPricingMode): Promise<CollectResult> {
    const http = await client.search({ params, session, pricingMode });
    if (!http.ok) {
      return { status: http.kind, snapshots: [], error: http.error };
    }
    const bodyError = azulBodyLooksLikeError(http.payload);
    if (bodyError) {
      const blocked = /something went wrong|access denied/i.test(bodyError);
      return {
        status: blocked ? 'scrape_failed' : 'auth_failed',
        snapshots: [],
        error: bodyError,
      };
    }
    return resultFromParse(parseAzulAvailability(http.payload, params, pricingMode));
  }

  return {
    async collect(params: CollectParams): Promise<CollectResult> {
      // DOW preference is applied by the scheduler job order, not here.
      if (isDryRun(env)) {
        const { pointsDate, points, cash } = dryRunPayloads(params.destination);
        const pointsParsed = parseAzulAvailability(shiftDates(points, pointsDate, params.flightDate), params, 'points');
        const cashParsed = parseAzulAvailability(shiftDates(cash, pointsDate, params.flightDate), params, 'cash');
        return combine(resultFromParse(pointsParsed), resultFromParse(cashParsed));
      }

      if (!isLiveEnabled(env)) {
        return {
          status: 'auth_failed',
          snapshots: [],
          error:
            'TudoAzul collector is not configured. Set TUDOAZUL_LOGIN and TUDOAZUL_PASSWORD, or TUDOAZUL_DRY_RUN=1 for fixtures.',
        };
      }

      if (!sessionPromise) {
        const headers = requestHeaders(
          env,
          {
            subscriptionKey: env.AZUL_SUBSCRIPTION_KEY?.trim() || undefined,
          },
          AZUL_ORIGIN,
        );
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
        headers.set('Accept', 'application/json, text/plain, */*');
        headers.set('User-Agent', BROWSER_UA);
        headers.set('Origin', AZUL_ORIGIN);
        headers.set('Culture', AZUL_CULTURE);
        headers.set('Device', AZUL_DEVICE);
        sessionPromise = resolveSession(env, { fetch: fetchImpl, headers });
      }
      const session = await sessionPromise;
      if ('error' in session) {
        return { status: 'auth_failed', snapshots: [], error: session.error };
      }

      const points = await searchMode(params, session, 'points');
      const cash = await searchMode(params, session, 'cash');
      return combine(points, cash);
    },
  };
}

/** Unconfigured default used only when tests import the module directly. */
export const tudoAzulCollector = createTudoAzulCollector({});

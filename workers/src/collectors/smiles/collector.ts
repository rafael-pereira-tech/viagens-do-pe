import type { Env } from '../../env';
import type { CollectParams, CollectResult, Collector, Snapshot } from '../types';
import { isDryRun, isLiveEnabled, resolveSession } from './auth';
import { createSmilesClient, type SmilesClient } from './client';
import { SEARCH_PET_CGH_CASH, SEARCH_PET_CGH_SUCCESS } from './fixtures';
import { waitMs } from './http';
import {
  parseSmilesSearch,
  parseVoegolFlights,
  resolveFareTypes,
  smilesBodyLooksLikeError,
  voegolBodyLooksLikeError,
} from './parser';
import type { SmilesSession } from './types';

export interface SmilesCollectorDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  client?: SmilesClient;
}

function shiftSearchDates(payload: unknown, flightDate: string): unknown {
  const json = JSON.stringify(payload);
  // Fixtures are recorded for 2026-09-15; rewrite civil dates so dry-run works for any tick.
  return JSON.parse(json.replaceAll('2026-09-15', flightDate));
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

function resultFromParse(parsed: { snapshots: Snapshot[] }): CollectResult {
  if (parsed.snapshots.length === 0) {
    return { status: 'empty', snapshots: [] };
  }
  return { status: 'success', snapshots: parsed.snapshots };
}

export function createSmilesCollector(env: Env, deps: SmilesCollectorDeps = {}): Collector {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? waitMs;
  const client = deps.client ?? createSmilesClient(env, { fetch: fetchImpl, sleep, now: deps.now });
  let sessionPromise: Promise<SmilesSession | { error: string }> | null = null;

  function fareTypes(session: Pick<SmilesSession, 'includeClub'>): Set<string> {
    return resolveFareTypes({
      configured: env.SMILES_FARE_TYPES,
      includeClub: session.includeClub,
    });
  }

  async function searchMiles(params: CollectParams, session: SmilesSession): Promise<CollectResult> {
    const http = await client.search({ params, session });
    if (!http.ok) {
      return { status: http.kind, snapshots: [], error: http.error };
    }
    const bodyError = smilesBodyLooksLikeError(http.payload);
    if (bodyError) {
      const blocked = /something went wrong|access denied/i.test(bodyError);
      return {
        status: blocked ? 'scrape_failed' : 'auth_failed',
        snapshots: [],
        error: bodyError,
      };
    }
    return resultFromParse(parseSmilesSearch(http.payload, params, { fareTypes: fareTypes(session) }));
  }

  async function searchCash(params: CollectParams, session: SmilesSession): Promise<CollectResult> {
    const http = await client.searchCash({ params, session });
    if (!http.ok) {
      return { status: http.kind, snapshots: [], error: http.error };
    }
    const bodyError = voegolBodyLooksLikeError(http.payload);
    if (bodyError) {
      const blocked = /something went wrong|access denied/i.test(bodyError);
      return {
        status: blocked ? 'scrape_failed' : 'auth_failed',
        snapshots: [],
        error: bodyError,
      };
    }
    return resultFromParse(parseVoegolFlights(http.payload, params));
  }

  return {
    async collect(params: CollectParams): Promise<CollectResult> {
      // DOW preference is applied by the scheduler job order, not here.
      if (isDryRun(env)) {
        const milesParsed = parseSmilesSearch(
          shiftSearchDates(SEARCH_PET_CGH_SUCCESS, params.flightDate),
          params,
          { fareTypes: fareTypes({ includeClub: env.SMILES_INCLUDE_CLUB === '1' }) },
        );
        const cashParsed = parseVoegolFlights(shiftSearchDates(SEARCH_PET_CGH_CASH, params.flightDate), params);
        return combine(resultFromParse(milesParsed), resultFromParse(cashParsed));
      }

      if (!isLiveEnabled(env)) {
        return {
          status: 'auth_failed',
          snapshots: [],
          error:
            'Smiles collector is not configured. Set SMILES_API_KEY or SMILES_COOKIE when live credentials are available, or SMILES_DRY_RUN=1 for fixtures.',
        };
      }

      if (!sessionPromise) sessionPromise = resolveSession(env, { fetch: fetchImpl });
      const session = await sessionPromise;
      if ('error' in session) {
        return { status: 'auth_failed', snapshots: [], error: session.error };
      }

      const miles = await searchMiles(params, session);
      const cash = await searchCash(params, session);
      return combine(miles, cash);
    },
  };
}

/** Unconfigured default used only when tests import the module directly. */
export const smilesCollector = createSmilesCollector({});

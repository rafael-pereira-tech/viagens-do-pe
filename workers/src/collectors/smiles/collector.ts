import type { Env } from '../../env';
import type { CollectParams, CollectResult, Collector } from '../types';
import { isDryRun, isLiveEnabled, isVoegolDisabled, resolveSession } from './auth';
import { createSmilesClient, requestDelayMs, type SmilesClient } from './client';
import { SEARCH_PET_CGH_SUCCESS, VOEGOL_PET_CGH_SUCCESS } from './fixtures';
import { SequentialLimiter, waitMs } from './http';
import { parseSmilesSearch, resolveFareTypes, smilesBodyLooksLikeError } from './parser';
import type { SmilesSession } from './types';
import { createVoegolClient, parseVoegolOffers, type VoegolClient } from './voegol';

export interface SmilesCollectorDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  client?: SmilesClient;
  voegolClient?: VoegolClient;
}

function shiftSearchDates(payload: unknown, flightDate: string): unknown {
  const json = JSON.stringify(payload);
  // Fixtures are recorded for 2026-09-15; rewrite civil dates so dry-run works for any tick.
  return JSON.parse(json.replaceAll('2026-09-15', flightDate));
}

function resultFromParse(parsed: { snapshots: CollectResult['snapshots'] }): CollectResult {
  if (parsed.snapshots.length === 0) {
    return { status: 'empty', snapshots: [] };
  }
  return { status: 'success', snapshots: parsed.snapshots };
}

function combineResults(smiles: CollectResult, cash: CollectResult | null): CollectResult {
  const cashResult: CollectResult = cash ?? { status: 'empty', snapshots: [] };
  const snapshots = [...smiles.snapshots, ...cashResult.snapshots];
  const errors = [smiles.error, cashResult.error].filter(Boolean).join(' | ') || undefined;

  const smilesHard = smiles.status === 'auth_failed' || smiles.status === 'scrape_failed';
  const cashHard = cashResult.status === 'auth_failed' || cashResult.status === 'scrape_failed';

  if (snapshots.length > 0) {
    if (smilesHard || cashHard) {
      return { status: 'partial', snapshots, error: errors };
    }
    return { status: 'success', snapshots };
  }

  if (smiles.status === 'scrape_failed' || cashResult.status === 'scrape_failed') {
    return { status: 'scrape_failed', snapshots: [], error: errors };
  }
  if (smiles.status === 'auth_failed' || cashResult.status === 'auth_failed') {
    return { status: 'auth_failed', snapshots: [], error: errors };
  }
  return { status: 'empty', snapshots: [] };
}

function collectVoegolCash(
  env: Env,
  params: CollectParams,
  voegol: VoegolClient | null,
): Promise<CollectResult> | CollectResult {
  if (!voegol || isVoegolDisabled(env)) {
    return { status: 'empty', snapshots: [] };
  }
  return voegol.search(params).then((http) => {
    if (!http.ok) {
      return { status: http.kind, snapshots: [], error: http.error };
    }
    return resultFromParse(parseVoegolOffers(http.payload, params));
  });
}

export function createSmilesCollector(env: Env, deps: SmilesCollectorDeps = {}): Collector {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? waitMs;
  const limiter = new SequentialLimiter(requestDelayMs(env), sleep, deps.now ?? Date.now);
  const client = deps.client ?? createSmilesClient(env, { fetch: fetchImpl, sleep, now: deps.now, limiter });
  const voegol =
    deps.voegolClient ??
    (isVoegolDisabled(env) ? null : createVoegolClient(env, { fetch: fetchImpl, sleep, now: deps.now, limiter }));
  let sessionPromise: Promise<SmilesSession | { error: string; kind: 'auth_failed' | 'scrape_failed' }> | null =
    null;

  function fareTypes(session: Pick<SmilesSession, 'includeClub'>): Set<string> {
    return resolveFareTypes({
      configured: env.SMILES_FARE_TYPES,
      includeClub: session.includeClub,
    });
  }

  return {
    async collect(params: CollectParams): Promise<CollectResult> {
      // DOW preference is applied by the scheduler job order, not here.
      if (isDryRun(env)) {
        const miles = parseSmilesSearch(shiftSearchDates(SEARCH_PET_CGH_SUCCESS, params.flightDate), params, {
          fareTypes: fareTypes({ includeClub: env.SMILES_INCLUDE_CLUB === '1' }),
        });
        const smilesResult = resultFromParse(miles);
        if (isVoegolDisabled(env)) return smilesResult;
        const cash = parseVoegolOffers(shiftSearchDates(VOEGOL_PET_CGH_SUCCESS, params.flightDate), params);
        return combineResults(smilesResult, resultFromParse(cash));
      }

      if (!isLiveEnabled(env)) {
        return {
          status: 'auth_failed',
          snapshots: [],
          error:
            'Smiles collector is not configured. Set SMILES_API_KEY or SMILES_MEMBER_NUMBER + SMILES_PASSWORD when live credentials are available, or SMILES_DRY_RUN=1 for fixtures.',
        };
      }

      if (!sessionPromise) sessionPromise = resolveSession(env, { fetch: fetchImpl });
      const session = await sessionPromise;
      if ('error' in session) {
        const cash = await collectVoegolCash(env, params, voegol);
        return combineResults({ status: session.kind, snapshots: [], error: session.error }, cash);
      }

      const http = await client.search({ params, session });
      let smilesResult: CollectResult;
      if (!http.ok) {
        smilesResult = { status: http.kind, snapshots: [], error: http.error };
      } else {
        const bodyError = smilesBodyLooksLikeError(http.payload);
        if (bodyError) {
          const blocked = /something went wrong|access denied/i.test(bodyError);
          smilesResult = {
            status: blocked ? 'scrape_failed' : 'auth_failed',
            snapshots: [],
            error: bodyError,
          };
        } else {
          smilesResult = resultFromParse(parseSmilesSearch(http.payload, params, { fareTypes: fareTypes(session) }));
        }
      }

      const cash = await collectVoegolCash(env, params, voegol);
      return combineResults(smilesResult, cash);
    },
  };
}

/** Unconfigured default used only when tests import the module directly. */
export const smilesCollector = createSmilesCollector({});

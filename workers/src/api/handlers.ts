import type { Env } from '../env';
import { createSupabaseRest, type SupabaseRest } from '../supabase';
import {
  emptyWindowStats,
  latestByRouteDay,
  looksLikeCashAggregate,
  looksLikeTotalsAggregate,
  mergeRouteDayCash,
  minByRouteDay,
  minOverWindow,
  parseStatsRow,
  statsSampleTruncated,
  sumSnapshotCounts,
  toWindowStats,
} from './aggregate';
import { authorizeRead } from './auth';
import { handlePostEvent } from './events';
import { json, jsonError, publicErrorMessage } from './http';
import {
  parseObservationSummaryRow,
  rollupObservationDays,
  type ObservationSummaryRow,
} from './observation-summary';
import { isDryRunSource, toPublicSnapshot } from './redact';
import { isCashCompanionSource } from './sources';
import {
  LATEST_DEFAULT_LIMIT,
  LATEST_MAX_LIMIT,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  STATS_CASH_ROUTE_DAY_SELECT,
  STATS_CASH_WINDOW_SELECT,
  STATS_FETCH_CAP,
  STATS_ROUTE_DAY_SELECT,
  STATS_WINDOW_SELECT,
  parseContentRangeTotal,
  parseSnapshotQuery,
  toPostgrestQuery,
  toStatsAggregateQuery,
  toStatsRpcArgs,
} from './query';
import type { PriceSnapshot, SnapshotQuery, SnapshotStatsResponse } from './types';

export interface ReadApiDeps {
  rest?: SupabaseRest | null;
  /** Test seam for POST /api/v1/events (Analytics Engine). */
  writeDataPoint?: (point: import('./events').AnalyticsEngineDataPoint) => void;
}

const LATEST_GRAIN = 'origin,destination,airline,program,source,flight_date';

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

async function readRows(response: Response): Promise<Record<string, unknown>[]> {
  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as Record<string, unknown>[]) : [];
}

function toPublicRows(rows: Record<string, unknown>[], query: SnapshotQuery): PriceSnapshot[] {
  const mapped = rows.map((row) => toPublicSnapshot(row, query.includeRaw));
  if (!query.excludeDryRun) return mapped;
  return mapped.filter((row) => !isDryRunSource(row.source));
}

async function fetchSnapshots(
  rest: SupabaseRest,
  table: string,
  query: SnapshotQuery,
  options: { order?: string; limit?: number; offset?: number; select?: string } = {},
): Promise<{ rows: PriceSnapshot[]; total: number | null; status: number }> {
  const qs = toPostgrestQuery(query, options);
  const response = await rest(`${table}?${qs}`, {
    method: 'GET',
    headers: { Prefer: 'count=exact' },
  });
  const rows = toPublicRows(await readRows(response), query);
  return {
    rows,
    total: parseContentRangeTotal(response.headers.get('content-range')),
    status: response.status,
  };
}

export async function handleReadApi(request: Request, env: Env, deps: ReadApiDeps = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  // Public ingest — no READ_API_KEY (and not tied to stub Entrar).
  if (path === '/api/v1/events') {
    if (request.method !== 'POST') return jsonError('method_not_allowed', 405);
    return handlePostEvent(request, env, { writeDataPoint: deps.writeDataPoint });
  }

  if (request.method !== 'GET') {
    return jsonError('method_not_allowed', 405);
  }

  if (path === '/api/v1/health') {
    return json({ ok: true, service: 'viagens-do-pe-read' });
  }

  const denied = authorizeRead(request, env);
  if (denied) return denied;

  try {
    if (path === '/api/v1/snapshots') return await listSnapshots(url, env, deps);
    if (path === '/api/v1/snapshots/latest') return await latestSnapshots(url, env, deps);
    if (path === '/api/v1/snapshots/stats') return await snapshotStats(url, env, deps);
    if (path === '/api/v1/observations/summary') return await observationSummary(url, env, deps);
  } catch (err) {
    return jsonError('upstream_error', 502, publicErrorMessage(err));
  }

  return jsonError('not_found', 404);
}

function requireRest(env: Env, deps: ReadApiDeps): SupabaseRest | Response {
  const rest = deps.rest === undefined ? createSupabaseRest(env) : deps.rest;
  if (!rest) return jsonError('supabase_not_configured', 503);
  return rest;
}

async function listSnapshots(url: URL, env: Env, deps: ReadApiDeps): Promise<Response> {
  const parsed = parseSnapshotQuery(url.searchParams, {
    defaultLimit: LIST_DEFAULT_LIMIT,
    maxLimit: LIST_MAX_LIMIT,
  });
  if (!parsed.ok) return jsonError(parsed.error, parsed.status, parsed.details);

  const rest = requireRest(env, deps);
  if (rest instanceof Response) return rest;

  const { rows, total } = await fetchSnapshots(rest, 'price_snapshots', parsed.value);
  return json({
    data: rows,
    meta: {
      limit: parsed.value.limit,
      offset: parsed.value.offset,
      total,
      include_raw: parsed.value.includeRaw,
    },
  });
}

async function latestSnapshots(url: URL, env: Env, deps: ReadApiDeps): Promise<Response> {
  const parsed = parseSnapshotQuery(url.searchParams, {
    defaultLimit: LATEST_DEFAULT_LIMIT,
    maxLimit: LATEST_MAX_LIMIT,
  });
  if (!parsed.ok) return jsonError(parsed.error, parsed.status, parsed.details);

  const rest = requireRest(env, deps);
  if (rest instanceof Response) return rest;

  const query = parsed.value;
  const viewQs = toPostgrestQuery(query, { order: 'flight_date.asc,origin.asc,destination.asc,collected_at.desc' });

  const response = await rest(
    `price_snapshots_latest?${viewQs}`,
    {
      method: 'GET',
      headers: { Prefer: 'count=exact' },
    },
    [404],
  );
  if (response.status === 404) return latestFromTable(rest, query);

  const rows = toPublicRows(await readRows(response), query);
  return json({
    data: rows,
    meta: {
      limit: query.limit,
      offset: query.offset,
      total: parseContentRangeTotal(response.headers.get('content-range')),
      include_raw: query.includeRaw,
      grain: LATEST_GRAIN,
    },
  });
}

async function latestFromTable(rest: SupabaseRest, query: SnapshotQuery): Promise<Response> {
  const { rows } = await fetchSnapshots(rest, 'price_snapshots', query, {
    order: 'collected_at.desc,id.desc',
    limit: STATS_FETCH_CAP,
    offset: 0,
  });
  const latest = latestByRouteDay(rows);
  const sliced = latest.slice(query.offset, query.offset + query.limit);
  return json({
    data: sliced,
    meta: {
      limit: query.limit,
      offset: query.offset,
      total: latest.length,
      include_raw: query.includeRaw,
      grain: LATEST_GRAIN,
      fallback: 'in_memory_distinct',
    },
  });
}

async function snapshotStats(url: URL, env: Env, deps: ReadApiDeps): Promise<Response> {
  const parsed = parseSnapshotQuery(url.searchParams, {
    defaultLimit: STATS_FETCH_CAP,
    maxLimit: STATS_FETCH_CAP,
  });
  if (!parsed.ok) return jsonError(parsed.error, parsed.status, parsed.details);

  const rest = requireRest(env, deps);
  if (rest instanceof Response) return rest;

  const query = { ...parsed.value, includeRaw: false };
  // Prefer unpaged PostgREST COUNT/MIN on the existing table (no migration).
  // That is the QA path: PET+CGH with no source, >1000 rows, legacy smiles_web copay.
  const statsTable = env.CURRENT_READ_MODEL === '1' ? 'price_snapshots_latest' : 'price_snapshots';
  const fromAggregate = await fetchPostgrestAggregateStats(rest, query, statsTable);
  if (fromAggregate) return json(fromAggregate);
  const fromRpc = await fetchSqlStats(rest, query);
  if (fromRpc) return json(fromRpc);
  return json(await sampleStats(rest, query, statsTable));
}

async function fetchPostgrestAggregateStats(
  rest: SupabaseRest,
  query: SnapshotQuery,
  table: string,
): Promise<SnapshotStatsResponse | null> {
  const routeDay = query.groupBy === 'route_day';
  const totalsQs = toStatsAggregateQuery(query, {
    select: routeDay ? STATS_ROUTE_DAY_SELECT : STATS_WINDOW_SELECT,
  });
  const totalsResponse = await rest(`${table}?${totalsQs}`, { method: 'GET' }, [400, 404]);
  if (!totalsResponse.ok) return null;
  const totalsBody = await readRows(totalsResponse);
  if (totalsBody.length > 0 && !looksLikeTotalsAggregate(totalsBody[0])) return null;

  const wantCash = !query.source || isCashCompanionSource(query.source);
  let cashBody: Record<string, unknown>[] = [];
  if (wantCash) {
    const cashQs = toStatsAggregateQuery(query, {
      select: routeDay ? STATS_CASH_ROUTE_DAY_SELECT : STATS_CASH_WINDOW_SELECT,
      cashOnly: true,
    });
    const cashResponse = await rest(`${table}?${cashQs}`, { method: 'GET' }, [400, 404]);
    if (!cashResponse.ok) return null;
    cashBody = await readRows(cashResponse);
    if (cashBody.length > 0 && !looksLikeCashAggregate(cashBody[0])) return null;
  }

  if (routeDay) {
    const data = mergeRouteDayCash(totalsBody.map((row) => parseStatsRow(row)), cashBody.map((row) => parseStatsRow(row)));
    return {
      data,
      meta: { group_by: 'route_day', snapshot_count: sumSnapshotCounts(data), truncated: false },
    };
  }

  const totals = totalsBody[0] ? toWindowStats(parseStatsRow(totalsBody[0])) : emptyWindowStats();
  const data = {
    ...totals,
    min_amount_brl: wantCash && cashBody[0] ? parseStatsRow(cashBody[0]).min_amount_brl : null,
  };
  return {
    data,
    meta: { group_by: 'window', snapshot_count: data.snapshot_count, truncated: false },
  };
}

async function fetchSqlStats(rest: SupabaseRest, query: SnapshotQuery): Promise<SnapshotStatsResponse | null> {
  const response = await rest(
    'rpc/price_snapshot_stats',
    {
      method: 'POST',
      body: JSON.stringify(toStatsRpcArgs(query)),
    },
    [400, 404],
  );
  if (!response.ok) return null;

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body.map((row) => parseStatsRow(row as Record<string, unknown>)) : [];
  const snapshot_count = sumSnapshotCounts(rows);

  if (query.groupBy === 'route_day') {
    return {
      data: rows,
      meta: { group_by: 'route_day', snapshot_count, truncated: false },
    };
  }

  const data = rows[0] ? toWindowStats(rows[0]) : emptyWindowStats();
  return {
    data,
    meta: { group_by: 'window', snapshot_count: data.snapshot_count, truncated: false },
  };
}

async function sampleStats(rest: SupabaseRest, query: SnapshotQuery, table = 'price_snapshots'): Promise<SnapshotStatsResponse> {
  const { rows, total } = await fetchSnapshots(rest, table, query, {
    select: 'origin,destination,flight_date,miles,amount_brl,collected_at,source',
    order: 'collected_at.desc',
    limit: STATS_FETCH_CAP,
    offset: 0,
  });

  const truncated = statsSampleTruncated(rows.length, total, STATS_FETCH_CAP);
  if (query.groupBy === 'route_day') {
    const data = minByRouteDay(rows);
    return {
      data,
      meta: {
        group_by: 'route_day',
        snapshot_count: rows.length,
        truncated,
        fallback: 'in_memory_sample',
      },
    };
  }

  return {
    data: minOverWindow(rows),
    meta: {
      group_by: 'window',
      snapshot_count: rows.length,
      truncated,
      fallback: 'in_memory_sample',
    },
  };
}

async function observationSummary(url: URL, env: Env, deps: ReadApiDeps): Promise<Response> {
  const restOrErr = requireRest(env, deps);
  if (restOrErr instanceof Response) return restOrErr;
  const rest = restOrErr;

  const origin = (url.searchParams.get('origin') ?? '').trim().toUpperCase();
  const destination = (url.searchParams.get('destination') ?? '').trim().toUpperCase();
  if (origin.length !== 3) return jsonError('invalid_origin', 400, 'origin must be a 3-letter IATA code');
  if (destination.length !== 3) {
    return jsonError('invalid_destination', 400, 'destination must be a 3-letter IATA code');
  }

  const flightDateFrom = url.searchParams.get('flight_date_from') || null;
  const flightDateTo = url.searchParams.get('flight_date_to') || null;

  const response = await rest('rpc/price_observation_summary', {
    method: 'POST',
    body: JSON.stringify({
      p_origin: origin,
      p_destination: destination,
      p_flight_date_from: flightDateFrom,
      p_flight_date_to: flightDateTo,
    }),
  });

  const raw = (await response.json()) as unknown;
  const rows: ObservationSummaryRow[] = Array.isArray(raw)
    ? raw
        .map((row) => parseObservationSummaryRow(row as Record<string, unknown>))
        .filter((row): row is ObservationSummaryRow => row != null)
    : [];

  return json({
    data: {
      by_source: rows,
      by_day: rollupObservationDays(rows),
    },
    meta: {
      origin,
      destination,
      flight_date_from: flightDateFrom,
      flight_date_to: flightDateTo,
      row_count: rows.length,
    },
  });
}

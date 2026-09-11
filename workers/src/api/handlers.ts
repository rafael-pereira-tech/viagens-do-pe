import type { Env } from '../env';
import { createSupabaseRest, type SupabaseRest } from '../supabase';
import { latestByRouteDay, minByRouteDay, minOverWindow } from './aggregate';
import { authorizeRead } from './auth';
import { json, jsonError, publicErrorMessage } from './http';
import { isDryRunSource, toPublicSnapshot } from './redact';
import {
  LATEST_DEFAULT_LIMIT,
  LATEST_MAX_LIMIT,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  STATS_FETCH_CAP,
  parseContentRangeTotal,
  parseSnapshotQuery,
  toPostgrestQuery,
} from './query';
import type { PriceSnapshot, SnapshotQuery } from './types';

export interface ReadApiDeps {
  rest?: SupabaseRest | null;
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
  const { rows } = await fetchSnapshots(rest, 'price_snapshots', query, {
    select: 'origin,destination,flight_date,miles,amount_brl,collected_at,source',
    order: 'collected_at.desc',
    limit: STATS_FETCH_CAP,
    offset: 0,
  });

  const truncated = rows.length >= STATS_FETCH_CAP;
  if (query.groupBy === 'route_day') {
    const data = minByRouteDay(rows);
    return json({
      data,
      meta: { group_by: 'route_day' as const, snapshot_count: rows.length, truncated },
    });
  }

  return json({
    data: minOverWindow(rows),
    meta: { group_by: 'window' as const, snapshot_count: rows.length, truncated },
  });
}

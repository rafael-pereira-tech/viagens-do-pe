import { SNAPSHOT_COLUMNS, type SnapshotQuery } from './types';

export const LIST_DEFAULT_LIMIT = 100;
export const LIST_MAX_LIMIT = 500;
export const LATEST_DEFAULT_LIMIT = 500;
export const LATEST_MAX_LIMIT = 2000;
export const STATS_FETCH_CAP = 10_000;
export const MAX_OFFSET = 100_000;

const IATA = /^[A-Za-z]{3}$/;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /^[A-Za-z0-9_]{1,64}$/;
const SOURCE = /^[A-Za-z0-9_]{1,64}$/;

export type ParseQueryResult =
  | { ok: true; value: SnapshotQuery }
  | { ok: false; error: string; details: string; status: 400 };

export interface ParseQueryOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

function first(params: URLSearchParams, names: string[]): string {
  for (const name of names) {
    const value = params.get(name);
    if (value != null && value.trim() !== '') return value.trim();
  }
  return '';
}

function isTruthyFlag(value: string | null): boolean {
  if (value == null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parseLimit(raw: string, fallback: number, max: number): { ok: true; value: number } | { ok: false; details: string } {
  if (!raw) return { ok: true, value: fallback };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return { ok: false, details: 'limit must be a positive integer' };
  return { ok: true, value: Math.min(n, max) };
}

function parseOffset(raw: string): { ok: true; value: number } | { ok: false; details: string } {
  if (!raw) return { ok: true, value: 0 };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return { ok: false, details: 'offset must be a non-negative integer' };
  if (n > MAX_OFFSET) return { ok: false, details: `offset must be <= ${MAX_OFFSET}` };
  return { ok: true, value: n };
}

function parseIata(raw: string, field: string): { ok: true; value?: string } | { ok: false; details: string } {
  if (!raw) return { ok: true, value: undefined };
  if (!IATA.test(raw)) return { ok: false, details: `${field} must be a 3-letter IATA code` };
  return { ok: true, value: raw.toUpperCase() };
}

function parseCivilDate(raw: string, field: string): { ok: true; value?: string } | { ok: false; details: string } {
  if (!raw) return { ok: true, value: undefined };
  if (!CIVIL_DATE.test(raw)) return { ok: false, details: `${field} must be YYYY-MM-DD` };
  const ms = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(ms)) return { ok: false, details: `${field} is not a valid calendar date` };
  return { ok: true, value: raw };
}

function parseCollectedAt(raw: string, field: string): { ok: true; value?: string } | { ok: false; details: string } {
  if (!raw) return { ok: true, value: undefined };
  if (CIVIL_DATE.test(raw)) return { ok: true, value: raw };
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return { ok: false, details: `${field} must be an ISO-8601 datetime or YYYY-MM-DD` };
  return { ok: true, value: raw };
}

function parseToken(raw: string, field: string, normalize?: (value: string) => string): { ok: true; value?: string } | { ok: false; details: string } {
  if (!raw) return { ok: true, value: undefined };
  if (!TOKEN.test(raw)) return { ok: false, details: `${field} contains unsupported characters` };
  return { ok: true, value: normalize ? normalize(raw) : raw };
}

export function parseSnapshotQuery(params: URLSearchParams, options: ParseQueryOptions = {}): ParseQueryResult {
  const defaultLimit = options.defaultLimit ?? LIST_DEFAULT_LIMIT;
  const maxLimit = options.maxLimit ?? LIST_MAX_LIMIT;

  const origin = parseIata(first(params, ['origin']), 'origin');
  if (!origin.ok) return { ok: false, error: 'invalid_origin', details: origin.details, status: 400 };

  const destination = parseIata(first(params, ['destination']), 'destination');
  if (!destination.ok) return { ok: false, error: 'invalid_destination', details: destination.details, status: 400 };

  const airline = parseToken(first(params, ['airline']), 'airline', (v) => v.toUpperCase());
  if (!airline.ok) return { ok: false, error: 'invalid_airline', details: airline.details, status: 400 };

  const program = parseToken(first(params, ['program']), 'program', (v) => v.toLowerCase());
  if (!program.ok) return { ok: false, error: 'invalid_program', details: program.details, status: 400 };

  const sourceRaw = first(params, ['source']);
  let source: string | undefined;
  if (sourceRaw) {
    if (!SOURCE.test(sourceRaw)) {
      return { ok: false, error: 'invalid_source', details: 'source contains unsupported characters', status: 400 };
    }
    source = sourceRaw;
  }

  const flightDateFrom = parseCivilDate(first(params, ['flight_date_from', 'flight_date_gte']), 'flight_date_from');
  if (!flightDateFrom.ok) return { ok: false, error: 'invalid_flight_date_from', details: flightDateFrom.details, status: 400 };

  const flightDateTo = parseCivilDate(first(params, ['flight_date_to', 'flight_date_lte']), 'flight_date_to');
  if (!flightDateTo.ok) return { ok: false, error: 'invalid_flight_date_to', details: flightDateTo.details, status: 400 };

  if (flightDateFrom.value && flightDateTo.value && flightDateFrom.value > flightDateTo.value) {
    return { ok: false, error: 'invalid_flight_date_range', details: 'flight_date_from must be <= flight_date_to', status: 400 };
  }

  const collectedAtFrom = parseCollectedAt(first(params, ['collected_at_from', 'collected_at_gte']), 'collected_at_from');
  if (!collectedAtFrom.ok) {
    return { ok: false, error: 'invalid_collected_at_from', details: collectedAtFrom.details, status: 400 };
  }

  const collectedAtTo = parseCollectedAt(first(params, ['collected_at_to', 'collected_at_lte']), 'collected_at_to');
  if (!collectedAtTo.ok) {
    return { ok: false, error: 'invalid_collected_at_to', details: collectedAtTo.details, status: 400 };
  }

  if (collectedAtFrom.value && collectedAtTo.value && collectedAtFrom.value > collectedAtTo.value) {
    return {
      ok: false,
      error: 'invalid_collected_at_range',
      details: 'collected_at_from must be <= collected_at_to',
      status: 400,
    };
  }

  const limit = parseLimit(first(params, ['limit']), defaultLimit, maxLimit);
  if (!limit.ok) return { ok: false, error: 'invalid_limit', details: limit.details, status: 400 };

  const offset = parseOffset(first(params, ['offset']));
  if (!offset.ok) return { ok: false, error: 'invalid_offset', details: offset.details, status: 400 };

  const groupRaw = first(params, ['group_by']).toLowerCase();
  const groupBy = groupRaw === 'route_day' ? 'route_day' : groupRaw === '' || groupRaw === 'window' ? 'window' : null;
  if (!groupBy) {
    return { ok: false, error: 'invalid_group_by', details: 'group_by must be window or route_day', status: 400 };
  }

  return {
    ok: true,
    value: {
      origin: origin.value,
      destination: destination.value,
      airline: airline.value,
      program: program.value,
      source,
      flightDateFrom: flightDateFrom.value,
      flightDateTo: flightDateTo.value,
      collectedAtFrom: collectedAtFrom.value,
      collectedAtTo: collectedAtTo.value,
      includeRaw: isTruthyFlag(params.get('include_raw')),
      excludeDryRun: isTruthyFlag(params.get('exclude_dry_run')),
      limit: limit.value,
      offset: offset.value,
      groupBy,
    },
  };
}

export function snapshotSelect(includeRaw: boolean): string {
  return includeRaw ? `${SNAPSHOT_COLUMNS.join(',')},raw_payload` : SNAPSHOT_COLUMNS.join(',');
}

export interface PostgrestQueryOptions {
  select?: string;
  order?: string;
  limit?: number;
  offset?: number;
}

/**
 * Map a validated SnapshotQuery onto a PostgREST query string (no leading `?`).
 * Equality filters use `eq`; ranges use `gte` / `lte`.
 */
export function toPostgrestQuery(query: SnapshotQuery, options: PostgrestQueryOptions = {}): string {
  const params = new URLSearchParams();
  params.set('select', options.select ?? snapshotSelect(query.includeRaw));

  if (query.origin) params.set('origin', `eq.${query.origin}`);
  if (query.destination) params.set('destination', `eq.${query.destination}`);
  if (query.airline) params.set('airline', `eq.${query.airline}`);
  if (query.program) params.set('program', `eq.${query.program}`);
  if (query.source) params.set('source', `eq.${query.source}`);
  if (query.excludeDryRun && !query.source) params.append('source', 'not.like.*dry_run');

  if (query.flightDateFrom) params.append('flight_date', `gte.${query.flightDateFrom}`);
  if (query.flightDateTo) params.append('flight_date', `lte.${query.flightDateTo}`);
  if (query.collectedAtFrom) params.append('collected_at', `gte.${query.collectedAtFrom}`);
  if (query.collectedAtTo) params.append('collected_at', `lte.${query.collectedAtTo}`);

  params.set('order', options.order ?? 'collected_at.desc,id.desc');
  params.set('limit', String(options.limit ?? query.limit));
  params.set('offset', String(options.offset ?? query.offset));
  return params.toString();
}

export function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const match = header.match(/\/(\d+|\*)$/);
  if (!match) return null;
  if (match[1] === '*') return null;
  return Number(match[1]);
}

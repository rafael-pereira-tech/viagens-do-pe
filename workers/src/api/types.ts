/**
 * BE-6 read-API contract. Keep in sync with `src/types/api.ts` (FE copy)
 * and `docs/api-price-snapshots.md`.
 *
 * Nullability: `miles`, `amount_brl`, and `taxes_brl` may be null (miles-only
 * or cash-only rows are valid). `currency` is almost always `BRL`.
 * `source` is the collector id and may be a `*_dry_run` suffix — the FE should
 * filter those out or accept them as fixture data.
 */

export const SNAPSHOT_COLUMNS = [
  'id',
  'origin',
  'destination',
  'airline',
  'program',
  'flight_date',
  'departure_time',
  'miles',
  'amount_brl',
  'taxes_brl',
  'currency',
  'source',
  'collected_at',
  'created_at',
  'ingest_run_id',
] as const;

export type SnapshotColumn = (typeof SNAPSHOT_COLUMNS)[number];

export interface PriceSnapshot {
  id: string;
  origin: string;
  destination: string;
  airline: string;
  program: string;
  flight_date: string;
  departure_time: string | null;
  miles: number | null;
  amount_brl: number | null;
  taxes_brl: number | null;
  currency: string;
  source: string;
  collected_at: string;
  created_at: string;
  ingest_run_id: string | null;
  raw_payload?: unknown;
}

export type SnapshotGroupBy = 'window' | 'route_day';

export interface SnapshotQuery {
  origin?: string;
  destination?: string;
  airline?: string;
  program?: string;
  source?: string;
  flightDateFrom?: string;
  flightDateTo?: string;
  collectedAtFrom?: string;
  collectedAtTo?: string;
  includeRaw: boolean;
  excludeDryRun: boolean;
  limit: number;
  offset: number;
  groupBy: SnapshotGroupBy;
}

export interface SnapshotListMeta {
  limit: number;
  offset: number;
  total: number | null;
  include_raw: boolean;
  grain?: string;
  fallback?: 'in_memory_distinct';
}

export interface SnapshotListResponse {
  data: PriceSnapshot[];
  meta: SnapshotListMeta;
}

export interface SnapshotWindowStats {
  min_miles: number | null;
  min_amount_brl: number | null;
  snapshot_count: number;
  latest_collected_at: string | null;
}

export interface SnapshotRouteDayStats extends SnapshotWindowStats {
  origin: string;
  destination: string;
  flight_date: string;
}

export interface SnapshotStatsResponse {
  data: SnapshotWindowStats | SnapshotRouteDayStats[];
  meta: {
    group_by: SnapshotGroupBy;
    snapshot_count: number;
    truncated: boolean;
  };
}

export interface ApiErrorBody {
  error: string;
  details?: string;
}

/**
 * BE-6 read-API contract. Keep in sync with `src/types/api.ts` (FE copy)
 * and `docs/api-price-snapshots.md`.
 *
 * Nullability: `miles`, `amount_brl`, and `taxes_brl` may be null (miles-only
 * or cash-only rows are valid). `currency` is almost always `BRL`.
 * Locked `source` pairs: smiles_web/voegol, tudoazul/voeazul, latam_pass/latam_web.
 * LATAM cash is `latam_web` — never `latamairlines`. Dry-run may use `*_dry_run`.
 *
 * Stats KPIs (`GET /snapshots/stats`): `min_miles` only from award sources
 * (`smiles_web`, `tudoazul`, `latam_pass` + `_dry_run`); `min_amount_brl`
 * only from cash companions (`voegol`, `voeazul`, `latam_web`, `latam` +
 * `_dry_run`). Aggregated in SQL over the full filtered set.
 */

export const LIVE_SOURCES = ['smiles_web', 'voegol', 'tudoazul', 'voeazul', 'latam_pass', 'latam_web'] as const;

export type LiveSource = (typeof LIVE_SOURCES)[number];

export const DRY_RUN_SOURCES = [
  'smiles_web_dry_run',
  'voegol_dry_run',
  'tudoazul_dry_run',
  'voeazul_dry_run',
  'latam_pass_dry_run',
  'latam_web_dry_run',
] as const;

export type DryRunSource = (typeof DRY_RUN_SOURCES)[number];

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
  /** Exact civil date (`eq`). Dashboard `dia`. */
  flightDate?: string;
  flightDateFrom?: string;
  flightDateTo?: string;
  /** Exact collected_at (`eq` for a timestamp; civil date → that UTC day). */
  collectedAt?: string;
  collectedAtFrom?: string;
  collectedAtTo?: string;
  includeRaw: boolean;
  /**
   * When true, omit collector fixture rows (`source` contains `dry_run`).
   * Those are written by `SMILES_DRY_RUN` / `TUDOAZUL_DRY_RUN` / `LATAM_DRY_RUN`.
   * Live ingest uses unsuffixed sources. An explicit `source` / `fonte` wins
   * and this flag is not applied as an extra filter.
   */
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
    /** Always false on the SQL path. True only if the in-memory sample is short. */
    truncated: boolean;
    fallback?: 'in_memory_sample';
  };
}

export interface ApiErrorBody {
  error: string;
  details?: string;
}

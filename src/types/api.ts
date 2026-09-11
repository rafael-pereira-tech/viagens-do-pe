/**
 * BE-6 Worker read-API contract. Keep in sync with `workers/src/api/types.ts`
 * and `docs/api-price-snapshots.md`.
 *
 * Nullability: `miles`, `amount_brl`, and `taxes_brl` may be null (miles-only
 * or cash-only rows are valid). `currency` is almost always `BRL`.
 * `source` is the collector id and may be a `*_dry_run` suffix — filter or accept.
 * Stats: `min_miles` is award sources only; `min_amount_brl` is cash companions
 * only. `exclude_dry_run` drops fixture sources, not a cash-vs-miles switch.
 */

export type ApiPriceSnapshot = {
  id: string
  origin: string
  destination: string
  airline: string
  program: string
  flight_date: string
  departure_time: string | null
  miles: number | null
  amount_brl: number | null
  taxes_brl: number | null
  currency: string
  source: string
  collected_at: string
  created_at: string
  ingest_run_id: string | null
  raw_payload?: unknown
}

export type SnapshotGroupBy = 'window' | 'route_day'

export type SnapshotListQuery = {
  origin?: string
  destination?: string
  airline?: string
  program?: string
  source?: string
  /** Dashboard alias for `source`. */
  fonte?: string
  /** Exact civil date. Dashboard `dia`. */
  flight_date?: string
  flight_date_from?: string
  flight_date_to?: string
  collected_at?: string
  collected_at_from?: string
  collected_at_to?: string
  include_raw?: boolean
  /**
   * Drop collector fixture rows (`*_dry_run` sources from SMILES_DRY_RUN /
   * TUDOAZUL_DRY_RUN / LATAM_DRY_RUN). Live sources stay unsuffixed.
   * Ignored as an extra filter when `source` / `fonte` is already set.
   */
  exclude_dry_run?: boolean
  limit?: number
  offset?: number
  group_by?: SnapshotGroupBy
}

export type SnapshotListMeta = {
  limit: number
  offset: number
  total: number | null
  include_raw: boolean
  grain?: string
  fallback?: 'in_memory_distinct'
}

export type SnapshotListResponse = {
  data: ApiPriceSnapshot[]
  meta: SnapshotListMeta
}

export type SnapshotWindowStats = {
  min_miles: number | null
  min_amount_brl: number | null
  snapshot_count: number
  latest_collected_at: string | null
}

export type SnapshotRouteDayStats = SnapshotWindowStats & {
  origin: string
  destination: string
  flight_date: string
}

export type SnapshotStatsResponse = {
  data: SnapshotWindowStats | SnapshotRouteDayStats[]
  meta: {
    group_by: SnapshotGroupBy
    snapshot_count: number
    /** Always false when stats come from SQL. True only on a short in-memory sample. */
    truncated: boolean
    fallback?: 'in_memory_sample'
  }
}

export type ApiErrorBody = {
  error: string
  details?: string
}

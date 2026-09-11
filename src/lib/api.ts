import { API_TOKEN, API_URL } from './config.ts'
import type { DashboardQuery } from './query.ts'
import type { ApiPriceSnapshot, SnapshotListQuery, SnapshotListResponse, SnapshotStatsResponse } from '../types/api.ts'
import type { OfferRow } from '../types/priceSnapshot.ts'

export const SNAPSHOTS_PATH = '/api/v1/snapshots'
export const SNAPSHOTS_LATEST_PATH = '/api/v1/snapshots/latest'
export const SNAPSHOTS_STATS_PATH = '/api/v1/snapshots/stats'

/** Map D-1 dashboard query params onto the Worker read-API filters. */
export function dashboardToSnapshotQuery(query: DashboardQuery): SnapshotListQuery {
  return {
    origin: 'PET',
    destination: query.to,
    flight_date_from: query.from || undefined,
    flight_date_to: query.until || undefined,
    source: query.fonte && query.fonte.toLowerCase() !== 'todas' ? query.fonte : undefined,
  }
}

export function snapshotSearchParams(query: SnapshotListQuery): URLSearchParams {
  const params = new URLSearchParams()
  const entries: [keyof SnapshotListQuery, string | number | boolean | undefined][] = [
    ['origin', query.origin],
    ['destination', query.destination],
    ['airline', query.airline],
    ['program', query.program],
    ['source', query.source],
    ['flight_date_from', query.flight_date_from],
    ['flight_date_to', query.flight_date_to],
    ['collected_at_from', query.collected_at_from],
    ['collected_at_to', query.collected_at_to],
    ['include_raw', query.include_raw ? '1' : undefined],
    ['exclude_dry_run', query.exclude_dry_run ? '1' : undefined],
    ['limit', query.limit],
    ['offset', query.offset],
    ['group_by', query.group_by],
  ]
  for (const [key, value] of entries) {
    if (value === undefined || value === '') continue
    params.set(key, String(value))
  }
  return params
}

export function snapshotsUrl(path: string, query: SnapshotListQuery = {}): string {
  const base = API_URL.replace(/\/$/, '')
  const params = snapshotSearchParams(query).toString()
  return params ? `${base}${path}?${params}` : `${base}${path}`
}

function headers(init?: HeadersInit): Headers {
  const next = new Headers(init)
  if (API_TOKEN) next.set('Authorization', `Bearer ${API_TOKEN}`)
  return next
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: headers(init?.headers) })
  if (!response.ok) {
    throw new Error(`API ${response.status}`)
  }
  return (await response.json()) as T
}

/** Latest quote per route/day/source — usual table/chart feed. */
export function fetchLatestSnapshots(query: SnapshotListQuery, init?: RequestInit): Promise<SnapshotListResponse> {
  return getJson<SnapshotListResponse>(snapshotsUrl(SNAPSHOTS_LATEST_PATH, query), init)
}

/** Raw history (paginated). */
export function fetchSnapshots(query: SnapshotListQuery, init?: RequestInit): Promise<SnapshotListResponse> {
  return getJson<SnapshotListResponse>(snapshotsUrl(SNAPSHOTS_PATH, query), init)
}

/** KPI mins: `group_by=window` (default) or `route_day`. */
export function fetchSnapshotStats(query: SnapshotListQuery, init?: RequestInit): Promise<SnapshotStatsResponse> {
  return getJson<SnapshotStatsResponse>(snapshotsUrl(SNAPSHOTS_STATS_PATH, query), init)
}

/** Derive the FE stub `milheiro` (R$ / 1.000 milhas). Incomplete quotes → 0. */
export function toOfferRow(row: ApiPriceSnapshot): OfferRow {
  const miles = row.miles
  const amount = row.amount_brl
  const milheiro = miles != null && miles > 0 && amount != null ? (amount / miles) * 1000 : 0
  return {
    origin: row.origin,
    destination: row.destination,
    airline: row.airline,
    program: row.program,
    flight_date: row.flight_date,
    departure_time: row.departure_time ?? undefined,
    miles: miles ?? undefined,
    amount_brl: amount ?? undefined,
    taxes_brl: row.taxes_brl ?? undefined,
    currency: row.currency,
    source: row.source,
    collected_at: row.collected_at,
    milheiro,
  }
}

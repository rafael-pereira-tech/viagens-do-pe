import { API_URL, READ_API_KEY } from './config.ts'
import { isCashCompanionSource } from './filters.ts'
import type { ObservationSummaryResponse } from './history.ts'
import { todayIso, type DashboardQuery } from './query.ts'
import type { ApiPriceSnapshot, SnapshotListQuery, SnapshotListResponse, SnapshotStatsResponse } from '../types/api.ts'
import type { OfferRow } from '../types/priceSnapshot.ts'

export const SNAPSHOTS_PATH = '/api/v1/snapshots'
export const SNAPSHOTS_LATEST_PATH = '/api/v1/snapshots/latest'
export const SNAPSHOTS_STATS_PATH = '/api/v1/snapshots/stats'
export const OBSERVATIONS_SUMMARY_PATH = '/api/v1/observations/summary'

/** Map D-1 dashboard query params onto the Worker read-API filters. */
export function dashboardToSnapshotQuery(query: DashboardQuery): SnapshotListQuery {
  const hub = query.to
  const volta = query.sentido === 'volta'
  return {
    origin: volta ? hub : 'PET',
    destination: volta ? 'PET' : hub,
    flight_date: query.dia || undefined,
    flight_date_from: query.from || undefined,
    flight_date_to: query.until || undefined,
    fonte: query.fonte && query.fonte.toLowerCase() !== 'todas' ? query.fonte : undefined,
  }
}

const LATEST_PAGE_LIMIT = 2000

/**
 * Live dashboard fetch: PET → tab destination, no `dia` (chart needs the window).
 * Default excludes dry-run fixtures. `?dry=1` includes both; `?dry_run=1`
 * keeps only fixtures.
 */
export function liveDashboardQuery(query: DashboardQuery, today = todayIso()): SnapshotListQuery {
  const filters = dashboardToSnapshotQuery({ ...query, dia: '' })
  const fonte =
    query.dryMode === 'only' && filters.fonte && !filters.fonte.endsWith('_dry_run')
      ? `${filters.fonte}_dry_run`
      : filters.fonte
  return {
    ...filters,
    fonte,
    flight_date_from: filters.flight_date_from || today,
    exclude_dry_run: query.dryMode === 'live',
    limit: LATEST_PAGE_LIMIT,
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
    ['fonte', query.fonte],
    ['flight_date', query.flight_date],
    ['flight_date_from', query.flight_date_from],
    ['flight_date_to', query.flight_date_to],
    ['collected_at', query.collected_at],
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

/** Header the FE must send. Stub Entrar/Sair does not authorize reads. */
export const READ_AUTH_HEADER = 'Authorization'

export function readAuthHeaders(init?: HeadersInit): Headers {
  const next = new Headers(init)
  if (READ_API_KEY) next.set(READ_AUTH_HEADER, `Bearer ${READ_API_KEY}`)
  return next
}

export function describeFetchError(err: unknown): string {
  const detail = err instanceof Error ? err.message : 'erro desconhecido'
  if (detail.includes('404')) {
    return 'A API ainda não está no ar (404). Tente de novo depois do deploy do Worker.'
  }
  if (detail.includes('401')) {
    return 'A API pediu autorização (401). Defina VITE_API_TOKEN ou VITE_READ_API_KEY e faça rebuild.'
  }
  if (detail.includes('503')) {
    return 'A API não está pronta (503). Confira o Worker.'
  }
  return `Não foi possível carregar as ofertas (${detail}).`
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: readAuthHeaders(init?.headers) })
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

/** KPI mins from SQL over the filtered set. `min_amount_brl` is cash-only. */
export function fetchSnapshotStats(query: SnapshotListQuery, init?: RequestInit): Promise<SnapshotStatsResponse> {
  return getJson<SnapshotStatsResponse>(snapshotsUrl(SNAPSHOTS_STATS_PATH, query), init)
}

/** Per-source / per-day observation history (Δ% vs previous, min–max). */
export function fetchObservationSummary(
  query: Pick<SnapshotListQuery, 'origin' | 'destination' | 'flight_date_from' | 'flight_date_to'>,
  init?: RequestInit,
): Promise<ObservationSummaryResponse> {
  return getJson<ObservationSummaryResponse>(
    snapshotsUrl(OBSERVATIONS_SUMMARY_PATH, {
      origin: query.origin,
      destination: query.destination,
      flight_date_from: query.flight_date_from,
      flight_date_to: query.flight_date_to,
    }),
    init,
  )
}

/**
 * Classic milheiro: cash fare ÷ (miles / 1000) = R$ per 1.000 milhas.
 * Higher = miles buy more reais (better to redeem). Requires a cash companion
 * fare for the same route/day/airline (e.g. smiles_web + voegol).
 */
export function milheiroFromCashAndMiles(cashBrl: number, miles: number): number | null {
  if (!(miles > 0) || !(cashBrl > 0)) return null
  return (cashBrl / miles) * 1000
}

/**
 * Attach classic milheiro on award rows by pairing with the cheapest cash
 * companion (`voegol` / `voeazul` / `latam_web`) on the same origin/destination/date/airline.
 * Cash-only rows stay `milheiro: null`.
 */
export function attachClassicMilheiros(rows: OfferRow[]): OfferRow[] {
  const cashByKey = new Map<string, number>()
  for (const row of rows) {
    if (!isCashCompanionSource(row.source) || row.amount_brl == null || !(row.amount_brl > 0)) continue
    const key = `${row.origin}|${row.destination}|${row.flight_date}|${row.airline}`
    const prev = cashByKey.get(key)
    if (prev == null || row.amount_brl < prev) cashByKey.set(key, row.amount_brl)
  }
  return rows.map((row) => {
    if (row.miles == null || !(row.miles > 0)) return { ...row, milheiro: null }
    const cash = cashByKey.get(`${row.origin}|${row.destination}|${row.flight_date}|${row.airline}`)
    if (cash == null) return { ...row, milheiro: null }
    return { ...row, milheiro: milheiroFromCashAndMiles(cash, row.miles) }
  })
}

/** @deprecated Prefer attachClassicMilheiros — tax-based milheiro was misleading. */
export function milheiroFromQuote(input: {
  miles?: number | null
  taxes_brl?: number | null
  amount_brl?: number | null
}): number | null {
  const miles = input.miles
  // Same-row cash+miles (rare); otherwise null until attachClassicMilheiros.
  if (miles != null && miles > 0 && input.amount_brl != null && input.amount_brl > 0) {
    return milheiroFromCashAndMiles(input.amount_brl, miles)
  }
  return null
}

export function toOfferRow(row: ApiPriceSnapshot): OfferRow {
  const miles = row.miles
  const amount = row.amount_brl
  return {
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    airline: row.airline,
    program: row.program,
    flight_date: row.flight_date,
    departure_time: row.departure_time ?? undefined,
    stops: row.stops ?? undefined,
    miles: miles ?? undefined,
    amount_brl: amount ?? undefined,
    taxes_brl: row.taxes_brl ?? undefined,
    currency: row.currency,
    source: row.source,
    collected_at: row.collected_at,
    milheiro: null,
  }
}

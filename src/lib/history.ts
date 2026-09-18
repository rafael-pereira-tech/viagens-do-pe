/** Shared history-delta helpers for chart + offers table. */

/** Absolute percent change that triggers a visual badge. */
export const HISTORY_DELTA_THRESHOLD = 5

export type ObservationMetric = 'miles' | 'amount_brl'

export type ObservationSummaryRow = {
  origin: string
  destination: string
  source: string
  flight_date: string
  metric: ObservationMetric
  current_value: number | null
  prev_value: number | null
  delta_pct: number | null
  min_value: number | null
  max_value: number | null
  sample_count: number
  latest_collected_at: string | null
}

export type ObservationDaySummary = {
  flight_date: string
  miles: ObservationSummaryRow | null
  amount_brl: ObservationSummaryRow | null
}

export type ObservationSummaryResponse = {
  data: {
    by_source: ObservationSummaryRow[]
    by_day: ObservationDaySummary[]
  }
  meta: {
    origin: string
    destination: string
    flight_date_from: string | null
    flight_date_to: string | null
    row_count: number
  }
}

export type PriceHistoryMeta = {
  deltaPct: number | null
  min: number | null
  max: number | null
}

export function significantDelta(deltaPct: number | null | undefined): boolean {
  return deltaPct != null && Number.isFinite(deltaPct) && Math.abs(deltaPct) >= HISTORY_DELTA_THRESHOLD
}

export function formatDeltaPct(deltaPct: number): string {
  const rounded = Math.round(deltaPct)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}%`
}

export function sourceHistoryKey(source: string, flightDate: string, metric: ObservationMetric): string {
  return `${source}|${flightDate}|${metric}`
}

export function indexSourceHistory(rows: ObservationSummaryRow[]): Map<string, ObservationSummaryRow> {
  const map = new Map<string, ObservationSummaryRow>()
  for (const row of rows) {
    map.set(sourceHistoryKey(row.source, row.flight_date, row.metric), row)
  }
  return map
}

export function indexDayHistory(days: ObservationDaySummary[]): Map<string, ObservationDaySummary> {
  return new Map(days.map((d) => [d.flight_date, d]))
}

export function metaFromSummary(row: ObservationSummaryRow | null | undefined): PriceHistoryMeta {
  if (!row) return { deltaPct: null, min: null, max: null }
  return { deltaPct: row.delta_pct, min: row.min_value, max: row.max_value }
}

type OfferHistoryFields = {
  milesDeltaPct?: number | null
  milesMin?: number | null
  milesMax?: number | null
  brlDeltaPct?: number | null
  brlMin?: number | null
  brlMax?: number | null
}

/** Attach per-source history onto offer rows (miles and/or cash metrics). */
export function attachOfferHistory<T extends { source: string; flight_date: string }>(
  offers: T[],
  bySource: ObservationSummaryRow[],
): Array<T & OfferHistoryFields> {
  const index = indexSourceHistory(bySource)
  return offers.map((row) => {
    const miles = index.get(sourceHistoryKey(row.source, row.flight_date, 'miles'))
    const brl = index.get(sourceHistoryKey(row.source, row.flight_date, 'amount_brl'))
    if (!miles && !brl) return row
    return {
      ...row,
      milesDeltaPct: miles?.delta_pct ?? null,
      milesMin: miles?.min_value ?? null,
      milesMax: miles?.max_value ?? null,
      brlDeltaPct: brl?.delta_pct ?? null,
      brlMin: brl?.min_value ?? null,
      brlMax: brl?.max_value ?? null,
    }
  })
}

type ChartHistoryFields = {
  milesDeltaPct?: number | null
  brlDeltaPct?: number | null
  milesMin?: number | null
  milesMax?: number | null
  brlMin?: number | null
  brlMax?: number | null
}

/** Attach day-level rollup history onto chart points. */
export function attachChartHistory<T extends { date: string }>(
  points: T[],
  byDay: ObservationDaySummary[],
): Array<T & ChartHistoryFields> {
  const index = indexDayHistory(byDay)
  return points.map((point) => {
    const day = index.get(point.date)
    if (!day) return point
    return {
      ...point,
      milesDeltaPct: day.miles?.delta_pct ?? null,
      brlDeltaPct: day.amount_brl?.delta_pct ?? null,
      milesMin: day.miles?.min_value ?? null,
      milesMax: day.miles?.max_value ?? null,
      brlMin: day.amount_brl?.min_value ?? null,
      brlMax: day.amount_brl?.max_value ?? null,
    }
  })
}

/** Compact arrow badge label when |Δ| ≥ threshold (e.g. "↓12%" / "↑8%"). */
export function deltaBadgeLabel(deltaPct: number): string {
  const rounded = Math.round(Math.abs(deltaPct))
  return deltaPct < 0 ? `↓${rounded}%` : `↑${rounded}%`
}

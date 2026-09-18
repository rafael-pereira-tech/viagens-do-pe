/**
 * Observation history summary for dashboard ±5% deltas.
 */
import { isAwardMilesSource, isCashCompanionSource } from './sources';

export type ObservationMetric = 'miles' | 'amount_brl';

export interface ObservationSummaryRow {
  origin: string;
  destination: string;
  source: string;
  flight_date: string;
  metric: ObservationMetric;
  current_value: number | null;
  prev_value: number | null;
  delta_pct: number | null;
  min_value: number | null;
  max_value: number | null;
  sample_count: number;
  latest_collected_at: string | null;
}

/** Day-level rollup used by the chart (best current among sources). */
export interface ObservationDaySummary {
  flight_date: string;
  miles: ObservationSummaryRow | null;
  amount_brl: ObservationSummaryRow | null;
}

export function parseObservationSummaryRow(row: Record<string, unknown>): ObservationSummaryRow | null {
  const metric = row.metric;
  if (metric !== 'miles' && metric !== 'amount_brl') return null;
  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    origin: String(row.origin ?? ''),
    destination: String(row.destination ?? ''),
    source: String(row.source ?? ''),
    flight_date: String(row.flight_date ?? ''),
    metric,
    current_value: num(row.current_value),
    prev_value: num(row.prev_value),
    delta_pct: num(row.delta_pct),
    min_value: num(row.min_value),
    max_value: num(row.max_value),
    sample_count: Number(row.sample_count ?? 0) || 0,
    latest_collected_at: row.latest_collected_at != null ? String(row.latest_collected_at) : null,
  };
}

/**
 * For each flight_date + metric, pick the source with the best (lowest) current
 * value; min/max span all sources for that day/metric.
 */
export function rollupObservationDays(rows: ObservationSummaryRow[]): ObservationDaySummary[] {
  const byDate = new Map<string, ObservationSummaryRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.flight_date) ?? [];
    list.push(row);
    byDate.set(row.flight_date, list);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([flight_date, list]) => {
      const milesRows = list.filter((r) => r.metric === 'miles' && isAwardMilesSource(r.source));
      const cashRows = list.filter((r) => r.metric === 'amount_brl' && isCashCompanionSource(r.source));
      return {
        flight_date,
        miles: pickBestDay(milesRows),
        amount_brl: pickBestDay(cashRows),
      };
    });
}

function pickBestDay(rows: ObservationSummaryRow[]): ObservationSummaryRow | null {
  if (rows.length === 0) return null;
  let best = rows[0];
  for (const row of rows.slice(1)) {
    if (row.current_value == null) continue;
    if (best.current_value == null || row.current_value < best.current_value) best = row;
  }
  const mins = rows.map((r) => r.min_value).filter((v): v is number => v != null);
  const maxs = rows.map((r) => r.max_value).filter((v): v is number => v != null);
  return {
    ...best,
    min_value: mins.length ? Math.min(...mins) : best.min_value,
    max_value: maxs.length ? Math.max(...maxs) : best.max_value,
    sample_count: rows.reduce((n, r) => n + r.sample_count, 0),
  };
}

export function sourceMetricKey(source: string, flightDate: string, metric: ObservationMetric): string {
  return `${source}|${flightDate}|${metric}`;
}

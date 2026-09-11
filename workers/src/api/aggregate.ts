import type { PriceSnapshot, SnapshotRouteDayStats, SnapshotWindowStats } from './types';

export function latestKey(row: Pick<PriceSnapshot, 'origin' | 'destination' | 'airline' | 'program' | 'source' | 'flight_date'>): string {
  return [row.origin, row.destination, row.airline, row.program, row.source, row.flight_date].join('|');
}

export function routeDayKey(row: Pick<PriceSnapshot, 'origin' | 'destination' | 'flight_date'>): string {
  return `${row.origin}|${row.destination}|${row.flight_date}`;
}

/**
 * Keep the newest row per (origin, destination, airline, program, source, flight_date).
 * `rows` must already be ordered by `collected_at` descending.
 */
export function latestByRouteDay<T extends PriceSnapshot>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = latestKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function minFinite(current: number | null, next: number | null): number | null {
  if (next == null) return current;
  if (current == null || next < current) return next;
  return current;
}

function maxIso(current: string | null, next: string | null): string | null {
  if (!next) return current;
  if (!current || next > current) return next;
  return current;
}

export function minOverWindow(rows: readonly Pick<PriceSnapshot, 'miles' | 'amount_brl' | 'collected_at'>[]): SnapshotWindowStats {
  let min_miles: number | null = null;
  let min_amount_brl: number | null = null;
  let latest_collected_at: string | null = null;
  for (const row of rows) {
    min_miles = minFinite(min_miles, row.miles);
    min_amount_brl = minFinite(min_amount_brl, row.amount_brl);
    latest_collected_at = maxIso(latest_collected_at, row.collected_at);
  }
  return {
    min_miles,
    min_amount_brl,
    snapshot_count: rows.length,
    latest_collected_at,
  };
}

export function minByRouteDay(
  rows: readonly Pick<PriceSnapshot, 'origin' | 'destination' | 'flight_date' | 'miles' | 'amount_brl' | 'collected_at'>[],
): SnapshotRouteDayStats[] {
  const groups = new Map<string, SnapshotRouteDayStats>();
  for (const row of rows) {
    const key = routeDayKey(row);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        origin: row.origin,
        destination: row.destination,
        flight_date: row.flight_date,
        min_miles: row.miles,
        min_amount_brl: row.amount_brl,
        snapshot_count: 1,
        latest_collected_at: row.collected_at,
      });
      continue;
    }
    existing.min_miles = minFinite(existing.min_miles, row.miles);
    existing.min_amount_brl = minFinite(existing.min_amount_brl, row.amount_brl);
    existing.snapshot_count += 1;
    existing.latest_collected_at = maxIso(existing.latest_collected_at, row.collected_at);
  }
  return [...groups.values()].sort((a, b) => {
    const byDate = a.flight_date.localeCompare(b.flight_date);
    if (byDate !== 0) return byDate;
    const byDest = a.destination.localeCompare(b.destination);
    if (byDest !== 0) return byDest;
    return a.origin.localeCompare(b.origin);
  });
}

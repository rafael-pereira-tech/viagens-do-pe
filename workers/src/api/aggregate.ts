import { isAwardMilesSource, isCashCompanionSource } from './sources';
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

function kpiMiles(row: Pick<PriceSnapshot, 'miles' | 'source'>): number | null {
  return isAwardMilesSource(row.source) ? row.miles : null;
}

function kpiAmountBrl(row: Pick<PriceSnapshot, 'amount_brl' | 'source'>): number | null {
  return isCashCompanionSource(row.source) ? row.amount_brl : null;
}

export function emptyWindowStats(): SnapshotWindowStats {
  return {
    min_miles: null,
    min_amount_brl: null,
    snapshot_count: 0,
    latest_collected_at: null,
  };
}

/**
 * Window KPIs. `min_miles` ignores cash companions; `min_amount_brl` ignores
 * award / program sources (including legacy smiles_web rows with amount_brl).
 */
export function minOverWindow(
  rows: readonly Pick<PriceSnapshot, 'miles' | 'amount_brl' | 'collected_at' | 'source'>[],
): SnapshotWindowStats {
  let min_miles: number | null = null;
  let min_amount_brl: number | null = null;
  let latest_collected_at: string | null = null;
  for (const row of rows) {
    min_miles = minFinite(min_miles, kpiMiles(row));
    min_amount_brl = minFinite(min_amount_brl, kpiAmountBrl(row));
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
  rows: readonly Pick<
    PriceSnapshot,
    'origin' | 'destination' | 'flight_date' | 'miles' | 'amount_brl' | 'collected_at' | 'source'
  >[],
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
        min_miles: kpiMiles(row),
        min_amount_brl: kpiAmountBrl(row),
        snapshot_count: 1,
        latest_collected_at: row.collected_at,
      });
      continue;
    }
    existing.min_miles = minFinite(existing.min_miles, kpiMiles(row));
    existing.min_amount_brl = minFinite(existing.min_amount_brl, kpiAmountBrl(row));
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

function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value !== null && 'count' in value) {
    return asFiniteNumber((value as { count: unknown }).count);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Map one `price_snapshot_stats` RPC / aggregate row onto the public stats shape. */
export function parseStatsRow(row: Record<string, unknown>): SnapshotRouteDayStats {
  return {
    origin: asText(row.origin),
    destination: asText(row.destination),
    flight_date: asText(row.flight_date),
    min_miles: asFiniteNumber(row.min_miles),
    min_amount_brl: asFiniteNumber(row.min_amount_brl),
    snapshot_count: asFiniteNumber(row.snapshot_count) ?? 0,
    latest_collected_at: asIso(row.latest_collected_at),
  };
}

export function toWindowStats(row: SnapshotRouteDayStats): SnapshotWindowStats {
  return {
    min_miles: row.min_miles,
    min_amount_brl: row.min_amount_brl,
    snapshot_count: row.snapshot_count,
    latest_collected_at: row.latest_collected_at,
  };
}

export function sumSnapshotCounts(rows: readonly Pick<SnapshotWindowStats, 'snapshot_count'>[]): number {
  return rows.reduce((sum, row) => sum + row.snapshot_count, 0);
}

/**
 * A sample is truncated when PostgREST (or our cap) returned fewer rows than
 * the filtered set. `content-range` `/N` is the source of truth; falling back
 * to `rows.length >= cap` covers a missing header.
 */
export function statsSampleTruncated(
  rowCount: number,
  total: number | null,
  cap: number,
): boolean {
  if (total != null && total > rowCount) return true;
  return rowCount >= cap;
}

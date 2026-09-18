/**
 * Compact best-offer series derived from a batch of stamped snapshots.
 * One observation per (origin, destination, source, flight_date).
 */
import type { Snapshot } from './collectors/types';
import { isAwardMilesSource, isCashCompanionSource, sourceBase } from './api/sources';

export interface PriceObservation {
  ingest_run_id: string;
  collected_at: string;
  origin: string;
  destination: string;
  airline: string;
  program: string;
  source: string;
  flight_date: string;
  departure_time?: string | null;
  stops?: number | null;
  miles?: number | null;
  amount_brl?: number | null;
  taxes_brl?: number | null;
  milheiro?: number | null;
  snapshot_id?: string | null;
}

function seriesKey(s: Snapshot): string {
  return `${s.origin}|${s.destination}|${s.source}|${s.flight_date}`;
}

function cashKey(s: Pick<Snapshot, 'origin' | 'destination' | 'airline' | 'flight_date'>): string {
  return `${s.origin}|${s.destination}|${s.airline}|${s.flight_date}`;
}

/** Classic milheiro: cash / (miles/1000). */
export function classicMilheiro(miles: number, amountBrl: number): number {
  return amountBrl / (miles / 1000);
}

function positiveMiles(s: Snapshot): number | null {
  return s.miles != null && s.miles > 0 ? s.miles : null;
}

function positiveAmount(s: Snapshot): number | null {
  return s.amount_brl != null && s.amount_brl > 0 ? s.amount_brl : null;
}

function isPersistable(s: Snapshot): boolean {
  return positiveMiles(s) != null || positiveAmount(s) != null;
}

/**
 * Build origin/dest/airline/date → cheapest cash companion amount in the batch.
 */
export function cashCompanionIndex(snapshots: Snapshot[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const s of snapshots) {
    if (!isCashCompanionSource(s.source)) continue;
    const amount = positiveAmount(s);
    if (amount == null) continue;
    const key = cashKey(s);
    const prev = best.get(key);
    if (prev == null || amount < prev) best.set(key, amount);
  }
  return best;
}

function score(s: Snapshot, _milheiro: number | null): number {
  const miles = positiveMiles(s);
  if (miles != null && isAwardMilesSource(s.source)) {
    // Best award fare = fewest miles to redeem.
    return miles;
  }
  const amount = positiveAmount(s);
  if (amount != null) return amount;
  return Number.POSITIVE_INFINITY;
}

function milheiroFor(s: Snapshot, cashByRoute: Map<string, number>): number | null {
  const miles = positiveMiles(s);
  if (miles == null || !isAwardMilesSource(s.source)) return null;
  const cash = cashByRoute.get(cashKey(s));
  if (cash == null) return null;
  return classicMilheiro(miles, cash);
}

/**
 * Pick the best persistable snapshot per series key and map to observations.
 */
export function bestObservationsFromSnapshots(snapshots: Snapshot[]): PriceObservation[] {
  const persistable = snapshots.filter(isPersistable);
  if (persistable.length === 0) return [];

  const cashByRoute = cashCompanionIndex(persistable);
  const best = new Map<string, { snapshot: Snapshot; milheiro: number | null; score: number }>();

  for (const s of persistable) {
    if (!s.ingest_run_id || !s.collected_at) continue;
    const milheiro = milheiroFor(s, cashByRoute);
    const sc = score(s, milheiro);
    const key = seriesKey(s);
    const prev = best.get(key);
    if (!prev || sc < prev.score) {
      best.set(key, { snapshot: s, milheiro, score: sc });
    }
  }

  const out: PriceObservation[] = [];
  for (const { snapshot: s, milheiro } of best.values()) {
    out.push({
      ingest_run_id: s.ingest_run_id!,
      collected_at: s.collected_at!,
      origin: s.origin,
      destination: s.destination,
      airline: s.airline,
      program: s.program,
      source: s.source,
      flight_date: s.flight_date,
      departure_time: s.departure_time ?? null,
      stops: s.stops ?? null,
      miles: positiveMiles(s),
      amount_brl: isCashCompanionSource(s.source) ? positiveAmount(s) : null,
      taxes_brl: s.taxes_brl ?? null,
      milheiro,
      snapshot_id: null,
    });
  }

  // Stable order for tests / deterministic inserts.
  out.sort((a, b) =>
    `${a.origin}${a.destination}${a.source}${a.flight_date}`.localeCompare(
      `${b.origin}${b.destination}${b.source}${b.flight_date}`,
    ),
  );
  return out;
}

export function toObservationRow(obs: PriceObservation): Record<string, unknown> {
  return {
    ingest_run_id: obs.ingest_run_id,
    collected_at: obs.collected_at,
    origin: obs.origin,
    destination: obs.destination,
    airline: obs.airline,
    program: obs.program,
    source: obs.source,
    flight_date: obs.flight_date,
    departure_time: obs.departure_time ?? null,
    stops: obs.stops ?? null,
    miles: obs.miles ?? null,
    amount_brl: obs.amount_brl ?? null,
    taxes_brl: obs.taxes_brl ?? null,
    milheiro: obs.milheiro ?? null,
    snapshot_id: obs.snapshot_id ?? null,
  };
}

/** Strip dry-run suffix for alert matching against live source filters. */
export function observationSourceBase(source: string): string {
  return sourceBase(source);
}

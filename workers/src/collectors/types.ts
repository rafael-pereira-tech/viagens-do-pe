import type { Airline, Program } from '../config';
import type { RunStatus } from '../status';

export interface CollectParams {
  origin: string;
  destination: string;
  airline: Airline;
  program: Program;
  flightDate: string;
}

/**
 * Collector output shaped for `public.price_snapshots`.
 * `id` / `created_at` are assigned by Postgres. The scheduler stamps
 * `collected_at` and `ingest_run_id` on every write path — collectors
 * should leave those unset.
 */
export interface Snapshot {
  origin: string;
  destination: string;
  airline: Airline;
  program: Program;
  flight_date: string;
  departure_time?: string | null;
  miles?: number | null;
  amount_brl?: number | null;
  taxes_brl?: number | null;
  currency: string;
  source: string;
  raw_payload?: unknown;
  collected_at?: string;
  ingest_run_id?: string;
}

export interface CollectResult {
  status: RunStatus;
  snapshots: Snapshot[];
  error?: string;
}

/**
 * BE-3/4/5 implement this. The scheduler never imports airline HTTP clients
 * directly — swap the module behind `collectors/index.ts`.
 */
export interface Collector {
  collect(params: CollectParams): Promise<CollectResult>;
}

import type { Snapshot } from './collectors/types';
import type { Env } from './env';
import type { RunStatus } from './status';

export interface IngestRunInsert {
  started_at: string;
  finished_at: string;
  status: RunStatus;
  cron: string;
  snapshot_count: number;
  job_count: number;
  error_message: string | null;
  details: unknown;
}

export interface SnapshotStore {
  insertSnapshots(snapshots: Snapshot[]): Promise<number>;
  insertRun(run: IngestRunInsert): Promise<void>;
}

function toRow(snapshot: Snapshot): Record<string, unknown> {
  const row: Record<string, unknown> = {
    origin: snapshot.origin,
    destination: snapshot.destination,
    airline: snapshot.airline,
    program: snapshot.program,
    flight_date: snapshot.flight_date,
    currency: snapshot.currency || 'BRL',
    source: snapshot.source,
  };
  if (snapshot.departure_time !== undefined) row.departure_time = snapshot.departure_time;
  if (snapshot.miles !== undefined) row.miles = snapshot.miles;
  if (snapshot.amount_brl !== undefined) row.amount_brl = snapshot.amount_brl;
  if (snapshot.taxes_brl !== undefined) row.taxes_brl = snapshot.taxes_brl;
  if (snapshot.raw_payload !== undefined) row.raw_payload = snapshot.raw_payload;
  return row;
}

export function isPersistableSnapshot(snapshot: Snapshot): boolean {
  return snapshot.miles != null || snapshot.amount_brl != null;
}

const PLACEHOLDER = /your[_-]?project|example\.supabase|placeholder|changeme|your-service-role-key/i;

/**
 * Skip persistence for empty or example credentials. workerd throws an
 * uncatchable internal error on DNS failure, so dummy hosts must not be fetched.
 */
export function isConfiguredSupabase(env: Env): boolean {
  const url = env.SUPABASE_URL?.trim() ?? '';
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  if (!url || !key) return false;
  if (PLACEHOLDER.test(url) || PLACEHOLDER.test(key)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function createSupabase(env: Env): SnapshotStore | null {
  if (!isConfiguredSupabase(env)) return null;
  const baseUrl = env.SUPABASE_URL!.replace(/\/$/, '');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY!;

  async function rest(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('apikey', serviceRoleKey);
    headers.set('Authorization', `Bearer ${serviceRoleKey}`);
    headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/rest/v1/${path}`, { ...init, headers });
    } catch (err) {
      throw new Error(`Supabase ${path} fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase ${path} ${response.status}: ${body}`);
    }
    return response;
  }

  return {
    async insertSnapshots(snapshots: Snapshot[]): Promise<number> {
      const rows = snapshots.filter(isPersistableSnapshot).map(toRow);
      if (rows.length === 0) return 0;
      await rest('price_snapshots', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      });
      return rows.length;
    },
    async insertRun(run: IngestRunInsert): Promise<void> {
      await rest('ingest_runs', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(run),
      });
    },
  };
}

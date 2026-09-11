import type { Snapshot } from './collectors/types';
import type { Env } from './env';
import type { IngestRunStatus, RunStatus } from './status';

export interface IngestRunStart {
  id: string;
  started_at: string;
  collected_at: string;
  lease_expires_at: string;
  cron: string;
}

export interface IngestRunFinish {
  finished_at: string;
  status: RunStatus;
  snapshot_count: number;
  job_count: number;
  error_message: string | null;
  details: unknown;
}

export type BeginRunResult = { acquired: true } | { acquired: false; reason: 'already_running' };

export interface SnapshotStore {
  expireStaleRuns(nowIso: string): Promise<number>;
  beginRun(run: IngestRunStart): Promise<BeginRunResult>;
  insertSnapshots(snapshots: Snapshot[]): Promise<number>;
  finishRun(id: string, patch: IngestRunFinish): Promise<boolean>;
}

export function stampSnapshot(snapshot: Snapshot, runId: string, collectedAt: string): Snapshot {
  return {
    ...snapshot,
    ingest_run_id: runId,
    collected_at: collectedAt,
  };
}

export function toSnapshotRow(snapshot: Snapshot): Record<string, unknown> {
  if (!snapshot.collected_at || !snapshot.ingest_run_id) {
    throw new Error('Refusing to persist snapshot without collected_at and ingest_run_id');
  }
  const row: Record<string, unknown> = {
    origin: snapshot.origin,
    destination: snapshot.destination,
    airline: snapshot.airline,
    program: snapshot.program,
    flight_date: snapshot.flight_date,
    currency: snapshot.currency || 'BRL',
    source: snapshot.source,
    collected_at: snapshot.collected_at,
    ingest_run_id: snapshot.ingest_run_id,
  };
  if (snapshot.departure_time !== undefined) row.departure_time = snapshot.departure_time;
  if (snapshot.miles !== undefined) {
    row.miles = snapshot.miles != null && snapshot.miles > 0 ? snapshot.miles : null;
  }
  if (snapshot.amount_brl !== undefined) {
    row.amount_brl = snapshot.amount_brl != null && snapshot.amount_brl > 0 ? snapshot.amount_brl : null;
  }
  if (snapshot.taxes_brl !== undefined) row.taxes_brl = snapshot.taxes_brl;
  if (snapshot.raw_payload !== undefined) row.raw_payload = snapshot.raw_payload;
  return row;
}

export function isPersistableSnapshot(snapshot: Snapshot): boolean {
  const miles = snapshot.miles;
  const amount = snapshot.amount_brl;
  return (miles != null && miles > 0) || (amount != null && amount > 0);
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

export type SupabaseRest = (
  path: string,
  init?: RequestInit,
  allowStatuses?: number[],
) => Promise<Response>;

/** Service-role PostgREST client. Never expose the key to the browser. */
export function createSupabaseRest(env: Env): SupabaseRest | null {
  if (!isConfiguredSupabase(env)) return null;
  const baseUrl = env.SUPABASE_URL!.replace(/\/$/, '');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY!;

  return async function rest(path: string, init: RequestInit = {}, allowStatuses: number[] = []): Promise<Response> {
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
    if (!response.ok && !allowStatuses.includes(response.status)) {
      const body = await response.text();
      throw new Error(`Supabase ${path} ${response.status}: ${body}`);
    }
    return response;
  };
}

export function createSupabase(env: Env): SnapshotStore | null {
  const rest = createSupabaseRest(env);
  if (!rest) return null;

  return {
    async expireStaleRuns(nowIso: string): Promise<number> {
      const encoded = encodeURIComponent(nowIso);
      const response = await rest(
        `ingest_runs?status=eq.running&lease_expires_at=lt.${encoded}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            status: 'scrape_failed' satisfies IngestRunStatus,
            finished_at: nowIso,
            error_message: 'lease expired before completion',
          }),
        },
      );
      const rows = (await response.json()) as unknown[];
      return Array.isArray(rows) ? rows.length : 0;
    },

    async beginRun(run: IngestRunStart): Promise<BeginRunResult> {
      const response = await rest(
        'ingest_runs',
        {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            id: run.id,
            started_at: run.started_at,
            collected_at: run.collected_at,
            lease_expires_at: run.lease_expires_at,
            status: 'running' satisfies IngestRunStatus,
            cron: run.cron,
            snapshot_count: 0,
            job_count: 0,
            details: { phase: 'started' },
          }),
        },
        [409],
      );
      if (response.status === 409) return { acquired: false, reason: 'already_running' };
      return { acquired: true };
    },

    async insertSnapshots(snapshots: Snapshot[]): Promise<number> {
      const rows = snapshots.filter(isPersistableSnapshot).map(toSnapshotRow);
      if (rows.length === 0) return 0;
      await rest('price_snapshots', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      });
      return rows.length;
    },

    async finishRun(id: string, patch: IngestRunFinish): Promise<boolean> {
      const response = await rest(`ingest_runs?id=eq.${encodeURIComponent(id)}&status=eq.running`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      const rows = (await response.json()) as unknown[];
      return Array.isArray(rows) && rows.length > 0;
    },
  };
}

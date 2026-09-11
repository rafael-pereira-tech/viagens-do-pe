import { FLIGHT_WINDOW, INGEST_LEASE_MS, type Airline, type Program } from './config';
import { getCollector } from './collectors';
import type { CollectParams, CollectResult, Collector, Snapshot } from './collectors/types';
import type { Env } from './env';
import { isolateLock, type SkipIfRunningLock } from './lock';
import { buildJobs } from './jobs';
import { aggregateStatus, isFailureStatus, type RunStatus } from './status';
import {
  createSupabase,
  isPersistableSnapshot,
  stampSnapshot,
  type SnapshotStore,
} from './supabase';

export interface RouteRunSummary {
  origin: string;
  destination: string;
  airline: Airline;
  program: Program;
  jobs: number;
  preferredJobs: number;
  snapshots: number;
  status: RunStatus;
}

export interface JobFailure {
  origin: string;
  destination: string;
  airline: Airline;
  program: Program;
  flightDate: string;
  status: RunStatus;
  error?: string;
}

export interface IngestSummary {
  skipped: boolean;
  skipReason?: 'already_running';
  status: RunStatus | null;
  runId: string;
  collectedAt: string;
  cron: string;
  startedAt: string;
  finishedAt: string;
  jobCount: number;
  snapshotCount: number;
  window: { start: string; end: string };
  routes: RouteRunSummary[];
  failures: JobFailure[];
  persisted: boolean;
  error?: string;
}

export interface IngestDeps {
  env: Env;
  cron: string;
  scheduledTime: Date;
  now?: Date;
  collect?: (params: CollectParams) => Promise<CollectResult>;
  store?: SnapshotStore | null;
  lock?: SkipIfRunningLock;
}

function resolveWindow(env: Env): { start: string; end: string } {
  return {
    start: env.FLIGHT_WINDOW_START || FLIGHT_WINDOW.start,
    end: env.FLIGHT_WINDOW_END || FLIGHT_WINDOW.end,
  };
}

function normalizeResult(result: CollectResult): CollectResult {
  if (result.status === 'success' && result.snapshots.length === 0) {
    return { ...result, status: 'empty' };
  }
  return result;
}

function routeKey(job: { origin: string; destination: string; airline: string; program: string }): string {
  return `${job.origin}-${job.destination}-${job.airline}-${job.program}`;
}

function skippedSummary(opts: {
  runId: string;
  collectedAt: string;
  cron: string;
  startedAt: string;
  window: { start: string; end: string };
}): IngestSummary {
  return {
    skipped: true,
    skipReason: 'already_running',
    status: null,
    runId: opts.runId,
    collectedAt: opts.collectedAt,
    cron: opts.cron,
    startedAt: opts.startedAt,
    finishedAt: new Date().toISOString(),
    jobCount: 0,
    snapshotCount: 0,
    window: opts.window,
    routes: [],
    failures: [],
    persisted: false,
  };
}

function newRunId(): string {
  return crypto.randomUUID();
}

export async function runIngest(deps: IngestDeps): Promise<IngestSummary> {
  const now = deps.now ?? new Date();
  const startedAt = deps.scheduledTime.toISOString();
  const collectedAt = now.toISOString();
  const runId = newRunId();
  const window = resolveWindow(deps.env);
  const lock = deps.lock ?? isolateLock;
  const collect =
    deps.collect ??
    ((params: CollectParams) => getCollector(params.program).collect(params));
  const store = deps.store === undefined ? createSupabase(deps.env) : deps.store;

  if (!lock.tryAcquire(runId)) {
    const summary = skippedSummary({ runId, collectedAt, cron: deps.cron, startedAt, window });
    console.log(JSON.stringify({ msg: 'ingest_skipped', reason: 'already_running', scope: 'isolate' }));
    return summary;
  }

  let acquiredDb = false;
  try {
    if (store) {
      await store.expireStaleRuns(collectedAt);
      const began = await store.beginRun({
        id: runId,
        started_at: startedAt,
        collected_at: collectedAt,
        lease_expires_at: new Date(now.getTime() + INGEST_LEASE_MS).toISOString(),
        cron: deps.cron,
      });
      if (!began.acquired) {
        const summary = skippedSummary({ runId, collectedAt, cron: deps.cron, startedAt, window });
        console.log(JSON.stringify({ msg: 'ingest_skipped', reason: 'already_running', scope: 'postgres' }));
        return summary;
      }
      acquiredDb = true;
    }

    const jobs = buildJobs(window);
    const statuses: RunStatus[] = [];
    const pending: Snapshot[] = [];
    const failures: JobFailure[] = [];
    const acc = new Map<
      string,
      {
        origin: string;
        destination: string;
        airline: Airline;
        program: Program;
        jobs: number;
        preferredJobs: number;
        snapshots: number;
        statuses: RunStatus[];
      }
    >();

    for (const job of jobs) {
      let result: CollectResult;
      try {
        result = normalizeResult(
          await collect({
            origin: job.origin,
            destination: job.destination,
            airline: job.airline,
            program: job.program,
            flightDate: job.flightDate,
          }),
        );
      } catch (err) {
        result = {
          status: 'scrape_failed',
          snapshots: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }

      statuses.push(result.status);
      for (const snapshot of result.snapshots) {
        pending.push(stampSnapshot(snapshot, runId, collectedAt));
      }

      const key = routeKey(job);
      const current = acc.get(key) ?? {
        origin: job.origin,
        destination: job.destination,
        airline: job.airline,
        program: job.program,
        jobs: 0,
        preferredJobs: 0,
        snapshots: 0,
        statuses: [],
      };
      current.jobs += 1;
      if (job.preferred) current.preferredJobs += 1;
      current.snapshots += result.snapshots.length;
      current.statuses.push(result.status);
      acc.set(key, current);

      if (isFailureStatus(result.status)) {
        failures.push({
          origin: job.origin,
          destination: job.destination,
          airline: job.airline,
          program: job.program,
          flightDate: job.flightDate,
          status: result.status,
          error: result.error,
        });
      }
    }

    const routes: RouteRunSummary[] = [...acc.values()].map((row) => ({
      origin: row.origin,
      destination: row.destination,
      airline: row.airline,
      program: row.program,
      jobs: row.jobs,
      preferredJobs: row.preferredJobs,
      snapshots: row.snapshots,
      status: aggregateStatus(row.statuses),
    }));

    let status = aggregateStatus(statuses);
    if (status === 'success' && failures.length > 0) {
      status = 'partial';
    }

    let error: string | undefined;
    const persistable = pending.filter(isPersistableSnapshot);

    if (store && persistable.length > 0) {
      try {
        await store.insertSnapshots(persistable);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        status = status === 'success' || status === 'empty' ? 'partial' : status;
      }
    }

    const finishedAt = new Date().toISOString();
    const summary: IngestSummary = {
      skipped: false,
      status,
      runId,
      collectedAt,
      cron: deps.cron,
      startedAt,
      finishedAt,
      jobCount: jobs.length,
      snapshotCount: persistable.length,
      window,
      routes,
      failures,
      persisted: false,
      error,
    };

    if (store && acquiredDb) {
      try {
        const finished = await store.finishRun(runId, {
          finished_at: summary.finishedAt,
          status: summary.status!,
          snapshot_count: summary.snapshotCount,
          job_count: summary.jobCount,
          error_message: summary.error ?? null,
          details: { window, routes, failures, collected_at: collectedAt },
        });
        summary.persisted = finished;
        if (!finished) {
          const lost = 'lost running lease before finish (expired or reaped)';
          summary.error = summary.error ? `${summary.error}; ${lost}` : lost;
          if (summary.status === 'success' || summary.status === 'empty') {
            summary.status = 'partial';
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summary.error = summary.error ? `${summary.error}; ingest_runs: ${message}` : message;
        if (summary.status === 'success' || summary.status === 'empty') {
          summary.status = 'partial';
        }
      }
    }

    console.log(
      JSON.stringify({
        msg: 'ingest_complete',
        status: summary.status,
        runId: summary.runId,
        cron: summary.cron,
        jobCount: summary.jobCount,
        snapshotCount: summary.snapshotCount,
        persisted: summary.persisted,
      }),
    );
    return summary;
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    const summary: IngestSummary = {
      skipped: false,
      status: 'scrape_failed',
      runId,
      collectedAt,
      cron: deps.cron,
      startedAt,
      finishedAt,
      jobCount: 0,
      snapshotCount: 0,
      window,
      routes: [],
      failures: [],
      persisted: false,
      error: message,
    };
    if (store && acquiredDb) {
      try {
        summary.persisted = await store.finishRun(runId, {
          finished_at: finishedAt,
          status: 'scrape_failed',
          snapshot_count: 0,
          job_count: 0,
          error_message: message,
          details: { window, error: message },
        });
      } catch {
        // Isolate lock still releases in finally; cron logs keep the summary.
      }
    }
    console.log(JSON.stringify({ msg: 'ingest_failed', status: summary.status, runId }));
    return summary;
  } finally {
    lock.release(runId);
  }
}

/** Default collector lookup used by the Worker. Re-exported for BE-3/4/5. */
export type { Collector };

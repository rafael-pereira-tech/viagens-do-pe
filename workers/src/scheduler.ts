import { FLIGHT_WINDOW, type Airline, type Program } from './config';
import { getCollector } from './collectors';
import type { CollectParams, CollectResult, Collector, Snapshot } from './collectors/types';
import type { Env } from './env';
import { buildJobs } from './jobs';
import { aggregateStatus, type RunStatus } from './status';
import { createSupabase, isPersistableSnapshot, type SnapshotStore } from './supabase';

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
  status: RunStatus;
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
  collect?: (params: CollectParams) => Promise<CollectResult>;
  store?: SnapshotStore | null;
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

export async function runIngest(deps: IngestDeps): Promise<IngestSummary> {
  const started = deps.scheduledTime;
  const startedAt = started.toISOString();
  const window = resolveWindow(deps.env);
  const collect =
    deps.collect ??
    ((params: CollectParams) => getCollector(params.program).collect(params));
  const store = deps.store === undefined ? createSupabase(deps.env) : deps.store;

  try {
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
      pending.push(...result.snapshots);

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

      if (result.status === 'auth_failed' || result.status === 'scrape_failed') {
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
    let persisted = false;
    let error: string | undefined;
    const persistable = pending.filter(isPersistableSnapshot);

    if (store && persistable.length > 0) {
      try {
        await store.insertSnapshots(persistable);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        status = 'partial';
      }
    }

    const finishedAt = new Date().toISOString();
    const summary: IngestSummary = {
      status,
      cron: deps.cron,
      startedAt,
      finishedAt,
      jobCount: jobs.length,
      snapshotCount: persistable.length,
      window,
      routes,
      failures,
      persisted,
      error,
    };

    if (store) {
      try {
        await store.insertRun({
          started_at: summary.startedAt,
          finished_at: summary.finishedAt,
          status: summary.status,
          cron: summary.cron,
          snapshot_count: summary.snapshotCount,
          job_count: summary.jobCount,
          error_message: summary.error ?? null,
          details: {
            window,
            routes,
            failures,
          },
        });
        summary.persisted = true;
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
        cron: summary.cron,
        jobCount: summary.jobCount,
        snapshotCount: summary.snapshotCount,
        persisted: summary.persisted,
      }),
    );
    return summary;
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const summary: IngestSummary = {
      status: 'scrape_failed',
      cron: deps.cron,
      startedAt,
      finishedAt,
      jobCount: 0,
      snapshotCount: 0,
      window,
      routes: [],
      failures: [],
      persisted: false,
      error: err instanceof Error ? err.message : String(err),
    };
    if (store) {
      try {
        await store.insertRun({
          started_at: summary.startedAt,
          finished_at: summary.finishedAt,
          status: summary.status,
          cron: summary.cron,
          snapshot_count: 0,
          job_count: 0,
          error_message: summary.error ?? null,
          details: { window, error: summary.error },
        });
      } catch {
        // Swallow persist errors on the fatal path; the cron log still has the summary.
      }
    }
    console.log(JSON.stringify({ msg: 'ingest_failed', ...summary }));
    return summary;
  }
}

/** Default collector lookup used by the Worker. Re-exported for BE-3/4/5. */
export type { Collector };

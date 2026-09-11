import type { Env } from './env';
import type { IngestSummary } from './scheduler';

const MAX_FAILURES = 25;

/** Subset of @sentry/cloudflare CloudflareOptions used by withSentry. No SDK import so root CI tests resolve. */
export type WorkerSentryOptions = {
  dsn: string;
  environment: string;
  release?: string;
  enabled: boolean;
  sendDefaultPii: boolean;
  tracesSampleRate: number;
  dataCollection: {
    userInfo: boolean;
    cookies: boolean;
    httpBodies: [];
    httpHeaders: { request: boolean; response: boolean };
    stackFrameVariables: boolean;
  };
};

function sanitizeIngestError(detail: string | undefined): string | undefined {
  if (!detail) return detail;
  if (/<!doctype html/i.test(detail) || /<html[\s>]/i.test(detail) || /access denied/i.test(detail)) {
    return 'HTML WAF/Akamai';
  }
  if (/something went wrong/i.test(detail) && /406/.test(detail)) {
    return 'Akamai 406 (guest or datacenter IP)';
  }
  return detail.length > 180 ? `${detail.slice(0, 180)}…` : detail;
}

export function sentryOptions(env: Env): WorkerSentryOptions | undefined {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return undefined;

  const environment = env.ENVIRONMENT?.trim() || 'production';
  const release = env.CF_VERSION_METADATA?.tag?.trim() || env.CF_VERSION_METADATA?.id?.trim();
  return {
    dsn,
    environment,
    ...(release ? { release } : {}),
    enabled: true,
    sendDefaultPii: false,
    tracesSampleRate: environment === 'staging' ? 1 : 0.1,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: { request: false, response: false },
      stackFrameVariables: false,
    },
  };
}

export function ingestSentryEvent(summary: IngestSummary): {
  message: string;
  level: 'error' | 'warning';
  fingerprint: string[];
  tags: Record<string, string>;
  extra: Record<string, unknown>;
} | null {
  if (summary.skipped) return null;
  const status = summary.status;
  if (!status || status === 'success' || status === 'empty') return null;

  return {
    message: `ingest ${status} (${summary.cron})`,
    level: status === 'partial' ? 'warning' : 'error',
    fingerprint: ['ingest', status, summary.cron],
    tags: {
      ingest_status: status,
      cron: summary.cron,
      persisted: String(summary.persisted),
    },
    extra: {
      runId: summary.runId,
      jobCount: summary.jobCount,
      snapshotCount: summary.snapshotCount,
      window: summary.window,
      error: sanitizeIngestError(summary.error),
      failureCount: summary.failures.length,
      failures: summary.failures.slice(0, MAX_FAILURES).map((row) => ({
        destination: row.destination,
        program: row.program,
        airline: row.airline,
        flightDate: row.flightDate,
        status: row.status,
        error: sanitizeIngestError(row.error),
      })),
      routes: summary.routes.map((row) => ({
        destination: row.destination,
        program: row.program,
        status: row.status,
        jobs: row.jobs,
        snapshots: row.snapshots,
      })),
    },
  };
}

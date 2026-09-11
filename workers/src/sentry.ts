import * as Sentry from '@sentry/cloudflare';
import type { CloudflareOptions } from '@sentry/cloudflare';
import type { Env } from './env';
import type { IngestSummary } from './scheduler';

const MAX_FAILURES = 25;

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

export function sentryOptions(env: Env): CloudflareOptions | undefined {
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

/** Capture ingest WAF/auth failures. Collectors return statuses — they do not throw. */
export function reportIngestToSentry(summary: IngestSummary): void {
  const event = ingestSentryEvent(summary);
  if (!event) return;
  Sentry.withScope((scope) => {
    scope.setLevel(event.level);
    scope.setFingerprint(event.fingerprint);
    for (const [key, value] of Object.entries(event.tags)) {
      scope.setTag(key, value);
    }
    scope.setExtras(event.extra);
    Sentry.captureMessage(event.message);
  });
}

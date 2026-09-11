export const RUN_STATUSES = [
  'success',
  'empty',
  'auth_failed',
  'scrape_failed',
  'partial',
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

/** In-progress lease only. Never a QA/day outcome. */
export const RUNNING_STATUS = 'running' as const;
export type IngestRunStatus = RunStatus | typeof RUNNING_STATUS;

export function isRunStatus(value: string): value is RunStatus {
  return (RUN_STATUSES as readonly string[]).includes(value);
}

export function isFailureStatus(status: RunStatus): boolean {
  return status === 'auth_failed' || status === 'scrape_failed' || status === 'partial';
}

/**
 * Combine per-job statuses into a run-level status.
 * Any failure → never `success` (a failed job cannot mark the run/day successful).
 * Unanimous auth_failed / scrape_failed is preserved; mixed failures are partial.
 * success + empty → success (quotes plus no-inventory days).
 */
export function aggregateStatus(statuses: readonly RunStatus[]): RunStatus {
  if (statuses.length === 0) return 'empty';

  const failures = statuses.filter(isFailureStatus);
  if (failures.length > 0) {
    if (failures.length === statuses.length) {
      const unique = new Set(failures);
      if (unique.size === 1) return failures[0]!;
    }
    return 'partial';
  }

  if (statuses.every((s) => s === 'empty')) return 'empty';
  if (statuses.every((s) => s === 'success' || s === 'empty')) return 'success';
  return 'partial';
}

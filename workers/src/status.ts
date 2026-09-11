export const RUN_STATUSES = [
  'success',
  'empty',
  'auth_failed',
  'scrape_failed',
  'partial',
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export function isRunStatus(value: string): value is RunStatus {
  return (RUN_STATUSES as readonly string[]).includes(value);
}

/**
 * Combine per-job statuses into a run-level status.
 * success + empty → success (some quotes, some no-inventory days).
 * Any mix of success/empty with failures → partial.
 */
export function aggregateStatus(statuses: readonly RunStatus[]): RunStatus {
  if (statuses.length === 0) return 'empty';

  const unique = new Set(statuses);
  if (unique.size === 1) return statuses[0]!;

  const failed = statuses.filter((s) => s === 'auth_failed' || s === 'scrape_failed' || s === 'partial');
  const collected = statuses.filter((s) => s === 'success' || s === 'empty');

  if (failed.length > 0 && collected.length > 0) return 'partial';
  if (failed.length === statuses.length) return 'partial';
  if (unique.has('success')) return 'success';
  if (unique.has('empty') && !unique.has('success')) return 'empty';
  return 'partial';
}

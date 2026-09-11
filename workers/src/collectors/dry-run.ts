import type { CollectResult, Snapshot } from './types';

export const DRY_RUN_SOURCE_SUFFIX = '_dry_run';

const CREDENTIAL_KEY =
  /^(cookie|cookies|password|passwd|secret|token|access_token|accessToken|authorization|api[_-]?key|x-api-key|credential|credentials)$/i;

/** Live source names stay unsuffixed. Dry-run persist ids always end with `_dry_run`. */
export function dryRunSource(source: string): string {
  return source.endsWith(DRY_RUN_SOURCE_SUFFIX) ? source : `${source}${DRY_RUN_SOURCE_SUFFIX}`;
}

export function stampDryRunSources(snapshots: Snapshot[]): Snapshot[] {
  return snapshots.map((row) => ({ ...row, source: dryRunSource(row.source) }));
}

export function stampDryRunResult(result: CollectResult): CollectResult {
  return { ...result, snapshots: stampDryRunSources(result.snapshots) };
}

export function rawPayloadHasCredentials(payload: unknown): boolean {
  if (payload == null) return false;
  if (Array.isArray(payload)) return payload.some((item) => rawPayloadHasCredentials(item));
  if (typeof payload !== 'object') return false;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (CREDENTIAL_KEY.test(key)) return true;
    if (rawPayloadHasCredentials(value)) return true;
  }
  return false;
}

import type { PriceSnapshot } from './types';

const SECRET_KEY = /^(authorization|cookie|set-cookie|password|passwd|secret|token|access_token|refresh_token|api[_-]?key|service[_-]?role|apikey|bearer|x-api-key)$/i;

const REDACTED = '[redacted]';

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactValue(item, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSecretKey(key) ? REDACTED : redactValue(child, depth + 1);
  }
  return out;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/**
 * Pick the public snapshot columns only. Drops `raw_payload` unless
 * `includeRaw` is set, and never forwards unknown keys (or secrets).
 */
export function toPublicSnapshot(row: Record<string, unknown>, includeRaw: boolean): PriceSnapshot {
  const snapshot: PriceSnapshot = {
    id: asString(row.id) ?? '',
    origin: asString(row.origin) ?? '',
    destination: asString(row.destination) ?? '',
    airline: asString(row.airline) ?? '',
    program: asString(row.program) ?? '',
    flight_date: asString(row.flight_date) ?? '',
    departure_time: asString(row.departure_time),
    miles: asNumber(row.miles),
    amount_brl: asNumber(row.amount_brl),
    taxes_brl: asNumber(row.taxes_brl),
    currency: asString(row.currency) ?? 'BRL',
    source: asString(row.source) ?? '',
    collected_at: asString(row.collected_at) ?? '',
    created_at: asString(row.created_at) ?? '',
    ingest_run_id: asString(row.ingest_run_id),
  };
  if (includeRaw && row.raw_payload !== undefined) {
    snapshot.raw_payload = redactValue(row.raw_payload);
  }
  return snapshot;
}

export function isDryRunSource(source: string): boolean {
  return source.endsWith('_dry_run') || source.includes('dry_run');
}

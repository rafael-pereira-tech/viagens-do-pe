import type { Env } from '../env';
import { json, jsonError } from './http';

export interface EventsApiDeps {
  /** Test seam — when set, skips the Analytics Engine binding. */
  writeDataPoint?: (point: AnalyticsEngineDataPoint) => void;
}

/** Minimal allowlist — expand carefully; keep props free of PII. */
export const ALLOWED_EVENTS = ['page_view', 'filter_apply', 'tab_change', 'chart_click'] as const;
export type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

const MAX_BODY_BYTES = 4_096;
const MAX_PROPS_KEYS = 12;
const MAX_PROP_STRING = 128;
const MAX_PATH = 512;
const MAX_UA = 512;
const MAX_PROPS_BLOB = 1_024;

const BLOCKED_PROP_KEYS =
  /^(email|e[_-]?mail|phone|tel|cpf|name|nome|password|senha|token|authorization|cookie|ip|address|endereco)$/i;

type EventBody = {
  event?: unknown;
  props?: unknown;
  path?: unknown;
};

export type AnalyticsEngineDataPoint = {
  indexes?: string[];
  blobs?: (string | null)[];
  doubles?: number[];
};

function isAllowedEvent(value: string): value is AllowedEvent {
  return (ALLOWED_EVENTS as readonly string[]).includes(value);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/** Drop PII-ish keys and oversized values; keep a small flat object. */
export function sanitizeProps(raw: unknown): Record<string, unknown> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PROPS_KEYS) break;
    if (!key || key.length > 64 || BLOCKED_PROP_KEYS.test(key)) continue;
    if (value == null) {
      out[key] = null;
      continue;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      if (typeof value === 'number' && !Number.isFinite(value)) continue;
      out[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      out[key] = truncate(value, MAX_PROP_STRING);
    }
  }
  return out;
}

function parsePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return null;
  return truncate(trimmed, MAX_PATH);
}

/**
 * Persist a client event to Analytics Engine.
 *
 * Dataset layout (query via CF AE SQL API):
 *   index1  = event name
 *   blob1   = path
 *   blob2   = user-agent
 *   blob3   = props JSON
 *   double1 = unix ms at ingest
 */
export async function handlePostEvent(
  request: Request,
  env: Env,
  deps: EventsApiDeps = {},
): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonError('invalid_content_type', 415, 'Expected application/json');
  }

  const rawText = await request.text();
  if (rawText.length > MAX_BODY_BYTES) {
    return jsonError('payload_too_large', 413);
  }

  let body: EventBody;
  try {
    body = JSON.parse(rawText || '{}') as EventBody;
  } catch {
    return jsonError('invalid_json', 400);
  }

  const eventName = typeof body.event === 'string' ? body.event.trim() : '';
  if (!eventName || !isAllowedEvent(eventName)) {
    return jsonError('invalid_event', 400, `Allowed: ${ALLOWED_EVENTS.join(', ')}`);
  }

  const props = sanitizeProps(body.props);
  const path = parsePath(body.path);
  const uaHeader = request.headers.get('user-agent');
  const ua = uaHeader ? truncate(uaHeader, MAX_UA) : null;
  const propsBlob = truncate(JSON.stringify(props), MAX_PROPS_BLOB);

  const point: AnalyticsEngineDataPoint = {
    indexes: [eventName],
    blobs: [path, ua, propsBlob],
    doubles: [Date.now()],
  };

  try {
    if (deps.writeDataPoint) {
      deps.writeDataPoint(point);
    } else if (env.USER_EVENTS) {
      env.USER_EVENTS.writeDataPoint(point);
    } else {
      return jsonError('analytics_not_configured', 503);
    }
  } catch {
    // Never fail the UX on analytics — accept and drop.
    return json({ ok: true, dropped: true }, 202);
  }

  return json({ ok: true }, 202);
}

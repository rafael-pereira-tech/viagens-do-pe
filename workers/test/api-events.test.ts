import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handlePostEvent, sanitizeProps, type AnalyticsEngineDataPoint } from '../src/api/events.ts';
import { handleReadApi } from '../src/api/handlers.ts';

async function postEvent(
  body: unknown,
  writeDataPoint: ((point: AnalyticsEngineDataPoint) => void) | undefined,
  headers: HeadersInit = { 'Content-Type': 'application/json' },
) {
  return handleReadApi(
    new Request('http://localhost:8787/api/v1/events', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    {
      READ_API_KEY: 'dev-only-read-api-key',
      INGEST_TRIGGER_SECRET: 'dev-only-trigger-secret',
    },
    writeDataPoint ? { writeDataPoint } : {},
  );
}

describe('sanitizeProps', () => {
  it('keeps small primitives and drops PII-ish keys', () => {
    assert.deepEqual(
      sanitizeProps({
        to: 'CGH',
        email: 'a@b.c',
        nested: { x: 1 },
        ok: true,
        n: 3,
      }),
      { to: 'CGH', ok: true, n: 3 },
    );
  });
});

describe('POST /api/v1/events', () => {
  it('accepts a public page_view without Authorization', async () => {
    const written: AnalyticsEngineDataPoint[] = [];
    const response = await postEvent(
      { event: 'page_view', path: '/?to=CGH', props: { to: 'CGH' } },
      (point) => written.push(point),
      { 'Content-Type': 'application/json', 'User-Agent': 'vitest-agent/1.0' },
    );
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(written.length, 1);
    assert.deepEqual(written[0]?.indexes, ['page_view']);
    assert.equal(written[0]?.blobs?.[0], '/?to=CGH');
    assert.equal(written[0]?.blobs?.[1], 'vitest-agent/1.0');
    assert.equal(written[0]?.blobs?.[2], JSON.stringify({ to: 'CGH' }));
    assert.equal(typeof written[0]?.doubles?.[0], 'number');
  });

  it('rejects unknown events and missing content-type', async () => {
    const bad = await postEvent({ event: 'hack', path: '/' }, () => {});
    assert.equal(bad.status, 400);

    const noType = await handlePostEvent(
      new Request('http://localhost:8787/api/v1/events', {
        method: 'POST',
        body: JSON.stringify({ event: 'page_view' }),
      }),
      { USER_EVENTS: { writeDataPoint() {} } },
    );
    assert.equal(noType.status, 415);
  });

  it('returns 503 when Analytics Engine is not bound', async () => {
    const response = await handlePostEvent(
      new Request('http://localhost:8787/api/v1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'filter_apply', path: '/' }),
      }),
      {},
    );
    assert.equal(response.status, 503);
  });

  it('rejects non-POST on the events path', async () => {
    const response = await handleReadApi(new Request('http://localhost:8787/api/v1/events'), {
      READ_API_KEY: 'dev-only-read-api-key',
      INGEST_TRIGGER_SECRET: 'dev-only-trigger-secret',
    });
    assert.equal(response.status, 405);
  });
});

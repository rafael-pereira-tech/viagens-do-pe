import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ingestSentryEvent, sentryOptions } from '../src/sentry.ts';
import type { IngestSummary } from '../src/scheduler.ts';

function summary(over: Partial<IngestSummary> = {}): IngestSummary {
  return {
    skipped: false,
    status: 'success',
    runId: 'run-1',
    collectedAt: '2026-11-06T12:00:00.000Z',
    cron: '0 9 * * *',
    startedAt: '2026-11-06T12:00:00.000Z',
    finishedAt: '2026-11-06T12:01:00.000Z',
    jobCount: 3,
    snapshotCount: 0,
    window: { start: '2026-11-05', end: '2026-11-06' },
    routes: [],
    failures: [],
    persisted: true,
    ...over,
  };
}

describe('sentryOptions', () => {
  it('skips init without a DSN', () => {
    assert.equal(sentryOptions({}), undefined);
    assert.equal(sentryOptions({ SENTRY_DSN: '  ' }), undefined);
  });

  it('does not collect cookies, bodies, or request headers', () => {
    const options = sentryOptions({ SENTRY_DSN: 'https://example@o0.ingest.sentry.io/1', ENVIRONMENT: 'production' });
    assert.ok(options);
    assert.equal(options.sendDefaultPii, false);
    assert.equal(options.dataCollection?.cookies, false);
    assert.deepEqual(options.dataCollection?.httpBodies, []);
    assert.equal(options.tracesSampleRate, 0.1);
    assert.equal(options.release, undefined);
  });

  it('uses Cloudflare version metadata as release', () => {
    const options = sentryOptions({
      SENTRY_DSN: 'https://example@o0.ingest.sentry.io/1',
      CF_VERSION_METADATA: { id: 'abc123', tag: 'v1.2.3' },
    });
    assert.equal(options?.release, 'v1.2.3');
    assert.equal(options?.environment, 'production');
  });
});

describe('ingestSentryEvent', () => {
  it('ignores skip, success, and empty runs', () => {
    assert.equal(ingestSentryEvent(summary({ skipped: true, status: null })), null);
    assert.equal(ingestSentryEvent(summary({ status: 'success' })), null);
    assert.equal(ingestSentryEvent(summary({ status: 'empty' })), null);
  });

  it('reports scrape_failed without HTML bodies', () => {
    const event = ingestSentryEvent(
      summary({
        status: 'scrape_failed',
        failures: [
          {
            origin: 'PET',
            destination: 'CGH',
            airline: 'GOL',
            program: 'smiles',
            flightDate: '2026-11-05',
            status: 'scrape_failed',
            error: 'Smiles search 406: { "message": "Something went wrong" }',
          },
          {
            origin: 'PET',
            destination: 'GRU',
            airline: 'LATAM',
            program: 'latam_pass',
            flightDate: '2026-11-06',
            status: 'scrape_failed',
            error: '<!DOCTYPE html><html><title>Access Denied</title>',
          },
        ],
      }),
    );
    assert.ok(event);
    assert.equal(event.level, 'error');
    assert.equal(event.message, 'ingest scrape_failed (0 9 * * *)');
    assert.deepEqual(event.fingerprint, ['ingest', 'scrape_failed', '0 9 * * *']);
    const failures = event.extra.failures as Array<{ destination: string; error?: string }>;
    assert.equal(failures[0]?.destination, 'CGH');
    assert.match(String(failures[0]?.error), /406/);
    assert.equal(failures[1]?.error, 'HTML WAF/Akamai');
    assert.equal(JSON.stringify(event).includes('<!DOCTYPE'), false);
  });

  it('treats partial ingest as a warning', () => {
    const event = ingestSentryEvent(summary({ status: 'partial' }));
    assert.equal(event?.level, 'warning');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeRead } from '../src/api/auth.ts';

function req(header?: string): Request {
  return new Request('http://localhost:8787/api/v1/snapshots', {
    headers: header ? { Authorization: header } : undefined,
  });
}

async function errorOf(response: Response | null): Promise<{ status: number; error: string }> {
  assert.ok(response);
  const body = (await response.json()) as { error: string };
  return { status: response.status, error: body.error };
}

describe('authorizeRead', () => {
  it('refuses snapshot data when READ_API_KEY is not configured', async () => {
    const result = await errorOf(authorizeRead(req('Bearer anything'), {}));
    assert.equal(result.status, 503);
    assert.equal(result.error, 'read_api_key_not_configured');
  });

  it('refuses when READ_API_KEY equals INGEST_TRIGGER_SECRET', async () => {
    const result = await errorOf(
      authorizeRead(req('Bearer same-secret'), {
        READ_API_KEY: 'same-secret',
        INGEST_TRIGGER_SECRET: 'same-secret',
      }),
    );
    assert.equal(result.status, 503);
    assert.equal(result.error, 'read_api_key_reuses_ingest_secret');
  });

  it('rejects a missing or wrong Bearer, including the ingest secret', async () => {
    const env = { READ_API_KEY: 'read-key', INGEST_TRIGGER_SECRET: 'ingest-key' };
    assert.equal((await errorOf(authorizeRead(req(), env))).status, 401);
    assert.equal((await errorOf(authorizeRead(req('Bearer ingest-key'), env))).status, 401);
    assert.equal((await errorOf(authorizeRead(req('Bearer other'), env))).status, 401);
  });

  it('accepts only Authorization: Bearer <READ_API_KEY>', () => {
    const env = { READ_API_KEY: 'read-key', INGEST_TRIGGER_SECRET: 'ingest-key' };
    assert.equal(authorizeRead(req('Bearer read-key'), env), null);
  });
});

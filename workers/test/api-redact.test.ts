import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { publicErrorMessage } from '../src/api/http.ts';
import { isDryRunSource, redactValue, toPublicSnapshot } from '../src/api/redact.ts';

describe('toPublicSnapshot', () => {
  it('strips raw_payload by default and coerces numeric strings', () => {
    const row = toPublicSnapshot(
      {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        origin: 'PET',
        destination: 'CGH',
        airline: 'GOL',
        program: 'smiles',
        flight_date: '2026-09-15',
        departure_time: null,
        miles: '12000',
        amount_brl: '890.50',
        taxes_brl: null,
        currency: 'BRL',
        source: 'smiles_web',
        collected_at: '2026-09-11T12:00:00.000Z',
        created_at: '2026-09-11T12:00:00.000Z',
        ingest_run_id: null,
        raw_payload: { password: 'hunter2', fare: 1 },
        extra_secret: 'should-not-leak',
      },
      false,
    );
    assert.equal(row.miles, 12000);
    assert.equal(row.amount_brl, 890.5);
    assert.equal(row.taxes_brl, null);
    assert.equal('raw_payload' in row, false);
    assert.equal('extra_secret' in row, false);
  });

  it('includes raw_payload when asked and redacts secret keys', () => {
    const row = toPublicSnapshot(
      {
        id: 'id',
        origin: 'PET',
        destination: 'GRU',
        airline: 'LATAM',
        program: 'latam_pass',
        flight_date: '2026-09-15',
        miles: 14000,
        currency: 'BRL',
        source: 'latam_pass',
        collected_at: '2026-09-11T12:00:00.000Z',
        created_at: '2026-09-11T12:00:00.000Z',
        raw_payload: {
          fare: 1,
          password: 'hunter2',
          authorization: 'Bearer secret-token',
          nested: { api_key: 'abc', miles: 9 },
        },
      },
      true,
    );
    assert.deepEqual(row.raw_payload, {
      fare: 1,
      password: '[redacted]',
      authorization: '[redacted]',
      nested: { api_key: '[redacted]', miles: 9 },
    });
  });
});

describe('redact helpers', () => {
  it('recognizes dry-run source suffixes', () => {
    assert.equal(isDryRunSource('smiles_web_dry_run'), true);
    assert.equal(isDryRunSource('smiles_dry_run'), true);
    assert.equal(isDryRunSource('smiles_web'), false);
  });

  it('scrubs JWTs and Bearer tokens from upstream errors', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signaturepart';
    assert.equal(publicErrorMessage(new Error(`Bearer ${jwt} failed`)).includes(jwt), false);
    assert.match(publicErrorMessage(new Error(`Bearer ${jwt} failed`)), /redacted/);
    assert.deepEqual(redactValue({ cookie: 'a=b', ok: true }), { cookie: '[redacted]', ok: true });
  });
});

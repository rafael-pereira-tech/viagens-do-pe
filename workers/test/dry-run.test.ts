import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dryRunSource, rawPayloadHasCredentials, stampDryRunSources } from '../src/collectors/dry-run.ts';
import type { Snapshot } from '../src/collectors/types.ts';

describe('dry-run source suffix', () => {
  it('appends _dry_run to live source names and is idempotent', () => {
    assert.equal(dryRunSource('smiles_web'), 'smiles_web_dry_run');
    assert.equal(dryRunSource('voegol'), 'voegol_dry_run');
    assert.equal(dryRunSource('tudoazul'), 'tudoazul_dry_run');
    assert.equal(dryRunSource('voeazul'), 'voeazul_dry_run');
    assert.equal(dryRunSource('smiles_web_dry_run'), 'smiles_web_dry_run');
  });

  it('stamps snapshot sources without changing live names in place', () => {
    const row = {
      origin: 'PET',
      destination: 'CGH',
      airline: 'GOL',
      program: 'smiles',
      flight_date: '2026-09-15',
      currency: 'BRL',
      source: 'smiles_web',
    } as Snapshot;
    const stamped = stampDryRunSources([row]);
    assert.equal(row.source, 'smiles_web');
    assert.equal(stamped[0]!.source, 'smiles_web_dry_run');
  });
});

describe('raw_payload credentials', () => {
  it('rejects credential keys anywhere in the payload tree', () => {
    assert.equal(rawPayloadHasCredentials({ copay_brl: 248.5, money: 248.5 }), false);
    assert.equal(rawPayloadHasCredentials({ cookie: 'sid=1' }), true);
    assert.equal(rawPayloadHasCredentials({ nested: { accessToken: 'tok' } }), true);
    assert.equal(rawPayloadHasCredentials({ password: 'x' }), true);
    assert.equal(rawPayloadHasCredentials({ 'x-api-key': 'k' }), true);
  });
});

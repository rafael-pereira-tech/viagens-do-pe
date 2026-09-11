import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Snapshot } from '../src/collectors/types.ts';
import { stampSnapshot, toSnapshotRow } from '../src/supabase.ts';

const base: Snapshot = {
  origin: 'PET',
  destination: 'CGH',
  airline: 'GOL',
  program: 'smiles',
  flight_date: '2026-09-01',
  miles: 1000,
  currency: 'BRL',
  source: 'test',
};

describe('snapshot write stamps', () => {
  it('refuses rows missing collected_at or ingest_run_id', () => {
    assert.throws(() => toSnapshotRow(base), /collected_at and ingest_run_id/);
    assert.throws(
      () => toSnapshotRow({ ...base, collected_at: '2026-09-11T12:00:00.000Z' }),
      /collected_at and ingest_run_id/,
    );
  });

  it('includes both stamps on the persisted row', () => {
    const stamped = stampSnapshot(base, 'run-1', '2026-09-11T12:00:00.000Z');
    const row = toSnapshotRow(stamped);
    assert.equal(row.collected_at, '2026-09-11T12:00:00.000Z');
    assert.equal(row.ingest_run_id, 'run-1');
  });
});

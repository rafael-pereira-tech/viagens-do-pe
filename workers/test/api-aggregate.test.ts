import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { latestByRouteDay, minByRouteDay, minOverWindow } from '../src/api/aggregate.ts';
import type { PriceSnapshot } from '../src/api/types.ts';

function row(patch: Partial<PriceSnapshot>): PriceSnapshot {
  return {
    id: patch.id ?? 'id',
    origin: 'PET',
    destination: 'CGH',
    airline: 'GOL',
    program: 'smiles',
    flight_date: '2026-09-15',
    departure_time: '07:00:00',
    miles: 10000,
    amount_brl: null,
    taxes_brl: 50,
    currency: 'BRL',
    source: 'smiles_web',
    collected_at: '2026-09-11T12:00:00.000Z',
    created_at: '2026-09-11T12:00:00.000Z',
    ingest_run_id: 'run-1',
    ...patch,
  };
}

describe('latestByRouteDay', () => {
  it('keeps the first row per route/day/source when ordered newest-first', () => {
    const newer = row({ id: 'new', collected_at: '2026-09-11T18:00:00.000Z', miles: 8000 });
    const older = row({ id: 'old', collected_at: '2026-09-11T06:00:00.000Z', miles: 9000 });
    const otherDay = row({ id: 'day2', flight_date: '2026-09-16', miles: 11000 });
    const cash = row({
      id: 'cash',
      source: 'voeazul',
      airline: 'AZUL',
      program: 'tudoazul',
      miles: null,
      amount_brl: 529.9,
    });

    const latest = latestByRouteDay([newer, older, otherDay, cash]);
    assert.deepEqual(
      latest.map((r) => r.id),
      ['new', 'day2', 'cash'],
    );
    assert.equal(latest[0]?.miles, 8000);
  });
});

describe('min aggregations', () => {
  it('computes window mins and ignores nulls (never invents 0)', () => {
    const stats = minOverWindow([
      row({ miles: 12000, amount_brl: null }),
      row({ miles: null, amount_brl: 890.5 }),
      row({ miles: 7200, amount_brl: null, collected_at: '2026-09-11T18:00:00.000Z' }),
    ]);
    assert.equal(stats.min_miles, 7200);
    assert.equal(stats.min_amount_brl, 890.5);
    assert.equal(stats.snapshot_count, 3);
    assert.equal(stats.latest_collected_at, '2026-09-11T18:00:00.000Z');
  });

  it('returns null mins for an empty window', () => {
    assert.deepEqual(minOverWindow([]), {
      min_miles: null,
      min_amount_brl: null,
      snapshot_count: 0,
      latest_collected_at: null,
    });
  });

  it('groups min miles / cash by route/day', () => {
    const grouped = minByRouteDay([
      row({ destination: 'CGH', flight_date: '2026-09-15', miles: 12000, amount_brl: null }),
      row({ destination: 'CGH', flight_date: '2026-09-15', miles: 8000, amount_brl: 400 }),
      row({ destination: 'VCP', flight_date: '2026-09-15', miles: 18500, amount_brl: null }),
    ]);
    assert.equal(grouped.length, 2);
    const cgh = grouped.find((g) => g.destination === 'CGH');
    assert.equal(cgh?.min_miles, 8000);
    assert.equal(cgh?.min_amount_brl, 400);
    assert.equal(cgh?.snapshot_count, 2);
    assert.equal(grouped.find((g) => g.destination === 'VCP')?.min_amount_brl, null);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Snapshot } from '../src/collectors/types.ts';
import {
  bestObservationsFromSnapshots,
  classicMilheiro,
} from '../src/observations.ts';

function snap(partial: Partial<Snapshot> & Pick<Snapshot, 'source' | 'flight_date'>): Snapshot {
  return {
    origin: 'PET',
    destination: 'CGH',
    airline: 'GOL',
    program: 'smiles',
    currency: 'BRL',
    collected_at: '2026-09-18T12:00:00.000Z',
    ingest_run_id: 'run-1',
    ...partial,
  };
}

describe('bestObservationsFromSnapshots', () => {
  it('keeps one best award row per series and attaches milheiro from cash companion', () => {
    const rows = bestObservationsFromSnapshots([
      snap({ source: 'smiles_web', flight_date: '2026-10-01', miles: 40000 }),
      snap({ source: 'smiles_web', flight_date: '2026-10-01', miles: 30000 }),
      snap({ source: 'voegol', flight_date: '2026-10-01', amount_brl: 600, airline: 'GOL', program: 'smiles' }),
      snap({ source: 'voegol', flight_date: '2026-10-01', amount_brl: 900, airline: 'GOL', program: 'smiles' }),
    ]);
    assert.equal(rows.length, 2);
    const award = rows.find((r) => r.source === 'smiles_web');
    const cash = rows.find((r) => r.source === 'voegol');
    assert.ok(award);
    assert.ok(cash);
    assert.equal(award!.miles, 30000);
    assert.equal(award!.milheiro, classicMilheiro(30000, 600));
    assert.equal(cash!.amount_brl, 600);
    assert.equal(cash!.milheiro, null);
  });

  it('picks lowest BRL for cash-only series', () => {
    const rows = bestObservationsFromSnapshots([
      snap({
        source: 'latam_web',
        flight_date: '2026-11-01',
        origin: 'PET',
        destination: 'GRU',
        airline: 'LATAM',
        program: 'latam_pass',
        amount_brl: 800,
      }),
      snap({
        source: 'latam_web',
        flight_date: '2026-11-01',
        origin: 'PET',
        destination: 'GRU',
        airline: 'LATAM',
        program: 'latam_pass',
        amount_brl: 500,
      }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount_brl, 500);
  });

  it('ignores unstamped or non-persistable rows', () => {
    const rows = bestObservationsFromSnapshots([
      snap({ source: 'smiles_web', flight_date: '2026-10-02', miles: 0, amount_brl: null }),
      {
        origin: 'PET',
        destination: 'CGH',
        airline: 'GOL',
        program: 'smiles',
        flight_date: '2026-10-02',
        currency: 'BRL',
        source: 'smiles_web',
        miles: 10000,
      },
    ]);
    assert.equal(rows.length, 0);
  });
});

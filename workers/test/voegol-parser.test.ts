import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CollectParams } from '../src/collectors/types.ts';
import { VOEGOL_SOURCE } from '../src/collectors/smiles/constants.ts';
import { VOEGOL_PET_CGH_EMPTY, VOEGOL_PET_CGH_SUCCESS } from '../src/collectors/smiles/fixtures.ts';
import { parseVoegolOffers } from '../src/collectors/smiles/voegol.ts';

const params: CollectParams = {
  origin: 'PET',
  destination: 'CGH',
  airline: 'GOL',
  program: 'smiles',
  flightDate: '2026-09-15',
};

describe('parseVoegolOffers', () => {
  it('emits GOL BRL cash rows and skips zero/missing/partner offers', () => {
    const parsed = parseVoegolOffers(VOEGOL_PET_CGH_SUCCESS, params);
    assert.equal(parsed.snapshots.length, 2);
    assert.ok(parsed.skipped >= 3);
    for (const row of parsed.snapshots) {
      assert.equal(row.source, VOEGOL_SOURCE);
      assert.equal(row.program, 'smiles');
      assert.equal(row.airline, 'GOL');
      assert.equal(row.miles, null);
      assert.ok(row.amount_brl != null && row.amount_brl > 0);
      assert.notEqual(row.amount_brl, 0);
    }
    assert.ok(parsed.snapshots.some((row) => row.amount_brl === 389.9 && row.departure_time === '06:40:00'));
    assert.ok(parsed.snapshots.some((row) => row.amount_brl === 421));
  });

  it('returns empty when there are no offers', () => {
    const parsed = parseVoegolOffers(VOEGOL_PET_CGH_EMPTY, params);
    assert.equal(parsed.snapshots.length, 0);
  });
});

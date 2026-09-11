import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CollectParams } from '../src/collectors/types.ts';
import { SMILES_SOURCE } from '../src/collectors/smiles/constants.ts';
import {
  SEARCH_PET_CGH_EMPTY,
  SEARCH_PET_CGH_GOL_NO_FARES,
  SEARCH_PET_CGH_SUCCESS,
} from '../src/collectors/smiles/fixtures.ts';
import {
  departureTimeOf,
  isGolFlight,
  parseSmilesSearch,
  resolveFareTypes,
  toFiniteNumber,
} from '../src/collectors/smiles/parser.ts';

const params: CollectParams = {
  origin: 'PET',
  destination: 'CGH',
  airline: 'GOL',
  program: 'smiles',
  flightDate: '2026-09-15',
};

describe('smiles parser helpers', () => {
  it('parses numeric strings and ISO departure times', () => {
    assert.equal(toFiniteNumber('39.90'), 39.9);
    assert.equal(toFiniteNumber('not-a-number'), null);
    assert.equal(departureTimeOf('2026-09-15T06:40:00'), '06:40:00');
    assert.equal(departureTimeOf('2026-09-15T18:20:00-03:00'), '18:20:00');
  });

  it('detects GOL by G3 code or name', () => {
    assert.equal(isGolFlight({ airline: { code: 'G3', name: 'GOL (G3)' } }), true);
    assert.equal(isGolFlight({ sourceGDS: 'G3' }), true);
    assert.equal(isGolFlight({ airline: { code: 'JJ', name: 'LATAM' } }), false);
  });
});

describe('parseSmilesSearch PET→CGH fixture', () => {
  it('emits GOL miles and miles+BRL rows and drops partner airlines', () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_SUCCESS, params, {
      fareTypes: resolveFareTypes({ includeClub: false }),
    });

    assert.equal(parsed.golFlights, 2);
    assert.equal(parsed.otherAirlineFlights, 1);
    assert.ok(parsed.snapshots.length >= 3);

    for (const row of parsed.snapshots) {
      assert.equal(row.origin, 'PET');
      assert.equal(row.destination, 'CGH');
      assert.equal(row.airline, 'GOL');
      assert.equal(row.program, 'smiles');
      assert.equal(row.flight_date, '2026-09-15');
      assert.equal(row.currency, 'BRL');
      assert.equal(row.source, SMILES_SOURCE);
      assert.ok(row.miles != null || row.amount_brl != null);
      assert.equal(row.collected_at, undefined);
      assert.equal(row.ingest_run_id, undefined);
    }

    const morningMiles = parsed.snapshots.find(
      (row) => row.departure_time === '06:40:00' && row.miles === 18500 && (row.amount_brl === 0 || row.amount_brl == null),
    );
    assert.ok(morningMiles);
    assert.equal(morningMiles.taxes_brl, 39.9);

    const morningMix = parsed.snapshots.find(
      (row) => row.departure_time === '06:40:00' && row.miles === 7200,
    );
    assert.ok(morningMix);
    assert.equal(morningMix.amount_brl, 248.5);
    assert.equal(morningMix.taxes_brl, 39.9);

    assert.equal(
      parsed.snapshots.some((row) => row.miles === 17100),
      false,
      'club fares are guest-hidden',
    );
    assert.equal(
      parsed.snapshots.some((row) => row.miles === 22000),
      false,
      'LATAM partner row must be dropped',
    );
  });

  it('includes club fares when requested', () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_SUCCESS, params, {
      fareTypes: resolveFareTypes({ includeClub: true }),
    });
    assert.ok(parsed.snapshots.some((row) => row.miles === 17100));
  });

  it('returns empty when fixture departure dates do not match the requested civil date', () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_SUCCESS, { ...params, flightDate: '2026-10-03' }, {
      fareTypes: resolveFareTypes({ includeClub: false }),
    });
    // Fixture departures are 2026-09-15, so a different civil date yields no rows.
    assert.equal(parsed.snapshots.length, 0);
    assert.equal(parsed.golFlights, 0);
  });

  it('returns no snapshots for an empty flight list', () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_EMPTY, params, {
      fareTypes: resolveFareTypes({ includeClub: false }),
    });
    assert.equal(parsed.snapshots.length, 0);
    assert.equal(parsed.golFlights, 0);
  });

  it('returns no snapshots when GOL flights have no fares', () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_GOL_NO_FARES, { ...params, flightDate: '2026-09-17' }, {
      fareTypes: resolveFareTypes({ includeClub: false }),
    });
    assert.equal(parsed.golFlights, 1);
    assert.equal(parsed.snapshots.length, 0);
  });
});

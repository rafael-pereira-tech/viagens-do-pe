import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CollectParams } from '../src/collectors/types.ts';
import { SMILES_SOURCE } from '../src/collectors/smiles/constants.ts';
import {
  SEARCH_PET_CGH_EMPTY,
  SEARCH_PET_CGH_FARE_OPTIONS,
  SEARCH_PET_CGH_GOL_NO_FARES,
  SEARCH_PET_CGH_SUCCESS,
} from '../src/collectors/smiles/fixtures.ts';
import {
  departureTimeOf,
  isGolFlight,
  parseSmilesSearch,
  quotedOrNull,
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
      assert.ok(row.miles != null);
      assert.equal(row.amount_brl, null);
      assert.equal(row.collected_at, undefined);
      assert.equal(row.ingest_run_id, undefined);
    }

    const morningMiles = parsed.snapshots.find(
      (row) => row.departure_time === '06:40:00' && row.miles === 18500,
    );
    assert.ok(morningMiles);
    assert.equal(morningMiles.amount_brl, null);
    assert.equal(morningMiles.taxes_brl, 39.9);

    const omittedMoney = parsed.snapshots.find((row) => row.miles === 14100);
    assert.ok(omittedMoney);
    assert.equal(omittedMoney.amount_brl, null);

    const morningMix = parsed.snapshots.find(
      (row) => row.departure_time === '06:40:00' && row.miles === 7200,
    );
    assert.ok(morningMix);
    assert.equal(morningMix.amount_brl, null, 'Smiles money must not be written to amount_brl');
    assert.equal(morningMix.taxes_brl, 39.9);
    const mixPayload = morningMix.raw_payload as { copay_brl?: number | null; smiles_money?: unknown };
    assert.equal(mixPayload.copay_brl, 248.5);
    assert.equal(mixPayload.smiles_money, 248.5);

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

  it('returns no snapshots when GOL flights have no fares', async () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_GOL_NO_FARES, { ...params, flightDate: '2026-09-17' }, {
      fareTypes: resolveFareTypes({ includeClub: false }),
    });
    assert.equal(parsed.golFlights, 1);
    assert.equal(parsed.snapshots.length, 0);
  });

  it('parses extractor fareOptions STANDARD|SMILES_CLUB and never treats money as cash', () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_FARE_OPTIONS, params, {
      fareTypes: resolveFareTypes({ includeClub: true }),
    });
    assert.equal(parsed.golFlights, 1);
    assert.equal(parsed.otherAirlineFlights, 1);
    const standard = parsed.snapshots.find((row) => row.miles === 15000);
    assert.ok(standard);
    assert.equal(standard.amount_brl, null);
    assert.equal(standard.taxes_brl, 32.44);
    assert.equal(standard.source, SMILES_SOURCE);
    const payload = standard.raw_payload as { copay_brl?: number | null; fareType?: string };
    assert.equal(payload.copay_brl, 199.9);
    assert.equal(payload.fareType, 'STANDARD');
    assert.ok(parsed.snapshots.some((row) => row.miles === 13200));
    assert.equal(
      parsed.snapshots.some((row) => row.miles === 21000),
      false,
      'non-G3 extractor row must be dropped',
    );
    assert.equal(
      parsed.snapshots.some((row) => row.amount_brl != null),
      false,
    );
  });
});

describe('quoted prices', () => {
  it('never invents 0 for missing miles or cash', () => {
    assert.equal(quotedOrNull(undefined, 'miles'), null);
    assert.equal(quotedOrNull(null, 'money'), null);
    assert.equal(quotedOrNull('', 'money'), null);
    assert.equal(quotedOrNull(0, 'miles'), null);
    assert.equal(quotedOrNull(0, 'money'), null);
    assert.equal(quotedOrNull('0', 'money'), null);
    assert.equal(quotedOrNull(18500, 'miles'), 18500);
    assert.equal(quotedOrNull(248.5, 'money'), 248.5);
  });

  it('does not persist placeholder zeros from the search payload', () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_SUCCESS, params, {
      fareTypes: resolveFareTypes({ includeClub: false }),
    });
    assert.ok(parsed.snapshots.length > 0);
    for (const row of parsed.snapshots) {
      assert.notEqual(row.miles, 0);
      assert.notEqual(row.amount_brl, 0);
      if (row.miles == null) assert.equal(row.miles, null);
      if (row.amount_brl == null) assert.equal(row.amount_brl, null);
    }
    assert.equal(
      parsed.snapshots.some((row) => row.miles === 0 || row.amount_brl === 0),
      false,
    );
  });
});

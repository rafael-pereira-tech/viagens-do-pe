import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CollectParams } from '../src/collectors/types.ts';
import { SMILES_SOURCE, VOEGOL_SOURCE } from '../src/collectors/smiles/constants.ts';
import {
  SEARCH_PET_CGH_CASH,
  SEARCH_PET_CGH_CASH_EMPTY,
  SEARCH_PET_CGH_EMPTY,
  SEARCH_PET_CGH_GOL_NO_FARES,
  SEARCH_PET_CGH_SUCCESS,
} from '../src/collectors/smiles/fixtures.ts';
import {
  departureTimeOf,
  isGolFlight,
  parseSmilesSearch,
  parseVoegolFlights,
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
  it('emits GOL miles rows with amount_brl always null and copay only in raw_payload', () => {
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
      assert.ok(row.miles != null && row.miles > 0);
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
    assert.equal(morningMix.amount_brl, null);
    assert.equal(morningMix.taxes_brl, 39.9);
    const mixRaw = morningMix.raw_payload as {
      copay_brl?: number | null;
      smiles_money?: number | null;
      money?: number | null;
    };
    assert.equal(mixRaw.copay_brl, 248.5);
    assert.equal(mixRaw.smiles_money, 248.5);
    assert.equal(mixRaw.money, 248.5);

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

  it('never writes Smiles money copay onto amount_brl for smiles_web', () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_SUCCESS, params, {
      fareTypes: resolveFareTypes({ includeClub: false }),
    });
    const smilesWeb = parsed.snapshots.filter((row) => row.source === SMILES_SOURCE);
    assert.ok(smilesWeb.length > 0);
    for (const row of smilesWeb) {
      assert.equal(row.amount_brl, null);
    }
    assert.equal(
      smilesWeb.some((row) => row.amount_brl != null),
      false,
    );
  });

  it('includes club fares when requested', () => {
    const parsed = parseSmilesSearch(SEARCH_PET_CGH_SUCCESS, params, {
      fareTypes: resolveFareTypes({ includeClub: true }),
    });
    assert.ok(parsed.snapshots.some((row) => row.miles === 17100));
    assert.ok(parsed.snapshots.filter((row) => row.source === SMILES_SOURCE).every((row) => row.amount_brl == null));
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

describe('parseVoegolFlights PET→CGH cash', () => {
  it('emits voegol full-cash rows and never invents 0', () => {
    const parsed = parseVoegolFlights(SEARCH_PET_CGH_CASH, params);
    assert.equal(parsed.golItineraries, 2);
    assert.equal(parsed.otherAirlineItineraries, 1);
    assert.equal(parsed.snapshots.length, 2);
    for (const row of parsed.snapshots) {
      assert.equal(row.source, VOEGOL_SOURCE);
      assert.equal(row.program, 'smiles');
      assert.equal(row.airline, 'GOL');
      assert.equal(row.miles, null);
      assert.ok(row.amount_brl != null && row.amount_brl > 0);
      assert.notEqual(row.amount_brl, 0);
      assert.equal(row.currency, 'BRL');
    }
    const morning = parsed.snapshots.find((row) => row.departure_time === '06:40:00');
    assert.equal(morning?.amount_brl, 548.9);
    const evening = parsed.snapshots.find((row) => row.departure_time === '18:20:00');
    assert.equal(evening?.amount_brl, 631.2);
    assert.equal(
      parsed.snapshots.some((row) => row.amount_brl === 199.9),
      false,
      'partner cash must be dropped',
    );
  });

  it('unwraps nested data.itineraries and totalPrice.amount', () => {
    const nested = {
      data: {
        itineraries: [
          {
            origin: 'PET',
            destination: 'CGH',
            departure: '2026-09-15T07:00:00',
            segments: [{ flight: { airlineCode: 'G3' } }],
            offers: [{ totalPrice: { amount: '455.75', currencyCode: 'BRL' } }],
          },
        ],
      },
    };
    const parsed = parseVoegolFlights(nested, params);
    assert.equal(parsed.snapshots.length, 1);
    assert.equal(parsed.snapshots[0]!.source, VOEGOL_SOURCE);
    assert.equal(parsed.snapshots[0]!.amount_brl, 455.75);
    assert.equal(parsed.snapshots[0]!.miles, null);
    assert.equal(parsed.snapshots[0]!.departure_time, '07:00:00');
  });

  it('returns no snapshots for an empty itinerary list', () => {
    const parsed = parseVoegolFlights(SEARCH_PET_CGH_CASH_EMPTY, params);
    assert.equal(parsed.snapshots.length, 0);
    assert.equal(parsed.golItineraries, 0);
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

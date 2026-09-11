import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CollectParams } from '../src/collectors/types.ts';
import { TUDOAZUL_SOURCE, VOEAZUL_SOURCE } from '../src/collectors/tudoazul/constants.ts';
import {
  SEARCH_EMPTY,
  SEARCH_NAVITAIRE_CASH,
  SEARCH_NO_FARES,
  SEARCH_PET_POA_CASH,
  SEARCH_PET_POA_POINTS,
  SEARCH_PET_VCP_CASH,
  SEARCH_PET_VCP_POINTS,
} from '../src/collectors/tudoazul/fixtures.ts';
import {
  departureTimeOf,
  isAzulJourney,
  parseAzulAvailability,
  quotedOrNull,
  toFiniteNumber,
} from '../src/collectors/tudoazul/parser.ts';

const vcp: CollectParams = {
  origin: 'PET',
  destination: 'VCP',
  airline: 'AZUL',
  program: 'tudoazul',
  flightDate: '2026-09-14',
};

const poa: CollectParams = {
  origin: 'PET',
  destination: 'POA',
  airline: 'AZUL',
  program: 'tudoazul',
  flightDate: '2026-09-16',
};

describe('tudoazul parser helpers', () => {
  it('parses numeric strings and ISO departure times', () => {
    assert.equal(toFiniteNumber('39.90'), 39.9);
    assert.equal(toFiniteNumber('not-a-number'), null);
    assert.equal(departureTimeOf('2026-09-14T06:40:00'), '06:40:00');
    assert.equal(departureTimeOf('2026-09-14T18:20:00-03:00'), '18:20:00');
  });

  it('detects Azul by AD / 2Z and drops partners', () => {
    assert.equal(isAzulJourney({ segments: [{ flight: { carrierCode: 'AD' } }] }), true);
    assert.equal(isAzulJourney({ segments: [{ identifier: { carrierCode: '2Z' } }] }), true);
    assert.equal(isAzulJourney({ segments: [{ flight: { carrierCode: 'LA' } }] }), false);
    assert.equal(isAzulJourney({}), true);
  });
});

describe('parseAzulAvailability points PET→VCP', () => {
  it('emits TudoAzul miles rows, keeps copay off amount_brl, drops partners', () => {
    const parsed = parseAzulAvailability(SEARCH_PET_VCP_POINTS, vcp, 'points');

    assert.equal(parsed.azulJourneys, 2);
    assert.equal(parsed.otherAirlineJourneys, 1);
    assert.ok(parsed.snapshots.length >= 3);

    for (const row of parsed.snapshots) {
      assert.equal(row.origin, 'PET');
      assert.equal(row.destination, 'VCP');
      assert.equal(row.airline, 'AZUL');
      assert.equal(row.program, 'tudoazul');
      assert.equal(row.flight_date, '2026-09-14');
      assert.equal(row.currency, 'BRL');
      assert.equal(row.source, TUDOAZUL_SOURCE);
      assert.ok(row.miles != null && row.miles > 0);
      assert.equal(row.amount_brl, null);
      assert.equal(row.collected_at, undefined);
      assert.equal(row.ingest_run_id, undefined);
    }

    const morningMiles = parsed.snapshots.find((row) => row.departure_time === '06:40:00' && row.miles === 18500);
    assert.ok(morningMiles);
    assert.equal(morningMiles.amount_brl, null);
    assert.equal(morningMiles.taxes_brl, 39.9);
    const morningRaw = morningMiles.raw_payload as { copay_brl?: number | null };
    assert.equal(morningRaw.copay_brl, null);

    const mix = parsed.snapshots.find((row) => row.miles === 7200);
    assert.ok(mix);
    assert.equal(mix.amount_brl, null);
    const mixRaw = mix.raw_payload as { copay_brl?: number | null; fareMoney?: { amount?: number } };
    assert.equal(mixRaw.copay_brl, 248.5);
    assert.equal(mixRaw.fareMoney?.amount, 248.5);

    const omitted = parsed.snapshots.find((row) => row.miles === 14100);
    assert.ok(omitted);
    assert.equal(omitted.amount_brl, null);

    assert.equal(
      parsed.snapshots.some((row) => row.miles === 22000),
      false,
      'LATAM partner row must be dropped',
    );
    assert.equal(
      parsed.snapshots.some((row) => row.miles === 0 || row.amount_brl === 0),
      false,
    );
  });
});

describe('parseAzulAvailability cash PET→VCP', () => {
  it('emits voeazul full-cash rows and never invents 0', () => {
    const parsed = parseAzulAvailability(SEARCH_PET_VCP_CASH, vcp, 'cash');
    assert.equal(parsed.snapshots.length, 2);
    for (const row of parsed.snapshots) {
      assert.equal(row.source, VOEAZUL_SOURCE);
      assert.equal(row.miles, null);
      assert.ok(row.amount_brl != null && row.amount_brl > 0);
      assert.notEqual(row.amount_brl, 0);
    }
    const morning = parsed.snapshots.find((row) => row.departure_time === '06:40:00');
    assert.equal(morning?.amount_brl, 529.9);
    const evening = parsed.snapshots.find((row) => row.departure_time === '18:20:00');
    assert.equal(evening?.amount_brl, 612.4);
  });

  it('parses native Navitaire journeysAvailableByMarket', () => {
    const parsed = parseAzulAvailability(SEARCH_NAVITAIRE_CASH, vcp, 'cash');
    assert.equal(parsed.snapshots.length, 1);
    assert.equal(parsed.snapshots[0]!.source, VOEAZUL_SOURCE);
    assert.equal(parsed.snapshots[0]!.amount_brl, 455.75);
    assert.equal(parsed.snapshots[0]!.miles, null);
    assert.equal(parsed.snapshots[0]!.departure_time, '07:00:00');
  });
});

describe('parseAzulAvailability PET→POA', () => {
  it('emits points and cash for Pelotas → Porto Alegre', () => {
    const points = parseAzulAvailability(SEARCH_PET_POA_POINTS, poa, 'points');
    assert.equal(points.snapshots.length, 1);
    assert.equal(points.snapshots[0]!.miles, 9800);
    assert.equal(points.snapshots[0]!.amount_brl, null);
    assert.equal(points.snapshots[0]!.source, TUDOAZUL_SOURCE);

    const cash = parseAzulAvailability(SEARCH_PET_POA_CASH, poa, 'cash');
    assert.equal(cash.snapshots.length, 1);
    assert.equal(cash.snapshots[0]!.amount_brl, 389);
    assert.equal(cash.snapshots[0]!.miles, null);
    assert.equal(cash.snapshots[0]!.source, VOEAZUL_SOURCE);
  });
});

describe('parseAzulAvailability empty / date mismatch', () => {
  it('returns empty when fixture departure dates do not match', () => {
    const parsed = parseAzulAvailability(SEARCH_PET_VCP_POINTS, { ...vcp, flightDate: '2026-10-03' }, 'points');
    assert.equal(parsed.snapshots.length, 0);
    assert.equal(parsed.azulJourneys, 0);
  });

  it('returns no snapshots for an empty journey list', () => {
    const parsed = parseAzulAvailability(SEARCH_EMPTY, vcp, 'points');
    assert.equal(parsed.snapshots.length, 0);
  });

  it('returns no snapshots when Azul journeys have no fares', () => {
    const parsed = parseAzulAvailability(SEARCH_NO_FARES, vcp, 'points');
    assert.equal(parsed.azulJourneys, 1);
    assert.equal(parsed.snapshots.length, 0);
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
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CollectParams } from '../src/collectors/types.ts';
import { LATAM_WEB_SOURCE, LATAM_PASS_SOURCE } from '../src/collectors/latam-pass/constants.ts';
import {
  SEARCH_EMPTY,
  SEARCH_GECKO_CASH,
  SEARCH_NO_FARES,
  SEARCH_PET_GRU_CASH,
  SEARCH_PET_GRU_CONNECTING,
  SEARCH_PET_GRU_MILES,
} from '../src/collectors/latam-pass/fixtures.ts';
import {
  departureTimeOf,
  isLatamOffer,
  parseLatamOffers,
  quotedOrNull,
  toFiniteNumber,
} from '../src/collectors/latam-pass/parser.ts';

const gru: CollectParams = {
  origin: 'PET',
  destination: 'GRU',
  airline: 'LATAM',
  program: 'latam_pass',
  flightDate: '2026-09-16',
};

describe('latam-pass parser helpers', () => {
  it('parses numeric strings and ISO departure times', () => {
    assert.equal(toFiniteNumber('39.90'), 39.9);
    assert.equal(toFiniteNumber('not-a-number'), null);
    assert.equal(departureTimeOf('2026-09-16T10:25:00'), '10:25:00');
    assert.equal(departureTimeOf('2026-09-16T16:40:00-03:00'), '16:40:00');
  });

  it('keeps LA/JJ and drops G3 / partners', () => {
    assert.equal(isLatamOffer({ summary: { flightCode: 'LA3456' } }), true);
    assert.equal(isLatamOffer({ summary: { flightCode: 'JJ3456' } }), true);
    assert.equal(isLatamOffer({ summary: { flightCode: 'G31234' } }), false);
    assert.equal(isLatamOffer({}), true);
  });
});

describe('parseLatamOffers miles PET→GRU', () => {
  it('emits LATAM Pass miles rows, keeps copay off amount_brl, drops partners', () => {
    const parsed = parseLatamOffers(SEARCH_PET_GRU_MILES, gru, 'miles');

    assert.equal(parsed.latamOffers, 2);
    assert.equal(parsed.otherAirlineOffers, 1);
    assert.ok(parsed.snapshots.length >= 3);

    for (const row of parsed.snapshots) {
      assert.equal(row.origin, 'PET');
      assert.equal(row.destination, 'GRU');
      assert.equal(row.airline, 'LATAM');
      assert.equal(row.program, 'latam_pass');
      assert.equal(row.flight_date, '2026-09-16');
      assert.equal(row.currency, 'BRL');
      assert.equal(row.source, LATAM_PASS_SOURCE);
      assert.ok(row.miles != null && row.miles > 0);
      assert.equal(row.amount_brl, null);
      assert.equal(row.collected_at, undefined);
      assert.equal(row.ingest_run_id, undefined);
    }

    const morningMiles = parsed.snapshots.find((row) => row.departure_time === '10:25:00' && row.miles === 12500);
    assert.ok(morningMiles);
    assert.equal(morningMiles.amount_brl, null);
    assert.equal(morningMiles.taxes_brl, 39.9);
    const morningRaw = morningMiles.raw_payload as {
      copay_brl?: number | null;
      price_without_tax_brl?: number | null;
      dow_preference?: { published?: boolean; brief?: boolean; grid?: string };
    };
    assert.equal(morningRaw.copay_brl, null);
    assert.equal(morningRaw.price_without_tax_brl, 359.9);
    assert.equal(morningRaw.dow_preference?.published, false);
    assert.equal(morningRaw.dow_preference?.brief, true);
    assert.equal(morningRaw.dow_preference?.grid, 'through_oct');

    const mix = parsed.snapshots.find((row) => row.miles === 7200);
    assert.ok(mix);
    assert.equal(mix.amount_brl, null);
    const mixRaw = mix.raw_payload as { copay_brl?: number | null; price_without_tax_brl?: number | null };
    assert.equal(mixRaw.copay_brl, 198.5);
    assert.equal(mixRaw.price_without_tax_brl, 359.9);

    const omitted = parsed.snapshots.find((row) => row.miles === 14100);
    assert.ok(omitted);
    assert.equal(omitted.amount_brl, null);

    assert.equal(
      parsed.snapshots.some((row) => row.miles === 22000),
      false,
      'GOL partner row must be dropped',
    );
    assert.equal(
      parsed.snapshots.some((row) => row.miles === 0 || row.amount_brl === 0),
      false,
    );
  });
});

describe('parseLatamOffers cash PET→GRU', () => {
  it('emits latam_web full-cash rows and never invents 0', () => {
    const parsed = parseLatamOffers(SEARCH_PET_GRU_CASH, gru, 'cash');
    assert.equal(parsed.snapshots.length, 2);
    for (const row of parsed.snapshots) {
      assert.equal(row.source, LATAM_WEB_SOURCE);
      assert.equal(row.miles, null);
      assert.ok(row.amount_brl != null && row.amount_brl > 0);
      assert.notEqual(row.amount_brl, 0);
      assert.equal((row.raw_payload as { dow_preference?: { published?: boolean } }).dow_preference?.published, false);
    }
    const morning = parsed.snapshots.find((row) => row.departure_time === '10:25:00' && row.amount_brl === 429.9);
    assert.ok(morning);
    const standard = parsed.snapshots.find((row) => row.amount_brl === 512.4);
    assert.ok(standard);
    assert.equal(
      parsed.snapshots.some((row) => row.amount_brl === 199.9),
      false,
      'GOL partner cash must be dropped',
    );
  });

  it('persists a connecting PET→GRU journey', () => {
    const parsed = parseLatamOffers(SEARCH_PET_GRU_CONNECTING, gru, 'cash');
    assert.equal(parsed.snapshots.length, 1);
    assert.equal(parsed.snapshots[0]!.source, LATAM_WEB_SOURCE);
    assert.equal(parsed.snapshots[0]!.amount_brl, 678.2);
    assert.equal((parsed.snapshots[0]!.raw_payload as { stops?: number }).stops, 1);
  });

  it('parses gecko-normalized items[] cash', () => {
    const parsed = parseLatamOffers(SEARCH_GECKO_CASH, gru, 'cash');
    assert.equal(parsed.snapshots.length, 1);
    assert.equal(parsed.snapshots[0]!.source, LATAM_WEB_SOURCE);
    assert.equal(parsed.snapshots[0]!.amount_brl, 388.75);
    assert.equal(parsed.snapshots[0]!.miles, null);
    assert.equal(parsed.snapshots[0]!.departure_time, '11:10:00');
    const raw = parsed.snapshots[0]!.raw_payload as { price?: { amount?: number }; dow_preference?: { brief?: boolean } };
    assert.equal(raw.price?.amount, 388.75);
    assert.equal(raw.dow_preference?.brief, true);
  });
});

describe('parseLatamOffers empty / date mismatch', () => {
  it('returns empty when fixture departure dates do not match', () => {
    const parsed = parseLatamOffers(SEARCH_PET_GRU_MILES, { ...gru, flightDate: '2026-10-03' }, 'miles');
    assert.equal(parsed.snapshots.length, 0);
    assert.equal(parsed.latamOffers, 0);
  });

  it('returns no snapshots for an empty content list', () => {
    const parsed = parseLatamOffers(SEARCH_EMPTY, gru, 'miles');
    assert.equal(parsed.snapshots.length, 0);
  });

  it('returns no snapshots when LATAM offers have no brands', () => {
    const parsed = parseLatamOffers(SEARCH_NO_FARES, gru, 'miles');
    assert.equal(parsed.latamOffers, 1);
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
    assert.equal(quotedOrNull(12500, 'miles'), 12500);
    assert.equal(quotedOrNull(198.5, 'money'), 198.5);
  });
});

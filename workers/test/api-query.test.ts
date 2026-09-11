import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  parseContentRangeTotal,
  parseSnapshotQuery,
  snapshotSelect,
  toPostgrestQuery,
} from '../src/api/query.ts';

function parse(raw: string) {
  return parseSnapshotQuery(new URLSearchParams(raw));
}

describe('parseSnapshotQuery', () => {
  it('defaults pagination and flags', () => {
    const parsed = parse('');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.limit, LIST_DEFAULT_LIMIT);
    assert.equal(parsed.value.offset, 0);
    assert.equal(parsed.value.includeRaw, false);
    assert.equal(parsed.value.excludeDryRun, false);
    assert.equal(parsed.value.groupBy, 'window');
  });

  it('normalizes IATA, airline, and program', () => {
    const parsed = parse('origin=pet&destination=cgh&airline=gol&program=Smiles&source=smiles_web');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(
      {
        origin: parsed.value.origin,
        destination: parsed.value.destination,
        airline: parsed.value.airline,
        program: parsed.value.program,
        source: parsed.value.source,
      },
      { origin: 'PET', destination: 'CGH', airline: 'GOL', program: 'smiles', source: 'smiles_web' },
    );
  });

  it('accepts flight_date and collected_at ranges plus aliases', () => {
    const parsed = parse(
      'flight_date_gte=2026-09-01&flight_date_lte=2026-12-31&collected_at_from=2026-09-11T00:00:00Z&collected_at_to=2026-09-11T23:59:59Z',
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.flightDateFrom, '2026-09-01');
    assert.equal(parsed.value.flightDateTo, '2026-12-31');
    assert.equal(parsed.value.collectedAtFrom, '2026-09-11T00:00:00Z');
    assert.equal(parsed.value.collectedAtTo, '2026-09-11T23:59:59Z');
  });

  it('treats include_raw=1 and exclude_dry_run=true as flags', () => {
    const parsed = parse('include_raw=1&exclude_dry_run=true');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.includeRaw, true);
    assert.equal(parsed.value.excludeDryRun, true);
  });

  it('rejects invalid IATA and inverted ranges', () => {
    assert.equal(parse('origin=PE').ok, false);
    assert.equal(parse('destination=CGHX').ok, false);
    const inverted = parse('flight_date_from=2026-12-31&flight_date_to=2026-09-01');
    assert.equal(inverted.ok, false);
    if (inverted.ok) return;
    assert.equal(inverted.error, 'invalid_flight_date_range');
  });

  it('accepts fonte as source and flight_date / collected_at exact filters', () => {
    const parsed = parse('fonte=smiles_web&flight_date=2026-09-15&collected_at=2026-09-11&dia=2026-09-16');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.source, 'smiles_web');
    assert.equal(parsed.value.flightDate, '2026-09-15');
    assert.equal(parsed.value.collectedAt, '2026-09-11');
  });

  it('treats fonte=todas as no source filter', () => {
    const parsed = parse('fonte=todas');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.source, undefined);
  });

  it('clamps limit to the configured max', () => {
    const parsed = parseSnapshotQuery(new URLSearchParams('limit=9999'));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.limit, LIST_MAX_LIMIT);
  });
});

describe('toPostgrestQuery', () => {
  it('maps equality and range filters onto PostgREST operators', () => {
    const parsed = parse(
      [
        'origin=PET',
        'destination=CGH',
        'airline=GOL',
        'program=smiles',
        'source=smiles_web',
        'flight_date_from=2026-09-01',
        'flight_date_to=2026-12-31',
        'collected_at_from=2026-09-11T00:00:00Z',
        'collected_at_to=2026-09-11T23:59:59Z',
        'limit=20',
        'offset=40',
      ].join('&'),
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const qs = toPostgrestQuery(parsed.value);
    const params = new URLSearchParams(qs);

    assert.equal(params.get('origin'), 'eq.PET');
    assert.equal(params.get('destination'), 'eq.CGH');
    assert.equal(params.get('airline'), 'eq.GOL');
    assert.equal(params.get('program'), 'eq.smiles');
    assert.equal(params.get('source'), 'eq.smiles_web');
    assert.deepEqual(params.getAll('flight_date'), ['gte.2026-09-01', 'lte.2026-12-31']);
    assert.deepEqual(params.getAll('collected_at'), ['gte.2026-09-11T00:00:00Z', 'lte.2026-09-11T23:59:59Z']);
    assert.equal(params.get('limit'), '20');
    assert.equal(params.get('offset'), '40');
    assert.equal(params.get('order'), 'collected_at.desc,id.desc');
    assert.equal(params.get('select')?.includes('raw_payload'), false);
    assert.equal(params.get('select')?.includes('miles'), true);
  });

  it('omits raw_payload unless include_raw is set', () => {
    assert.equal(snapshotSelect(false).includes('raw_payload'), false);
    assert.equal(snapshotSelect(true).endsWith(',raw_payload'), true);

    const withRaw = parse('include_raw=1');
    assert.equal(withRaw.ok, true);
    if (!withRaw.ok) return;
    assert.match(toPostgrestQuery(withRaw.value), /raw_payload/);
  });

  it('adds a dry-run exclusion when requested and source is unset', () => {
    const parsed = parse('exclude_dry_run=1&origin=PET');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const params = new URLSearchParams(toPostgrestQuery(parsed.value));
    assert.deepEqual(params.getAll('source'), ['not.like.*dry_run']);
    assert.equal(params.get('origin'), 'eq.PET');
  });

  it('maps exact flight_date and a collected_at civil day onto eq / day bounds', () => {
    const parsed = parse('flight_date=2026-09-15&collected_at=2026-09-11&fonte=voegol');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const params = new URLSearchParams(toPostgrestQuery(parsed.value));
    assert.equal(params.get('source'), 'eq.voegol');
    assert.deepEqual(params.getAll('flight_date'), ['eq.2026-09-15']);
    assert.deepEqual(params.getAll('collected_at'), ['gte.2026-09-11', 'lt.2026-09-12']);
  });

  it('does not add the dry-run filter when source is explicit', () => {
    const parsed = parse('exclude_dry_run=1&source=smiles_web');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(new URLSearchParams(toPostgrestQuery(parsed.value)).getAll('source'), ['eq.smiles_web']);
  });
});

describe('parseContentRangeTotal', () => {
  it('reads PostgREST totals', () => {
    assert.equal(parseContentRangeTotal('0-99/1234'), 1234);
    assert.equal(parseContentRangeTotal('*/0'), 0);
    assert.equal(parseContentRangeTotal('0-0/*'), null);
    assert.equal(parseContentRangeTotal(null), null);
  });
});

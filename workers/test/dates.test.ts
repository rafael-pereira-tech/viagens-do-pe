import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FLIGHT_WINDOW, ROUTE_MATRIX } from '../src/config.ts';
import { candidateDates, eachUtcDate, isPreferredDate, utcDow } from '../src/dates.ts';

describe('flight window', () => {
  it('is 1 Sep 2026 through 31 Dec 2026 (122 civil days)', () => {
    const dates = eachUtcDate(FLIGHT_WINDOW.start, FLIGHT_WINDOW.end);
    assert.equal(dates[0], '2026-09-01');
    assert.equal(dates.at(-1), '2026-12-31');
    assert.equal(dates.length, 122);
  });
});

describe('DOW preferences', () => {
  const gol = ROUTE_MATRIX.find((r) => r.destination === 'CGH')!;
  const vcp = ROUTE_MATRIX.find((r) => r.destination === 'VCP')!;
  const poa = ROUTE_MATRIX.find((r) => r.destination === 'POA')!;
  const latam = ROUTE_MATRIX.find((r) => r.destination === 'GRU')!;

  it('treats GOL CGH Tue/Thu/Sat as preferred', () => {
    assert.equal(utcDow('2026-09-01'), 2); // Tuesday
    assert.equal(isPreferredDate(gol, '2026-09-01'), true);
    assert.equal(isPreferredDate(gol, '2026-09-02'), false); // Wednesday
  });

  it('treats Azul VCP Mon/Fri as preferred', () => {
    assert.equal(isPreferredDate(vcp, '2026-09-07'), true); // Monday
    assert.equal(isPreferredDate(vcp, '2026-09-04'), true); // Friday
    assert.equal(isPreferredDate(vcp, '2026-09-02'), false); // Wednesday
  });

  it('does not lock Azul POA to specific weekdays', () => {
    assert.equal(isPreferredDate(poa, '2026-09-01'), false);
    assert.equal(isPreferredDate(poa, '2026-09-07'), false);
  });

  it('switches LATAM GRU preference after 31 Oct 2026', () => {
    assert.equal(isPreferredDate(latam, '2026-10-30'), true); // Friday, pre-Nov
    assert.equal(isPreferredDate(latam, '2026-10-31'), false); // Saturday still on Mon/Wed/Fri scheme
    assert.equal(isPreferredDate(latam, '2026-11-02'), false); // Monday no longer preferred
    assert.equal(isPreferredDate(latam, '2026-11-04'), true); // Wednesday
    assert.equal(isPreferredDate(latam, '2026-11-07'), true); // Saturday
  });

  it('puts preferred dates first but keeps the rest of the window', () => {
    const dates = candidateDates(gol, FLIGHT_WINDOW);
    assert.equal(dates.length, 122);
    const firstNonPreferred = dates.findIndex((d) => !isPreferredDate(gol, d));
    assert.ok(firstNonPreferred > 0);
    assert.ok(dates.slice(0, firstNonPreferred).every((d) => isPreferredDate(gol, d)));
    assert.ok(dates.slice(firstNonPreferred).every((d) => !isPreferredDate(gol, d)));
  });
});

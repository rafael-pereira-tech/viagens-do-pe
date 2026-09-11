import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FLIGHT_WINDOW, ROUTE_MATRIX } from '../src/config.ts';
import { buildJobs } from '../src/jobs.ts';

describe('buildJobs', () => {
  it('covers the four PET routes across the full window', () => {
    const jobs = buildJobs();
    assert.equal(ROUTE_MATRIX.length, 4);
    assert.equal(jobs.length, 122 * 4);

    const keys = new Set(jobs.map((j) => `${j.program}:${j.airline}:${j.origin}-${j.destination}`));
    assert.deepEqual(
      [...keys].sort(),
      ['latam_pass:LATAM:PET-GRU', 'smiles:GOL:PET-CGH', 'tudoazul:AZUL:PET-POA', 'tudoazul:AZUL:PET-VCP'].sort(),
    );
  });

  it('orders preferred dates before the rest within each route', () => {
    const jobs = buildJobs(FLIGHT_WINDOW, ROUTE_MATRIX.filter((r) => r.destination === 'CGH'));
    const firstOther = jobs.findIndex((j) => !j.preferred);
    assert.ok(firstOther > 0);
    assert.ok(jobs.slice(0, firstOther).every((j) => j.preferred));
    assert.ok(jobs.slice(firstOther).every((j) => !j.preferred));
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { smilesCollector } from '../src/collectors/smiles.ts';
import { latamPassCollector } from '../src/collectors/latam-pass.ts';
import { tudoAzulCollector } from '../src/collectors/tudoazul.ts';

describe('stub collectors', () => {
  it('return empty snapshots so BE-3/4/5 can replace the modules in place', async () => {
    const params = {
      origin: 'PET',
      destination: 'CGH',
      airline: 'GOL' as const,
      program: 'smiles' as const,
      flightDate: '2026-09-01',
    };
    const smiles = await smilesCollector.collect(params);
    assert.equal(smiles.status, 'empty');
    assert.deepEqual(smiles.snapshots, []);

    const azul = await tudoAzulCollector.collect({
      ...params,
      destination: 'VCP',
      airline: 'AZUL',
      program: 'tudoazul',
    });
    assert.equal(azul.status, 'empty');

    const latam = await latamPassCollector.collect({
      ...params,
      destination: 'GRU',
      airline: 'LATAM',
      program: 'latam_pass',
    });
    assert.equal(latam.status, 'empty');
  });
});

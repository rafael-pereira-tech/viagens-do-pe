import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { smilesCollector } from '../src/collectors/smiles/index.ts';
import { latamPassCollector } from '../src/collectors/latam-pass.ts';
import { tudoAzulCollector } from '../src/collectors/tudoazul.ts';

describe('airline collectors', () => {
  it('keeps TudoAzul and LATAM as empty stubs (BE-4/BE-5)', async () => {
    const params = {
      origin: 'PET' as const,
      destination: 'VCP',
      airline: 'AZUL' as const,
      program: 'tudoazul' as const,
      flightDate: '2026-09-01',
    };
    const azul = await tudoAzulCollector.collect(params);
    assert.equal(azul.status, 'empty');
    assert.deepEqual(azul.snapshots, []);

    const latam = await latamPassCollector.collect({
      origin: 'PET',
      destination: 'GRU',
      airline: 'LATAM',
      program: 'latam_pass',
      flightDate: '2026-09-01',
    });
    assert.equal(latam.status, 'empty');
  });

  it('does not search Smiles until env is configured', async () => {
    const smiles = await smilesCollector.collect({
      origin: 'PET',
      destination: 'CGH',
      airline: 'GOL',
      program: 'smiles',
      flightDate: '2026-09-01',
    });
    assert.equal(smiles.status, 'auth_failed');
    assert.deepEqual(smiles.snapshots, []);
  });
});

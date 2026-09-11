import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { smilesCollector } from '../src/collectors/smiles/index.ts';
import { latamPassCollector } from '../src/collectors/latam-pass/index.ts';
import { tudoAzulCollector } from '../src/collectors/tudoazul/index.ts';

describe('airline collectors', () => {
  it('does not search TudoAzul until env is configured', async () => {
    const azul = await tudoAzulCollector.collect({
      origin: 'PET',
      destination: 'VCP',
      airline: 'AZUL',
      program: 'tudoazul',
      flightDate: '2026-09-01',
    });
    assert.equal(azul.status, 'auth_failed');
    assert.deepEqual(azul.snapshots, []);
  });

  it('does not search LATAM Pass until env is configured', async () => {
    const latam = await latamPassCollector.collect({
      origin: 'PET',
      destination: 'GRU',
      airline: 'LATAM',
      program: 'latam_pass',
      flightDate: '2026-09-01',
    });
    assert.equal(latam.status, 'auth_failed');
    assert.deepEqual(latam.snapshots, []);
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

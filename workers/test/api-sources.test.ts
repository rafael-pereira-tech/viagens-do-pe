import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cashCompanionSourceIds,
  isAwardMilesSource,
  isCashCompanionSource,
  sourceBase,
} from '../src/api/sources.ts';

describe('source families', () => {
  it('strips the dry-run suffix and classifies award vs cash', () => {
    assert.equal(sourceBase('voegol_dry_run'), 'voegol');
    assert.equal(sourceBase('smiles_web'), 'smiles_web');

    for (const source of ['smiles_web', 'smiles_web_dry_run', 'tudoazul', 'latam_pass_dry_run']) {
      assert.equal(isAwardMilesSource(source), true, source);
      assert.equal(isCashCompanionSource(source), false, source);
    }

    for (const source of ['voegol', 'voeazul_dry_run', 'latam_web', 'latam_dry_run']) {
      assert.equal(isCashCompanionSource(source), true, source);
      assert.equal(isAwardMilesSource(source), false, source);
    }

    assert.equal(isCashCompanionSource('smiles_web'), false);
    assert.equal(isAwardMilesSource('voegol'), false);
    assert.deepEqual(cashCompanionSourceIds(false), ['voegol', 'voeazul', 'latam_web', 'latam']);
    assert.ok(cashCompanionSourceIds(true).includes('voegol_dry_run'));
    assert.equal(cashCompanionSourceIds(true).includes('smiles_web_dry_run'), false);
  });
});

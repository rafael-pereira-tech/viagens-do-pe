import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateStatus } from '../src/status.ts';

describe('aggregateStatus', () => {
  it('returns empty for no jobs', () => {
    assert.equal(aggregateStatus([]), 'empty');
  });

  it('keeps a unanimous status', () => {
    assert.equal(aggregateStatus(['empty', 'empty']), 'empty');
    assert.equal(aggregateStatus(['success']), 'success');
    assert.equal(aggregateStatus(['auth_failed', 'auth_failed']), 'auth_failed');
  });

  it('promotes success+empty to success', () => {
    assert.equal(aggregateStatus(['success', 'empty', 'empty']), 'success');
  });

  it('marks mixed failures as partial', () => {
    assert.equal(aggregateStatus(['success', 'scrape_failed']), 'partial');
    assert.equal(aggregateStatus(['empty', 'auth_failed']), 'partial');
    assert.equal(aggregateStatus(['auth_failed', 'scrape_failed']), 'partial');
  });
});

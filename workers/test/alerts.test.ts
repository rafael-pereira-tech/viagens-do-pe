import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldFire, type PriceAlert } from '../src/alerts.ts';

function alert(partial: Partial<PriceAlert> & Pick<PriceAlert, 'condition' | 'threshold' | 'metric'>): PriceAlert {
  return {
    id: 'a1',
    enabled: true,
    origin: null,
    destination: null,
    source: null,
    flight_date: null,
    flight_date_from: null,
    flight_date_to: null,
    channel: 'log',
    last_fired_at: null,
    cooldown_minutes: 360,
    ...partial,
  };
}

describe('shouldFire', () => {
  it('fires below_abs when current <= threshold', () => {
    const a = alert({ metric: 'miles', condition: 'below_abs', threshold: 25000 });
    assert.equal(shouldFire(a, 20000, null, null).fire, true);
    assert.equal(shouldFire(a, 30000, null, null).fire, false);
  });

  it('fires drop_pct_vs_prev on percent drop', () => {
    const a = alert({ metric: 'amount_brl', condition: 'drop_pct_vs_prev', threshold: 10 });
    // 100 → 80 = 20% drop
    const hit = shouldFire(a, 80, 100, null);
    assert.equal(hit.fire, true);
    assert.equal(shouldFire(a, 95, 100, null).fire, false);
    assert.equal(shouldFire(a, 80, null, null).fire, false);
  });

  it('fires drop_pct_vs_7d_min against rolling min', () => {
    const a = alert({ metric: 'milheiro', condition: 'drop_pct_vs_7d_min', threshold: 15 });
    // min7d 20 → current 16 = 20% drop
    assert.equal(shouldFire(a, 16, 18, 20).fire, true);
    assert.equal(shouldFire(a, 19, 18, 20).fire, false);
  });
});

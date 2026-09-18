import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseObservationSummaryRow,
  rollupObservationDays,
  type ObservationSummaryRow,
} from '../src/api/observation-summary.ts';
import { handleReadApi } from '../src/api/handlers.ts';
import type { SupabaseRest } from '../src/supabase.ts';

describe('observation summary helpers', () => {
  it('parses RPC rows and rolls up best-of-day miles/cash', () => {
    const rows: ObservationSummaryRow[] = [
      {
        origin: 'PET',
        destination: 'CGH',
        source: 'smiles_web',
        flight_date: '2026-10-01',
        metric: 'miles',
        current_value: 30000,
        prev_value: 35000,
        delta_pct: -14.29,
        min_value: 28000,
        max_value: 40000,
        sample_count: 4,
        latest_collected_at: '2026-09-18T12:00:00Z',
      },
      {
        origin: 'PET',
        destination: 'CGH',
        source: 'latam_pass',
        flight_date: '2026-10-01',
        metric: 'miles',
        current_value: 32000,
        prev_value: 30000,
        delta_pct: 6.67,
        min_value: 30000,
        max_value: 32000,
        sample_count: 2,
        latest_collected_at: '2026-09-18T12:00:00Z',
      },
      {
        origin: 'PET',
        destination: 'CGH',
        source: 'voegol',
        flight_date: '2026-10-01',
        metric: 'amount_brl',
        current_value: 500,
        prev_value: 450,
        delta_pct: 11.11,
        min_value: 400,
        max_value: 600,
        sample_count: 3,
        latest_collected_at: '2026-09-18T12:00:00Z',
      },
    ];

    const days = rollupObservationDays(rows);
    assert.equal(days.length, 1);
    assert.equal(days[0].miles?.current_value, 30000);
    assert.equal(days[0].miles?.delta_pct, -14.29);
    assert.equal(days[0].miles?.min_value, 28000);
    assert.equal(days[0].miles?.max_value, 40000);
    assert.equal(days[0].amount_brl?.current_value, 500);
    assert.equal(days[0].amount_brl?.delta_pct, 11.11);
  });

  it('rejects unknown metrics', () => {
    assert.equal(parseObservationSummaryRow({ metric: 'milheiro', flight_date: '2026-10-01' }), null);
  });
});

describe('GET /api/v1/observations/summary', () => {
  const READ_KEY = 'dev-only-read-api-key';

  it('requires origin/destination and maps RPC response', async () => {
    const rest: SupabaseRest = async (path, init) => {
      assert.match(path, /^rpc\/price_observation_summary$/);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      assert.equal(body.p_origin, 'PET');
      assert.equal(body.p_destination, 'CGH');
      return new Response(
        JSON.stringify([
          {
            origin: 'PET',
            destination: 'CGH',
            source: 'smiles_web',
            flight_date: '2026-10-01',
            metric: 'miles',
            current_value: 30000,
            prev_value: 35000,
            delta_pct: -14.29,
            min_value: 28000,
            max_value: 40000,
            sample_count: 4,
            latest_collected_at: '2026-09-18T12:00:00Z',
          },
        ]),
        { status: 200 },
      );
    };

    const response = await handleReadApi(
      new Request('http://localhost:8787/api/v1/observations/summary?origin=PET&destination=CGH&flight_date_from=2026-10-01', {
        headers: { Authorization: `Bearer ${READ_KEY}` },
      }),
      { READ_API_KEY: READ_KEY },
      { rest },
    );
    assert.equal(response.status, 200);
    const json = (await response.json()) as {
      data: { by_source: unknown[]; by_day: Array<{ miles: { current_value: number } | null }> };
    };
    assert.equal(json.data.by_source.length, 1);
    assert.equal(json.data.by_day[0].miles?.current_value, 30000);
  });

  it('rejects missing origin', async () => {
    const response = await handleReadApi(
      new Request('http://localhost:8787/api/v1/observations/summary?destination=CGH', {
        headers: { Authorization: `Bearer ${READ_KEY}` },
      }),
      { READ_API_KEY: READ_KEY },
      { rest: async () => new Response('[]') },
    );
    assert.equal(response.status, 400);
  });
});

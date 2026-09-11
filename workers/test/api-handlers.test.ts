import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleReadApi } from '../src/api/handlers.ts';
import type { SupabaseRest } from '../src/supabase.ts';

function row(source = 'smiles_web') {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    origin: 'PET',
    destination: 'CGH',
    airline: 'GOL',
    program: 'smiles',
    flight_date: '2026-09-15',
    departure_time: '07:00:00',
    miles: 12000,
    amount_brl: null,
    taxes_brl: 58,
    currency: 'BRL',
    source,
    collected_at: '2026-09-11T18:00:00.000Z',
    created_at: '2026-09-11T18:00:00.000Z',
    ingest_run_id: '22222222-2222-2222-2222-222222222222',
    raw_payload: { password: 'nope', fare: 1 },
  };
}

function restMock(
  impl: (path: string, init?: RequestInit) => { status?: number; rows: unknown[]; total?: number },
): {
  rest: SupabaseRest;
  paths: string[];
  bodies: unknown[];
} {
  const paths: string[] = [];
  const bodies: unknown[] = [];
  const rest: SupabaseRest = async (path, init) => {
    paths.push(path);
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    const result = impl(path, init);
    return new Response(JSON.stringify(result.rows), {
      status: result.status ?? 200,
      headers: { 'Content-Range': `0-${Math.max(result.rows.length - 1, 0)}/${result.total ?? result.rows.length}` },
    });
  };
  return { rest, paths, bodies };
}

async function get(path: string, rest: SupabaseRest | null, env: Record<string, string> = {}) {
  return handleReadApi(new Request(`http://localhost:8787${path}`), env, { rest });
}

describe('handleReadApi', () => {
  it('serves read health without Supabase', async () => {
    const response = await get('/api/v1/health', null);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: 'viagens-do-pe-read' });
  });

  it('maps dashboard-style filters onto the PostgREST path', async () => {
    const { rest, paths } = restMock(() => ({ rows: [row()], total: 1 }));
    const response = await get(
      '/api/v1/snapshots?origin=PET&destination=CGH&source=smiles_web&flight_date_from=2026-09-01&flight_date_to=2026-12-31&collected_at_from=2026-09-11T00:00:00Z',
      rest,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: Array<{ source: string; raw_payload?: unknown }>; meta: { total: number } };
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0]?.source, 'smiles_web');
    assert.equal('raw_payload' in (body.data[0] ?? {}), false);
    assert.equal(body.meta.total, 1);
    assert.match(paths[0] ?? '', /^price_snapshots\?/);
    const qs = new URLSearchParams(paths[0]!.split('?')[1]);
    assert.equal(qs.get('origin'), 'eq.PET');
    assert.equal(qs.get('destination'), 'eq.CGH');
    assert.equal(qs.get('source'), 'eq.smiles_web');
    assert.deepEqual(qs.getAll('flight_date'), ['gte.2026-09-01', 'lte.2026-12-31']);
    assert.equal(qs.get('collected_at'), 'gte.2026-09-11T00:00:00Z');
    assert.equal((qs.get('select') ?? '').includes('raw_payload'), false);
  });

  it('accepts fonte and exact flight_date as dashboard aliases', async () => {
    const { rest, paths } = restMock(() => ({ rows: [row()], total: 1 }));
    const response = await get(
      '/api/v1/snapshots?origin=PET&destination=CGH&fonte=smiles_web&flight_date=2026-09-15&collected_at=2026-09-11',
      rest,
    );
    assert.equal(response.status, 200);
    const qs = new URLSearchParams(paths[0]!.split('?')[1]);
    assert.equal(qs.get('source'), 'eq.smiles_web');
    assert.deepEqual(qs.getAll('flight_date'), ['eq.2026-09-15']);
    assert.deepEqual(qs.getAll('collected_at'), ['gte.2026-09-11', 'lt.2026-09-12']);
  });

  it('uses the latest view and falls back to in-memory distinct', async () => {
    const view = restMock((path) => {
      if (path.startsWith('price_snapshots_latest')) {
        return { rows: [row('smiles_web'), row('smiles_web')], total: 2 };
      }
      return { rows: [], total: 0 };
    });
    const latest = await get('/api/v1/snapshots/latest?origin=PET&destination=CGH', view.rest);
    assert.equal(latest.status, 200);
    const latestBody = (await latest.json()) as { meta: { grain: string } };
    assert.equal(latestBody.meta.grain, 'origin,destination,airline,program,source,flight_date');
    assert.match(view.paths[0] ?? '', /^price_snapshots_latest\?/);

    const fallback = restMock((path) => {
      if (path.startsWith('price_snapshots_latest')) return { status: 404, rows: [] };
      return {
        rows: [
          { ...row(), id: 'new', collected_at: '2026-09-11T18:00:00.000Z', miles: 8000 },
          { ...row(), id: 'old', collected_at: '2026-09-11T06:00:00.000Z', miles: 9000 },
        ],
      };
    });
    const fb = await get('/api/v1/snapshots/latest?origin=PET', fallback.rest);
    const fbBody = (await fb.json()) as { data: Array<{ id: string }>; meta: { fallback?: string; total: number } };
    assert.equal(fbBody.meta.fallback, 'in_memory_distinct');
    assert.equal(fbBody.meta.total, 1);
    assert.equal(fbBody.data[0]?.id, 'new');
  });

  it('returns window mins from SQL aggregates over the full filtered set', async () => {
    const { rest, paths, bodies } = restMock((path) => {
      if (path.startsWith('rpc/price_snapshot_stats')) {
        return {
          rows: [
            {
              origin: null,
              destination: null,
              flight_date: null,
              min_miles: 7200,
              min_amount_brl: '529.90',
              snapshot_count: 5480,
              latest_collected_at: '2026-09-11T18:00:00.000Z',
            },
          ],
        };
      }
      return { rows: [] };
    });
    const response = await get(
      '/api/v1/snapshots/stats?origin=PET&destination=CGH&exclude_dry_run=1&group_by=window',
      rest,
    );
    const body = (await response.json()) as {
      data: { min_miles: number; min_amount_brl: number; snapshot_count: number };
      meta: { group_by: string; snapshot_count: number; truncated: boolean; fallback?: string };
    };
    assert.equal(response.status, 200);
    assert.equal(paths[0], 'rpc/price_snapshot_stats');
    assert.equal((bodies[0] as { p_exclude_dry_run: boolean }).p_exclude_dry_run, true);
    assert.equal((bodies[0] as { p_origin: string }).p_origin, 'PET');
    assert.equal(body.meta.group_by, 'window');
    assert.equal(body.meta.snapshot_count, 5480);
    assert.equal(body.meta.truncated, false);
    assert.equal(body.meta.fallback, undefined);
    assert.equal(body.data.min_miles, 7200);
    assert.equal(body.data.min_amount_brl, 529.9);
    assert.equal(body.data.snapshot_count, 5480);
  });

  it('does not treat legacy smiles_web amount_brl as cash on the sample fallback', async () => {
    const { rest } = restMock((path) => {
      if (path.startsWith('rpc/')) return { status: 404, rows: [] };
      return {
        rows: [
          { ...row(), miles: 18500, amount_brl: 248.5, source: 'smiles_web' },
          { ...row(), miles: null, amount_brl: '529.90', source: 'voeazul' },
        ],
        total: 2,
      };
    });
    const response = await get('/api/v1/snapshots/stats?origin=PET&destination=CGH&group_by=window', rest);
    const body = (await response.json()) as {
      data: { min_miles: number; min_amount_brl: number };
      meta: { truncated: boolean; fallback?: string; snapshot_count: number };
    };
    assert.equal(response.status, 200);
    assert.equal(body.meta.fallback, 'in_memory_sample');
    assert.equal(body.meta.truncated, false);
    assert.equal(body.meta.snapshot_count, 2);
    assert.equal(body.data.min_miles, 18500);
    assert.equal(body.data.min_amount_brl, 529.9);
  });

  it('marks a 1000-row PostgREST page truncated when Content-Range total is larger', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({
      ...row(),
      id: `row-${i}`,
      amount_brl: i === 0 ? 248.5 : null,
    }));
    const { rest } = restMock((path) => {
      if (path.startsWith('rpc/')) return { status: 404, rows: [] };
      return { rows: page, total: 5480 };
    });
    const response = await get('/api/v1/snapshots/stats?origin=PET&group_by=window', rest);
    const body = (await response.json()) as {
      data: { min_amount_brl: number | null; snapshot_count: number };
      meta: { truncated: boolean; snapshot_count: number; fallback?: string };
    };
    assert.equal(body.meta.fallback, 'in_memory_sample');
    assert.equal(body.meta.truncated, true);
    assert.equal(body.meta.snapshot_count, 1000);
    assert.equal(body.data.min_amount_brl, null);
  });

  it('groups SQL stats by route/day', async () => {
    const { rest } = restMock((path) => {
      if (path.startsWith('rpc/price_snapshot_stats')) {
        return {
          rows: [
            {
              origin: 'PET',
              destination: 'CGH',
              flight_date: '2026-09-15',
              min_miles: 12000,
              min_amount_brl: 890,
              snapshot_count: 4,
              latest_collected_at: '2026-09-11T18:00:00.000Z',
            },
            {
              origin: 'PET',
              destination: 'VCP',
              flight_date: '2026-09-16',
              min_miles: 18500,
              min_amount_brl: null,
              snapshot_count: 2,
              latest_collected_at: '2026-09-11T18:00:00.000Z',
            },
          ],
        };
      }
      return { rows: [] };
    });
    const response = await get('/api/v1/snapshots/stats?origin=PET&group_by=route_day', rest);
    const body = (await response.json()) as {
      data: Array<{ destination: string; min_amount_brl: number | null }>;
      meta: { snapshot_count: number; truncated: boolean };
    };
    assert.equal(response.status, 200);
    assert.equal(body.meta.truncated, false);
    assert.equal(body.meta.snapshot_count, 6);
    assert.equal(body.data[0]?.destination, 'CGH');
    assert.equal(body.data[0]?.min_amount_brl, 890);
    assert.equal(body.data[1]?.min_amount_brl, null);
  });

  it('requires a Bearer token when API_READ_SECRET is set', async () => {
    const { rest } = restMock(() => ({ rows: [] }));
    const denied = await handleReadApi(new Request('http://localhost:8787/api/v1/snapshots'), {
      API_READ_SECRET: 'read-secret',
    }, { rest });
    assert.equal(denied.status, 401);

    const ok = await handleReadApi(
      new Request('http://localhost:8787/api/v1/snapshots', {
        headers: { Authorization: 'Bearer read-secret' },
      }),
      { API_READ_SECRET: 'read-secret' },
      { rest },
    );
    assert.equal(ok.status, 200);
  });

  it('validates filters before requiring Supabase', async () => {
    const response = await handleReadApi(new Request('http://localhost:8787/api/v1/snapshots?origin=PE'), {}, { rest: null });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, 'invalid_origin');
  });

  it('returns 503 when Supabase is not configured', async () => {
    const response = await handleReadApi(new Request('http://localhost:8787/api/v1/snapshots'), {}, { rest: null });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'supabase_not_configured' });
  });

  it('never echoes raw_payload secrets even with include_raw=1', async () => {
    const { rest } = restMock(() => ({ rows: [row()] }));
    const response = await get('/api/v1/snapshots?include_raw=1', rest);
    const body = (await response.json()) as { data: Array<{ raw_payload: Record<string, unknown> }> };
    assert.equal(body.data[0]?.raw_payload.password, '[redacted]');
    assert.equal(body.data[0]?.raw_payload.fare, 1);
    const text = JSON.stringify(body);
    assert.equal(text.includes('nope'), false);
    assert.equal(text.includes('SERVICE_ROLE'), false);
  });
});

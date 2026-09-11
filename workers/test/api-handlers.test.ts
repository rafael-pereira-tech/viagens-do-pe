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

function restMock(impl: (path: string) => { status?: number; rows: unknown[]; total?: number }): {
  rest: SupabaseRest;
  paths: string[];
} {
  const paths: string[] = [];
  const rest: SupabaseRest = async (path) => {
    paths.push(path);
    const result = impl(path);
    return new Response(JSON.stringify(result.rows), {
      status: result.status ?? 200,
      headers: { 'Content-Range': `0-0/${result.total ?? result.rows.length}` },
    });
  };
  return { rest, paths };
}

const READ_KEY = 'dev-only-read-api-key';
const INGEST_KEY = 'dev-only-trigger-secret';

async function get(
  path: string,
  rest: SupabaseRest | null,
  env: Record<string, string> = {},
  opts: { auth?: boolean } = {},
) {
  const headers: HeadersInit = {};
  if (opts.auth !== false) headers.Authorization = `Bearer ${env.READ_API_KEY ?? READ_KEY}`;
  return handleReadApi(new Request(`http://localhost:8787${path}`, { headers }), {
    READ_API_KEY: READ_KEY,
    INGEST_TRIGGER_SECRET: INGEST_KEY,
    ...env,
  }, { rest });
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

  it('returns window mins for KPIs', async () => {
    const { rest } = restMock(() => ({
      rows: [
        { ...row(), miles: 12000, amount_brl: null },
        { ...row(), miles: null, amount_brl: '529.90', source: 'voeazul' },
      ],
    }));
    const response = await get('/api/v1/snapshots/stats?origin=PET&destination=CGH&group_by=window', rest);
    const body = (await response.json()) as {
      data: { min_miles: number; min_amount_brl: number };
      meta: { group_by: string };
    };
    assert.equal(response.status, 200);
    assert.equal(body.meta.group_by, 'window');
    assert.equal(body.data.min_miles, 12000);
    assert.equal(body.data.min_amount_brl, 529.9);
  });

  it('requires Authorization: Bearer <READ_API_KEY> and rejects the ingest secret', async () => {
    const { rest } = restMock(() => ({ rows: [] }));
    const missing = await get('/api/v1/snapshots', rest, {}, { auth: false });
    assert.equal(missing.status, 401);

    const ingest = await handleReadApi(
      new Request('http://localhost:8787/api/v1/snapshots', {
        headers: { Authorization: `Bearer ${INGEST_KEY}` },
      }),
      { READ_API_KEY: READ_KEY, INGEST_TRIGGER_SECRET: INGEST_KEY },
      { rest },
    );
    assert.equal(ingest.status, 401);

    const ok = await get('/api/v1/snapshots', rest);
    assert.equal(ok.status, 200);
  });

  it('does not serve snapshots when READ_API_KEY is unset (FE login is not enough)', async () => {
    const { rest } = restMock(() => ({ rows: [{ origin: 'PET' }] }));
    const response = await handleReadApi(new Request('http://localhost:8787/api/v1/snapshots'), {}, { rest });
    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { error: string }).error, 'read_api_key_not_configured');
  });

  it('validates filters before requiring Supabase', async () => {
    const response = await get('/api/v1/snapshots?origin=PE', null);
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, 'invalid_origin');
  });

  it('returns 503 when Supabase is not configured', async () => {
    const response = await get('/api/v1/snapshots', null);
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

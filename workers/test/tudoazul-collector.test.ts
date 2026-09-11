import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTudoAzulCollector } from '../src/collectors/tudoazul/collector.ts';
import {
  SEARCH_AKAMAI_BLOCK,
  SEARCH_EMPTY,
  SEARCH_FLEXIBLE_DAYS_ONLY,
  SEARCH_HTML_BLOCK,
  SEARCH_PET_VCP_CASH,
  SEARCH_PET_VCP_CONNECTING,
  SEARCH_PET_VCP_POINTS,
} from '../src/collectors/tudoazul/fixtures.ts';
import { AZUL_AVAILABILITY_PATH, AZUL_TOKEN_PATH, TUDOAZUL_SOURCE, VOEAZUL_SOURCE } from '../src/collectors/tudoazul/constants.ts';
import type { CollectParams } from '../src/collectors/types.ts';

const params: CollectParams = {
  origin: 'PET',
  destination: 'VCP',
  airline: 'AZUL',
  program: 'tudoazul',
  flightDate: '2026-09-14',
};

const LIVE = {
  TUDOAZUL_LOGIN: 'member',
  TUDOAZUL_PASSWORD: 'placeholder-password',
  TUDOAZUL_REQUEST_DELAY_MS: '0',
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function withLogin(
  handler: (url: string) => Response | Promise<Response>,
): (input: RequestInfo | URL) => Promise<Response> {
  return async (input) => {
    const url = String(input);
    if (url.includes(AZUL_TOKEN_PATH)) {
      return jsonResponse({ data: { token: 'member-jwt' } });
    }
    return handler(url);
  };
}

describe('tudoazul collector', () => {
  it('returns auth_failed when frozen secrets are missing and not dry-run', async () => {
    const collector = createTudoAzulCollector({});
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.deepEqual(result.snapshots, []);
    assert.match(String(result.error), /TUDOAZUL_LOGIN/);
    assert.match(String(result.error), /TUDOAZUL_PASSWORD/);
  });

  it('returns auth_failed when only TUDOAZUL_LOGIN is set', async () => {
    const collector = createTudoAzulCollector({ TUDOAZUL_LOGIN: 'member' });
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.deepEqual(result.snapshots, []);
  });

  it('parses bundled PET→VCP fixtures in dry-run without fetching', async () => {
    let fetches = 0;
    const collector = createTudoAzulCollector(
      { TUDOAZUL_DRY_RUN: '1' },
      {
        fetch: async () => {
          fetches += 1;
          throw new Error('dry-run must not fetch');
        },
      },
    );
    const result = await collector.collect({ ...params, flightDate: '2026-11-20' });
    assert.equal(fetches, 0);
    assert.equal(result.status, 'success');
    assert.ok(result.snapshots.every((row) => row.flight_date === '2026-11-20'));
    assert.ok(result.snapshots.some((row) => row.source === TUDOAZUL_SOURCE && row.miles === 18500 && row.amount_brl == null));
    assert.ok(result.snapshots.some((row) => row.source === TUDOAZUL_SOURCE && row.miles === 7200 && row.amount_brl == null));
    assert.ok(result.snapshots.some((row) => row.source === VOEAZUL_SOURCE && row.amount_brl === 529.9 && row.miles == null));
    const mix = result.snapshots.find((row) => row.miles === 7200);
    assert.equal((mix?.raw_payload as { fare_money_brl?: number }).fare_money_brl, 248.5);
    assert.equal(mix?.amount_brl, null);
  });

  it('parses bundled PET→POA fixtures in dry-run', async () => {
    const collector = createTudoAzulCollector({ TUDOAZUL_DRY_RUN: '1' }, { fetch: async () => new Response('nope') });
    const result = await collector.collect({
      origin: 'PET',
      destination: 'POA',
      airline: 'AZUL',
      program: 'tudoazul',
      flightDate: '2026-10-02',
    });
    assert.equal(result.status, 'success');
    assert.ok(result.snapshots.some((row) => row.destination === 'POA' && row.miles === 9800 && row.amount_brl == null));
    assert.ok(result.snapshots.some((row) => row.destination === 'POA' && row.amount_brl === 389 && row.miles == null));
  });

  it('maps 401 to auth_failed', async () => {
    const collector = createTudoAzulCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse({ message: 'unauthorized' }, 401)),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.equal(result.snapshots.length, 0);
  });

  it('maps HTML 403 WAF to scrape_failed', async () => {
    const collector = createTudoAzulCollector(LIVE, {
      fetch: withLogin(
        async () => new Response(SEARCH_HTML_BLOCK, { status: 403, headers: { 'content-type': 'text/html' } }),
      ),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('retries 429 then reports scrape_failed', async () => {
    let availabilityCalls = 0;
    const collector = createTudoAzulCollector(LIVE, {
      fetch: withLogin(async () => {
        availabilityCalls += 1;
        return jsonResponse({ message: 'rate limited' }, 429, { 'retry-after': '0' });
      }),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
    // points + cash, 3 attempts each
    assert.equal(availabilityCalls, 6);
  });

  it('maps Akamai-style 200 error JSON to scrape_failed', async () => {
    const collector = createTudoAzulCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse(SEARCH_AKAMAI_BLOCK, 200)),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('maps HTML bodies to scrape_failed', async () => {
    const collector = createTudoAzulCollector(LIVE, {
      fetch: withLogin(
        async () => new Response(SEARCH_HTML_BLOCK, { status: 200, headers: { 'content-type': 'text/html' } }),
      ),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('returns empty when both searches have no journeys', async () => {
    const collector = createTudoAzulCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse(SEARCH_EMPTY)),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'empty');
    assert.deepEqual(result.snapshots, []);
  });

  it('logs in with TUDOAZUL_LOGIN / TUDOAZUL_PASSWORD then searches points and cash', async () => {
    const urls: string[] = [];
    const bodies: Array<Record<string, unknown>> = [];
    const referers: string[] = [];
    let loginBody = '';
    const collector = createTudoAzulCollector(LIVE, {
      fetch: async (input, init) => {
        const url = String(input);
        urls.push(url);
        if (url.includes(AZUL_TOKEN_PATH)) {
          loginBody = typeof init?.body === 'string' ? init.body : '';
          return jsonResponse({ data: { token: 'member-jwt' } });
        }
        if (url.includes(AZUL_AVAILABILITY_PATH)) {
          const raw = typeof init?.body === 'string' ? init.body : '{}';
          bodies.push(JSON.parse(raw) as Record<string, unknown>);
          referers.push(new Headers(init?.headers).get('referer') ?? '');
          const isPoints = urls.filter((u) => u.includes(AZUL_AVAILABILITY_PATH)).length === 1;
          return jsonResponse(isPoints ? SEARCH_PET_VCP_POINTS : SEARCH_PET_VCP_CASH);
        }
        throw new Error(`unexpected url ${url}`);
      },
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'success');
    assert.equal(urls.filter((u) => u.includes(AZUL_TOKEN_PATH)).length, 1);
    assert.equal(urls.filter((u) => u.includes(AZUL_AVAILABILITY_PATH)).length, 2);
    assert.match(loginBody, /"login":"member"/);
    assert.match(loginBody, /"password":"placeholder-password"/);
    assert.equal(bodies[0]?.pricingMode, 'points');
    assert.equal(bodies[0]?.points, true);
    assert.equal(bodies[1]?.pricingMode, 'cash');
    assert.equal(bodies[1]?.points, false);
    assert.match(referers[0]!, /passagens\.voeazul\.com\.br\/pt\/buscador-de-pontos/);
    assert.match(referers[1]!, /selecao-voo/);
    assert.match(referers[1]!, /p(?:\[0\]|%5B0%5D)\.cp=false/);
    assert.ok(result.snapshots.some((row) => row.source === TUDOAZUL_SOURCE && row.miles === 18500));
    assert.ok(result.snapshots.some((row) => row.source === VOEAZUL_SOURCE && row.amount_brl === 529.9));
    assert.equal(TUDOAZUL_SOURCE, 'tudoazul');
  });

  it('treats a connecting PET→VCP before 2026-10-26 as success, not scrape_failed', async () => {
    const collector = createTudoAzulCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse(SEARCH_PET_VCP_CONNECTING)),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'success');
    assert.equal(result.snapshots.length, 1);
    assert.equal(result.snapshots[0]!.source, VOEAZUL_SOURCE);
    assert.equal(result.snapshots[0]!.amount_brl, 678.2);
    assert.equal((result.snapshots[0]!.raw_payload as { stops?: number }).stops, 1);
  });

  it('treats flexibleDays-only inventory as empty, not scrape_failed', async () => {
    const collector = createTudoAzulCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse(SEARCH_FLEXIBLE_DAYS_ONLY)),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'empty');
    assert.deepEqual(result.snapshots, []);
  });

  it('is partial when points succeed and cash fails', async () => {
    let availabilityCalls = 0;
    const collector = createTudoAzulCollector(LIVE, {
      fetch: withLogin(async () => {
        availabilityCalls += 1;
        if (availabilityCalls === 1) return jsonResponse(SEARCH_PET_VCP_POINTS);
        return jsonResponse({ message: 'upstream' }, 500);
      }),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'partial');
    assert.ok(result.snapshots.some((row) => row.source === TUDOAZUL_SOURCE));
    assert.equal(
      result.snapshots.some((row) => row.source === VOEAZUL_SOURCE),
      false,
    );
  });

  it('treats login failure as auth_failed and does not search', async () => {
    const urls: string[] = [];
    const collector = createTudoAzulCollector(LIVE, {
      fetch: async (input) => {
        urls.push(String(input));
        return jsonResponse({ error: 'invalid' }, 401);
      },
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.equal(urls.length, 1);
    assert.match(urls[0]!, /authentication\/v1\/token/);
    assert.match(String(result.error), /auth_failed/);
  });
});

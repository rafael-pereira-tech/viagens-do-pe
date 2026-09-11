import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLatamPassCollector } from '../src/collectors/latam-pass/collector.ts';
import {
  SEARCH_AKAMAI_BLOCK,
  SEARCH_EMPTY,
  SEARCH_HTML_BLOCK,
  SEARCH_PET_GRU_CASH,
  SEARCH_PET_GRU_CONNECTING,
  SEARCH_PET_GRU_MILES,
} from '../src/collectors/latam-pass/fixtures.ts';
import {
  LATAM_OFFERS_PATH,
  LATAM_PASS_SOURCE,
  LATAM_SESSION_PATH,
  LATAM_WEB_SOURCE,
} from '../src/collectors/latam-pass/constants.ts';
import type { CollectParams } from '../src/collectors/types.ts';

const params: CollectParams = {
  origin: 'PET',
  destination: 'GRU',
  airline: 'LATAM',
  program: 'latam_pass',
  flightDate: '2026-09-16',
};

const LIVE = {
  LATAM_PASS_LOGIN: 'member@example.com',
  LATAM_PASS_PASSWORD: 'placeholder-password',
  LATAM_REQUEST_DELAY_MS: '0',
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
    if (url.includes(LATAM_SESSION_PATH)) {
      return jsonResponse({ data: { token: 'member-jwt' } });
    }
    return handler(url);
  };
}

describe('latam-pass collector', () => {
  it('returns auth_failed when frozen secrets are missing and not dry-run', async () => {
    const collector = createLatamPassCollector({});
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.deepEqual(result.snapshots, []);
    assert.match(String(result.error), /LATAM_PASS_LOGIN/);
    assert.match(String(result.error), /LATAM_PASS_PASSWORD/);
  });

  it('returns auth_failed when only LATAM_PASS_LOGIN is set', async () => {
    const collector = createLatamPassCollector({ LATAM_PASS_LOGIN: 'member@example.com' });
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.deepEqual(result.snapshots, []);
  });

  it('ignores LATAM_LOGIN / LATAM_PASSWORD (frozen names are LATAM_PASS_*)', async () => {
    const collector = createLatamPassCollector({
      LATAM_LOGIN: 'member@example.com',
      LATAM_PASSWORD: 'placeholder-password',
    } as Record<string, string>);
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.match(String(result.error), /LATAM_PASS_LOGIN/);
  });

  it('parses bundled PET→GRU fixtures in dry-run without fetching', async () => {
    let fetches = 0;
    const collector = createLatamPassCollector(
      { LATAM_DRY_RUN: '1' },
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
    assert.ok(result.snapshots.some((row) => row.source === LATAM_PASS_SOURCE && row.miles === 12500 && row.amount_brl == null));
    assert.ok(result.snapshots.some((row) => row.source === LATAM_PASS_SOURCE && row.miles === 7200 && row.amount_brl == null));
    assert.ok(result.snapshots.some((row) => row.source === LATAM_WEB_SOURCE && row.amount_brl === 429.9 && row.miles == null));
    const mix = result.snapshots.find((row) => row.miles === 7200);
    assert.equal((mix?.raw_payload as { copay_brl?: number }).copay_brl, 198.5);
    assert.equal(mix?.amount_brl, null);
  });

  it('maps 401 to auth_failed', async () => {
    const collector = createLatamPassCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse({ message: 'unauthorized' }, 401)),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.equal(result.snapshots.length, 0);
  });

  it('maps HTML 403 WAF to scrape_failed', async () => {
    const collector = createLatamPassCollector(LIVE, {
      fetch: withLogin(
        async () => new Response(SEARCH_HTML_BLOCK, { status: 403, headers: { 'content-type': 'text/html' } }),
      ),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('retries 429 then reports scrape_failed', async () => {
    let offerCalls = 0;
    const collector = createLatamPassCollector(LIVE, {
      fetch: withLogin(async () => {
        offerCalls += 1;
        return jsonResponse({ message: 'rate limited' }, 429, { 'retry-after': '0' });
      }),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
    // miles + cash, 3 attempts each
    assert.equal(offerCalls, 6);
  });

  it('maps Akamai-style 200 error JSON to scrape_failed', async () => {
    const collector = createLatamPassCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse(SEARCH_AKAMAI_BLOCK, 200)),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('maps HTML bodies to scrape_failed', async () => {
    const collector = createLatamPassCollector(LIVE, {
      fetch: withLogin(
        async () => new Response(SEARCH_HTML_BLOCK, { status: 200, headers: { 'content-type': 'text/html' } }),
      ),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('returns empty when both searches have no offers', async () => {
    const collector = createLatamPassCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse(SEARCH_EMPTY)),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'empty');
    assert.deepEqual(result.snapshots, []);
  });

  it('treats empty inventory on a non-operating DOW as empty, not scrape_failed', async () => {
    const collector = createLatamPassCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse(SEARCH_EMPTY)),
      sleep: async () => {},
    });
    const result = await collector.collect({ ...params, flightDate: '2026-09-15' }); // Tuesday
    assert.equal(result.status, 'empty');
    assert.deepEqual(result.snapshots, []);
  });

  it('logs in with LATAM_PASS_LOGIN / LATAM_PASS_PASSWORD then searches miles and cash', async () => {
    const urls: string[] = [];
    const redemptions: string[] = [];
    const referers: string[] = [];
    let loginBody = '';
    const collector = createLatamPassCollector(LIVE, {
      fetch: async (input, init) => {
        const url = String(input);
        urls.push(url);
        if (url.includes(LATAM_SESSION_PATH)) {
          loginBody = typeof init?.body === 'string' ? init.body : '';
          return jsonResponse({ data: { token: 'member-jwt' } });
        }
        if (url.includes(LATAM_OFFERS_PATH) || url.includes('/offers/search')) {
          const parsed = new URL(url);
          redemptions.push(parsed.searchParams.get('redemption') ?? '');
          referers.push(new Headers(init?.headers).get('referer') ?? '');
          const isMiles = parsed.searchParams.get('redemption') === 'true';
          return jsonResponse(isMiles ? SEARCH_PET_GRU_MILES : SEARCH_PET_GRU_CASH);
        }
        throw new Error(`unexpected url ${url}`);
      },
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'success');
    assert.equal(urls.filter((u) => u.includes(LATAM_SESSION_PATH)).length, 1);
    assert.equal(urls.filter((u) => u.includes('/offers/search')).length, 2);
    assert.match(loginBody, /"email":"member@example.com"/);
    assert.match(loginBody, /"password":"placeholder-password"/);
    assert.deepEqual(redemptions, ['true', 'false']);
    assert.match(referers[0]!, /redemption=true/);
    assert.match(referers[1]!, /redemption=false/);
    assert.match(referers[0]!, /origin=PET/);
    assert.match(referers[0]!, /destination=GRU/);
    assert.ok(result.snapshots.some((row) => row.source === LATAM_PASS_SOURCE && row.miles === 12500));
    assert.ok(result.snapshots.some((row) => row.source === LATAM_WEB_SOURCE && row.amount_brl === 429.9));
    assert.equal(LATAM_PASS_SOURCE, 'latam_pass');
    assert.equal(LATAM_WEB_SOURCE, 'latam_web');
    assert.ok(urls.some((u) => u.includes('/bff/air-offers/offers/search')));
  });

  it('treats a connecting PET→GRU as success, not scrape_failed', async () => {
    const collector = createLatamPassCollector(LIVE, {
      fetch: withLogin(async () => jsonResponse(SEARCH_PET_GRU_CONNECTING)),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'success');
    assert.equal(result.snapshots.length, 1);
    assert.equal(result.snapshots[0]!.source, LATAM_WEB_SOURCE);
    assert.equal(result.snapshots[0]!.amount_brl, 678.2);
    assert.equal((result.snapshots[0]!.raw_payload as { stops?: number }).stops, 1);
  });

  it('is partial when miles succeed and cash fails', async () => {
    let offerCalls = 0;
    const collector = createLatamPassCollector(LIVE, {
      fetch: withLogin(async () => {
        offerCalls += 1;
        if (offerCalls === 1) return jsonResponse(SEARCH_PET_GRU_MILES);
        return jsonResponse({ message: 'upstream' }, 500);
      }),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'partial');
    assert.ok(result.snapshots.some((row) => row.source === LATAM_PASS_SOURCE));
    assert.equal(
      result.snapshots.some((row) => row.source === LATAM_WEB_SOURCE),
      false,
    );
  });

  it('treats login failure as auth_failed and does not search', async () => {
    const urls: string[] = [];
    const collector = createLatamPassCollector(LIVE, {
      fetch: async (input) => {
        urls.push(String(input));
        return jsonResponse({ error: 'invalid' }, 401);
      },
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.equal(urls.length, 1);
    assert.match(urls[0]!, /user-session\/v1\/session/);
    assert.match(String(result.error), /auth_failed/);
  });
});

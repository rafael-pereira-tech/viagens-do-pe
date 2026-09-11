import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CollectParams } from '../src/collectors/types.ts';
import { createSmilesCollector } from '../src/collectors/smiles/collector.ts';
import { searchHost } from '../src/collectors/smiles/client.ts';
import { SMILES_SOURCE, VOEGOL_SOURCE } from '../src/collectors/smiles/constants.ts';
import {
  SEARCH_AKAMAI_BLOCK,
  SEARCH_HTML_BLOCK,
  SEARCH_PET_CGH_EMPTY,
  SEARCH_PET_CGH_SUCCESS,
  VOEGOL_PET_CGH_SUCCESS,
} from '../src/collectors/smiles/fixtures.ts';

const params: CollectParams = {
  origin: 'PET',
  destination: 'CGH',
  airline: 'GOL',
  program: 'smiles',
  flightDate: '2026-09-15',
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function milesOnlyEnv(extra: Record<string, string> = {}) {
  return {
    SMILES_API_KEY: 'test-key',
    SMILES_REQUEST_DELAY_MS: '0',
    VOEGOL_DISABLED: '1',
    ...extra,
  };
}

describe('smiles collector', () => {
  it('defaults the search host to the documented green replica', () => {
    assert.equal(searchHost({}), 'https://api-air-flightsearch-green.smiles.com.br');
    assert.equal(searchHost({ SMILES_ENV: 'blue' }), 'https://api-air-flightsearch-blue.smiles.com.br');
  });

  it('returns auth_failed when no credentials and not dry-run', async () => {
    const collector = createSmilesCollector({});
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.deepEqual(result.snapshots, []);
    assert.match(String(result.error), /not configured/i);
  });

  it('parses bundled PET→CGH fixtures in dry-run without fetching', async () => {
    let fetches = 0;
    const collector = createSmilesCollector(
      { SMILES_DRY_RUN: '1' },
      {
        fetch: async () => {
          fetches += 1;
          throw new Error('dry-run must not fetch');
        },
      },
    );
    const result = await collector.collect({ ...params, flightDate: '2026-11-21' });
    assert.equal(fetches, 0);
    assert.equal(result.status, 'success');
    assert.ok(result.snapshots.length >= 5);
    assert.ok(result.snapshots.every((row) => row.flight_date === '2026-11-21'));
    const milesRows = result.snapshots.filter((row) => row.source === SMILES_SOURCE);
    const cashRows = result.snapshots.filter((row) => row.source === VOEGOL_SOURCE);
    assert.ok(milesRows.length >= 3);
    assert.equal(cashRows.length, 2);
    const mix = milesRows.find((row) => row.miles === 7200);
    assert.ok(mix);
    assert.equal(mix.amount_brl, null);
    assert.equal((mix.raw_payload as { copay_brl?: number }).copay_brl, 248.5);
    assert.ok(cashRows.some((row) => row.amount_brl === 389.9 && row.miles == null));
    assert.equal(
      milesRows.some((row) => row.amount_brl != null),
      false,
      'Smiles rows must not carry copay in amount_brl',
    );
  });

  it('maps 401/403 to auth_failed', async () => {
    const collector = createSmilesCollector(milesOnlyEnv(), {
      fetch: async () => jsonResponse({ message: 'unauthorized' }, 401),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.equal(result.snapshots.length, 0);
  });

  it('maps HTTP 406 WAF to scrape_failed (not a 0 fare)', async () => {
    const collector = createSmilesCollector(milesOnlyEnv(), {
      fetch: async () => new Response('Not Acceptable', { status: 406 }),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
    assert.equal(result.snapshots.length, 0);
    assert.match(String(result.error), /406/);
    assert.equal(
      result.snapshots.some((row) => row.miles === 0 || row.amount_brl === 0),
      false,
    );
  });

  it('retries 429 then reports scrape_failed', async () => {
    let calls = 0;
    const collector = createSmilesCollector(milesOnlyEnv(), {
      fetch: async () => {
        calls += 1;
        return jsonResponse({ message: 'rate limited' }, 429, { 'retry-after': '0' });
      },
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
    assert.equal(calls, 3);
  });

  it('maps Akamai-style 200 error JSON to scrape_failed', async () => {
    const collector = createSmilesCollector(milesOnlyEnv(), {
      fetch: async () => jsonResponse(SEARCH_AKAMAI_BLOCK, 200),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('maps HTML bodies to scrape_failed', async () => {
    const collector = createSmilesCollector(milesOnlyEnv(), {
      fetch: async () => new Response(SEARCH_HTML_BLOCK, { status: 200, headers: { 'content-type': 'text/html' } }),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('returns empty when the search JSON has no flights', async () => {
    const collector = createSmilesCollector(milesOnlyEnv(), {
      fetch: async () => jsonResponse(SEARCH_PET_CGH_EMPTY),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'empty');
    assert.deepEqual(result.snapshots, []);
  });

  it('parses a live-shaped JSON payload via mock fetch', async () => {
    const collector = createSmilesCollector(milesOnlyEnv(), {
      fetch: async () => jsonResponse(SEARCH_PET_CGH_SUCCESS),
      sleep: async () => {},
    });
    const result = await collector.collect(params);
    assert.equal(result.status, 'success');
    assert.ok(result.snapshots.some((row) => row.departure_time === '18:20:00' && row.miles === 6100));
    assert.ok(result.snapshots.every((row) => row.amount_brl == null));
  });

  it('sends a browser Accept set on Smiles search', async () => {
    let accept = '';
    const collector = createSmilesCollector(milesOnlyEnv(), {
      fetch: async (_input, init) => {
        accept = new Headers(init?.headers).get('Accept') ?? '';
        return jsonResponse(SEARCH_PET_CGH_EMPTY);
      },
      sleep: async () => {},
    });
    await collector.collect(params);
    assert.match(accept, /text\/html/);
    assert.match(accept, /image\/webp/);
    assert.match(accept, /\*\/\*/);
  });

  it('treats member+password login failure as auth_failed and does not search Smiles', async () => {
    const urls: string[] = [];
    const collector = createSmilesCollector(
      milesOnlyEnv({
        SMILES_MEMBER_NUMBER: '123456789',
        SMILES_PASSWORD: '0000',
      }),
      {
        fetch: async (input) => {
          urls.push(String(input));
          return jsonResponse({ error: 'invalid_grant' }, 401);
        },
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.equal(urls.length, 1);
    assert.match(urls[0]!, /oauth\/token/);
  });

  it('keeps miles when VoeGol cash 406s and marks the job partial', async () => {
    const collector = createSmilesCollector(
      { SMILES_API_KEY: 'test-key', SMILES_REQUEST_DELAY_MS: '0' },
      {
        fetch: async (input) => {
          const url = String(input);
          if (url.includes('voegol')) return new Response('Not Acceptable', { status: 406 });
          return jsonResponse(SEARCH_PET_CGH_SUCCESS);
        },
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'partial');
    assert.ok(result.snapshots.some((row) => row.source === SMILES_SOURCE && row.miles === 18500));
    assert.equal(
      result.snapshots.some((row) => row.source === VOEGOL_SOURCE),
      false,
    );
    assert.match(String(result.error), /406/);
  });

  it('emits VoeGol cash rows from a companion 200 without inventing 0', async () => {
    const collector = createSmilesCollector(
      { SMILES_API_KEY: 'test-key', SMILES_REQUEST_DELAY_MS: '0' },
      {
        fetch: async (input) => {
          const url = String(input);
          if (url.includes('voegol')) return jsonResponse(VOEGOL_PET_CGH_SUCCESS);
          return jsonResponse(SEARCH_PET_CGH_EMPTY);
        },
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'success');
    assert.equal(
      result.snapshots.every((row) => row.source === VOEGOL_SOURCE),
      true,
    );
    assert.ok(result.snapshots.some((row) => row.amount_brl === 389.9));
    assert.equal(
      result.snapshots.some((row) => row.amount_brl === 0 || row.miles === 0),
      false,
    );
  });
});

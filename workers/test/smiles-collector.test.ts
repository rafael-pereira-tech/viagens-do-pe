import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSmilesCollector } from '../src/collectors/smiles/collector.ts';
import {
  SEARCH_AKAMAI_BLOCK,
  SEARCH_HTML_BLOCK,
  SEARCH_PET_CGH_CASH,
  SEARCH_PET_CGH_CASH_EMPTY,
  SEARCH_PET_CGH_EMPTY,
  SEARCH_PET_CGH_SUCCESS,
} from '../src/collectors/smiles/fixtures.ts';
import { SMILES_SOURCE, VOEGOL_FLIGHTS_PATH, VOEGOL_SOURCE } from '../src/collectors/smiles/constants.ts';
import type { CollectParams } from '../src/collectors/types.ts';

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

function isCashUrl(url: string): boolean {
  return url.includes(VOEGOL_FLIGHTS_PATH);
}

describe('smiles collector', () => {
  it('returns auth_failed when no credentials and not dry-run', async () => {
    const collector = createSmilesCollector({});
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.deepEqual(result.snapshots, []);
    assert.match(String(result.error), /not configured/i);
  });

  it('parses bundled PET→CGH miles + VoeGol cash fixtures in dry-run without fetching', async () => {
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
    assert.ok(
      result.snapshots.some(
        (row) => row.source === SMILES_SOURCE && row.miles === 18500 && row.amount_brl == null,
      ),
    );
    assert.ok(
      result.snapshots.some((row) => row.source === SMILES_SOURCE && row.miles === 7200 && row.amount_brl == null),
    );
    assert.ok(
      result.snapshots.some((row) => row.source === VOEGOL_SOURCE && row.amount_brl === 548.9 && row.miles == null),
    );
    const mix = result.snapshots.find((row) => row.miles === 7200);
    assert.equal((mix?.raw_payload as { copay_brl?: number }).copay_brl, 248.5);
    assert.equal((mix?.raw_payload as { smiles_money?: number }).smiles_money, 248.5);
    assert.equal(mix?.amount_brl, null);
    assert.ok(result.snapshots.filter((row) => row.source === SMILES_SOURCE).every((row) => row.amount_brl == null));
  });

  it('maps 401/403 to auth_failed', async () => {
    const collector = createSmilesCollector(
      { SMILES_API_KEY: 'test-key', SMILES_REQUEST_DELAY_MS: '0' },
      {
        fetch: async () => jsonResponse({ message: 'unauthorized' }, 401),
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'auth_failed');
    assert.equal(result.snapshots.length, 0);
  });

  it('retries 429 then reports scrape_failed', async () => {
    let calls = 0;
    const collector = createSmilesCollector(
      { SMILES_API_KEY: 'test-key', SMILES_REQUEST_DELAY_MS: '0' },
      {
        fetch: async () => {
          calls += 1;
          return jsonResponse({ message: 'rate limited' }, 429, { 'retry-after': '0' });
        },
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
    // miles + cash, 3 attempts each
    assert.equal(calls, 6);
  });

  it('maps Akamai-style 200 error JSON to scrape_failed', async () => {
    const collector = createSmilesCollector(
      { SMILES_API_KEY: 'test-key', SMILES_REQUEST_DELAY_MS: '0' },
      {
        fetch: async () => jsonResponse(SEARCH_AKAMAI_BLOCK, 200),
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('maps HTML bodies to scrape_failed', async () => {
    const collector = createSmilesCollector(
      { SMILES_API_KEY: 'test-key', SMILES_REQUEST_DELAY_MS: '0' },
      {
        fetch: async () => new Response(SEARCH_HTML_BLOCK, { status: 200, headers: { 'content-type': 'text/html' } }),
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'scrape_failed');
  });

  it('returns empty when both searches have no flights', async () => {
    const collector = createSmilesCollector(
      { SMILES_API_KEY: 'test-key', SMILES_REQUEST_DELAY_MS: '0' },
      {
        fetch: async (input) => jsonResponse(isCashUrl(String(input)) ? SEARCH_PET_CGH_CASH_EMPTY : SEARCH_PET_CGH_EMPTY),
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'empty');
    assert.deepEqual(result.snapshots, []);
  });

  it('parses live-shaped JSON for Smiles miles and VoeGol cash via mock fetch', async () => {
    const urls: string[] = [];
    const referers: string[] = [];
    let cashBody = '';
    const collector = createSmilesCollector(
      { SMILES_API_KEY: 'test-key', SMILES_REQUEST_DELAY_MS: '0' },
      {
        fetch: async (input, init) => {
          const url = String(input);
          urls.push(url);
          if (isCashUrl(url)) {
            cashBody = typeof init?.body === 'string' ? init.body : '';
            referers.push(new Headers(init?.headers).get('referer') ?? '');
            return jsonResponse(SEARCH_PET_CGH_CASH);
          }
          return jsonResponse(SEARCH_PET_CGH_SUCCESS);
        },
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'success');
    assert.ok(urls.some((url) => url.includes('/v1/airlines/search')));
    assert.ok(urls.some((url) => url.includes(VOEGOL_FLIGHTS_PATH) && url.includes('Flow=Issue')));
    assert.match(cashBody, /"origin":"PET"/);
    assert.match(cashBody, /"destination":"CGH"/);
    assert.match(referers[0]!, /voegol\.com\.br\/itineraries/);
    assert.ok(result.snapshots.some((row) => row.departure_time === '18:20:00' && row.miles === 6100));
    assert.ok(result.snapshots.some((row) => row.source === VOEGOL_SOURCE && row.amount_brl === 548.9));
    assert.ok(result.snapshots.filter((row) => row.source === SMILES_SOURCE).every((row) => row.amount_brl == null));
  });

  it('is partial when miles succeed and cash fails', async () => {
    const collector = createSmilesCollector(
      { SMILES_API_KEY: 'test-key', SMILES_REQUEST_DELAY_MS: '0' },
      {
        fetch: async (input) => {
          if (isCashUrl(String(input))) return jsonResponse({ message: 'upstream' }, 500);
          return jsonResponse(SEARCH_PET_CGH_SUCCESS);
        },
        sleep: async () => {},
      },
    );
    const result = await collector.collect(params);
    assert.equal(result.status, 'partial');
    assert.ok(result.snapshots.some((row) => row.source === SMILES_SOURCE));
    assert.equal(
      result.snapshots.some((row) => row.source === VOEGOL_SOURCE),
      false,
    );
  });

  it('treats password login failure as auth_failed and does not search', async () => {
    let urls: string[] = [];
    const collector = createSmilesCollector(
      {
        SMILES_API_KEY: 'test-key',
        SMILES_USER: '000000000',
        SMILES_PASS: 'wrong',
        SMILES_REQUEST_DELAY_MS: '0',
      },
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
});

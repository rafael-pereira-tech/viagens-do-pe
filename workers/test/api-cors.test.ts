import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCors, corsPreflight, isAllowedOrigin, PAGES_ORIGIN } from '../src/api/cors.ts';

describe('isAllowedOrigin', () => {
  it('allows the Pages production origin and localhost', () => {
    assert.equal(isAllowedOrigin(PAGES_ORIGIN), true);
    assert.equal(isAllowedOrigin('https://feat-branch.viagens-do-pe.pages.dev'), true);
    assert.equal(isAllowedOrigin('http://localhost:5173'), true);
    assert.equal(isAllowedOrigin('http://127.0.0.1:8787'), true);
    assert.equal(isAllowedOrigin('http://localhost'), true);
  });

  it('rejects unknown origins unless listed in CORS_ALLOWED_ORIGINS', () => {
    assert.equal(isAllowedOrigin('https://evil.example'), false);
    assert.equal(isAllowedOrigin('https://evil.example', { CORS_ALLOWED_ORIGINS: 'https://evil.example' }), true);
  });
});

describe('CORS responses', () => {
  it('echoes Allow-Origin only for an allowlisted Origin', () => {
    const allowed = new Request('http://localhost:8787/api/v1/snapshots', {
      headers: { Origin: PAGES_ORIGIN },
    });
    const withCors = applyCors(allowed, {}, new Response('{"ok":true}'));
    assert.equal(withCors.headers.get('Access-Control-Allow-Origin'), PAGES_ORIGIN);
    assert.equal(withCors.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');

    const blocked = applyCors(
      new Request('http://localhost:8787/api/v1/snapshots', { headers: { Origin: 'https://evil.example' } }),
      {},
      new Response('{"ok":true}'),
    );
    assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
  });

  it('answers preflight for Pages and 403 for unknown origins', () => {
    const ok = corsPreflight(new Request('http://localhost:8787/api/v1/snapshots', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), {});
    assert.equal(ok.status, 204);

    const no = corsPreflight(new Request('http://localhost:8787/api/v1/snapshots', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), {});
    assert.equal(no.status, 403);
  });
});

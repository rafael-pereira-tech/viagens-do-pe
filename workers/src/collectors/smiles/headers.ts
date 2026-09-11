import { BROWSER_ACCEPT, BROWSER_ACCEPT_LANGUAGE, BROWSER_UA } from './constants';

/** Headers that resemble a real browser. Required to reduce HTTP 406 WAF/Accept filters. */
export function applyBrowserClientHeaders(headers: Headers): void {
  headers.set('Accept', BROWSER_ACCEPT);
  headers.set('Accept-Language', BROWSER_ACCEPT_LANGUAGE);
  headers.set('User-Agent', BROWSER_UA);
  headers.set('Cache-Control', 'no-cache');
  headers.set('Pragma', 'no-cache');
}

export function classifySearchHttpError(
  label: string,
  status: number,
  body: string,
): { ok: false; status: number; error: string; kind: 'auth_failed' | 'scrape_failed' } {
  const snippet = body.slice(0, 240);
  if (status === 401 || status === 403) {
    return { ok: false, status, error: `${label} ${status}: ${snippet}`, kind: 'auth_failed' };
  }
  if (status === 406) {
    return {
      ok: false,
      status,
      error: `${label} 406 (WAF/Accept filter since ~07/2025): ${snippet}`,
      kind: 'scrape_failed',
    };
  }
  return { ok: false, status, error: `${label} ${status}: ${snippet}`, kind: 'scrape_failed' };
}

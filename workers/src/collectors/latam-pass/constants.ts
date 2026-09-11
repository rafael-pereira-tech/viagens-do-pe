/** Award / miles+money rows in `price_snapshots.source`. Distinct from `program: latam_pass`. */
export const LATAM_PASS_SOURCE = 'latam_pass';

/**
 * Full cash BRL from the official LATAM booking path (same BFF host,
 * `redemption=false`). Never mix this with LATAM Pass copay.
 */
export const LATAMAIRLINES_SOURCE = 'latamairlines';

export const LATAM_API_HOST = 'https://www.latamairlines.com';
export const LATAM_ORIGIN = 'https://www.latamairlines.com';
export const LATAM_OFFERS_UI = 'https://www.latamairlines.com/br/pt/oferta-voos';

/**
 * Miles UI uses `redemption=true`; cash uses `redemption=false`.
 * Upstream (2026): `GET /bff/air-offers/v2/offers/search`.
 * Gecko captures the unversioned `/bff/air-offers/offers/search` alias.
 */
export const LATAM_OFFERS_PATH = '/bff/air-offers/v2/offers/search';

/**
 * Member session. Password login is often blocked by Akamai/captcha —
 * `LATAM_DRY_RUN=1` is the accepted path until `LATAM_PASS_LOGIN` /
 * `LATAM_PASS_PASSWORD` are provided privately.
 */
export const LATAM_SESSION_PATH = '/bff/user-session/v1/session';

export const LATAM_APPLICATION_NAME = 'web-air-offers';
export const LATAM_ACTION_NAME = 'search-result.flightselection.offers-search';
export const LATAM_COUNTRY = 'BR';
export const LATAM_OC = 'br';
export const LATAM_LANG = 'pt';

export const DEFAULT_DELAY_MS = 400;
export const MAX_RETRIES = 3;

/** Marketing carriers operated as LATAM. Partners (G3, AD, DL, …) are dropped. */
export const LATAM_CARRIER_CODES = new Set(['LA', 'JJ', 'LP', 'XL', '4C', 'PZ']);

/** Award `price.currency` on redemption search. Cash search uses `BRL`. */
export const LOYALTY_CURRENCIES = new Set(['LOYALTY_POINTS', 'POINTS', 'LP', 'MILES']);

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

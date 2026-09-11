/** Award / miles+money rows in `price_snapshots.source`. Distinct from `program: latam_pass`. */
export const LATAM_PASS_SOURCE = 'latam_pass';
export const LATAM_PASS_DRY_RUN_SOURCE = 'latam_pass_dry_run';

/**
 * Full cash BRL from latamairlines.com (`redemption=false`).
 * Briefing allowed `latam` / `latam_web`; persist `latam_web` (mirrors `smiles_web`,
 * distinct from program `latam_pass`). Never mix with LATAM Pass copay.
 */
export const LATAM_WEB_SOURCE = 'latam_web';
export const LATAM_WEB_DRY_RUN_SOURCE = 'latam_web_dry_run';

export const LATAM_API_HOST = 'https://www.latamairlines.com';
export const LATAM_ORIGIN = 'https://www.latamairlines.com';
export const LATAM_OFFERS_UI = 'https://www.latamairlines.com/br/pt/oferta-voos';

/**
 * Miles UI uses `redemption=true`; cash uses `redemption=false`.
 * Research briefing (2026-09-11): `GET /bff/air-offers/offers/search`.
 * SPA also ships `/bff/air-offers/v2/offers/search` (`LATAM_OFFERS_PATH` override).
 * Partner award search / NDC are not public — skipped for v1.
 */
export const LATAM_OFFERS_PATH = '/bff/air-offers/offers/search';

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

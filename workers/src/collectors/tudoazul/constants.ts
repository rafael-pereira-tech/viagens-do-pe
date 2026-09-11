/** Award / pontos+reais rows in `price_snapshots.source`. Distinct from `program: tudoazul`. */
export const TUDOAZUL_SOURCE = 'tudoazul';

/**
 * Full cash BRL from the official Azul booking path (same B2C availability host,
 * `pricingMode=cash`). Never mix this with TudoAzul copay.
 */
export const VOEAZUL_SOURCE = 'voeazul';

export const AZUL_API_HOST = 'https://b2c-api.voeazul.com.br';
export const AZUL_ORIGIN = 'https://www.voeazul.com.br';
export const AZUL_CASH_REFERER = 'https://www.voeazul.com.br/br/pt/home/selecao-voo';

/** TudoAzul points UI (not the cash `selecao-voo` path). */
export const TUDOAZUL_POINTS_ORIGIN = 'https://passagens.voeazul.com.br';
export const TUDOAZUL_POINTS_REFERER = 'https://passagens.voeazul.com.br/pt/buscador-de-pontos';

/** Guest JWT. SPA sends `Device: novosite`. */
export const AZUL_TOKEN_PATH = '/authentication/api/authentication/v1/token';

/**
 * Cash and TudoAzul points both POST here. `points` / `pricingMode` selects the mode.
 * B2B Navitaire Shopping exists but needs an agency — skipped for v1.
 */
export const AZUL_AVAILABILITY_PATH =
  '/reservationavailability/api/reservation/availability/v5/availability';

export const AZUL_DEVICE = 'novosite';
export const AZUL_CULTURE = 'pt-BR';

export const DEFAULT_DELAY_MS = 400;
export const MAX_RETRIES = 3;

/** Briefing: persist `carrierCode=AD` only. Partners (LA) and Azul Conecta (2Z) are dropped. */
export const AZUL_CARRIER_CODE = 'AD';

/**
 * PET→VCP nonstop announced from this civil date (Mon/Fri).
 * Before that, empty inventory or `stopsCount>0` is valid — never `scrape_failed`.
 */
export const PET_VCP_DIRECT_FROM = '2026-10-26';

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

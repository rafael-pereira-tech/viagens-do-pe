/** Award quotes stored in `price_snapshots.source`. Distinct from `program: tudoazul`. */
export const TUDOAZUL_SOURCE = 'tudoazul_web';

/**
 * Full cash BRL from the official Azul booking path (same B2C availability host,
 * `points=false` / MonetaryOnly). Never mix this with TudoAzul copay.
 */
export const VOEAZUL_SOURCE = 'voeazul';

export const AZUL_API_HOST = 'https://b2c-api.voeazul.com.br';
export const AZUL_ORIGIN = 'https://www.voeazul.com.br';
export const AZUL_REFERER = 'https://www.voeazul.com.br/br/pt/home/selecao-voo';

/** Guest JWT. SPA sends `Ocp-Apim-Subscription-Key` + `Device: novosite`. */
export const AZUL_TOKEN_PATH = '/authentication/api/authentication/v1/token';

/**
 * Cash and TudoAzul points both POST here. `points` / `filters.loyalty` selects the mode.
 * Documented upstream of the 2026 voeazul.com.br PLP extract.
 */
export const AZUL_AVAILABILITY_PATH =
  '/reservationavailability/api/reservation/availability/v5/availability';

export const AZUL_DEVICE = 'novosite';
export const AZUL_CULTURE = 'pt-BR';

export const DEFAULT_DELAY_MS = 400;
export const MAX_RETRIES = 3;

/** IATA / marketing codes treated as Azul-operated. Partner rows are dropped. */
export const AZUL_CARRIER_CODES = new Set(['AD', '2Z', 'AZUL']);

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

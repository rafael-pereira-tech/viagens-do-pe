/** Award / Smiles+Money rows in `price_snapshots.source`. Distinct from `program: smiles`. */
export const SMILES_SOURCE = 'smiles_web';

/**
 * Full cash BRL from the official GOL booking path (VoeGol Sabre B2C).
 * Never mix this with Smiles `money` copay.
 */
export const VOEGOL_SOURCE = 'voegol';

export const VOEGOL_API_HOST = 'https://b2c-api.voegol.com.br';
export const VOEGOL_ORIGIN = 'https://www.voegol.com.br';
export const VOEGOL_FLIGHTS_PATH = '/api/sabre-default/flights';

/** Public SPA search hosts. `check-env.txt` on www.smiles.com.br currently returns `blue`. */
export const SMILES_SEARCH_HOSTS = {
  blue: 'https://api-air-flightsearch-blue.smiles.com.br',
  green: 'https://api-air-flightsearch-green.smiles.com.br',
} as const;

export const SMILES_LOGIN_HOSTS = {
  blue: 'https://api-login-blue.smiles.com.br',
  green: 'https://api-login-green.smiles.com.br',
} as const;

export const SMILES_SEARCH_PATH = '/v1/airlines/search';
export const SMILES_LOGIN_PATH = '/oauth/token';

export const SMILES_ORIGIN = 'https://www.smiles.com.br';
export const SMILES_REFERER = 'https://www.smiles.com.br/mfe/emissao-passagem/';

export const DEFAULT_DELAY_MS = 400;
export const MAX_RETRIES = 3;
export const GOL_AIRLINE_CODES = new Set(['G3', 'GOL']);

/** Public (non-club) fare types used for guest quotes. */
export const DEFAULT_FARE_TYPES = ['SMILES', 'SMILES_MONEY'] as const;

/** Club fares — only collected when a member session is present. */
export const CLUB_FARE_TYPES = ['SMILES_CLUB', 'SMILES_MONEY_CLUB'] as const;

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

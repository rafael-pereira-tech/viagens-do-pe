/** Collector id stored in `price_snapshots.source` for Smiles miles rows. */
export const SMILES_SOURCE = 'smiles_web';

/**
 * Collector id for full cash BRL from VoeGol (companion of the Smiles job).
 * Distinct from Smiles `money` (Smiles+Money copay). `program` stays `smiles`.
 */
export const VOEGOL_SOURCE = 'voegol';

/** Public SPA search hosts. Extractors document green; `SMILES_ENV=blue` overrides. */
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
export const SMILES_SEARCH_UI =
  'https://www.smiles.com.br/passagens-aereas?from=PET&to=CGH&departureDate=YYYY-MM-DD&numAdults=1&numChildren=0&numInfants=0&cabin=ALL';

export const VOEGOL_ORIGIN = 'https://www.voegol.com.br';
export const VOEGOL_SEARCH_URL =
  'https://b2c-api.voegol.com.br/api/sabre-default/flights?Flow=Issue&context=B2C';
export const VOEGOL_ITINERARIES_UI =
  'https://www.voegol.com.br/itineraries?from=PET&to=CGH&departureDate=YYYY-MM-DD&numAdults=1';

export const DEFAULT_DELAY_MS = 400;
export const MAX_RETRIES = 3;
export const GOL_AIRLINE_CODES = new Set(['G3', 'GOL']);

/**
 * Public (non-club) award types. Native SPA uses SMILES; extractors use STANDARD.
 * SMILES_MONEY is still collected for miles + labeled copay — never as amount_brl.
 */
export const DEFAULT_FARE_TYPES = ['SMILES', 'STANDARD', 'SMILES_MONEY'] as const;

/** Club fares — only collected when a member session is present. Guest will not get real SMILES_CLUB. */
export const CLUB_FARE_TYPES = ['SMILES_CLUB', 'SMILES_MONEY_CLUB'] as const;

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** Chrome document Accept. Naive `application/json`-only clients have received HTTP 406 since ~07/2025. */
export const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';

export const BROWSER_ACCEPT_LANGUAGE = 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7';

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** When set, POST /run requires `Authorization: Bearer <secret>`. */
  INGEST_TRIGGER_SECRET?: string;
  /** Optional ISO date override (YYYY-MM-DD) for the collection window. */
  FLIGHT_WINDOW_START?: string;
  FLIGHT_WINDOW_END?: string;

  /**
   * Smiles / GOL (BE-3). Never commit real values.
   *
   * Miles search: GET api-air-flightsearch-green.smiles.com.br/v1/airlines/search
   * (override with SMILES_ENV=blue or SMILES_SEARCH_HOST). Guest needs
   * SMILES_API_KEY (public SPA x-api-key). Unified GOL+Smiles login placeholders:
   * SMILES_MEMBER_NUMBER (9 digits) + SMILES_PASSWORD (4-digit). Empty memberNumber
   * is guest and will not get real SMILES_CLUB.
   *
   * Smiles `money` is Smiles+Money COPAY — stored in raw_payload.copay_brl, never
   * as amount_brl. Full cash BRL is the VoeGol companion (source=voegol).
   *
   * SMILES_DRY_RUN=1 parses bundled PET→CGH fixtures (no network, no live login).
   */
  SMILES_API_KEY?: string;
  SMILES_MEMBER_NUMBER?: string;
  SMILES_PASSWORD?: string;
  /** @deprecated alias of SMILES_MEMBER_NUMBER */
  SMILES_USER?: string;
  /** @deprecated alias of SMILES_PASSWORD */
  SMILES_PASS?: string;
  SMILES_COOKIE?: string;
  SMILES_ACCESS_TOKEN?: string;
  SMILES_DRY_RUN?: string;
  SMILES_LIVE?: string;
  SMILES_ENV?: string;
  SMILES_SEARCH_HOST?: string;
  SMILES_LOGIN_HOST?: string;
  SMILES_AUTH_CLIENT_ID?: string;
  SMILES_AUTH_AUDIENCE?: string;
  SMILES_AUTH_REALM?: string;
  SMILES_FARE_TYPES?: string;
  SMILES_INCLUDE_CLUB?: string;
  SMILES_REQUEST_DELAY_MS?: string;
  /** Set `1` to skip the VoeGol full-cash companion (miles-only). */
  VOEGOL_DISABLED?: string;
}

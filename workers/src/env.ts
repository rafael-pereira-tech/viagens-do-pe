export interface Env {
  ENVIRONMENT?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** When set, POST /run requires `Authorization: Bearer <secret>`. */
  INGEST_TRIGGER_SECRET?: string;
  /**
   * BE-6 dashboard read API. Required for GET /api/v1/snapshots*.
   * Clients send `Authorization: Bearer <READ_API_KEY>`.
   * Must be distinct from `INGEST_TRIGGER_SECRET` (ingest-only).
   * Never put `SUPABASE_SERVICE_ROLE_KEY` in VITE_* — Pages may hold this
   * Bearer as `VITE_READ_API_KEY` (public config, not the service role).
   */
  READ_API_KEY?: string;
  /** Extra CORS origins, comma-separated. Pages + localhost are always allowed. */
  CORS_ALLOWED_ORIGINS?: string;
  /** Optional ISO date override (YYYY-MM-DD) for the collection window. */
  FLIGHT_WINDOW_START?: string;
  FLIGHT_WINDOW_END?: string;
  /** When true, scan today through FLIGHT_WINDOW_DAYS instead of static dates. */
  FLIGHT_WINDOW_ROLLING?: string;
  FLIGHT_WINDOW_DAYS?: string;
  /** Production MVP excludes PET→POA unless explicitly enabled. */
  ROUTE_POA_ENABLED?: string;

  /**
   * Smiles (BE-3). Never commit real values.
   *
   * Live guest search needs `SMILES_API_KEY` (public SPA `x-api-key` from DevTools
   * on `v1/airlines/search`). Optional member session: `SMILES_COOKIE` and/or
   * `SMILES_ACCESS_TOKEN` + `SMILES_MEMBER_NUMBER`. Password login is best-effort
   * (`SMILES_USER` / `SMILES_PASS`) and usually blocked by Auth0/captcha.
   *
   * `SMILES_DRY_RUN=1` parses bundled PET→CGH fixtures (no network) and
   * persists `smiles_web_dry_run` / `voegol_dry_run`.
   */
  SMILES_API_KEY?: string;
  SMILES_POINTS_ENABLED?: string;
  GOL_CASH_ENABLED?: string;
  SMILES_USER?: string;
  SMILES_PASS?: string;
  SMILES_COOKIE?: string;
  SMILES_ACCESS_TOKEN?: string;
  SMILES_MEMBER_NUMBER?: string;
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
  /** VoeGol cash companion host override. Default `https://b2c-api.voegol.com.br`. */
  VOEGOL_API_HOST?: string;

  /**
   * TudoAzul / Azul (BE-4). Never commit real values.
   *
   * Frozen live secrets (placeholders only): `TUDOAZUL_LOGIN` + `TUDOAZUL_PASSWORD`.
   * Do not use `AZUL_*` secret names. `TUDOAZUL_DRY_RUN=1` parses bundled
   * PET→VCP / PET→POA fixtures (no network). Optional host/delay overrides
   * are non-secrets.
   */
  TUDOAZUL_LOGIN?: string;
  TUDOAZUL_PASSWORD?: string;
  AZUL_POINTS_ENABLED?: string;
  AZUL_CASH_ENABLED?: string;
  TUDOAZUL_DRY_RUN?: string;
  TUDOAZUL_API_HOST?: string;
  TUDOAZUL_REQUEST_DELAY_MS?: string;

  /**
   * LATAM Pass / LATAM (BE-5). Never commit real values.
   *
   * Frozen live secrets (placeholders only): `LATAM_PASS_LOGIN` + `LATAM_PASS_PASSWORD`.
   * Researchy `LATAM_PASS_NUMBER` maps to `LATAM_PASS_LOGIN`. Do not use
   * `LATAM_LOGIN` / `LATAM_PASSWORD`. `LATAM_DRY_RUN=1` parses bundled
   * PET→GRU fixtures (no network). Optional host/path/delay overrides are non-secrets.
   */
  LATAM_PASS_LOGIN?: string;
  LATAM_PASS_PASSWORD?: string;
  LATAM_CASH_ENABLED?: string;
  LATAM_PASS_POINTS_ENABLED?: string;
  LATAM_DRY_RUN?: string;
  LATAM_API_HOST?: string;
  LATAM_OFFERS_PATH?: string;
  LATAM_LOGIN_PATH?: string;
  LATAM_REQUEST_DELAY_MS?: string;
}

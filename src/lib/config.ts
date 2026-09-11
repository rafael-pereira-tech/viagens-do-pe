/** Workers API base URL. Empty = local stubs. Never put SUPABASE_* keys here. */
export const API_URL = import.meta.env.VITE_API_URL ?? ''

/**
 * Pages-safe Bearer sent as `Authorization: Bearer <VITE_READ_API_KEY>`.
 * Must match Worker secret `READ_API_KEY`. Not the service role, not
 * `INGEST_TRIGGER_SECRET`, and not the stub Entrar/Sair button.
 */
export const READ_API_KEY = import.meta.env.VITE_READ_API_KEY ?? import.meta.env.VITE_API_TOKEN ?? ''

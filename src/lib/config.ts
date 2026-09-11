/** Workers API base URL. Empty = local stubs. Never put SUPABASE_* keys here. */
export const API_URL = import.meta.env.VITE_API_URL ?? ''

/**
 * Optional Bearer: `VITE_READ_API_KEY` or alias `VITE_API_TOKEN`.
 * Send when the Worker has `READ_API_KEY` / `API_READ_SECRET`.
 * Not the service role, not `INGEST_TRIGGER_SECRET`, and not stub Entrar/Sair.
 */
export const READ_API_KEY = import.meta.env.VITE_READ_API_KEY ?? import.meta.env.VITE_API_TOKEN ?? ''

/** Fetch live snapshots whenever the Worker base URL is set. */
export const CAN_FETCH_SNAPSHOTS = Boolean(API_URL)

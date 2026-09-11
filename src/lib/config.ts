/** Workers API base URL. Empty = local stubs. Never put SUPABASE_* keys here. */
export const API_URL = import.meta.env.VITE_API_URL ?? ''

/**
 * Bearer for the live Worker: `VITE_API_TOKEN` or alias `VITE_READ_API_KEY`.
 * Required when the Worker has `API_READ_SECRET` / `READ_API_KEY`.
 * Not the service role, not `INGEST_TRIGGER_SECRET`, and not stub Entrar/Sair.
 */
export const READ_API_KEY = import.meta.env.VITE_API_TOKEN ?? import.meta.env.VITE_READ_API_KEY ?? ''

/** Fetch live snapshots whenever the Worker base URL is set. */
export const CAN_FETCH_SNAPSHOTS = Boolean(API_URL)

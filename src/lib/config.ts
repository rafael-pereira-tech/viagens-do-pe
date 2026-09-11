/** Workers API base URL. Empty = local stubs. Never put SUPABASE_* keys here. */
export const API_URL = import.meta.env.VITE_API_URL ?? ''

/** Stubs are opt-in. Production builds fail visibly if the API is missing. */
export const USE_STUBS = import.meta.env.VITE_USE_STUBS === '1'
export const CONFIG_ERROR =
  import.meta.env.PROD && !USE_STUBS && !API_URL
    ? 'Configuração de produção incompleta: VITE_API_URL não foi definido no build.'
    : null

/**
 * Optional Bearer: `VITE_READ_API_KEY` or alias `VITE_API_TOKEN`.
 * Send when the Worker has `READ_API_KEY` / `API_READ_SECRET`.
 * Not the service role, not `INGEST_TRIGGER_SECRET`, and not stub Entrar/Sair.
 */
export const READ_API_KEY = import.meta.env.VITE_READ_API_KEY ?? import.meta.env.VITE_API_TOKEN ?? ''

/** Fetch live snapshots whenever the Worker base URL is set. */
export const CAN_FETCH_SNAPSHOTS = Boolean(API_URL) && !USE_STUBS

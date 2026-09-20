/** Workers API base URL. Empty = local stubs. Never put secrets in VITE_* (inlined). */
export const API_URL = import.meta.env.VITE_API_URL ?? ''

/** Stubs are opt-in. Production builds fail visibly if the API is missing. */
export const USE_STUBS = import.meta.env.VITE_USE_STUBS === '1'
export const CONFIG_ERROR =
  import.meta.env.PROD && !USE_STUBS && !API_URL
    ? 'Configuração de produção incompleta: VITE_API_URL não foi definido no build.'
    : null

/** Fetch live snapshots whenever the Worker base URL is set. No client secret. */
export const CAN_FETCH_SNAPSHOTS = Boolean(API_URL) && !USE_STUBS

/** Local/e2e placeholders. Production Pages must leave this unset. */
export const USE_STUBS = import.meta.env.VITE_USE_STUBS === '1'

export const CONFIG_ERROR = null

/** Production hits same-origin `/api/v1/*` (Pages Function). Dev Vite stays on stubs. */
export const CAN_FETCH_SNAPSHOTS = !USE_STUBS && Boolean(import.meta.env.PROD)

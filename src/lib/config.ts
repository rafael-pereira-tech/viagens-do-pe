/**
 * Optional origin for local Vite. Production always uses same-origin `/api/v1/*`
 * (Pages Function). Empty string = relative. Never put secrets in VITE_*.
 */
export const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Local/e2e placeholders. Production Pages must leave this unset. */
export const USE_STUBS = import.meta.env.VITE_USE_STUBS === '1'

export const CONFIG_ERROR = null

/**
 * Production: same-origin Pages Function.
 * Dev: fetch only when VITE_API_URL is set (empty string = same-origin / pages dev).
 */
export const CAN_FETCH_SNAPSHOTS =
  !USE_STUBS && (Boolean(import.meta.env.PROD) || import.meta.env.VITE_API_URL !== undefined)

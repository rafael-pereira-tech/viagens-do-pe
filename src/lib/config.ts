/** Workers API base URL. Empty = local stubs. Never put SUPABASE_SERVICE_ROLE_KEY here. */
export const API_URL = import.meta.env.VITE_API_URL ?? ''

/**
 * Optional Bearer token when the Worker has `API_READ_SECRET` set.
 * Bundled into the client — it is not a secret from the service role.
 */
export const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? ''

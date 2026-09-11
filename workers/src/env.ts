export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** When set, POST /run requires `Authorization: Bearer <secret>`. */
  INGEST_TRIGGER_SECRET?: string;
  /** Optional ISO date override (YYYY-MM-DD) for the collection window. */
  FLIGHT_WINDOW_START?: string;
  FLIGHT_WINDOW_END?: string;
}

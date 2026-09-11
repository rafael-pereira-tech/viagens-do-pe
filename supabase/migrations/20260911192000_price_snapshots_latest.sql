-- BE-6: latest observation per route/day/source for the Worker read API.
-- security_invoker keeps RLS on public.price_snapshots (no anon policies).
-- The Worker queries this view with the service role (bypasses RLS).

ALTER TABLE public.price_snapshots
  ADD COLUMN IF NOT EXISTS stops smallint;

CREATE OR REPLACE VIEW public.price_snapshots_latest
WITH (security_invoker = true) AS
SELECT DISTINCT ON (origin, destination, airline, program, source, flight_date)
  id,
  origin,
  destination,
  airline,
  program,
  flight_date,
  departure_time,
  stops,
  miles,
  amount_brl,
  taxes_brl,
  currency,
  source,
  collected_at,
  created_at,
  ingest_run_id,
  raw_payload
FROM public.price_snapshots
ORDER BY
  origin,
  destination,
  airline,
  program,
  source,
  flight_date,
  collected_at DESC,
  created_at DESC;

COMMENT ON VIEW public.price_snapshots_latest IS
  'Most recent price_snapshots row per (origin, destination, airline, program, source, flight_date). Dashboard read path; grain matches Worker GET /api/v1/snapshots/latest.';

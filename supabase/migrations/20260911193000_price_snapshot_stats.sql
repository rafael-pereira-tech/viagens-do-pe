-- BE-6 follow-up: SQL COUNT/MIN/MAX for GET /api/v1/snapshots/stats.
-- Replaces the Worker 1000-row PostgREST sample (which also mis-set truncated).
--
-- KPI column rules (legacy smiles_web rows may still have amount_brl):
--   min_miles      — award / program sources only
--                    smiles_web, tudoazul, latam_pass (+ optional _dry_run)
--   min_amount_brl — cash companion sources only
--                    voegol, voeazul, latam_web, latam (+ optional _dry_run)
-- Keep lists in sync with workers/src/api/sources.ts.
--
-- exclude_dry_run: when true and p_source is null, drop collector fixture
-- rows whose source looks like *dry_run* (SMILES_DRY_RUN / TUDOAZUL_DRY_RUN /
-- LATAM_DRY_RUN ingest). An explicit p_source wins (same as the list API).
-- security_invoker keeps RLS on public.price_snapshots (no anon policies).

CREATE OR REPLACE FUNCTION public.price_snapshot_stats(
  p_origin text DEFAULT NULL,
  p_destination text DEFAULT NULL,
  p_airline text DEFAULT NULL,
  p_program text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_flight_date date DEFAULT NULL,
  p_flight_date_from date DEFAULT NULL,
  p_flight_date_to date DEFAULT NULL,
  p_collected_at_eq timestamptz DEFAULT NULL,
  p_collected_at_from timestamptz DEFAULT NULL,
  p_collected_at_to timestamptz DEFAULT NULL,
  p_collected_at_before timestamptz DEFAULT NULL,
  p_exclude_dry_run boolean DEFAULT FALSE,
  p_group_by text DEFAULT 'window'
)
RETURNS TABLE (
  origin text,
  destination text,
  flight_date date,
  min_miles integer,
  min_amount_brl numeric,
  snapshot_count bigint,
  latest_collected_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      s.origin::text AS origin,
      s.destination::text AS destination,
      s.flight_date,
      s.collected_at,
      CASE
        WHEN regexp_replace(s.source, '_dry_run$', '') IN ('smiles_web', 'tudoazul', 'latam_pass')
          THEN s.miles
      END AS kpi_miles,
      CASE
        WHEN regexp_replace(s.source, '_dry_run$', '') IN ('voegol', 'voeazul', 'latam_web', 'latam')
          THEN s.amount_brl
      END AS kpi_amount_brl
    FROM public.price_snapshots s
    WHERE
      (p_origin IS NULL OR s.origin = p_origin)
      AND (p_destination IS NULL OR s.destination = p_destination)
      AND (p_airline IS NULL OR s.airline = p_airline)
      AND (p_program IS NULL OR s.program = p_program)
      AND (p_source IS NULL OR s.source = p_source)
      AND (
        NOT COALESCE(p_exclude_dry_run, FALSE)
        OR p_source IS NOT NULL
        OR s.source NOT LIKE '%dry_run%'
      )
      AND (p_flight_date IS NULL OR s.flight_date = p_flight_date)
      AND (p_flight_date_from IS NULL OR s.flight_date >= p_flight_date_from)
      AND (p_flight_date_to IS NULL OR s.flight_date <= p_flight_date_to)
      AND (p_collected_at_eq IS NULL OR s.collected_at = p_collected_at_eq)
      AND (p_collected_at_from IS NULL OR s.collected_at >= p_collected_at_from)
      AND (p_collected_at_to IS NULL OR s.collected_at <= p_collected_at_to)
      AND (p_collected_at_before IS NULL OR s.collected_at < p_collected_at_before)
  )
  SELECT
    CASE WHEN p_group_by = 'route_day' THEN f.origin END,
    CASE WHEN p_group_by = 'route_day' THEN f.destination END,
    CASE WHEN p_group_by = 'route_day' THEN f.flight_date END,
    MIN(f.kpi_miles),
    MIN(f.kpi_amount_brl),
    COUNT(*)::bigint,
    MAX(f.collected_at)
  FROM filtered f
  GROUP BY 1, 2, 3
  ORDER BY 3 NULLS FIRST, 2 NULLS FIRST, 1 NULLS FIRST;
$$;

REVOKE ALL ON FUNCTION public.price_snapshot_stats(
  text, text, text, text, text, date, date, date,
  timestamptz, timestamptz, timestamptz, timestamptz, boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.price_snapshot_stats(
  text, text, text, text, text, date, date, date,
  timestamptz, timestamptz, timestamptz, timestamptz, boolean, text
) TO service_role;

COMMENT ON FUNCTION public.price_snapshot_stats(
  text, text, text, text, text, date, date, date,
  timestamptz, timestamptz, timestamptz, timestamptz, boolean, text
) IS
  'Worker GET /api/v1/snapshots/stats. SQL COUNT/MIN/MAX over the filtered set (no row sample). min_miles = award sources only; min_amount_brl = cash companions only. p_exclude_dry_run drops *dry_run* fixture sources unless p_source is set.';

-- Day/source observation history for dashboard deltas (min/max/prev/Δ%).
-- Used by GET /api/v1/observations/summary.

CREATE OR REPLACE FUNCTION public.price_observation_summary(
  p_origin text,
  p_destination text,
  p_flight_date_from date DEFAULT NULL,
  p_flight_date_to date DEFAULT NULL
)
RETURNS TABLE (
  origin text,
  destination text,
  source text,
  flight_date date,
  metric text,
  current_value numeric,
  prev_value numeric,
  delta_pct numeric,
  min_value numeric,
  max_value numeric,
  sample_count bigint,
  latest_collected_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      o.origin::text AS origin,
      o.destination::text AS destination,
      o.source,
      o.flight_date,
      o.collected_at,
      CASE
        WHEN regexp_replace(o.source, '_dry_run$', '') IN ('smiles_web', 'tudoazul', 'latam_pass')
          THEN o.miles::numeric
      END AS miles_value,
      CASE
        WHEN regexp_replace(o.source, '_dry_run$', '') IN ('voegol', 'voeazul', 'latam_web', 'latam')
          THEN o.amount_brl
      END AS amount_value
    FROM public.price_observations o
    WHERE
      o.origin = p_origin
      AND o.destination = p_destination
      AND o.source NOT LIKE '%dry_run%'
      AND (p_flight_date_from IS NULL OR o.flight_date >= p_flight_date_from)
      AND (p_flight_date_to IS NULL OR o.flight_date <= p_flight_date_to)
  ),
  miles_series AS (
    SELECT
      f.origin,
      f.destination,
      f.source,
      f.flight_date,
      f.collected_at,
      f.miles_value AS value
    FROM filtered f
    WHERE f.miles_value IS NOT NULL
  ),
  amount_series AS (
    SELECT
      f.origin,
      f.destination,
      f.source,
      f.flight_date,
      f.collected_at,
      f.amount_value AS value
    FROM filtered f
    WHERE f.amount_value IS NOT NULL
  ),
  miles_ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY s.origin, s.destination, s.source, s.flight_date
        ORDER BY s.collected_at DESC
      ) AS rn
    FROM miles_series s
  ),
  amount_ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY s.origin, s.destination, s.source, s.flight_date
        ORDER BY s.collected_at DESC
      ) AS rn
    FROM amount_series s
  ),
  miles_agg AS (
    SELECT
      origin,
      destination,
      source,
      flight_date,
      MIN(value) AS min_value,
      MAX(value) AS max_value,
      COUNT(*)::bigint AS sample_count
    FROM miles_series
    GROUP BY 1, 2, 3, 4
  ),
  amount_agg AS (
    SELECT
      origin,
      destination,
      source,
      flight_date,
      MIN(value) AS min_value,
      MAX(value) AS max_value,
      COUNT(*)::bigint AS sample_count
    FROM amount_series
    GROUP BY 1, 2, 3, 4
  )
  SELECT
    c.origin,
    c.destination,
    c.source,
    c.flight_date,
    'miles'::text AS metric,
    c.value AS current_value,
    p.value AS prev_value,
    CASE
      WHEN p.value IS NULL OR p.value = 0 THEN NULL
      ELSE ROUND(((c.value - p.value) / p.value) * 100, 2)
    END AS delta_pct,
    a.min_value,
    a.max_value,
    a.sample_count,
    c.collected_at AS latest_collected_at
  FROM miles_ranked c
  JOIN miles_agg a
    ON a.origin = c.origin
   AND a.destination = c.destination
   AND a.source = c.source
   AND a.flight_date = c.flight_date
  LEFT JOIN miles_ranked p
    ON p.origin = c.origin
   AND p.destination = c.destination
   AND p.source = c.source
   AND p.flight_date = c.flight_date
   AND p.rn = 2
  WHERE c.rn = 1

  UNION ALL

  SELECT
    c.origin,
    c.destination,
    c.source,
    c.flight_date,
    'amount_brl'::text AS metric,
    c.value AS current_value,
    p.value AS prev_value,
    CASE
      WHEN p.value IS NULL OR p.value = 0 THEN NULL
      ELSE ROUND(((c.value - p.value) / p.value) * 100, 2)
    END AS delta_pct,
    a.min_value,
    a.max_value,
    a.sample_count,
    c.collected_at AS latest_collected_at
  FROM amount_ranked c
  JOIN amount_agg a
    ON a.origin = c.origin
   AND a.destination = c.destination
   AND a.source = c.source
   AND a.flight_date = c.flight_date
  LEFT JOIN amount_ranked p
    ON p.origin = c.origin
   AND p.destination = c.destination
   AND p.source = c.source
   AND p.flight_date = c.flight_date
   AND p.rn = 2
  WHERE c.rn = 1

  ORDER BY flight_date, metric, source;
$$;

REVOKE ALL ON FUNCTION public.price_observation_summary(text, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.price_observation_summary(text, text, date, date) TO service_role;

COMMENT ON FUNCTION public.price_observation_summary(text, text, date, date) IS
  'Worker GET /api/v1/observations/summary. Per (source, flight_date, metric): current vs prev observation, historical min/max. Award miles vs cash companion sources.';

-- Compact time-series: best offer per (route, source, flight_date, ingest_run).
-- price_snapshots remains the full append-only detail; this table drives
-- historical patterns and price-drop alerts.

CREATE TABLE public.price_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_run_id UUID NOT NULL REFERENCES public.ingest_runs (id),
  collected_at TIMESTAMPTZ NOT NULL,
  origin CHAR(3) NOT NULL,
  destination CHAR(3) NOT NULL,
  airline TEXT NOT NULL,
  program TEXT NOT NULL,
  source TEXT NOT NULL,
  flight_date DATE NOT NULL,
  departure_time TIME,
  stops SMALLINT,
  miles INTEGER,
  amount_brl NUMERIC(12, 2),
  taxes_brl NUMERIC(12, 2),
  milheiro NUMERIC(12, 4),
  snapshot_id UUID REFERENCES public.price_snapshots (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT price_observations_airline_check
    CHECK (airline IN ('GOL', 'AZUL', 'LATAM')),
  CONSTRAINT price_observations_program_check
    CHECK (program IN ('smiles', 'tudoazul', 'latam_pass')),
  CONSTRAINT price_observations_origin_len_check
    CHECK (length(btrim(origin)) = 3),
  CONSTRAINT price_observations_destination_len_check
    CHECK (length(btrim(destination)) = 3),
  CONSTRAINT price_observations_miles_or_amount_check
    CHECK (miles IS NOT NULL OR amount_brl IS NOT NULL),
  CONSTRAINT price_observations_miles_nonneg_check
    CHECK (miles IS NULL OR miles > 0),
  CONSTRAINT price_observations_amount_nonneg_check
    CHECK (amount_brl IS NULL OR amount_brl > 0)
);

CREATE UNIQUE INDEX price_observations_natural_key_uidx
  ON public.price_observations (
    origin,
    destination,
    source,
    flight_date,
    ingest_run_id
  );

CREATE INDEX price_observations_series_collected_idx
  ON public.price_observations (
    origin,
    destination,
    source,
    flight_date,
    collected_at DESC
  );

CREATE INDEX price_observations_collected_at_idx
  ON public.price_observations (collected_at DESC);

CREATE INDEX price_observations_ingest_run_id_idx
  ON public.price_observations (ingest_run_id);

ALTER TABLE public.price_observations ENABLE ROW LEVEL SECURITY;
-- No anon policies. Cloudflare Workers use the service role (bypasses RLS).

COMMENT ON TABLE public.price_observations IS
  'Best offer per (origin, destination, source, flight_date, ingest_run). Compact series for trend/alerts; full detail stays in price_snapshots.';

COMMENT ON COLUMN public.price_observations.milheiro IS
  'Classic cash/(miles/1000) when award miles can be paired with a cash companion in the same batch; otherwise NULL.';

COMMENT ON COLUMN public.price_observations.snapshot_id IS
  'Optional pointer to the winning price_snapshots row from the same ingest.';

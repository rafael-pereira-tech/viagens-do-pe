-- BE-1: airfare/miles price snapshots for PET routes.
-- Routes (domain notes, not extra tables):
--   PET → GRU (LATAM / latam_pass)
--   PET → CGH (GOL / smiles)
--   PET → VCP and PET → POA (AZUL / tudoazul)

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin CHAR(3) NOT NULL,
  destination CHAR(3) NOT NULL,
  airline TEXT NOT NULL,
  program TEXT NOT NULL,
  flight_date DATE NOT NULL,
  departure_time TIME,
  miles INTEGER,
  amount_brl NUMERIC(12, 2),
  taxes_brl NUMERIC(12, 2),
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  source TEXT NOT NULL,
  raw_payload JSONB,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT price_snapshots_airline_check
    CHECK (airline IN ('GOL', 'AZUL', 'LATAM')),
  CONSTRAINT price_snapshots_program_check
    CHECK (program IN ('smiles', 'tudoazul', 'latam_pass')),
  CONSTRAINT price_snapshots_origin_len_check
    CHECK (length(btrim(origin)) = 3),
  CONSTRAINT price_snapshots_destination_len_check
    CHECK (length(btrim(destination)) = 3),
  CONSTRAINT price_snapshots_miles_or_amount_check
    CHECK (miles IS NOT NULL OR amount_brl IS NOT NULL)
);

-- Treat NULLs as equal so duplicate snapshots (e.g. miles-only with NULL
-- amount/taxes/departure_time) cannot be inserted twice.
CREATE UNIQUE INDEX price_snapshots_natural_key_uidx
  ON public.price_snapshots (
    origin,
    destination,
    airline,
    program,
    flight_date,
    departure_time,
    miles,
    amount_brl,
    taxes_brl,
    source,
    collected_at
  )
  NULLS NOT DISTINCT;

CREATE INDEX price_snapshots_route_airline_date_collected_idx
  ON public.price_snapshots (origin, destination, airline, flight_date, collected_at DESC);

CREATE INDEX price_snapshots_collected_at_idx
  ON public.price_snapshots (collected_at DESC);

CREATE INDEX price_snapshots_source_collected_at_idx
  ON public.price_snapshots (source, collected_at DESC);

ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies yet. Cloudflare Workers will use the
-- service role (bypasses RLS). Auth model is TBD.

COMMENT ON TABLE public.price_snapshots IS
  'Versioned airfare and miles price observations. Intended PET routes: PET→GRU (LATAM/latam_pass), PET→CGH (GOL/smiles), PET→VCP and PET→POA (AZUL/tudoazul). Miles-only or cash-only rows are valid; taxes_brl alone is not. taxes_brl NULL means unknown, 0 means zero tax.';

COMMENT ON COLUMN public.price_snapshots.program IS
  'Miles program for the quote: smiles, tudoazul, or latam_pass. Independent of source; program and source may differ.';

COMMENT ON COLUMN public.price_snapshots.source IS
  'Collector identifier (who or what captured this snapshot). Not the same as program.';

COMMENT ON COLUMN public.price_snapshots.raw_payload IS
  'Original payload from the collector, kept for debugging and reprocessing. Nullable.';

-- Price-drop alert rules + fire audit log.
-- Evaluation runs after each ingest; channel starts as `log` only.

CREATE TABLE public.price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled BOOLEAN NOT NULL DEFAULT true,
  origin CHAR(3),
  destination CHAR(3),
  source TEXT,
  flight_date DATE,
  flight_date_from DATE,
  flight_date_to DATE,
  metric TEXT NOT NULL,
  condition TEXT NOT NULL,
  threshold NUMERIC(12, 4) NOT NULL,
  channel TEXT NOT NULL DEFAULT 'log',
  last_fired_at TIMESTAMPTZ,
  cooldown_minutes INTEGER NOT NULL DEFAULT 360,
  CONSTRAINT price_alerts_metric_check
    CHECK (metric IN ('miles', 'amount_brl', 'milheiro')),
  CONSTRAINT price_alerts_condition_check
    CHECK (condition IN ('below_abs', 'drop_pct_vs_prev', 'drop_pct_vs_7d_min')),
  CONSTRAINT price_alerts_channel_check
    CHECK (channel IN ('log', 'webhook')),
  CONSTRAINT price_alerts_threshold_positive_check
    CHECK (threshold > 0),
  CONSTRAINT price_alerts_cooldown_nonneg_check
    CHECK (cooldown_minutes >= 0),
  CONSTRAINT price_alerts_origin_len_check
    CHECK (origin IS NULL OR length(btrim(origin)) = 3),
  CONSTRAINT price_alerts_destination_len_check
    CHECK (destination IS NULL OR length(btrim(destination)) = 3),
  CONSTRAINT price_alerts_flight_window_check
    CHECK (
      flight_date IS NOT NULL
      OR flight_date_from IS NOT NULL
      OR flight_date_to IS NOT NULL
      OR (flight_date IS NULL AND flight_date_from IS NULL AND flight_date_to IS NULL)
    )
);

CREATE INDEX price_alerts_enabled_idx
  ON public.price_alerts (enabled)
  WHERE enabled = true;

CREATE TABLE public.price_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.price_alerts (id) ON DELETE CASCADE,
  observation_id UUID REFERENCES public.price_observations (id) ON DELETE SET NULL,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX price_alert_events_alert_fired_idx
  ON public.price_alert_events (alert_id, fired_at DESC);

CREATE INDEX price_alert_events_fired_at_idx
  ON public.price_alert_events (fired_at DESC);

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alert_events ENABLE ROW LEVEL SECURITY;
-- No anon policies. Cloudflare Workers use the service role (bypasses RLS).

COMMENT ON TABLE public.price_alerts IS
  'User/system rules that fire when a price_observations series drops or crosses a threshold.';

COMMENT ON TABLE public.price_alert_events IS
  'Audit log of alert firings. payload holds prev/current/delta for debugging.';

COMMENT ON COLUMN public.price_alerts.condition IS
  'below_abs: metric <= threshold; drop_pct_vs_prev: (prev-cur)/prev*100 >= threshold; drop_pct_vs_7d_min: vs min of prior 7d.';

COMMENT ON COLUMN public.price_alerts.cooldown_minutes IS
  'Minimum minutes between firings for the same alert (debounce).';

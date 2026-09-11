-- BE-2: one row per scheduled ingest invocation (cron tick or manual /run).
-- Per-job outcomes live in details JSONB (route summaries + failures).
-- Terminal statuses match the QA enum; in-progress runs are not persisted.

CREATE TABLE public.ingest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL,
  cron TEXT,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  job_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ingest_runs_status_check
    CHECK (status IN ('success', 'empty', 'auth_failed', 'scrape_failed', 'partial')),
  CONSTRAINT ingest_runs_snapshot_count_nonneg_check
    CHECK (snapshot_count >= 0),
  CONSTRAINT ingest_runs_job_count_nonneg_check
    CHECK (job_count >= 0)
);

CREATE INDEX ingest_runs_started_at_idx
  ON public.ingest_runs (started_at DESC);

CREATE INDEX ingest_runs_status_started_at_idx
  ON public.ingest_runs (status, started_at DESC);

ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies. Cloudflare Workers use the service role
-- (bypasses RLS), same as price_snapshots.

COMMENT ON TABLE public.ingest_runs IS
  'Scheduled ingest invocations. status is the QA enum: success | empty | auth_failed | scrape_failed | partial. details holds route-level job summaries and failures; collectors themselves are BE-3/4/5.';

COMMENT ON COLUMN public.ingest_runs.cron IS
  'Cron expression that fired this run, or the literal ''manual'' for POST /run.';

COMMENT ON COLUMN public.ingest_runs.details IS
  'Structured run payload: flight window, per-route counts/status, and failed jobs. Not a substitute for price_snapshots.';

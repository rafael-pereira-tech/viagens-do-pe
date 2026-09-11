-- BE-2: one row per scheduled ingest invocation (cron tick or manual /run).
-- Terminal statuses are the QA enum: success | empty | auth_failed | scrape_failed | partial.
-- `running` is in-progress only (skip-if-running lock). A failed or expired run is
-- never rewritten to success. Overlapping ticks skip instead of clobbering.

CREATE TABLE public.ingest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  cron TEXT,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  job_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ingest_runs_status_check
    CHECK (status IN ('running', 'success', 'empty', 'auth_failed', 'scrape_failed', 'partial')),
  CONSTRAINT ingest_runs_running_unfinished_check
    CHECK (
      (status = 'running' AND finished_at IS NULL)
      OR (status <> 'running' AND finished_at IS NOT NULL)
    ),
  CONSTRAINT ingest_runs_snapshot_count_nonneg_check
    CHECK (snapshot_count >= 0),
  CONSTRAINT ingest_runs_job_count_nonneg_check
    CHECK (job_count >= 0)
);

CREATE INDEX ingest_runs_started_at_idx
  ON public.ingest_runs (started_at DESC);

CREATE INDEX ingest_runs_status_started_at_idx
  ON public.ingest_runs (status, started_at DESC);

-- Singleton in-progress run. A second cron tick gets a unique violation and skips.
CREATE UNIQUE INDEX ingest_runs_one_running_uidx
  ON public.ingest_runs ((true))
  WHERE status = 'running';

ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies. Cloudflare Workers use the service role
-- (bypasses RLS), same as price_snapshots.

COMMENT ON TABLE public.ingest_runs IS
  'Scheduled ingest invocations. Terminal status is the QA enum: success | empty | auth_failed | scrape_failed | partial. running is the skip-if-running lease only. Each row is append-only after it leaves running; a later tick never updates an earlier terminal row.';

COMMENT ON COLUMN public.ingest_runs.cron IS
  'Cron expression that fired this run, or the literal ''manual'' for POST /run.';

COMMENT ON COLUMN public.ingest_runs.collected_at IS
  'Batch timestamp stamped onto every price_snapshots row written by this run.';

COMMENT ON COLUMN public.ingest_runs.lease_expires_at IS
  'Skip-if-running lease. A crashed running row is reaped as scrape_failed after this instant, never as success.';

COMMENT ON COLUMN public.ingest_runs.details IS
  'Structured run payload: flight window, per-route counts/status, and failed jobs. Not a substitute for price_snapshots.';

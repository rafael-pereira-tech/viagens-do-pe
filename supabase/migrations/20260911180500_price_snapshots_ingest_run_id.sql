-- BE-2: every snapshot write is stamped with the owning ingest run.
-- collected_at already exists (BE-1); the worker sets it explicitly so the
-- batch timestamp matches ingest_runs.collected_at.

ALTER TABLE public.price_snapshots
  ADD COLUMN ingest_run_id UUID REFERENCES public.ingest_runs (id);

CREATE INDEX price_snapshots_ingest_run_id_idx
  ON public.price_snapshots (ingest_run_id);

COMMENT ON COLUMN public.price_snapshots.ingest_run_id IS
  'Owning ingest_runs.id. Insert-only: snapshots are never moved onto another run. Nullable only for rows written before BE-2; the worker always sets it.';

COMMENT ON COLUMN public.price_snapshots.collected_at IS
  'Observation time stamped by the ingest worker (same value as ingest_runs.collected_at for that run). Not left to the column default on the write path.';

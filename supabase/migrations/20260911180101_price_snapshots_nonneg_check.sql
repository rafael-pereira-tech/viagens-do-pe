-- QA S3 (non-blocking follow-up on BE-1): quoted miles/cash/taxes cannot be negative.

ALTER TABLE public.price_snapshots
  ADD CONSTRAINT price_snapshots_miles_nonneg_check
    CHECK (miles IS NULL OR miles >= 0);

ALTER TABLE public.price_snapshots
  ADD CONSTRAINT price_snapshots_amount_brl_nonneg_check
    CHECK (amount_brl IS NULL OR amount_brl >= 0);

ALTER TABLE public.price_snapshots
  ADD CONSTRAINT price_snapshots_taxes_brl_nonneg_check
    CHECK (taxes_brl IS NULL OR taxes_brl >= 0);

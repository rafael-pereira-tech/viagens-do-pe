# viagens-do-pe

Track airfare and miles quotes for PET (Pelotas) routes in Sep–Dec 2026.

Stack: Cloudflare Workers + Pages, Supabase Postgres, Vite/React.

## Ingest worker (BE-2)

Scheduled collection lives in [`workers/`](workers/). Collectors for Smiles, TudoAzul, and LATAM Pass are stubs until BE-3/4/5.

- Cron: 00:00, 06:00, 12:00, 18:00 **UTC** (21:00, 03:00, 09:00, 15:00 America/Sao_Paulo)
- Local: `cd workers && npm install && npm run dev` — see [`workers/README.md`](workers/README.md)

## Schema

- [`supabase/migrations/20260911174910_price_snapshots.sql`](supabase/migrations/20260911174910_price_snapshots.sql)
- [`supabase/migrations/20260911180100_ingest_runs.sql`](supabase/migrations/20260911180100_ingest_runs.sql)
- [`supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql`](supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql)

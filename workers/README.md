# viagens-do-pe ingest worker (BE-2)

Scheduled Cloudflare Worker that walks the PET route matrix for **1 Sep 2026 – 31 Dec 2026** and calls collector stubs. Real Smiles / TudoAzul / LATAM Pass scraping is BE-3/4/5 — this worker only defines the cron, job list, collector interface, and persist path.

## Timezone

Cloudflare Cron Triggers are **UTC only**. This worker runs four times per day:

| Cron (UTC) | America/Sao_Paulo (UTC−3, no DST) |
| --- | --- |
| `0 0 * * *` (00:00) | 21:00 |
| `0 6 * * *` (06:00) | 03:00 |
| `0 12 * * *` (12:00) | 09:00 |
| `0 18 * * *` (18:00) | 15:00 |

Configured in `wrangler.toml` `[triggers].crons`.

## Route matrix

| Program | Airline | Route | Preferred DOWs (not a hard lock) |
| --- | --- | --- | --- |
| Smiles | GOL | PET→CGH | Tue / Thu / Sat |
| TudoAzul | AZUL | PET→VCP | Mon / Fri |
| TudoAzul | AZUL | PET→POA | none published — full window, equal priority |
| LATAM Pass | LATAM | PET→GRU | Mon / Wed / Fri through 31 Oct 2026; Wed / Fri / Sat from 1 Nov 2026 |

Preferred weekdays are ordered first; every other date in the window is still queued.

## Collector interface (BE-3/4/5)

Replace the stub modules without rewriting the cron:

- `src/collectors/smiles.ts`
- `src/collectors/tudoazul.ts`
- `src/collectors/latam-pass.ts`

Contract:

```ts
collect({ origin, destination, airline, program, flightDate }): Promise<CollectResult>
```

`CollectResult.snapshots` matches `public.price_snapshots` (`miles`, `amount_brl`, `taxes_brl`, `currency`, `source`, `raw_payload`, …). Job status is `success | empty | auth_failed | scrape_failed | partial`. Stubs currently return `{ status: "empty", snapshots: [] }`.

## Run status

Each cron tick writes one `public.ingest_runs` row (see `supabase/migrations/20260911180100_ingest_runs.sql`). `details` JSONB holds per-route summaries and any failed jobs.

## Secrets

Do not commit credentials. Placeholders:

```bash
cd workers
cp .dev.vars.example .dev.vars   # local only
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# optional, required for POST /run:
npx wrangler secret put INGEST_TRIGGER_SECRET
```

Optional env overrides: `FLIGHT_WINDOW_START`, `FLIGHT_WINDOW_END` (YYYY-MM-DD).

Without real Supabase secrets the worker still runs collectors and returns a summary; it skips persistence (`persisted: false`). Do not point `SUPABASE_URL` at a dummy hostname — workerd fails hard on DNS errors. Leave the vars empty instead.

## Local

```bash
cd workers
npm install
npm test
npm run typecheck
npm run build          # wrangler deploy --dry-run (no account upload)
npm run dev            # wrangler dev
```

Then:

```bash
curl http://localhost:8787/health

# Wrangler 4 local scheduled handler
curl -X POST "http://localhost:8787/cdn-cgi/local/scheduled?format=json"

# Manual run (needs INGEST_TRIGGER_SECRET in .dev.vars)
curl -X POST http://localhost:8787/run \
  -H "Authorization: Bearer dev-only-trigger-secret"
```

## Deploy

```bash
cd workers
npx wrangler deploy
```

Requires a Cloudflare account login (`npx wrangler login`) and the secrets above. Cron triggers are applied from `wrangler.toml` on deploy.

# viagens-do-pe ingest worker (BE-2)

Scheduled Cloudflare Worker that walks the PET route matrix for **1 Sep 2026 – 31 Dec 2026** and persists quotes. Smiles / GOL (PET→CGH) is a live HTTP collector (BE-3). TudoAzul and LATAM Pass remain stubs until BE-4/5.

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

Swap airline modules without rewriting the cron:

- `src/collectors/smiles/` — **BE-3 implemented** (GOL PET→CGH)
- `src/collectors/tudoazul.ts` — stub until BE-4
- `src/collectors/latam-pass.ts` — stub until BE-5

Contract:

```ts
collect({ origin, destination, airline, program, flightDate }): Promise<CollectResult>
```

`CollectResult.snapshots` matches `public.price_snapshots` (`miles`, `amount_brl`, `taxes_brl`, `currency`, `source`, `raw_payload`, …). The scheduler overwrites `collected_at` and `ingest_run_id` on the write path. Job status is `success | empty | auth_failed | scrape_failed | partial`.

## Smiles / GOL (BE-3)

One `collect()` job, **two sources**. `program` stays `smiles`. Airline is GOL. Partner SOAP RedeemMiles is B2B redeem, not consumer search — ignored.

| Quote | `source` | `amount_brl` | `miles` | `taxes_brl` |
| --- | --- | --- | --- | --- |
| Award / Smiles+Money | `smiles_web` | **always `null`** | from Smiles `miles` | from `costTax` |
| Full cash BRL | `voegol` | VoeGol `offers[].total.amount` | `null` | `null` unless present |

**Critical: Smiles `money` is Smiles+Money copay, not full cash.** It is stored as `raw_payload.copay_brl` / `raw_payload.smiles_money`. It is **never** written to `amount_brl`.

UI (miles): `https://www.smiles.com.br/passagens-aereas?from=PET&to=CGH&departureDate=YYYY-MM-DD&numAdults=1&numChildren=0&numInfants=0&cabin=ALL`

```
GET {SMILES_SEARCH_HOST}/v1/airlines/search
  ?cabin=ALL&originAirportCode=PET&destinationAirportCode=CGH
  &departureDate=YYYY-MM-DD&memberNumber=&adults=1&children=0&infants=0
  &forceCongener=false
```

Default host is **green** (`https://api-air-flightsearch-green.smiles.com.br`). `SMILES_ENV=blue` switches replica. Parser accepts native `fareList[]` (`SMILES` / `SMILES_CLUB`) and extractor `fareOptions[]` (`STANDARD` / `SMILES_CLUB`). Filter `airline_code=G3`. Club fares only when `memberNumber` is set — **guest will not get real SMILES_CLUB**.

UI (cash): `https://www.voegol.com.br/itineraries?from=PET&to=CGH&departureDate=YYYY-MM-DD&numAdults=1`

```
POST https://b2c-api.voegol.com.br/api/sabre-default/flights?Flow=Issue&context=B2C
```

Cash rows use `offers[].total.amount` when `currency=BRL`. Missing fare → no row (`null` / empty), **never price 0**.

Rate / WAF: no official RPM. Naive clients have received **HTTP 406** since ~07/2025 (bot/Accept filters). Headers use a real-browser Accept set. Sequential 400ms gap (`SMILES_REQUEST_DELAY_MS`), no burst, exponential backoff on 429/502/503/504 (max 3). 3–4 ticks/day × many dates is high volume — the shared limiter batches Smiles then VoeGol. Tue/Thu/Sat are scheduler preferences only.

Live credentials are env secrets only. Until Pereira sends them privately to PM, `SMILES_DRY_RUN=1` (bundled PET→CGH fixtures) is the accepted path. CI does not live-login.

### Env / secrets

Do not commit credentials. Local: `workers/.dev.vars`. Production: `npx wrangler secret put …`.

| Variable | Required for live | Purpose |
| --- | --- | --- |
| `SMILES_API_KEY` | Yes (guest miles) | Public SPA `x-api-key` on `v1/airlines/search`. Not a user password. |
| `SMILES_MEMBER_NUMBER` | Club pricing | 9-digit Smiles number (`memberNumber` query). Empty = guest. |
| `SMILES_PASSWORD` | Club login | 4-digit unified GOL+Smiles password. Best-effort `POST /oauth/token`; often blocked by captcha/WAF — prefer `SMILES_COOKIE`. |
| `SMILES_COOKIE` | No | Browser `Cookie` for a logged-in session. |
| `SMILES_ACCESS_TOKEN` | No | Bearer token if you already have one. |
| `SMILES_USER` / `SMILES_PASS` | No | Deprecated aliases of member number / password. |
| `SMILES_AUTH_CLIENT_ID` / `SMILES_AUTH_AUDIENCE` / `SMILES_AUTH_REALM` | No | Overrides for that login POST. |
| `SMILES_DRY_RUN` | CI / local without Smiles | `1` parses bundled PET→CGH JSON (miles + VoeGol cash fixtures, no network). |
| `SMILES_LIVE` | No | `1` to force live mode if you only have cookies/token. |
| `SMILES_ENV` | No | `green` (default) or `blue`. |
| `SMILES_SEARCH_HOST` / `SMILES_LOGIN_HOST` | No | Full origin overrides. |
| `SMILES_FARE_TYPES` | No | Comma list, default `SMILES,STANDARD,SMILES_MONEY`. |
| `SMILES_INCLUDE_CLUB` | No | `1` to keep club fares without a member session (still not real Club inventory). |
| `SMILES_REQUEST_DELAY_MS` | No | Default `400`. Shared by Smiles and VoeGol. |
| `VOEGOL_DISABLED` | No | `1` skips the VoeGol cash companion (miles-only). |

Unconfigured live ticks record **`auth_failed`** for every Smiles date (TudoAzul/LATAM stay `empty` stubs), so the ingest run is **`partial`**.

### Manual tick

```bash
cd workers
cp .dev.vars.example .dev.vars
# either:
#   SMILES_DRY_RUN=1
# or:
#   SMILES_API_KEY=<from DevTools>
#   SMILES_MEMBER_NUMBER=<9 digits>
#   SMILES_PASSWORD=<4 digits>
npm run dev
```

```bash
curl http://localhost:8787/health

# Wrangler 4 local scheduled handler
curl -X POST "http://localhost:8787/cdn-cgi/local/scheduled?format=json"

# Manual run (needs INGEST_TRIGGER_SECRET in .dev.vars)
curl -X POST http://localhost:8787/run \
  -H "Authorization: Bearer dev-only-trigger-secret"
```

Narrow the window while testing live:

```
FLIGHT_WINDOW_START=2026-09-15
FLIGHT_WINDOW_END=2026-09-15
```

### Known failure modes

| Status | When |
| --- | --- |
| `success` | At least one persistable GOL quote (`miles` from Smiles and/or `amount_brl` from VoeGol). |
| `empty` | HTTP 200 but no GOL inventory / no allowed fares. |
| `auth_failed` | Missing config, 401/403, or password login failed. |
| `scrape_failed` | Network/5xx/429 exhausted, non-JSON/HTML, Akamai `{ "message": "Something went wrong" }`, or **HTTP 406 WAF/Accept filter**. |
| `partial` | Miles succeeded and cash failed (or the reverse), or run-level mix with stub programs. |

**Live API discovery notes:** the SPA (`@smiles/flight-availability`) calls `ApiFlightSearch` → `v1/airlines/search` with `NOT_CREDENTIALS` plus `x-api-key`. Datacenter egress commonly gets **HTTP 406** from Akamai (since ~07/2025) even with the public SPA key — map that to `scrape_failed`, not a R$0 fare. Cloudflare Worker IPs or a browser `SMILES_COOKIE` may be needed for live; keep `SMILES_DRY_RUN=1` until the WAF allows the guest key.

## Run status and overlap

Each cron tick that acquires the lock writes one `public.ingest_runs` row (`supabase/migrations/20260911180100_ingest_runs.sql`).

Terminal QA statuses: `success | empty | auth_failed | scrape_failed | partial`. `running` is the in-progress lease only. A later tick **never** updates an earlier terminal row, and a failed job **never** rolls the run up to `success`.

Skip-if-running (no destructive overlap):

1. Isolate lock so `/run` and cron in the same Worker cannot stack
2. Partial unique index `ingest_runs_one_running_uidx` — a second tick gets a conflict and **skips** (HTTP 409 on `/run`). It does not write snapshots or a success row
3. Stale `running` rows past `lease_expires_at` (15 minutes) are reaped as `scrape_failed`, never as `success`

Every snapshot write is stamped with `collected_at` (batch time) and `ingest_run_id` (FK to that run). The persist helper refuses unstamped rows. Snapshots are insert-only.

## Secrets

Do not commit credentials. Placeholders:

```bash
cd workers
cp .dev.vars.example .dev.vars   # local only
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# optional, required for POST /run:
npx wrangler secret put INGEST_TRIGGER_SECRET
# BE-3 live Smiles (omit if SMILES_DRY_RUN=1):
npx wrangler secret put SMILES_API_KEY
npx wrangler secret put SMILES_MEMBER_NUMBER
npx wrangler secret put SMILES_PASSWORD
# optional member session:
# npx wrangler secret put SMILES_COOKIE
```

Optional env overrides: `FLIGHT_WINDOW_START`, `FLIGHT_WINDOW_END` (YYYY-MM-DD), `SMILES_DRY_RUN`, `SMILES_ENV`, `SMILES_REQUEST_DELAY_MS`, `VOEGOL_DISABLED`.

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

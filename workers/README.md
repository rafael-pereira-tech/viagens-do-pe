# viagens-do-pe ingest worker (BE-2)

Scheduled Cloudflare Worker that walks the PET route matrix for **1 Sep 2026 – 31 Dec 2026** and persists quotes. Smiles / GOL (PET→CGH) and TudoAzul / AZUL (PET→VCP, PET→POA) are live HTTP collectors. LATAM Pass remains a stub until BE-5.

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
- `src/collectors/tudoazul/` — **BE-4 implemented** (AZUL PET→VCP and PET→POA)
- `src/collectors/latam-pass.ts` — stub until BE-5

Contract:

```ts
collect({ origin, destination, airline, program, flightDate }): Promise<CollectResult>
```

`CollectResult.snapshots` matches `public.price_snapshots` (`miles`, `amount_brl`, `taxes_brl`, `currency`, `source`, `raw_payload`, …). The scheduler overwrites `collected_at` and `ingest_run_id` on the write path. Job status is `success | empty | auth_failed | scrape_failed | partial`.

## Smiles / GOL (BE-3)

Collector id (`source`): **`smiles_web`**. Program stays `smiles`. We talk to the same JSON search the Smiles website uses, not HTML scraping of `www.smiles.com.br` (that host's robots.txt disallows `/*?*`).

```
GET {SMILES_SEARCH_HOST}/v1/airlines/search
  ?cabin=ALL&originAirportCode=PET&destinationAirportCode=CGH
  &departureDate=YYYY-MM-DD&memberNumber=&adults=1&children=0&infants=0
  &forceCongener=false
```

Default host is `https://api-air-flightsearch-blue.smiles.com.br` (`SMILES_ENV=green` switches to the green replica). One sequential request per flight date, default **400ms** gap (`SMILES_REQUEST_DELAY_MS`), exponential backoff on 429/502/503/504 (max 3 tries). Tue/Thu/Sat are scheduler preferences only — the collector does **not** hard-fail other dates.

Each GOL (G3) flight emits public **SMILES** (miles) and **SMILES_MONEY** (miles+BRL copay) rows. Club fares are skipped unless a member session is present (`SMILES_COOKIE` / `SMILES_ACCESS_TOKEN` / `SMILES_MEMBER_NUMBER` or `SMILES_INCLUDE_CLUB=1`). Partner airlines in the same payload are dropped. Taxes come from `fare.g3.costTax` or `airlineTax` when present (`null` means unknown). **Missing miles or cash is `null`, never `0`.** A payload `money: 0` on a miles-only fare is treated as no cash quote.

Live credentials are env secrets only. Until Pereira sends them privately to PM, `SMILES_DRY_RUN=1` (bundled PET→CGH fixtures) is the accepted path.

### Env / secrets

Do not commit credentials. Local: `workers/.dev.vars`. Production: `npx wrangler secret put …`.

| Variable | Required for live | Purpose |
| --- | --- | --- |
| `SMILES_API_KEY` | Yes (guest search) | Public SPA `x-api-key` sent to `v1/airlines/search`. Copy from DevTools on smiles.com.br (it is not a user password). |
| `SMILES_COOKIE` | No | Browser `Cookie` header for a logged-in session (practical member path). |
| `SMILES_ACCESS_TOKEN` | No | Bearer token if you already have one. |
| `SMILES_MEMBER_NUMBER` | No | `memberNumber` query param (club pricing). |
| `SMILES_USER` / `SMILES_PASS` | No | Best-effort `POST /oauth/token` (Auth0 password-realm). Usually blocked by captcha/WAF — prefer cookies. |
| `SMILES_AUTH_CLIENT_ID` / `SMILES_AUTH_AUDIENCE` / `SMILES_AUTH_REALM` | No | Overrides for that login POST. |
| `SMILES_DRY_RUN` | CI / local without Smiles | `1` parses bundled PET→CGH JSON fixtures (no network). Accepted until live credentials are provided privately. |
| `SMILES_LIVE` | No | Set `1` to force live mode if you only have cookies/token. |
| `SMILES_ENV` | No | `blue` (default) or `green`. |
| `SMILES_SEARCH_HOST` / `SMILES_LOGIN_HOST` | No | Full origin overrides. |
| `SMILES_FARE_TYPES` | No | Comma list, default `SMILES,SMILES_MONEY`. |
| `SMILES_INCLUDE_CLUB` | No | `1` to keep club fares without a member session. |
| `SMILES_REQUEST_DELAY_MS` | No | Default `400`. |
| `AZUL_SUBSCRIPTION_KEY` | Yes (guest search) | Public SPA `Ocp-Apim-Subscription-Key` for token + availability. Copy from DevTools on `b2c-api.voeazul.com.br`. |
| `AZUL_COOKIE` / `AZUL_ACCESS_TOKEN` | No | Browser session / bearer for the B2C API. |
| `TUDOAZUL_DRY_RUN` | CI / local without Azul | `1` parses bundled PET→VCP and PET→POA JSON fixtures (no network). |
| `AZUL_API_HOST` | No | Default `https://b2c-api.voeazul.com.br`. |
| `AZUL_REQUEST_DELAY_MS` | No | Default `400`. |

Unconfigured live ticks record **`auth_failed`** for every Smiles and TudoAzul date (LATAM stays an `empty` stub), so the ingest run is **`partial`**.

## TudoAzul / AZUL (BE-4)

One `collect({ origin, destination, airline, program, flightDate })` job, two sources. `program` stays `tudoazul`. Airline is AZUL. The scheduler already prefers VCP Mon/Fri and queues every other date (including all PET→POA dates) — the collector does **not** hard-lock DOW.

| Quote | `source` | `miles` | `amount_brl` | `taxes_brl` |
| --- | --- | --- | --- | --- |
| Award / pontos+reais | `tudoazul_web` | `pointsOptions[].points` (or `discountedPoints`) | **always `null`** | `taxesAndFees` |
| Full cash BRL | `voeazul` | `null` | `fares[].total.amount` (BRL) | passenger tax charges when present |

**Critical: Azul `fareMoney` / `totalMoney` is pontos+reais copay, not full cash BRL.** It is stored only as `raw_payload.copay_brl` (plus the original money fields). Missing fare → `null` / `empty`, **never price 0**.

### TudoAzul points (primary)

- UI: `https://www.voeazul.com.br/br/pt/home/selecao-voo?c[0].ds=PET&c[0].as=VCP&c[0].std=MM/DD/YYYY&p[0].t=ADT&p[0].c=1&p[0].cp=true&cc=BRL` (same for POA)
- Upstream: `POST https://b2c-api.voeazul.com.br/reservationavailability/api/reservation/availability/v5/availability`
- Guest JWT first: `POST https://b2c-api.voeazul.com.br/authentication/api/authentication/v1/token`
- Body: `criteria[].stations.originStationCodes` / `destinationStationCodes`, `dates.beginDate=YYYY-MM-DDT00:00:00`, `passengers.types=[{type:ADT,count:1}]`, `codes.currencyCode=BRL`, `points=true`, `filters.loyalty=PointsAndMonetary`
- Headers: `Ocp-Apim-Subscription-Key`, `Device: novosite`, `Culture: pt-BR`, browser `Accept` / `Origin` / `Referer` / `User-Agent`, optional `Authorization: Bearer` / `Cookie`
- Parses gecko-normalized `trips[].journeys[].fares[].pointsOptions[]` and native Navitaire `journeysAvailableByMarket` + `passengerFares.points`
- Filter carrier `AD` / `2Z` (partner airlines dropped)

### Full cash BRL (separate source, same host)

- UI: same `selecao-voo` URL with `p[0].cp=false`
- Upstream: same availability v5 POST with `points=false` and `filters.loyalty=MonetaryOnly`
- `fares[].total.amount` + `currency=BRL` (or Navitaire `passengerFares[].fareAmount`)
- Same ingest job (companion), distinct `source=voeazul`. Points WAF vs cash WAF can independently yield `partial`.

### Auth

Placeholders only (no live login in CI):

- `AZUL_SUBSCRIPTION_KEY` — public SPA `Ocp-Apim-Subscription-Key` (not a user password)
- Optional `AZUL_COOKIE` / `AZUL_ACCESS_TOKEN` (practical member path if captcha blocks password login)
- `TUDOAZUL_DRY_RUN=1` parses bundled PET→VCP and PET→POA fixtures (no network)

### Rate / WAF

- No official RPM. Naive / datacenter clients get **HTML 403 Access Denied** from Akamai
- Browser Accept + `Device`/`Culture` set; sequential 400ms limiter shared by points then cash; backoff on 429/5xx; no burst
- **HTML / Akamai / HTTP 406 → `scrape_failed`**. **401 / JSON 403 / missing config → `auth_failed`**. Never invent a 0 fare.

### Statuses

| Status | When |
| --- | --- |
| `success` | ≥1 persistable AZUL quote (points and/or voeazul cash) |
| `empty` | 200 but no AZUL inventory / allowed fares |
| `auth_failed` | missing config, 401, JSON 403, or guest token failed |
| `scrape_failed` | network/5xx/429, HTML/non-JSON, Akamai block, HTTP 406 WAF |
| `partial` | points ok + cash failed (or reverse); or run-level mix with other programs |

### Manual tick

```bash
cd workers
cp .dev.vars.example .dev.vars
# either:
#   SMILES_DRY_RUN=1
#   TUDOAZUL_DRY_RUN=1
# or:
#   SMILES_API_KEY=<from DevTools>
#   AZUL_SUBSCRIPTION_KEY=<from DevTools>
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
| `success` | At least one persistable GOL quote (`miles` and/or `amount_brl`). |
| `empty` | HTTP 200 but no GOL inventory / no allowed fares. |
| `auth_failed` | Missing config, 401/403, or password login failed. |
| `scrape_failed` | Network/5xx/429 exhausted, non-JSON/HTML, or Akamai-style `{ "message": "Something went wrong" }` (HTTP 406 from datacenter IPs is common). |
| `partial` | Run-level mix (one program failed, others empty/success; miles ok + cash failed; or persist errors). |

**Live API discovery notes:** the SPA (`@smiles/flight-availability`) calls `ApiFlightSearch` → `v1/airlines/search` with `NOT_CREDENTIALS` plus `x-api-key` from remote constants (`x-api-key=flight-search` in LaunchDarkly). This environment's AWS egress received **HTTP 406** from Akamai on both blue and green search hosts even with the historical public key — Workers on Cloudflare IPs may succeed; if not, set `SMILES_COOKIE` from a real browser session or keep `SMILES_DRY_RUN=1` until the WAF allows the guest key.

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
# optional member session:
# npx wrangler secret put SMILES_COOKIE
# BE-4 live Azul (omit if TUDOAZUL_DRY_RUN=1):
npx wrangler secret put AZUL_SUBSCRIPTION_KEY
# npx wrangler secret put AZUL_COOKIE
```

Optional env overrides: `FLIGHT_WINDOW_START`, `FLIGHT_WINDOW_END` (YYYY-MM-DD), `SMILES_DRY_RUN`, `SMILES_ENV`, `SMILES_REQUEST_DELAY_MS`, `TUDOAZUL_DRY_RUN`, `AZUL_REQUEST_DELAY_MS`.

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

# viagens-do-pe ingest worker (BE-2)

Scheduled Cloudflare Worker that walks the PET route matrix for **1 Sep 2026 – 31 Dec 2026** and persists quotes. Smiles / GOL (PET→CGH), TudoAzul / AZUL (PET→VCP, PET→POA), and LATAM Pass / LATAM (PET→GRU) are live HTTP collectors.

## Dashboard read API (BE-6)

Same Worker, service-role proxy. The browser never sees `SUPABASE_SERVICE_ROLE_KEY`.

| Method | Path | Use |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Read API liveness |
| `GET` | `/api/v1/snapshots` | History + filters |
| `GET` | `/api/v1/snapshots/latest` | Latest per route/day/source |
| `GET` | `/api/v1/snapshots/stats` | Min miles / min `amount_brl` |

Contract, FE call pattern, and OpenAPI: [`docs/api-price-snapshots.md`](../docs/api-price-snapshots.md). Types: `src/api/types.ts` (Worker) and `../src/types/api.ts` (FE).

```bash
curl -sS http://localhost:8787/api/v1/health

curl -sS -G 'http://localhost:8787/api/v1/snapshots/latest' \
  --data-urlencode origin=PET \
  --data-urlencode destination=CGH \
  --data-urlencode flight_date_from=2026-09-01 \
  --data-urlencode flight_date_to=2026-12-31

curl -sS -G 'http://localhost:8787/api/v1/snapshots/stats' \
  --data-urlencode origin=PET \
  --data-urlencode destination=CGH \
  --data-urlencode group_by=window
```

CORS allowlist: `https://viagens-do-pe.pages.dev`, Pages previews, `localhost` / `127.0.0.1`. Optional `API_READ_SECRET` adds a Bearer gate. `raw_payload` is omitted unless `?include_raw=1` (secret keys still redacted).

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
| LATAM Pass | LATAM | PET→GRU | **Brief preference:** Mon / Wed / Fri through Oct 2026; Wed / Fri / Sat after. **Published network** (Mon / Thu / Fri through Oct; Wed / Fri / Sat from ~2026-11-01) is not the sort key — only to read empty≠scrape_failed on non-operating days |

Preferred weekdays are ordered first; every other date in the window is still queued.

## Collector interface (BE-3/4/5)

Swap airline modules without rewriting the cron:

- `src/collectors/smiles/` — **BE-3 implemented** (GOL PET→CGH)
- `src/collectors/tudoazul/` — **BE-4 implemented** (AZUL PET→VCP and PET→POA)
- `src/collectors/latam-pass/` — **BE-5 implemented** (LATAM PET→GRU)

Contract:

```ts
collect({ origin, destination, airline, program, flightDate }): Promise<CollectResult>
```

`CollectResult.snapshots` matches `public.price_snapshots` (`miles`, `amount_brl`, `taxes_brl`, `currency`, `source`, `raw_payload`, …). The scheduler overwrites `collected_at` and `ingest_run_id` on the write path. Job status is `success | empty | auth_failed | scrape_failed | partial`.

## Smiles / GOL (BE-3)

One `collect({ origin, destination, airline, program, flightDate })` job, two sources. `program` stays `smiles`. Airline is GOL. We talk to the same JSON search the Smiles website uses, not HTML scraping of `www.smiles.com.br` (that host's robots.txt disallows `/*?*`).

| Quote | `source` | `miles` | `amount_brl` | `taxes_brl` |
| --- | --- | --- | --- | --- |
| Award / Smiles+Money | `smiles_web` | Smiles `miles` | **always `null`** | `costTax` / `airlineTax` |
| Full cash BRL | `voegol` | `null` | `offers[].total.amount` (BRL) | `null` unless present |

**Critical: Smiles `money` is SMILES_MONEY copay, not full cash BRL.** Persist only on `raw_payload` as `copay_brl` / `smiles_money`. Missing fare → `null` / `empty`, **never invent price 0**. If only miles or only cash fails → `partial`.

```
GET {SMILES_SEARCH_HOST}/v1/airlines/search
  ?cabin=ALL&originAirportCode=PET&destinationAirportCode=CGH
  &departureDate=YYYY-MM-DD&memberNumber=&adults=1&children=0&infants=0
  &forceCongener=false
```

Default host is `https://api-air-flightsearch-blue.smiles.com.br` (`SMILES_ENV=green` switches to the green replica). Sequential 400ms limiter shared by Smiles then VoeGol (`SMILES_REQUEST_DELAY_MS`), exponential backoff on 429/502/503/504 (max 3 tries). Tue/Thu/Sat are scheduler preferences only — the collector does **not** hard-fail other dates.

Each GOL (G3) flight emits public **SMILES** and **SMILES_MONEY** award rows (`source=smiles_web`, `amount_brl` always null). Club fares are skipped unless a member session is present (`SMILES_COOKIE` / `SMILES_ACCESS_TOKEN` / `SMILES_MEMBER_NUMBER` or `SMILES_INCLUDE_CLUB=1`). Partner airlines in the same payload are dropped. Taxes come from `fare.g3.costTax` or `airlineTax` when present (`null` means unknown). A payload `money: 0` on a miles-only fare is treated as no copay.

### Full cash BRL (separate source)

- UI: `https://www.voegol.com.br/itineraries?from=PET&to=CGH&departureDate=YYYY-MM-DD&numAdults=1`
- Upstream: `POST https://b2c-api.voegol.com.br/api/sabre-default/flights?Flow=Issue&context=B2C`
- Persist `itineraries[].offers[].total.amount` → `amount_brl`, currency BRL (`totalPrice.amount` fallback)
- Same ingest job (companion), distinct `source=voegol`. Miles WAF vs cash WAF can independently yield `partial`.
- `SMILES_DRY_RUN=1` parses bundled PET→CGH miles **and** VoeGol cash fixtures (no network) and persists `source` as `smiles_web_dry_run` / `voegol_dry_run` (live names stay unsuffixed). Never write credentials into `raw_payload`.

Live credentials are env secrets only. Until Pereira sends them privately to PM, `SMILES_DRY_RUN=1` is the accepted path.

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
| `SMILES_DRY_RUN` | CI / local without Smiles | `1` parses bundled PET→CGH miles + VoeGol cash JSON fixtures (no network). Accepted until live credentials are provided privately. |
| `SMILES_LIVE` | No | Set `1` to force live mode if you only have cookies/token. |
| `SMILES_ENV` | No | `blue` (default) or `green`. |
| `SMILES_SEARCH_HOST` / `SMILES_LOGIN_HOST` | No | Full origin overrides. |
| `SMILES_FARE_TYPES` | No | Comma list, default `SMILES,SMILES_MONEY`. |
| `SMILES_INCLUDE_CLUB` | No | `1` to keep club fares without a member session. |
| `SMILES_REQUEST_DELAY_MS` | No | Default `400`. Shared by Smiles then VoeGol. |
| `VOEGOL_API_HOST` | No | Default `https://b2c-api.voegol.com.br`. |
| `TUDOAZUL_LOGIN` | Yes (live) | **Frozen** TudoAzul / Azul Fidelidade login (placeholder only). Not `AZUL_*`. |
| `TUDOAZUL_PASSWORD` | Yes (live) | **Frozen** password (placeholder only). Never commit a real value. |
| `TUDOAZUL_DRY_RUN` | CI / local without Azul | `1` parses bundled PET→VCP and PET→POA JSON fixtures (no network). Accepted until live credentials are provided privately. |
| `TUDOAZUL_API_HOST` | No | Default `https://b2c-api.voeazul.com.br`. |
| `TUDOAZUL_REQUEST_DELAY_MS` | No | Default `400`. |
| `LATAM_PASS_LOGIN` | Yes (live) | **Frozen** LATAM Pass / latamairlines.com login (placeholder only). Researchy `LATAM_PASS_NUMBER` → this name. Not `LATAM_LOGIN`. |
| `LATAM_PASS_PASSWORD` | Yes (live) | **Frozen** password (placeholder only). Not `LATAM_PASSWORD`. Never commit a real value. |
| `LATAM_DRY_RUN` | CI / local without LATAM | `1` parses bundled PET→GRU JSON fixtures (no network). Accepted until live credentials are provided privately. |
| `LATAM_API_HOST` | No | Default `https://www.latamairlines.com`. |
| `LATAM_OFFERS_PATH` | No | Default `/bff/air-offers/offers/search`. SPA v2 alias via env override. |
| `LATAM_REQUEST_DELAY_MS` | No | Default `400`. |

Unconfigured live ticks record **`auth_failed`** for every Smiles, TudoAzul, and LATAM Pass date, so the ingest run is **`auth_failed`**.

## TudoAzul / AZUL (BE-4)

One `collect({ origin, destination, airline, program, flightDate })` job, two sources. `program` stays `tudoazul`. Airline is AZUL. The scheduler already prefers VCP Mon/Fri and queues every other date (including all PET→POA dates) — the collector does **not** hard-lock DOW.

| Quote | `source` | `miles` | `amount_brl` | `taxes_brl` |
| --- | --- | --- | --- | --- |
| Award / pontos+reais | `tudoazul` | `pointsOptions[].points` (or `discountedPoints`) | **always `null`** | `taxesAndFees.amount` |
| Full cash BRL | `voeazul` | `null` | `fares[].total.amount` (BRL) | passenger tax charges when present |

**Critical: Azul `fareMoney` / `totalMoney` / `convenienceFee` is pontos+reais COPAY, not full cash BRL.** Persist only on `raw_payload` as `fare_money_brl`, `total_money_brl`, `convenience_fee_brl`. `amountLevel` is the mix tier, not a price. Missing fare → `null` / `empty`, **never invent price 0**. If only points or only cash fails → `partial`.

B2B Navitaire Shopping exists but needs an agency — skipped for v1.

### TudoAzul points (primary)

- UI: `https://passagens.voeazul.com.br/pt/buscador-de-pontos`
- Upstream: `POST https://b2c-api.voeazul.com.br/reservationavailability/api/reservation/availability/v5/availability`
- Login JWT first: `POST https://b2c-api.voeazul.com.br/authentication/api/authentication/v1/token` with `TUDOAZUL_LOGIN` / `TUDOAZUL_PASSWORD` (`grantType=password`). 2FA possible — dry-run/fixtures until secrets.
- Body: `criteria[].stations.originStationCodes` / `destinationStationCodes`, `dates.beginDate=YYYY-MM-DDT00:00:00`, `passengers.types=[{type:ADT,count:1}]`, `codes.currencyCode=BRL`, `points=true`, `pricingMode=points`, `filters.loyalty=PointsAndMonetary`
- Headers: `Device: novosite`, `Culture: pt-BR`, browser `Accept` / `Origin` (`passagens.voeazul.com.br`) / `Referer` / `User-Agent`, `Authorization: Bearer` after login
- Parses gecko-normalized `trips[].journeys[].fares[].pointsOptions[]` and native Navitaire `journeysAvailableByMarket` + `passengerFares.points`
- Filter `carrierCode=AD` only (2Z Conecta and partners dropped)
- `flexibleDays` lowest fares are calendar-only and are **not** persisted as flight snapshots

### Full cash BRL (separate source, same host)

- UI: `https://www.voeazul.com.br/br/pt/home/selecao-voo?c[0].ds=PET&c[0].std=MM/DD/YYYY&c[0].as=VCP|POA&p[0].t=ADT&p[0].c=1&p[0].cp=false&cc=BRL`
- Upstream: same availability v5 POST with `points=false`, `pricingMode=cash`, `filters.loyalty=MonetaryOnly`
- Persist `fares[].total.amount` → `amount_brl`, currency BRL (Navitaire `passengerFares[].fareAmount` fallback)
- Same ingest job (companion), distinct `source=voeazul`. Points WAF vs cash WAF can independently yield `partial`.

### Routes

- **PET→POA**: operates; empty on some DOWs is `empty`, not `scrape_failed`
- **PET→VCP**: nonstop announced from **2026-10-26** Mon/Fri. Before that, empty inventory or connections (`stopsCount>0`) are **not** `scrape_failed`

### Auth

Frozen secrets (placeholders only — no real credentials in git or CI):

- `TUDOAZUL_LOGIN` / `TUDOAZUL_PASSWORD` — Azul Fidelidade / TudoAzul member pair (not `AZUL_*`)
- `TUDOAZUL_DRY_RUN=1` parses bundled PET→VCP and PET→POA fixtures (no network) until those secrets are provided privately

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
#   LATAM_DRY_RUN=1
# or:
#   SMILES_API_KEY=<from DevTools>
#   TUDOAZUL_LOGIN= / TUDOAZUL_PASSWORD=  (never commit real values)
#   LATAM_PASS_LOGIN= / LATAM_PASS_PASSWORD=  (never commit real values)
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

## LATAM Pass / LATAM (BE-5)

One `collect({ origin, destination, airline, program, flightDate })` job, two sources. `program` stays `latam_pass`. Airline is LATAM. The scheduler **preference-orders** the brief PET→GRU grid (Mon/Wed/Fri through Oct 2026; Wed/Fri/Sat after) and still queues every other Sep–Dec date — **not a hard lock**. The published network (Mon/Thu/Fri through Oct; Wed/Fri/Sat from ~2026-11-01) is **not** the sort key; it only explains why empty inventory on a non-operating weekday is `empty`, not `scrape_failed`. Each snapshot tags `raw_payload.dow_preference` with `{ brief, published, cutover, grid }`.

| Quote | `source` | `miles` | `amount_brl` | `taxes_brl` |
| --- | --- | --- | --- | --- |
| Award / miles+money | `latam_pass` | `brands[].price.amount` when `currency=LOYALTY_POINTS` | **always `null`** | `brands[].taxes.amount` |
| Full cash BRL | `latam_web` | `null` | `items[].price.amount` / `brands[].price.amount` (BRL) | `brands[].taxes.amount` when present |

**Critical: LATAM miles+money copay (`money` / `copay` / `additionalAmount` / `fareMoney`) is not full cash BRL.** Persist only on `raw_payload` as `copay_brl`. `priceWithOutTax` is the equivalent cash fare LATAM attaches next to miles (used for milheiro) — store as `price_without_tax_brl`, never as `amount_brl`. Missing fare → `null` / `empty`, **never invent price 0**. If only miles or only cash fails → `partial`.

Partner LATAM Pass award search is redeem-only (not availability). NDC / B2B LATAM Trade needs an agency — both skipped for v1.

### LATAM Pass miles (primary)

- UI: `https://www.latamairlines.com/br/pt/oferta-voos?origin=PET&outbound=YYYY-MM-DDT00:00:00.000Z&destination=GRU&adt=1&chd=0&inf=0&trip=OW&cabin=Economy&redemption=true&sort=RECOMMENDED`
- Upstream: `GET https://www.latamairlines.com/bff/air-offers/offers/search` (`redemption=true`; logged session). Award search is not public — fixtures until secrets.
- Login first (best-effort): `POST …/bff/user-session/v1/session` with `LATAM_PASS_LOGIN` / `LATAM_PASS_PASSWORD`. Captcha/WAF likely — dry-run/fixtures until secrets.
- Params: `origin`, `destination`, `outFrom={YYYY-MM-DD}T00:00:00.000Z`, `adult=1`, `cabinType=Economy`, one-way (`inFrom=null`)
- Headers: `x-latam-application-name: web-air-offers`, `x-latam-application-country: BR`, `x-latam-application-oc: br`, `x-latam-application-lang: pt`, browser `Accept` / `Origin` / `Referer` / `User-Agent`
- Parses native `content[].summary.brands[]` (`price.currency=LOYALTY_POINTS`) and gecko-normalized `items[]`
- Filter marketing carrier **LA\*** / LATAM group **JJ / LP / XL / 4C / PZ** (G3 / AD / DL dropped)

### Full cash BRL (separate source, same host)

- UI: same `oferta-voos` URL with `redemption=false`
- Upstream: `GET https://www.latamairlines.com/bff/air-offers/offers/search?origin=PET&destination=GRU` (`redemption=false`)
- Persist `items[].price.amount` (gecko) or `brands[].price.amount` → `amount_brl` when `currency=BRL`; `miles=null`; filter LA\*
- Same ingest job (companion), distinct `source=latam_web` (briefing also allowed `latam`). Miles WAF vs cash WAF can independently yield `partial`.

### Route

- **PET→GRU**: collect **all** dates 1 Sep–31 Dec 2026. Empty outside real inventory (including published non-operating DOWs) is `empty`, not `scrape_failed`. Connections (`stopOvers>0`) are inventory, never `scrape_failed`.

### Auth

Frozen secrets (placeholders only — no real credentials in git or CI):

- `LATAM_PASS_LOGIN` / `LATAM_PASS_PASSWORD` — LATAM Pass / latamairlines.com member pair (not `LATAM_LOGIN` / `LATAM_PASSWORD`; Researchy `LATAM_PASS_NUMBER` → `LATAM_PASS_LOGIN`)
- `LATAM_DRY_RUN=1` parses bundled PET→GRU fixtures (no network) until those secrets are provided privately

### Rate / WAF

- No official RPM. Datacenter clients get **HTML 403 Access Denied** from Akamai
- Browser Accept + `x-latam-*` set; sequential 400ms limiter shared by miles then cash; backoff on 429/5xx; no burst
- **HTML / Akamai / HTTP 406 → `scrape_failed`**. **401 / JSON 403 / missing config → `auth_failed`**. Never invent a 0 fare.

### Statuses

| Status | When |
| --- | --- |
| `success` | ≥1 persistable LATAM quote (miles and/or `latam_web` cash) |
| `empty` | 200 but no LATAM inventory / allowed fares |
| `auth_failed` | missing config, 401, JSON 403, or login failed |
| `scrape_failed` | network/5xx/429, HTML/non-JSON, Akamai block, HTTP 406 WAF |
| `partial` | miles ok + cash failed (or reverse); or run-level mix with other programs |

### Known failure modes

| Status | When |
| --- | --- |
| `success` | ≥1 persistable GOL quote (smiles_web miles and/or voegol cash) |
| `empty` | HTTP 200 but no GOL inventory / no allowed fares. |
| `auth_failed` | Missing config, 401/403, or password login failed. |
| `scrape_failed` | Network/5xx/429 exhausted, non-JSON/HTML, or Akamai-style `{ "message": "Something went wrong" }` (HTTP 406 from datacenter IPs is common). |
| `partial` | Run-level mix (one program failed, others empty/success; miles ok + cash failed; or persist errors). |

**Live API discovery notes:** the SPA (`@smiles/flight-availability`) calls `ApiFlightSearch` → `v1/airlines/search` with `NOT_CREDENTIALS` plus `x-api-key` from remote constants (`x-api-key=flight-search` in LaunchDarkly). This environment's AWS egress received **HTTP 406** from Akamai on both blue and green search hosts even with the historical public key — Workers on Cloudflare IPs may succeed; if not, set `SMILES_COOKIE` from a real browser session or keep `SMILES_DRY_RUN=1` until the WAF allows the guest key.

LATAM's SPA calls `GET /bff/air-offers/offers/search` (`redemption=true|false`) with `x-latam-*` headers. Miles fields (`price.currency=LOYALTY_POINTS`, `priceWithOutTax`) typically need a logged-in session. This environment's AWS egress received **HTML 403 Access Denied** from Akamai — keep `LATAM_DRY_RUN=1` until private `LATAM_PASS_LOGIN` / `LATAM_PASS_PASSWORD` are provided.

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
# optional dashboard read gate (BE-6):
npx wrangler secret put API_READ_SECRET
# BE-3 live Smiles (omit if SMILES_DRY_RUN=1):
npx wrangler secret put SMILES_API_KEY
# optional member session:
# npx wrangler secret put SMILES_COOKIE
# BE-4 live TudoAzul (omit if TUDOAZUL_DRY_RUN=1):
npx wrangler secret put TUDOAZUL_LOGIN
npx wrangler secret put TUDOAZUL_PASSWORD
# BE-5 live LATAM Pass (omit if LATAM_DRY_RUN=1):
npx wrangler secret put LATAM_PASS_LOGIN
npx wrangler secret put LATAM_PASS_PASSWORD
```

Optional env overrides: `FLIGHT_WINDOW_START`, `FLIGHT_WINDOW_END` (YYYY-MM-DD), `SMILES_DRY_RUN`, `SMILES_ENV`, `SMILES_REQUEST_DELAY_MS`, `VOEGOL_API_HOST`, `TUDOAZUL_DRY_RUN`, `TUDOAZUL_REQUEST_DELAY_MS`, `TUDOAZUL_API_HOST`, `LATAM_DRY_RUN`, `LATAM_REQUEST_DELAY_MS`, `LATAM_API_HOST`, `CORS_ALLOWED_ORIGINS`.

Without real Supabase secrets the worker still runs collectors and returns a summary; it skips persistence (`persisted: false`). Do not point `SUPABASE_URL` at a dummy hostname — workerd fails hard on DNS errors. Leave the vars empty instead.

## Local

Toolchain matches the repo root: Node **24** (`../.nvmrc`, `engines.node`). Lint/format stay on the Vite app; this package keeps `typecheck` + `test`.

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
curl http://localhost:8787/api/v1/health

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

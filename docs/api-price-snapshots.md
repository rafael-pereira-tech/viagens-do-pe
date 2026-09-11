# BE-6: `price_snapshots` read API

Stable Worker proxy so the Vite/React dashboard can load KPIs, charts, and the
offers table **without** `SUPABASE_SERVICE_ROLE_KEY` in the browser.

RLS on `public.price_snapshots` is enabled with **no** anon policies. This API
reads via the Worker service role. Do not add a browser Supabase client.

Same Workers project as ingest: `workers/` (`viagens-do-pe-ingest`).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Ingest liveness (unchanged) |
| `GET` | `/api/v1/health` | Read API liveness |
| `GET` | `/api/v1/snapshots` | Paginated history |
| `GET` | `/api/v1/snapshots/latest` | Latest row per route/day/source |
| `GET` | `/api/v1/snapshots/stats` | Min miles / min `amount_brl` over the window |
| `OPTIONS` | `/api/v1/*` | CORS preflight |

## Query filters

All list/latest/stats endpoints accept:

| Param | PostgREST | Notes |
| --- | --- | --- |
| `origin` | `eq` | 3-letter IATA (`PET`) |
| `destination` | `eq` | 3-letter IATA (`GRU`, `CGH`, `VCP`, `POA`) |
| `airline` | `eq` | `GOL` \| `AZUL` \| `LATAM` (uppercased) |
| `program` | `eq` | `smiles` \| `tudoazul` \| `latam_pass` (lowercased) |
| `source` / `fonte` | `eq` | Collector id. `fonte=todas` is ignored (dashboard) |
| `flight_date` / `dia` | `eq` | Exact civil `YYYY-MM-DD` |
| `flight_date_from` / `flight_date_to` | `gte` / `lte` | Civil date range |
| `collected_at` | `eq` or day window | ISO timestamp → `eq`; `YYYY-MM-DD` → that UTC day |
| `collected_at_from` / `collected_at_to` | `gte` / `lte` | ISO-8601 or `YYYY-MM-DD` |
| `include_raw` | select | `1` to include redacted `raw_payload` (omitted by default) |
| `exclude_dry_run` | `source=not.like.*dry_run` | Drop `*_dry_run` fixture sources |
| `limit` / `offset` | page | List default **100** (max 500). Latest default 500 (max 2000) |
| `group_by` | — | Stats only: `window` (default) or `route_day` |

Aliases: `flight_date_gte` / `flight_date_lte`, `collected_at_gte` / `collected_at_lte`.

## Response shapes

### `PriceSnapshot`

```ts
{
  id: string
  origin: string
  destination: string
  airline: string
  program: string
  flight_date: string            // YYYY-MM-DD
  departure_time: string | null
  miles: number | null           // award quote; null on cash-only rows
  amount_brl: number | null      // cash quote; null on miles-only rows
  taxes_brl: number | null       // null = unknown, 0 = zero tax
  currency: string               // usually "BRL"
  source: string                 // may be "*_dry_run"
  collected_at: string           // ISO timestamptz
  created_at: string
  ingest_run_id: string | null
  raw_payload?: unknown          // only when include_raw=1; secrets redacted
}
```

TypeScript copies:

- Worker: `workers/src/api/types.ts`
- FE: `src/types/api.ts` + helpers in `src/lib/api.ts`

`miles` **or** `amount_brl` is present (DB check). Never treat a missing fare as `0`.

### List / latest — example

`GET /api/v1/snapshots/latest?origin=PET&destination=CGH&fonte=smiles_web&flight_date_from=2026-09-01&limit=20`

```json
{
  "data": [
    {
      "id": "7c3b0d2a-1f44-4d8e-9a11-0c2f6b8e4a10",
      "origin": "PET",
      "destination": "CGH",
      "airline": "GOL",
      "program": "smiles",
      "flight_date": "2026-09-15",
      "departure_time": "07:05:00",
      "miles": 13800,
      "amount_brl": null,
      "taxes_brl": 64.0,
      "currency": "BRL",
      "source": "smiles_web",
      "collected_at": "2026-09-11T18:00:00.000Z",
      "created_at": "2026-09-11T18:00:12.000Z",
      "ingest_run_id": "2a11c0de-55ab-4b01-9c44-8f0d1e2a3b4c"
    },
    {
      "id": "9e8f1c22-0aa1-4b77-8d03-5c1a9f2e0011",
      "origin": "PET",
      "destination": "CGH",
      "airline": "GOL",
      "program": "smiles",
      "flight_date": "2026-09-15",
      "departure_time": "07:05:00",
      "miles": null,
      "amount_brl": 548.9,
      "taxes_brl": 64.0,
      "currency": "BRL",
      "source": "voegol",
      "collected_at": "2026-09-11T18:00:00.000Z",
      "created_at": "2026-09-11T18:00:12.000Z",
      "ingest_run_id": "2a11c0de-55ab-4b01-9c44-8f0d1e2a3b4c"
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "total": 2,
    "include_raw": false,
    "grain": "origin,destination,airline,program,source,flight_date"
  }
}
```

`grain` is only set on `/latest`. If the `price_snapshots_latest` view is not
applied yet, latest falls back to in-memory distinct and sets
`meta.fallback: "in_memory_distinct"`. Empty page: `"data": []` with `total: 0`.

### Stats

`GET /api/v1/snapshots/stats` (`group_by=window`, default):

```json
{
  "data": {
    "min_miles": 7200,
    "min_amount_brl": 529.9,
    "snapshot_count": 80,
    "latest_collected_at": "2026-09-11T18:00:00.000Z"
  },
  "meta": { "group_by": "window", "snapshot_count": 80, "truncated": false }
}
```

`GET /api/v1/snapshots/stats?group_by=route_day`:

```json
{
  "data": [
    {
      "origin": "PET",
      "destination": "CGH",
      "flight_date": "2026-09-15",
      "min_miles": 12000,
      "min_amount_brl": 890.0,
      "snapshot_count": 4,
      "latest_collected_at": "2026-09-11T18:00:00.000Z"
    }
  ],
  "meta": { "group_by": "route_day", "snapshot_count": 40, "truncated": false }
}
```

Null mins mean no numeric quotes in the window (not a zero fare).

## Sources (locked)

Award + cash companion pairs. Filter `fonte` / `source` on these ids.

| Pair | Award / miles `source` | Cash companion `source` | Program |
| --- | --- | --- | --- |
| Smiles / GOL | `smiles_web` | `voegol` | `smiles` |
| TudoAzul / AZUL | `tudoazul` | `voeazul` | `tudoazul` |
| LATAM Pass / LATAM | `latam_pass` | **`latam_web`** | `latam_pass` |

LATAM cash is **`latam_web`**. Do **not** use `latamairlines` (that name is not a
`price_snapshots.source`). Constants: `LIVE_SOURCES` in `src/types/api.ts`.

| `source` / `fonte` | Meaning |
| --- | --- |
| `smiles_web` | GOL award miles (`amount_brl` is null) |
| `voegol` | GOL full cash BRL |
| `tudoazul` | Azul points (cash copay is **not** `amount_brl`) |
| `voeazul` | Azul full cash BRL |
| `latam_pass` | LATAM miles |
| `latam_web` | LATAM full cash BRL |

Dry-run after the S0 hotfix persists the **same live name + `_dry_run`**:
`smiles_web_dry_run`, `voegol_dry_run`, `tudoazul_dry_run`, `voeazul_dry_run`,
`latam_pass_dry_run`, `latam_web_dry_run`. The FE should either pass
`exclude_dry_run=1` or accept those rows and label them.

## Auth and secrets

Reads go **only** through this Worker proxy. RLS stays enabled with **no**
anon/authenticated policies (`policies []` today). Do **not** add a browser
Supabase client or anon key until tight SELECT RLS exists.

The dashboard **Entrar / Sair** buttons are a UI stub. They do **not** authorize
snapshot data. The Worker checks a real Bearer on every `/api/v1/snapshots*` call.

| Who | Credential | Header |
| --- | --- | --- |
| Worker → Supabase | `SUPABASE_SERVICE_ROLE_KEY` (Worker secret only) | PostgREST `Authorization` / `apikey` — **never** in `VITE_*` |
| FE / curl → Worker | `READ_API_KEY` (Worker secret) = `VITE_READ_API_KEY` (Pages env) | `Authorization: Bearer <READ_API_KEY>` |
| Ingest `POST /run` | `INGEST_TRIGGER_SECRET` | **Not accepted** on read routes |

`READ_API_KEY` must be **distinct** from `INGEST_TRIGGER_SECRET`. Reusing the
ingest trigger is rejected (`read_api_key_reuses_ingest_secret`). A later
session/login can replace this v1 Pages-safe Bearer; until then the Worker
still requires the header. If `READ_API_KEY` is unset, snapshot routes return
**503** (`read_api_key_not_configured`) — they do not fall open.

v1 note: `VITE_READ_API_KEY` is bundled into the Pages build (public config).
It is only a shared Bearer the Worker knows. It is **not** a secret equivalent
to the service role. Never embed `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` in the FE.

`raw_payload` is stripped unless `include_raw=1`. When included, keys that look
like secrets (`password`, `authorization`, `cookie`, `api_key`, …) are replaced
with `"[redacted]"`. Error bodies never echo Bearer tokens or JWTs.

## CORS

Allowed request `Origin` values:

- `https://viagens-do-pe.pages.dev`
- `https://*.viagens-do-pe.pages.dev` (Pages previews)
- `http://localhost`, `http://localhost:<port>`
- `http://127.0.0.1`, `http://127.0.0.1:<port>`
- Extra origins in Worker `CORS_ALLOWED_ORIGINS` (comma-separated)

`curl` (no `Origin`) is not blocked by CORS.

## How the FE should call it

Dashboard query today: `to`, `from`, `until`, `fonte` (see `src/lib/query.ts`).

```ts
import { API_URL } from './lib/config.ts'
import {
  dashboardToSnapshotQuery,
  fetchLatestSnapshots,
  fetchSnapshotStats,
  toOfferRow,
} from './lib/api.ts'

if (!API_URL) {
  // keep using src/data/placeholders.ts
} else {
  const filters = dashboardToSnapshotQuery(query)
  const [latest, stats] = await Promise.all([
    fetchLatestSnapshots(filters),
    fetchSnapshotStats({ ...filters, group_by: 'window' }),
  ])
  const offers = latest.data.map(toOfferRow)
  const minMiles = stats.data.min_miles
  const minCash = stats.data.min_amount_brl
}
```

Pages build settings:

```
VITE_API_URL=https://viagens-do-pe-ingest.<account>.workers.dev
VITE_READ_API_KEY=<same value as Worker READ_API_KEY>
```

`src/lib/api.ts` always sends `Authorization: Bearer ${VITE_READ_API_KEY}` and
refuses to fetch if that env is empty.

## Env (Worker)

Already required for ingest:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Required for reads:

- `READ_API_KEY` — Bearer for `/api/v1/snapshots*` (not `INGEST_TRIGGER_SECRET`)

Optional: `CORS_ALLOWED_ORIGINS` — extra origins

```bash
cd workers
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put READ_API_KEY
```

Apply `supabase/migrations/20260911192000_price_snapshots_latest.sql` so
`/latest` can use the view (otherwise the Worker distincts in memory).

## Example curl

```bash
# liveness
curl -sS https://viagens-do-pe-ingest.<account>.workers.dev/api/v1/health

# PET → CGH table/chart feed (latest per route/day/source)
curl -sS -G 'https://viagens-do-pe-ingest.<account>.workers.dev/api/v1/snapshots/latest' \
  -H 'Authorization: Bearer <READ_API_KEY>' \
  --data-urlencode origin=PET \
  --data-urlencode destination=CGH \
  --data-urlencode flight_date_from=2026-09-01 \
  --data-urlencode flight_date_to=2026-12-31 \
  --data-urlencode exclude_dry_run=1

# KPI mins over the same window
curl -sS -G 'https://viagens-do-pe-ingest.<account>.workers.dev/api/v1/snapshots/stats' \
  -H 'Authorization: Bearer <READ_API_KEY>' \
  --data-urlencode origin=PET \
  --data-urlencode destination=CGH \
  --data-urlencode group_by=window

# Local (wrangler dev). READ_API_KEY is required on snapshot routes.
curl -sS -G 'http://localhost:8787/api/v1/snapshots' \
  -H 'Authorization: Bearer dev-only-read-api-key' \
  --data-urlencode origin=PET \
  --data-urlencode source=smiles_web \
  --data-urlencode limit=20
```

Local with a Pages-like Origin:

```bash
curl -sS -D - -o /dev/null \
  -H 'Origin: https://viagens-do-pe.pages.dev' \
  'http://localhost:8787/api/v1/health'
```

## OpenAPI (short)

```yaml
openapi: 3.1.0
info:
  title: viagens-do-pe price_snapshots read API
  version: "1.0.0"
servers:
  - url: https://viagens-do-pe-ingest.example.workers.dev
paths:
  /api/v1/snapshots:
    get:
      summary: List snapshots
      parameters:
        - $ref: "#/components/parameters/origin"
        - $ref: "#/components/parameters/destination"
        - $ref: "#/components/parameters/airline"
        - $ref: "#/components/parameters/program"
        - $ref: "#/components/parameters/source"
        - $ref: "#/components/parameters/fonte"
        - $ref: "#/components/parameters/flight_date"
        - $ref: "#/components/parameters/flight_date_from"
        - $ref: "#/components/parameters/flight_date_to"
        - $ref: "#/components/parameters/collected_at"
        - $ref: "#/components/parameters/collected_at_from"
        - $ref: "#/components/parameters/collected_at_to"
        - $ref: "#/components/parameters/include_raw"
        - $ref: "#/components/parameters/exclude_dry_run"
        - $ref: "#/components/parameters/limit"
        - $ref: "#/components/parameters/offset"
      responses:
        "200":
          description: Paginated snapshots (`data[]` + `meta.limit/offset/total`)
          content:
            application/json:
              example:
                data:
                  - id: "7c3b0d2a-1f44-4d8e-9a11-0c2f6b8e4a10"
                    origin: PET
                    destination: CGH
                    airline: GOL
                    program: smiles
                    flight_date: "2026-09-15"
                    departure_time: "07:05:00"
                    miles: 13800
                    amount_brl: null
                    taxes_brl: 64.0
                    currency: BRL
                    source: smiles_web
                    collected_at: "2026-09-11T18:00:00.000Z"
                    created_at: "2026-09-11T18:00:12.000Z"
                    ingest_run_id: "2a11c0de-55ab-4b01-9c44-8f0d1e2a3b4c"
                meta: { limit: 100, offset: 0, total: 1, include_raw: false }
        "400":
          description: Invalid filter
        "401":
          description: Missing/invalid Authorization Bearer READ_API_KEY
        "503":
          description: READ_API_KEY unset, reused ingest secret, or no Supabase credentials
  /api/v1/snapshots/latest:
    get:
      summary: Latest snapshot per route/day/source
      parameters:
        - $ref: "#/components/parameters/origin"
        - $ref: "#/components/parameters/destination"
        - $ref: "#/components/parameters/flight_date_from"
        - $ref: "#/components/parameters/flight_date_to"
      responses:
        "200":
          description: Latest grain rows
  /api/v1/snapshots/stats:
    get:
      summary: Min miles and min amount_brl
      parameters:
        - $ref: "#/components/parameters/origin"
        - $ref: "#/components/parameters/destination"
        - name: group_by
          in: query
          schema:
            type: string
            enum: [window, route_day]
      responses:
        "200":
          description: Aggregation
components:
  parameters:
    origin: { name: origin, in: query, schema: { type: string, minLength: 3, maxLength: 3 } }
    destination: { name: destination, in: query, schema: { type: string, minLength: 3, maxLength: 3 } }
    airline: { name: airline, in: query, schema: { type: string } }
    program: { name: program, in: query, schema: { type: string } }
    source: { name: source, in: query, schema: { type: string } }
    fonte: { name: fonte, in: query, schema: { type: string }, description: "Alias of source" }
    flight_date: { name: flight_date, in: query, schema: { type: string, format: date } }
    flight_date_from: { name: flight_date_from, in: query, schema: { type: string, format: date } }
    flight_date_to: { name: flight_date_to, in: query, schema: { type: string, format: date } }
    collected_at: { name: collected_at, in: query, schema: { type: string } }
    collected_at_from: { name: collected_at_from, in: query, schema: { type: string } }
    collected_at_to: { name: collected_at_to, in: query, schema: { type: string } }
    include_raw: { name: include_raw, in: query, schema: { type: string, enum: ["1", "true"] } }
    exclude_dry_run: { name: exclude_dry_run, in: query, schema: { type: string, enum: ["1", "true"] } }
    limit: { name: limit, in: query, schema: { type: integer, minimum: 1 } }
    offset: { name: offset, in: query, schema: { type: integer, minimum: 0 } }
```

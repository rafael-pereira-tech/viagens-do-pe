/**
 * UI snapshot row. The Worker read contract (nullability, `id`, `*_dry_run`
 * sources) lives in `src/types/api.ts` — see `docs/api-price-snapshots.md`.
 */
export type PriceSnapshot = {
  id?: string
  origin: string
  destination: string
  airline: string
  program: string
  flight_date: string
  departure_time?: string
  stops?: number
  miles?: number
  amount_brl?: number
  taxes_brl?: number
  currency: string
  source: string
  collected_at: string
}

/**
 * Display row. `milheiro` is classic `(cash_brl / miles) * 1000`, pairing the
 * award quote with the cash companion for the same route/day/airline.
 * `null` when miles are missing (cash-only) or no companion cash fare exists.
 * History fields come from `GET /observations/summary` (absent until ≥2 obs).
 */
export type OfferRow = PriceSnapshot & {
  milheiro: number | null
  milesDeltaPct?: number | null
  milesMin?: number | null
  milesMax?: number | null
  brlDeltaPct?: number | null
  brlMin?: number | null
  brlMax?: number | null
}

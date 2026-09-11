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
 * Display row. `milheiro` is derived: `(taxes_brl / miles) * 1000` on award
 * quotes. `null` when miles are missing (cash-only) or taxes are unknown.
 */
export type OfferRow = PriceSnapshot & {
  milheiro: number | null
}

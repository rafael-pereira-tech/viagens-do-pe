/** Snapshot of an award/cash fare quote. Backend shape — FE-1 uses local stubs only. */
export type PriceSnapshot = {
  origin: string
  destination: string
  airline: string
  program: string
  flight_date: string
  departure_time?: string
  miles?: number
  amount_brl?: number
  taxes_brl?: number
  currency: string
  source: string
  collected_at: string
}

/** UI stub: milheiro (R$ / 1.000 milhas) derived for display, not fetched. */
export type OfferRow = PriceSnapshot & {
  milheiro: number
}

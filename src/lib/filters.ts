import { ORIGIN, todayIso, type DashboardQuery } from './query.ts'
import type { OfferRow } from '../types/priceSnapshot.ts'

export const FILTER_FONTES = ['Seats.aero', 'Worker', 'ExpertFlyer'] as const

export function isFutureDate(isoDate: string, today = todayIso()): boolean {
  return isoDate >= today
}

export function filterOffers(
  offers: OfferRow[],
  query: DashboardQuery,
  opts: { ignoreDay?: boolean } = {},
): OfferRow[] {
  const fonte = query.fonte.trim()
  const today = todayIso()

  return offers.filter((row) => {
    if (row.origin !== ORIGIN) return false
    if (row.destination !== query.to) return false
    if (!isFutureDate(row.flight_date, today)) return false
    if (fonte && fonte.toLowerCase() !== 'todas' && row.source !== fonte) return false
    if (query.from && row.flight_date < query.from) return false
    if (query.until && row.flight_date > query.until) return false
    if (!opts.ignoreDay && query.dia && row.flight_date !== query.dia) return false
    return true
  })
}

export function sortOffers(offers: OfferRow[]): OfferRow[] {
  return [...offers].sort((a, b) => {
    const byDate = a.flight_date.localeCompare(b.flight_date)
    if (byDate !== 0) return byDate
    return a.milheiro - b.milheiro
  })
}

export function applyQuery(offers: OfferRow[], query: DashboardQuery, opts: { ignoreDay?: boolean } = {}): OfferRow[] {
  return sortOffers(filterOffers(offers, query, opts))
}

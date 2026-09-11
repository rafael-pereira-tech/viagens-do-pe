import { ORIGIN, todayIso, type DashboardQuery } from './query.ts'
import type { OfferRow } from '../types/priceSnapshot.ts'

/** Live collector ids for the Fonte filter (not `latamairlines`). */
export const FILTER_FONTES = ['smiles_web', 'voegol', 'tudoazul', 'voeazul', 'latam_pass', 'latam_web'] as const

export type LiveSource = (typeof FILTER_FONTES)[number]

export const SOURCE_LABELS: Record<LiveSource, string> = {
  smiles_web: 'Smiles',
  voegol: 'VoeGOL',
  tudoazul: 'TudoAzul',
  voeazul: 'VoeAzul',
  latam_pass: 'LATAM Pass',
  latam_web: 'LATAM',
}

const PROGRAM_LABELS: Record<string, string> = {
  smiles: 'Smiles',
  tudoazul: 'TudoAzul',
  latam_pass: 'LATAM Pass',
}

export function stripDryRunSuffix(source: string): { base: string; dryRun: boolean } {
  const dryRun = source.endsWith('_dry_run')
  return { base: dryRun ? source.slice(0, -'_dry_run'.length) : source, dryRun }
}

export function isDryRunSource(source: string): boolean {
  return stripDryRunSuffix(source).dryRun
}

export function sourceLabel(source: string): string {
  const { base, dryRun } = stripDryRunSuffix(source)
  const label = SOURCE_LABELS[base as LiveSource] ?? base
  return dryRun ? `${label} (dry-run)` : label
}

export function programLabel(program: string): string {
  return PROGRAM_LABELS[program.toLowerCase()] ?? program
}

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
    if (query.dryMode === 'only' && !isDryRunSource(row.source)) return false
    if (query.dryMode === 'live' && isDryRunSource(row.source)) return false
    if (fonte && fonte.toLowerCase() !== 'todas') {
      const { base } = stripDryRunSuffix(row.source)
      if (row.source !== fonte && base !== fonte) return false
    }
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
    return (a.milheiro ?? Number.POSITIVE_INFINITY) - (b.milheiro ?? Number.POSITIVE_INFINITY)
  })
}

export function applyQuery(offers: OfferRow[], query: DashboardQuery, opts: { ignoreDay?: boolean } = {}): OfferRow[] {
  return sortOffers(filterOffers(offers, query, opts))
}

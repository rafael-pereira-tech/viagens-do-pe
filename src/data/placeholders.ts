import { milheiroFromQuote } from '../lib/api.ts'
import { airlineForDestination, airlineIdFromName, type AirlineId } from '../lib/airlines.ts'
import { isCashCompanionSource, programLabel } from '../lib/filters.ts'
import { formatShortDate } from '../lib/format.ts'
import { isoFromToday, ORIGIN, todayIso, type Destination } from '../lib/query.ts'
import type { SnapshotRouteDayStats, SnapshotWindowStats } from '../types/api.ts'
import type { OfferRow } from '../types/priceSnapshot.ts'

function row(
  destination: Destination,
  offsetDays: number,
  fields: Omit<OfferRow, 'origin' | 'destination' | 'flight_date' | 'currency' | 'collected_at' | 'milheiro'> & {
    milheiro?: number | null
  },
): OfferRow {
  const { milheiro, ...rest } = fields
  return {
    origin: ORIGIN,
    destination,
    flight_date: isoFromToday(offsetDays),
    currency: 'BRL',
    collected_at: `${isoFromToday(0)}T12:00:00Z`,
    ...rest,
    milheiro: milheiro !== undefined ? milheiro : milheiroFromQuote(rest),
  }
}

/** Local stubs only — PET one-way to GRU / CGH / VCP. Includes a past row per dest (filtered out). */
export const PLACEHOLDER_OFFERS: OfferRow[] = [
  row('GRU', -4, {
    airline: 'LATAM',
    program: 'latam_pass',
    miles: 12_000,
    taxes_brl: 58,
    source: 'latam_pass',
  }),
  row('GRU', 6, {
    airline: 'LATAM',
    program: 'latam_pass',
    departure_time: '06:40',
    miles: 16_000,
    taxes_brl: 72,
    source: 'latam_pass_dry_run',
  }),
  row('GRU', 6, {
    airline: 'LATAM',
    program: 'latam_pass',
    departure_time: '09:15',
    amount_brl: 940,
    taxes_brl: 81,
    source: 'latam_web_dry_run',
  }),
  row('GRU', 13, {
    airline: 'AZUL',
    program: 'tudoazul',
    departure_time: '18:20',
    miles: 18_000,
    taxes_brl: 69,
    source: 'tudoazul_dry_run',
  }),
  row('GRU', 21, {
    airline: 'GOL',
    program: 'smiles',
    departure_time: '07:05',
    miles: 13_800,
    taxes_brl: 64,
    source: 'smiles_web_dry_run',
  }),
  row('GRU', 34, {
    airline: 'LATAM',
    program: 'latam_pass',
    departure_time: '12:40',
    amount_brl: 810,
    taxes_brl: 88,
    source: 'latam_web_dry_run',
  }),

  row('CGH', -3, {
    airline: 'GOL',
    program: 'smiles',
    miles: 11_000,
    taxes_brl: 55,
    source: 'smiles_web',
  }),
  row('CGH', 5, {
    airline: 'GOL',
    program: 'smiles',
    departure_time: '08:10',
    miles: 12_400,
    taxes_brl: 61,
    source: 'smiles_web_dry_run',
  }),
  row('CGH', 12, {
    airline: 'GOL',
    program: 'smiles',
    departure_time: '15:30',
    amount_brl: 690,
    taxes_brl: 77,
    source: 'voegol_dry_run',
  }),
  row('CGH', 19, {
    airline: 'GOL',
    program: 'smiles',
    departure_time: '06:55',
    miles: 11_800,
    taxes_brl: 59,
    source: 'smiles_web_dry_run',
  }),
  row('CGH', 28, {
    airline: 'AZUL',
    program: 'tudoazul',
    departure_time: '19:45',
    amount_brl: 910,
    taxes_brl: 70,
    source: 'voeazul_dry_run',
  }),

  row('VCP', -2, {
    airline: 'AZUL',
    program: 'tudoazul',
    miles: 13_000,
    taxes_brl: 62,
    source: 'tudoazul',
  }),
  row('VCP', 8, {
    airline: 'AZUL',
    program: 'tudoazul',
    departure_time: '10:25',
    miles: 14_200,
    taxes_brl: 66,
    source: 'tudoazul_dry_run',
  }),
  row('VCP', 16, {
    airline: 'AZUL',
    program: 'tudoazul',
    departure_time: '16:10',
    amount_brl: 580,
    taxes_brl: 74,
    source: 'voeazul_dry_run',
  }),
  row('VCP', 27, {
    airline: 'GOL',
    program: 'smiles',
    departure_time: '13:50',
    miles: 21_500,
    taxes_brl: 83,
    source: 'smiles_web_dry_run',
  }),
]

export type KpiModel = {
  menorMilhas: { value: number; caption: string } | null
  menorBrl: { value: number; caption: string } | null
  melhorMilheiro: { value: number; caption: string } | null
}

function minBy<T>(rows: T[], value: (row: T) => number): T | null {
  if (rows.length === 0) return null
  return rows.reduce((acc, row) => (value(row) < value(acc) ? row : acc))
}

export function kpisFromOffers(rows: OfferRow[], stats?: SnapshotWindowStats | null): KpiModel {
  const fewestMiles = minBy(
    rows.filter((row): row is OfferRow & { miles: number } => row.miles != null),
    (row) => row.miles,
  )
  const lowestCash = minBy(
    rows.filter(
      (row): row is OfferRow & { amount_brl: number } => row.amount_brl != null && isCashCompanionSource(row.source),
    ),
    (row) => row.amount_brl,
  )
  const bestMilheiro = minBy(
    rows.filter((row): row is OfferRow & { milheiro: number } => row.milheiro != null),
    (row) => row.milheiro,
  )

  // Window stats (#15): min_amount_brl is cash companions only — never award copay.
  const minMiles = stats ? stats.min_miles : (fewestMiles?.miles ?? null)
  const minCash = stats ? stats.min_amount_brl : (lowestCash?.amount_brl ?? null)

  const milesRow = minMiles != null ? (rows.find((row) => row.miles === minMiles) ?? fewestMiles) : null
  const cashRow =
    minCash != null
      ? (rows.find((row) => row.amount_brl === minCash && isCashCompanionSource(row.source)) ?? lowestCash)
      : null

  return {
    menorMilhas:
      minMiles == null
        ? null
        : {
            value: minMiles,
            caption: milesRow
              ? `${programLabel(milesRow.program)} · ${formatShortDate(milesRow.flight_date)}`
              : 'Na janela filtrada',
          },
    menorBrl:
      minCash == null
        ? null
        : {
            value: minCash,
            caption: cashRow ? `${cashRow.airline} · ${formatShortDate(cashRow.flight_date)}` : 'Na janela filtrada',
          },
    melhorMilheiro: bestMilheiro
      ? {
          value: bestMilheiro.milheiro,
          caption: `${programLabel(bestMilheiro.program)} · ${formatShortDate(bestMilheiro.flight_date)}`,
        }
      : null,
  }
}

export type ChartPoint = {
  date: string
  milhas: number
  brl: number
  sampleSize: number
  /** Winning airline of the day for that metric — bar fill, not a 3-cia stack. */
  milesAirline: AirlineId
  brlAirline: AirlineId
}

export function chartFromOffers(rows: OfferRow[], fallbackDestination = ''): ChartPoint[] {
  const fallback = airlineForDestination(fallbackDestination)
  const byDate = new Map<string, OfferRow[]>()
  for (const row of rows) {
    const list = byDate.get(row.flight_date) ?? []
    list.push(row)
    byDate.set(row.flight_date, list)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => {
      const milesWinner = minBy(
        group.filter((r): r is OfferRow & { miles: number } => r.miles != null),
        (r) => r.miles,
      )
      const cashWinner = minBy(
        group.filter(
          (r): r is OfferRow & { amount_brl: number } => r.amount_brl != null && isCashCompanionSource(r.source),
        ),
        (r) => r.amount_brl,
      )
      return {
        date,
        milhas: milesWinner?.miles ?? 0,
        brl: cashWinner?.amount_brl ?? 0,
        sampleSize: group.length,
        milesAirline: milesWinner ? airlineIdFromName(milesWinner.airline) : fallback,
        brlAirline: cashWinner ? airlineIdFromName(cashWinner.airline) : fallback,
      }
    })
}

export function chartFromRouteDayStats(
  days: SnapshotRouteDayStats[],
  offers: OfferRow[] = [],
  fallbackDestination = '',
  today = todayIso(),
): ChartPoint[] {
  const fromOffers = chartFromOffers(offers, fallbackDestination)
  const byDate = new Map(fromOffers.map((point) => [point.date, point]))
  const fallback = airlineForDestination(fallbackDestination)
  return [...days]
    .filter((day) => day.flight_date >= today)
    .sort((a, b) => a.flight_date.localeCompare(b.flight_date))
    .map((day) => {
      const row = byDate.get(day.flight_date)
      return {
        date: day.flight_date,
        milhas: day.min_miles ?? 0,
        brl: day.min_amount_brl ?? 0,
        sampleSize: day.snapshot_count,
        milesAirline: row?.milesAirline ?? fallback,
        brlAirline: row?.brlAirline ?? fallback,
      }
    })
}

import { formatShortDate } from '../lib/format.ts'
import { isoFromToday, ORIGIN, type Destination } from '../lib/query.ts'
import type { OfferRow } from '../types/priceSnapshot.ts'

function row(
  destination: Destination,
  offsetDays: number,
  fields: Omit<OfferRow, 'origin' | 'destination' | 'flight_date' | 'currency' | 'collected_at'>,
): OfferRow {
  return {
    origin: ORIGIN,
    destination,
    flight_date: isoFromToday(offsetDays),
    currency: 'BRL',
    collected_at: `${isoFromToday(0)}T12:00:00Z`,
    ...fields,
  }
}

/** Local stubs only — PET one-way to GRU / CGH / VCP. Includes a past row per dest (filtered out). */
export const PLACEHOLDER_OFFERS: OfferRow[] = [
  row('GRU', -4, {
    airline: 'GOL',
    program: 'Smiles',
    miles: 12_000,
    amount_brl: 540,
    taxes_brl: 58,
    source: 'Worker',
    milheiro: 13.4,
  }),
  row('GRU', 6, {
    airline: 'GOL',
    program: 'Smiles',
    departure_time: '06:40',
    miles: 16_000,
    amount_brl: 890,
    taxes_brl: 72,
    source: 'Seats.aero',
    milheiro: 15.8,
  }),
  row('GRU', 6, {
    airline: 'LATAM',
    program: 'Latam Pass',
    departure_time: '09:15',
    miles: 14_500,
    amount_brl: 940,
    taxes_brl: 81,
    source: 'Worker',
    milheiro: 14.2,
  }),
  row('GRU', 13, {
    airline: 'AZUL',
    program: 'TudoAzul',
    departure_time: '18:20',
    miles: 18_000,
    amount_brl: 760,
    taxes_brl: 69,
    source: 'ExpertFlyer',
    milheiro: 16.9,
  }),
  row('GRU', 21, {
    airline: 'GOL',
    program: 'Smiles',
    departure_time: '07:05',
    miles: 13_800,
    amount_brl: 1_120,
    taxes_brl: 64,
    source: 'Seats.aero',
    milheiro: 13.9,
  }),
  row('GRU', 34, {
    airline: 'LATAM',
    program: 'Latam Pass',
    departure_time: '12:40',
    miles: 17_200,
    amount_brl: 810,
    taxes_brl: 88,
    source: 'Worker',
    milheiro: 17.4,
  }),

  row('CGH', -3, {
    airline: 'GOL',
    program: 'Smiles',
    miles: 11_000,
    amount_brl: 480,
    taxes_brl: 55,
    source: 'Worker',
    milheiro: 12.8,
  }),
  row('CGH', 5, {
    airline: 'GOL',
    program: 'Smiles',
    departure_time: '08:10',
    miles: 12_400,
    amount_brl: 720,
    taxes_brl: 61,
    source: 'Seats.aero',
    milheiro: 13.1,
  }),
  row('CGH', 12, {
    airline: 'LATAM',
    program: 'Latam Pass',
    departure_time: '15:30',
    miles: 15_000,
    amount_brl: 690,
    taxes_brl: 77,
    source: 'Worker',
    milheiro: 14.8,
  }),
  row('CGH', 19, {
    airline: 'GOL',
    program: 'Smiles',
    departure_time: '06:55',
    miles: 11_800,
    amount_brl: 840,
    taxes_brl: 59,
    source: 'ExpertFlyer',
    milheiro: 12.6,
  }),
  row('CGH', 28, {
    airline: 'AZUL',
    program: 'TudoAzul',
    departure_time: '19:45',
    miles: 16_500,
    amount_brl: 910,
    taxes_brl: 70,
    source: 'Seats.aero',
    milheiro: 16.2,
  }),

  row('VCP', -2, {
    airline: 'AZUL',
    program: 'TudoAzul',
    miles: 13_000,
    amount_brl: 610,
    taxes_brl: 62,
    source: 'Worker',
    milheiro: 14.0,
  }),
  row('VCP', 8, {
    airline: 'AZUL',
    program: 'TudoAzul',
    departure_time: '10:25',
    miles: 14_200,
    amount_brl: 650,
    taxes_brl: 66,
    source: 'Seats.aero',
    milheiro: 14.6,
  }),
  row('VCP', 16, {
    airline: 'AZUL',
    program: 'TudoAzul',
    departure_time: '16:10',
    miles: 19_000,
    amount_brl: 580,
    taxes_brl: 74,
    source: 'Worker',
    milheiro: 17.1,
  }),
  row('VCP', 27, {
    airline: 'GOL',
    program: 'Smiles',
    departure_time: '13:50',
    miles: 21_500,
    amount_brl: 990,
    taxes_brl: 83,
    source: 'ExpertFlyer',
    milheiro: 18.8,
  }),
]

export type KpiModel = {
  menorMilhas: { value: number; caption: string } | null
  menorBrl: { value: number; caption: string } | null
  melhorMilheiro: { value: number; caption: string } | null
}

export function kpisFromOffers(rows: OfferRow[]): KpiModel {
  if (rows.length === 0) {
    return { menorMilhas: null, menorBrl: null, melhorMilheiro: null }
  }

  const fewestMiles = rows.reduce((acc, row) =>
    (row.miles ?? Infinity) < (acc.miles ?? Infinity) ? row : acc,
  )
  const lowestCash = rows.reduce((acc, row) =>
    (row.amount_brl ?? Infinity) < (acc.amount_brl ?? Infinity) ? row : acc,
  )
  const bestMilheiro = rows.reduce((acc, row) => (row.milheiro < acc.milheiro ? row : acc))

  return {
    menorMilhas: {
      value: fewestMiles.miles ?? 0,
      caption: `${fewestMiles.program} · ${formatShortDate(fewestMiles.flight_date)}`,
    },
    menorBrl: {
      value: lowestCash.amount_brl ?? 0,
      caption: `${lowestCash.airline} · ${formatShortDate(lowestCash.flight_date)}`,
    },
    melhorMilheiro: {
      value: bestMilheiro.milheiro,
      caption: `${bestMilheiro.program} · ${formatShortDate(bestMilheiro.flight_date)}`,
    },
  }
}

export type ChartPoint = {
  date: string
  milhas: number
  brl: number
  sampleSize: number
}

export function chartFromOffers(rows: OfferRow[]): ChartPoint[] {
  const byDate = new Map<string, OfferRow[]>()
  for (const row of rows) {
    const list = byDate.get(row.flight_date) ?? []
    list.push(row)
    byDate.set(row.flight_date, list)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => {
      const miles = group.map((r) => r.miles).filter((n): n is number => n != null)
      const cash = group.map((r) => r.amount_brl).filter((n): n is number => n != null)
      return {
        date,
        milhas: miles.length ? Math.min(...miles) : 0,
        brl: cash.length ? Math.min(...cash) : 0,
        sampleSize: group.length,
      }
    })
}

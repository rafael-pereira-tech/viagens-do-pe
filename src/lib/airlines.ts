/** Primary airline for each dashboard destination tab (route matrix). */
export type AirlineId = 'AZUL' | 'GOL' | 'LATAM' | 'OTHER'

export const DESTINATION_AIRLINE = {
  VCP: 'AZUL',
  CGH: 'GOL',
  GRU: 'LATAM',
} as const satisfies Record<string, AirlineId>

export type DestinationAirline = (typeof DESTINATION_AIRLINE)[keyof typeof DESTINATION_AIRLINE]

/** D-2.1 chart fills: miles = brand, BRL = soft companion. */
export type AirlineChartFills = {
  miles: string
  brl: string
  selection: string
  legendMilesClass: string
  legendBrlClass: string
  label: string
}

const FILLS: Record<AirlineId, AirlineChartFills> = {
  AZUL: {
    miles: 'hsl(var(--airline-azul))',
    brl: 'hsl(var(--airline-azul-soft))',
    selection: 'hsl(var(--airline-azul) / 0.12)',
    legendMilesClass: 'bg-airline-azul',
    legendBrlClass: 'bg-airline-azul-soft',
    label: 'Azul',
  },
  GOL: {
    miles: 'hsl(var(--airline-gol))',
    brl: 'hsl(var(--airline-gol-soft))',
    selection: 'hsl(var(--airline-gol) / 0.12)',
    legendMilesClass: 'bg-airline-gol',
    legendBrlClass: 'bg-airline-gol-soft',
    label: 'GOL',
  },
  LATAM: {
    miles: 'hsl(var(--airline-latam))',
    brl: 'hsl(var(--airline-latam-soft))',
    selection: 'hsl(var(--airline-latam) / 0.12)',
    legendMilesClass: 'bg-airline-latam',
    legendBrlClass: 'bg-airline-latam-soft',
    label: 'LATAM',
  },
  OTHER: {
    miles: 'hsl(var(--airline-other))',
    brl: 'hsl(var(--airline-other-soft))',
    selection: 'hsl(var(--airline-other) / 0.12)',
    legendMilesClass: 'bg-airline-other',
    legendBrlClass: 'bg-airline-other-soft',
    label: 'Outra',
  },
}

/** Designer map: GOL→gol, AZUL→azul, LATAM→latam. */
export function airlineIdFromName(airline: string | null | undefined): AirlineId {
  if (!airline) return 'OTHER'
  const n = airline.trim().toUpperCase()
  if (n === 'AZUL' || n.includes('AZUL')) return 'AZUL'
  if (n === 'GOL' || n.includes('GOL')) return 'GOL'
  if (n === 'LATAM' || n.includes('LATAM')) return 'LATAM'
  return 'OTHER'
}

export function airlineForDestination(destination: string): AirlineId {
  const key = destination.toUpperCase()
  if (key in DESTINATION_AIRLINE) {
    return DESTINATION_AIRLINE[key as keyof typeof DESTINATION_AIRLINE]
  }
  return 'OTHER'
}

export function chartFillsForAirline(airline: AirlineId | string): AirlineChartFills {
  const id =
    airline === 'AZUL' || airline === 'GOL' || airline === 'LATAM' || airline === 'OTHER'
      ? airline
      : airlineIdFromName(airline)
  return FILLS[id]
}

/**
 * Fallback when a day has no winning-cia on the row (stats-only path).
 * Per-bar fills should use `chartFillsForAirline` of that metric's winner.
 */
export function chartFillsForDestination(destination: string): AirlineChartFills {
  return FILLS[airlineForDestination(destination)]
}

export const AIRLINE_LEGEND: { id: AirlineId; label: string }[] = [
  { id: 'AZUL', label: 'Azul' },
  { id: 'GOL', label: 'GOL' },
  { id: 'LATAM', label: 'LATAM' },
]

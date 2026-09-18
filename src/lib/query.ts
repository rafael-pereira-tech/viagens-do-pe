export const ORIGIN = 'PET' as const

export const DESTINATIONS = ['GRU', 'CGH', 'VCP'] as const
export type Destination = (typeof DESTINATIONS)[number]

export const AIRPORT_LABEL: Record<Destination, string> = {
  GRU: 'Guarulhos',
  CGH: 'Congonhas',
  VCP: 'Viracopos',
}

export type ChartMode = 'both' | 'milhas' | 'brl'

/** PET → SP hub (`ida`) or hub → PET (`volta`). */
export type Sentido = 'ida' | 'volta'

export type UiState = '' | 'loading' | 'error' | 'empty'

/** Always production (`live`) in the dashboard; include/only kept for filter plumbing. */
export type DryMode = 'live' | 'include' | 'only'

export type DashboardQuery = {
  to: Destination
  sentido: Sentido
  from: string
  until: string
  fonte: string
  dia: string
  bars: ChartMode
  ui: UiState
  dryMode: DryMode
}

export const defaultQuery: DashboardQuery = {
  to: 'GRU',
  sentido: 'ida',
  from: '',
  until: '',
  fonte: '',
  dia: '',
  bars: 'both',
  ui: '',
  dryMode: 'live',
}

function isUiState(value: string): value is UiState {
  return value === 'loading' || value === 'error' || value === 'empty'
}

function isDestination(value: string): value is Destination {
  return (DESTINATIONS as readonly string[]).includes(value)
}

function isChartMode(value: string): value is ChartMode {
  return value === 'both' || value === 'milhas' || value === 'brl'
}

/** Always `live`; URL dry/dry_run/live flags are ignored. */
export function parseDryMode(): DryMode {
  return 'live'
}

export function parseQuery(params: URLSearchParams): DashboardQuery {
  const toParam = (params.get('to') ?? '').toUpperCase()
  const barsParam = params.get('bars') ?? ''
  const uiParam = params.get('ui') ?? ''
  const sentidoParam = (params.get('sentido') ?? params.get('dir') ?? '').toLowerCase()
  const sentido: Sentido = sentidoParam === 'volta' || sentidoParam === 'back' ? 'volta' : 'ida'
  return {
    to: isDestination(toParam) ? toParam : 'GRU',
    sentido,
    from: params.get('from') ?? '',
    until: params.get('until') ?? '',
    // Always all fontes — ignore ?fonte=
    fonte: '',
    dia: params.get('dia') ?? '',
    bars: isChartMode(barsParam) ? barsParam : 'both',
    ui: isUiState(uiParam) ? uiParam : '',
    // Always production — ignore ?dry= / ?dry_run= / ?live=
    dryMode: 'live',
  }
}

export function queryToSearchParams(query: DashboardQuery): URLSearchParams {
  const params = new URLSearchParams()
  params.set('to', query.to)
  if (query.sentido === 'volta') params.set('sentido', 'volta')
  if (query.from) params.set('from', query.from)
  if (query.until) params.set('until', query.until)
  // Never persist fonte / dry_run — always all fontes + production
  if (query.dia) params.set('dia', query.dia)
  if (query.bars !== 'both') params.set('bars', query.bars)
  if (query.ui) params.set('ui', query.ui)
  params.set('live', '1')
  return params
}

export function todayIso(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isoFromToday(offsetDays: number, d = new Date()): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)
  copy.setDate(copy.getDate() + offsetDays)
  return todayIso(copy)
}

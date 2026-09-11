export const ORIGIN = 'PET' as const

export const DESTINATIONS = ['GRU', 'CGH', 'VCP'] as const
export type Destination = (typeof DESTINATIONS)[number]

export const AIRPORT_LABEL: Record<Destination, string> = {
  GRU: 'Guarulhos',
  CGH: 'Congonhas',
  VCP: 'Viracopos',
}

export type ChartMode = 'both' | 'milhas' | 'brl'

/** Prod default excludes fixtures. `include` = ?dry=1. `only` = ?dry_run=1 smoke. */
export type DryMode = 'live' | 'include' | 'only'

export type DashboardQuery = {
  to: Destination
  from: string
  until: string
  fonte: string
  dia: string
  bars: ChartMode
  ui: '' | 'loading'
  dryMode: DryMode
}

export const defaultQuery: DashboardQuery = {
  to: 'GRU',
  from: '',
  until: '',
  fonte: '',
  dia: '',
  bars: 'both',
  ui: '',
  dryMode: 'live',
}

function isDestination(value: string): value is Destination {
  return (DESTINATIONS as readonly string[]).includes(value)
}

function isChartMode(value: string): value is ChartMode {
  return value === 'both' || value === 'milhas' || value === 'brl'
}

export function parseDryMode(params: URLSearchParams): DryMode {
  const only = (params.get('dry_run') ?? '').toLowerCase()
  if (only === '1' || only === 'true' || only === 'only') return 'only'
  const include = (params.get('dry') ?? '').toLowerCase()
  if (include === '1' || include === 'true') return 'include'
  return 'live'
}

export function parseQuery(params: URLSearchParams): DashboardQuery {
  const toParam = (params.get('to') ?? '').toUpperCase()
  const barsParam = params.get('bars') ?? ''
  const uiParam = params.get('ui') ?? ''
  return {
    to: isDestination(toParam) ? toParam : 'GRU',
    from: params.get('from') ?? '',
    until: params.get('until') ?? '',
    fonte: params.get('fonte') ?? '',
    dia: params.get('dia') ?? '',
    bars: isChartMode(barsParam) ? barsParam : 'both',
    ui: uiParam === 'loading' ? 'loading' : '',
    dryMode: parseDryMode(params),
  }
}

export function queryToSearchParams(query: DashboardQuery): URLSearchParams {
  const params = new URLSearchParams()
  params.set('to', query.to)
  if (query.from) params.set('from', query.from)
  if (query.until) params.set('until', query.until)
  if (query.fonte) params.set('fonte', query.fonte)
  if (query.dia) params.set('dia', query.dia)
  if (query.bars !== 'both') params.set('bars', query.bars)
  if (query.ui) params.set('ui', query.ui)
  if (query.dryMode === 'only') params.set('dry_run', '1')
  if (query.dryMode === 'include') params.set('dry', '1')
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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ChartPoint } from '../data/placeholders.ts'
import {
  AIRLINE_LEGEND,
  chartFillsForAirline,
  chartFillsForDestination,
  type AirlineChartFills,
} from '../lib/airlines.ts'
import { formatBrl, formatMiles, formatShortDate } from '../lib/format.ts'
import { formatDeltaPct, significantDelta } from '../lib/history.ts'
import type { ChartMode } from '../lib/query.ts'
import { StateView } from './StateView.tsx'

type Props = {
  points: ChartPoint[]
  mode: ChartMode
  isLoading: boolean
  selectedDate: string
  destination: string
  /** e.g. "PET → CGH" or "CGH → PET" */
  routeLabel?: string
  onModeChange: (mode: ChartMode) => void
  onSelectDate: (isoDate: string) => void
  error?: string | null
  onRetry?: () => void
}

const MODES: { key: ChartMode; label: string }[] = [
  { key: 'both', label: 'Milhas+BRL' },
  { key: 'milhas', label: 'Só milhas' },
  { key: 'brl', label: 'Só BRL' },
]

export function ChartPanel({
  points,
  mode,
  isLoading,
  selectedDate,
  destination,
  routeLabel,
  onModeChange,
  onSelectDate,
  error,
  onRetry,
}: Props) {
  const fallbackFills = chartFillsForDestination(destination)
  const titleRoute = routeLabel ?? `PET → ${destination}`

  return (
    <Card size="sm" aria-label="Gráfico de ofertas futuras">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              <CardTitle className="cursor-help text-sm font-semibold">
                Ofertas futuras por data ({titleRoute})
              </CardTitle>
            </TooltipTrigger>
            <TooltipContent>
              Barras agrupadas milhas|BRL. Cor = cia vencedora daquele dia na métrica (não empilha 3 cias). Fallback da
              rota: {fallbackFills.label}. Marcador ±% só quando |Δ| ≥ 5 vs observation anterior.
            </TooltipContent>
          </Tooltip>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={mode}
            onValueChange={(value) => {
              if (value) onModeChange(value as ChartMode)
            }}
            aria-label="Série do gráfico"
          >
            {MODES.map((item) => (
              <ToggleGroupItem key={item.key} value={item.key}>
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div aria-busy="true">
            <Skeleton className="h-52 w-full" />
          </div>
        ) : error ? (
          <StateView
            variant="error"
            title="Não foi possível carregar o gráfico"
            description={error}
            actionLabel={onRetry ? 'Tentar de novo' : undefined}
            onAction={onRetry}
          />
        ) : points.length === 0 ? (
          <StateView
            variant="filtered-empty"
            title="Sem ofertas futuras nesta aba"
            description="Ajuste a janela ou a fonte e aplique novamente."
          />
        ) : (
          <GroupedBars
            points={points}
            mode={mode}
            selectedDate={selectedDate}
            fallbackFills={fallbackFills}
            onSelectDate={onSelectDate}
          />
        )}
      </CardContent>
    </Card>
  )
}

function seriesBars(
  gx: number,
  barW: number,
  milesH: number,
  brlH: number,
  showMiles: boolean,
  showBrl: boolean,
  milesFills: AirlineChartFills,
  brlFills: AirlineChartFills,
  milesDelta: number | null | undefined,
  brlDelta: number | null | undefined,
): { key: string; x: number; h: number; fill: string; deltaPct: number | null | undefined }[] {
  const bars: { key: string; x: number; h: number; fill: string; deltaPct: number | null | undefined }[] = []
  let x = gx
  if (showMiles) {
    bars.push({ key: 'milhas', x, h: milesH, fill: milesFills.miles, deltaPct: milesDelta })
    x += barW + 3
  }
  if (showBrl) {
    bars.push({ key: 'brl', x, h: brlH, fill: brlFills.brl, deltaPct: brlDelta })
  }
  return bars
}

function deltaMarker(deltaPct: number): { arrow: string; className: string } {
  if (deltaPct < 0) return { arrow: '▼', className: 'fill-emerald-700' }
  return { arrow: '▲', className: 'fill-amber-700' }
}

function historyTooltipLine(
  label: string,
  current: string,
  min: number | null | undefined,
  max: number | null | undefined,
  deltaPct: number | null | undefined,
  formatRange: (n: number) => string,
): string {
  const parts = [`${label} ${current}`]
  if (min != null && max != null) parts.push(`min–max ${formatRange(min)}–${formatRange(max)}`)
  if (deltaPct != null && Number.isFinite(deltaPct)) parts.push(`Δ ${formatDeltaPct(deltaPct)} vs ant.`)
  return parts.join(' · ')
}

function GroupedBars({
  points,
  mode,
  selectedDate,
  fallbackFills,
  onSelectDate,
}: {
  points: ChartPoint[]
  mode: ChartMode
  selectedDate: string
  fallbackFills: AirlineChartFills
  onSelectDate: (isoDate: string) => void
}) {
  const showMiles = mode === 'both' || mode === 'milhas'
  const showBrl = mode === 'both' || mode === 'brl'
  const series = Number(showMiles) + Number(showBrl)
  const height = 230
  const pad = { top: 28, right: 8, bottom: 36, left: 8 }
  const innerH = height - pad.top - pad.bottom
  const minGroupW = 44
  const innerW = Math.max(640 - pad.left - pad.right, points.length * minGroupW)
  const groupW = innerW / Math.max(points.length, 1)
  const gap = 8
  const barW = Math.max(8, (groupW - gap) / Math.max(series, 1))
  const width = pad.left + pad.right + innerW
  const maxMiles = Math.max(...points.map((p) => p.milhas), 1)
  const maxBrl = Math.max(...points.map((p) => p.brl), 1)

  return (
    <div className="mt-1">
      <div className="relative overflow-x-auto">
        <div className="relative" style={{ minWidth: width }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="pointer-events-none h-52 w-full"
            role="img"
            aria-hidden="true"
          >
            {points.map((point, i) => {
              const gx = pad.left + i * groupW + gap / 2
              const selected = point.date === selectedDate
              const milesFills = chartFillsForAirline(point.milesAirline)
              const brlFills = chartFillsForAirline(point.brlAirline)
              const bars = seriesBars(
                gx,
                barW,
                (point.milhas / maxMiles) * innerH,
                (point.brl / maxBrl) * innerH,
                showMiles,
                showBrl,
                milesFills,
                brlFills,
                point.milesDeltaPct,
                point.brlDeltaPct,
              )
              return (
                <g key={point.date}>
                  <rect
                    x={pad.left + i * groupW}
                    y={pad.top}
                    width={groupW}
                    height={innerH}
                    fill={selected ? milesFills.selection : 'transparent'}
                  />
                  {bars.map((bar) => {
                    const top = pad.top + innerH - bar.h
                    const showDelta = significantDelta(bar.deltaPct)
                    const marker = showDelta && bar.deltaPct != null ? deltaMarker(bar.deltaPct) : null
                    return (
                      <g key={bar.key}>
                        <rect
                          x={bar.x}
                          y={top}
                          width={barW}
                          height={bar.h}
                          rx="3"
                          fill={bar.fill}
                          opacity={selected ? 1 : 0.9}
                        />
                        {marker ? (
                          <text
                            x={bar.x + barW / 2}
                            y={Math.max(10, top - 4)}
                            textAnchor="middle"
                            className={marker.className}
                            fontSize="9"
                            fontWeight="600"
                          >
                            {marker.arrow}
                            {formatDeltaPct(bar.deltaPct!)}
                          </text>
                        ) : null}
                      </g>
                    )
                  })}
                  <text
                    x={pad.left + i * groupW + groupW / 2}
                    y={height - 12}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="11"
                  >
                    {formatShortDate(point.date)}
                  </text>
                </g>
              )
            })}
          </svg>
          <div className="absolute inset-0 flex pb-9" role="list" aria-label="Datas do gráfico">
            {points.map((point) => {
              const selected = point.date === selectedDate
              const milesLabel = chartFillsForAirline(point.milesAirline).label
              const brlLabel = chartFillsForAirline(point.brlAirline).label
              return (
                <Tooltip key={point.date} delayDuration={150}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      role="listitem"
                      className="h-full flex-1 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      aria-pressed={selected}
                      aria-label={`${formatShortDate(point.date)}: ${formatMiles(point.milhas)} milhas (${milesLabel}), ${formatBrl(point.brl, true)} (${brlLabel}), ${point.sampleSize} ofertas`}
                      onClick={() => onSelectDate(point.date)}
                    />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs tabular-nums">
                    <div className="font-medium">{formatShortDate(point.date)}</div>
                    <div>
                      {historyTooltipLine(
                        'Milhas',
                        `${formatMiles(point.milhas)} (${milesLabel})`,
                        point.milesMin,
                        point.milesMax,
                        point.milesDeltaPct,
                        formatMiles,
                      )}
                    </div>
                    <div>
                      {historyTooltipLine(
                        'BRL',
                        `${formatBrl(point.brl, true)} (${brlLabel})`,
                        point.brlMin,
                        point.brlMax,
                        point.brlDeltaPct,
                        (n) => formatBrl(n, true),
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {point.sampleSize} oferta{point.sampleSize === 1 ? '' : 's'}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {showMiles ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${fallbackFills.legendMilesClass}`} />
                Menor milhas · cor da cia vencedora
              </span>
            </TooltipTrigger>
            <TooltipContent>Cor da barra = cia da menor oferta de milhas daquele dia</TooltipContent>
          </Tooltip>
        ) : null}
        {showBrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${fallbackFills.legendBrlClass}`} />
                Menor cash (BRL) · soft da cia vencedora
              </span>
            </TooltipTrigger>
            <TooltipContent>Cor suave = cia do menor cash daquele dia. Não empilha 3 cias.</TooltipContent>
          </Tooltip>
        ) : null}
        <span className="inline-flex flex-wrap items-center gap-2" aria-label="Cores das cias">
          {AIRLINE_LEGEND.map((item) => {
            const fills = chartFillsForAirline(item.id)
            return (
              <span key={item.id} className="inline-flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-sm ${fills.legendMilesClass}`} />
                {item.label}
              </span>
            )
          })}
        </span>
      </div>
    </div>
  )
}

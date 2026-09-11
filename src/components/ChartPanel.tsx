import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ChartPoint } from '../data/placeholders.ts'
import { formatBrl, formatMiles, formatShortDate } from '../lib/format.ts'
import type { ChartMode } from '../lib/query.ts'
import { EmptyHint } from './EmptyHint.tsx'

type Props = {
  points: ChartPoint[]
  mode: ChartMode
  isLoading: boolean
  selectedDate: string
  destination: string
  onModeChange: (mode: ChartMode) => void
  onSelectDate: (isoDate: string) => void
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
  onModeChange,
  onSelectDate,
}: Props) {
  return (
    <Card size="sm" aria-label="Gráfico de ofertas futuras">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              <CardTitle className="cursor-help text-sm font-semibold">
                Ofertas futuras por data (PET → {destination})
              </CardTitle>
            </TooltipTrigger>
            <TooltipContent>
              Barras agrupadas pelas menores milhas e menor cash do dia. Clique numa data para filtrar a
              tabela.
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
        ) : points.length === 0 ? (
          <EmptyHint title="Sem ofertas futuras nesta aba" />
        ) : (
          <GroupedBars points={points} mode={mode} selectedDate={selectedDate} onSelectDate={onSelectDate} />
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
): { key: string; x: number; h: number; fill: string }[] {
  const bars: { key: string; x: number; h: number; fill: string }[] = []
  let x = gx
  if (showMiles) {
    bars.push({ key: 'milhas', x, h: milesH, fill: 'hsl(var(--chart-1))' })
    x += barW + 3
  }
  if (showBrl) {
    bars.push({ key: 'brl', x, h: brlH, fill: 'hsl(var(--chart-2))' })
  }
  return bars
}

function GroupedBars({
  points,
  mode,
  selectedDate,
  onSelectDate,
}: {
  points: ChartPoint[]
  mode: ChartMode
  selectedDate: string
  onSelectDate: (isoDate: string) => void
}) {
  const showMiles = mode === 'both' || mode === 'milhas'
  const showBrl = mode === 'both' || mode === 'brl'
  const series = Number(showMiles) + Number(showBrl)
  const width = 640
  const height = 230
  const pad = { top: 16, right: 8, bottom: 36, left: 8 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const groupW = innerW / points.length
  const gap = 10
  const barW = Math.max(8, (groupW - gap) / Math.max(series, 1))
  const maxMiles = Math.max(...points.map((p) => p.milhas), 1)
  const maxBrl = Math.max(...points.map((p) => p.brl), 1)

  return (
    <div className="relative mt-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="pointer-events-none h-52 w-full"
        role="img"
        aria-hidden="true"
      >
        {points.map((point, i) => {
          const gx = pad.left + i * groupW + gap / 2
          const selected = point.date === selectedDate
          const bars = seriesBars(
            gx,
            barW,
            (point.milhas / maxMiles) * innerH,
            (point.brl / maxBrl) * innerH,
            showMiles,
            showBrl,
          )
          return (
            <g key={point.date}>
              <rect
                x={pad.left + i * groupW}
                y={pad.top}
                width={groupW}
                height={innerH}
                fill={selected ? 'hsl(var(--primary) / 0.1)' : 'transparent'}
              />
              {bars.map((bar) => (
                <rect
                  key={bar.key}
                  x={bar.x}
                  y={pad.top + innerH - bar.h}
                  width={barW}
                  height={bar.h}
                  rx="3"
                  fill={bar.fill}
                  opacity={selected ? 1 : 0.9}
                />
              ))}
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
          return (
            <Tooltip key={point.date} delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="listitem"
                  className="h-full flex-1 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-pressed={selected}
                  aria-label={`${formatShortDate(point.date)}: ${formatMiles(point.milhas)} milhas, ${formatBrl(point.brl, true)}, ${point.sampleSize} ofertas`}
                  onClick={() => onSelectDate(point.date)}
                />
              </TooltipTrigger>
              <TooltipContent className="tabular-nums">
                <span className="font-medium">{formatShortDate(point.date)}</span>
                {' · '}
                {formatMiles(point.milhas)} milhas
                {' · '}
                {formatBrl(point.brl, true)}
                {' · '}
                {point.sampleSize} oferta{point.sampleSize === 1 ? '' : 's'}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {showMiles ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-chart-1" />
                Menor milhas no dia
              </span>
            </TooltipTrigger>
            <TooltipContent>Menor quantidade de milhas entre as ofertas daquele dia</TooltipContent>
          </Tooltip>
        ) : null}
        {showBrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-chart-2" />
                Menor cash (BRL) no dia
              </span>
            </TooltipTrigger>
            <TooltipContent>Menor preço em dinheiro (cash) entre as ofertas daquele dia</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}

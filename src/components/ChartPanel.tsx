import { useState } from 'react'
import type { ChartPoint } from '../data/placeholders.ts'
import { formatBrl, formatMiles, formatShortDate } from '../lib/format.ts'
import type { ChartMode } from '../lib/query.ts'
import { EmptyHint, Skeleton } from './Skeleton.tsx'

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
    <section className="rounded-2xl border border-dashed border-slate-200 p-4" aria-label="Gráfico de ofertas futuras">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Ofertas futuras por data (PET → {destination})
        </h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Série do gráfico">
          {MODES.map((item) => {
            const active = mode === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onModeChange(item.key)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium',
                  active ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
      {isLoading ? (
        <div className="mt-4" aria-busy="true">
          <Skeleton className="h-52 w-full" />
        </div>
      ) : points.length === 0 ? (
        <EmptyHint title="Sem ofertas futuras nesta aba" />
      ) : (
        <GroupedBars points={points} mode={mode} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      )}
    </section>
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
    bars.push({ key: 'milhas', x, h: milesH, fill: '#3b82f6' })
    x += barW + 3
  }
  if (showBrl) {
    bars.push({ key: 'brl', x, h: brlH, fill: '#94a3b8' })
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
  const [hover, setHover] = useState<ChartPoint | null>(null)
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
  const active = hover ?? points.find((p) => p.date === selectedDate) ?? null

  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label="Barras agrupadas por data futura">
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
            <g
              key={point.date}
              className="cursor-pointer"
              onMouseEnter={() => setHover(point)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelectDate(point.date)}
            >
              <rect
                x={pad.left + i * groupW}
                y={pad.top}
                width={groupW}
                height={innerH}
                fill={selected ? '#eff6ff' : 'transparent'}
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
                className="fill-slate-400"
                fontSize="11"
              >
                {formatShortDate(point.date)}
              </text>
            </g>
          )
        })}
      </svg>
      {active ? (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm">
          <span className="font-medium text-slate-900">{formatShortDate(active.date)}</span>
          {' · '}
          <span className="tabular-nums">{formatMiles(active.milhas)} milhas</span>
          {' · '}
          <span className="tabular-nums">{formatBrl(active.brl, true)}</span>
          {' · '}
          {active.sampleSize} oferta{active.sampleSize === 1 ? '' : 's'}
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {showMiles ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
            Menor milhas no dia
          </span>
        ) : null}
        {showBrl ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />
            Menor cash (BRL) no dia
          </span>
        ) : null}
      </div>
    </div>
  )
}

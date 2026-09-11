import { formatBrl, formatMiles, formatMilheiro } from '../lib/format.ts'
import type { KpiModel } from '../data/placeholders.ts'
import { Skeleton } from './Skeleton.tsx'

type Props = {
  kpis: KpiModel
  isLoading: boolean
}

export function KpiStrip({ kpis, isLoading }: Props) {
  if (isLoading) {
    return (
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Indicadores" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <article key={i} className="rounded-2xl border border-dashed border-slate-200 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-32" />
          </article>
        ))}
      </section>
    )
  }

  const cards = [
    {
      label: 'Menor milhas',
      value: kpis.menorMilhas ? formatMiles(kpis.menorMilhas.value) : '—',
      caption: kpis.menorMilhas?.caption ?? 'Sem ofertas futuras nesta aba',
    },
    {
      label: 'Menor BRL',
      value: kpis.menorBrl ? formatBrl(kpis.menorBrl.value, true) : '—',
      caption: kpis.menorBrl?.caption ?? 'Sem ofertas futuras nesta aba',
    },
    {
      label: 'Melhor milheiro',
      value: kpis.melhorMilheiro ? formatMilheiro(kpis.melhorMilheiro.value) : '—',
      caption: kpis.melhorMilheiro?.caption ?? 'Sem ofertas futuras nesta aba',
    },
  ]

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Indicadores">
      {cards.map((card) => (
        <article key={card.label} className="rounded-2xl border border-dashed border-slate-200 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{card.value}</p>
          <p className="mt-1 text-xs text-slate-500">{card.caption}</p>
        </article>
      ))}
    </section>
  )
}

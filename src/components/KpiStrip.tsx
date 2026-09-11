import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { KpiModel } from '../data/placeholders.ts'
import { formatBrl, formatMiles, formatMilheiro } from '../lib/format.ts'
import { FIELD_LABEL, KPI_VALUE } from '../lib/ui.ts'

type Props = {
  kpis: KpiModel
  isLoading: boolean
}

export function KpiStrip({ kpis, isLoading }: Props) {
  if (isLoading) {
    return (
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Indicadores" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} size="sm">
            <CardHeader>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-7 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
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
        <Card key={card.label} size="sm">
          <CardHeader>
            <CardDescription className={FIELD_LABEL}>{card.label}</CardDescription>
            <CardTitle className={`${KPI_VALUE} text-card-foreground`}>{card.value}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{card.caption}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}

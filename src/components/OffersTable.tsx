import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { OfferRow } from '../types/priceSnapshot.ts'
import { programLabel, sourceLabel } from '../lib/filters.ts'
import { formatBrl, formatMiles, formatMilheiro, formatShortDate } from '../lib/format.ts'
import { deltaBadgeLabel, significantDelta } from '../lib/history.ts'
import { FIELD_LABEL } from '../lib/ui.ts'
import { StateView } from './StateView.tsx'

type Props = {
  rows: OfferRow[]
  isLoading: boolean
  onResetFilters: () => void
  error?: string | null
  onRetry?: () => void
}

export function OffersTable({ rows, isLoading, onResetFilters, error, onRetry }: Props) {
  return (
    <Card size="sm" aria-label="Ofertas">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Ofertas futuras</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <StateView
            variant="error"
            title="Não foi possível carregar as ofertas"
            description={error}
            actionLabel={onRetry ? 'Tentar de novo' : undefined}
            onAction={onRetry}
          />
        ) : rows.length === 0 ? (
          <StateView
            variant="filtered-empty"
            title="Sem ofertas futuras nesta aba"
            description="Nenhuma oferta combina com os filtros atuais."
            actionLabel="Limpar filtros"
            onAction={onResetFilters}
          />
        ) : (
          <Table className="min-w-[48rem]" containerClassName="max-h-[min(28rem,70vh)]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className={FIELD_LABEL}>Data</TableHead>
                <TableHead className={FIELD_LABEL}>Cia / programa</TableHead>
                <TableHead className={FIELD_LABEL}>Fonte</TableHead>
                <TableHead className={`${FIELD_LABEL} text-right`}>Milhas</TableHead>
                <TableHead className={`${FIELD_LABEL} text-right`}>Paradas</TableHead>
                <TableHead className={`${FIELD_LABEL} text-right`}>Taxas (BRL)</TableHead>
                <TableHead className={`${FIELD_LABEL} text-right`}>Cash (BRL)</TableHead>
                <TableHead className={`${FIELD_LABEL} text-right`}>Milheiro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow
                  key={
                    row.id ??
                    `${row.destination}-${row.program}-${row.flight_date}-${row.source}-${row.airline}-${row.departure_time ?? index}`
                  }
                  className="odd:bg-muted/40"
                >
                  <TableCell className="text-card-foreground">{formatShortDate(row.flight_date)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.airline} · {programLabel(row.program)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{sourceLabel(row.source)}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-card-foreground">
                    <PriceCell
                      value={row.miles != null ? formatMiles(row.miles) : null}
                      deltaPct={row.milesDeltaPct}
                      min={row.milesMin}
                      max={row.milesMax}
                      formatRange={formatMiles}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-card-foreground">
                    {row.stops != null ? row.stops : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-card-foreground">
                    {row.taxes_brl != null ? formatBrl(row.taxes_brl, true) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-card-foreground">
                    <PriceCell
                      value={row.amount_brl != null ? formatBrl(row.amount_brl, true) : null}
                      deltaPct={row.brlDeltaPct}
                      min={row.brlMin}
                      max={row.brlMax}
                      formatRange={(n) => formatBrl(n, true)}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-card-foreground">
                    {row.milheiro != null ? formatMilheiro(row.milheiro) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function PriceCell({
  value,
  deltaPct,
  min,
  max,
  formatRange,
}: {
  value: string | null
  deltaPct?: number | null
  min?: number | null
  max?: number | null
  formatRange: (n: number) => string
}) {
  if (value == null) return <span className="tabular-nums">—</span>
  const showBadge = significantDelta(deltaPct)
  const drop = deltaPct != null && deltaPct < 0
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        {value}
        {showBadge && deltaPct != null ? (
          <Badge
            variant="outline"
            className={`px-1.5 py-0 text-[10px] font-semibold ${
              drop ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {deltaBadgeLabel(deltaPct)}
          </Badge>
        ) : null}
      </span>
      {min != null && max != null ? (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {formatRange(min)}–{formatRange(max)}
        </span>
      ) : null}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { OfferRow } from '../types/priceSnapshot.ts'
import { formatBrl, formatMiles, formatMilheiro, formatShortDate } from '../lib/format.ts'
import { FIELD_LABEL } from '../lib/ui.ts'
import { EmptyHint } from './EmptyHint.tsx'

type Props = {
  rows: OfferRow[]
  isLoading: boolean
  onResetFilters: () => void
}

export function OffersTable({ rows, isLoading, onResetFilters }: Props) {
  return (
    <Card size="sm" aria-label="Ofertas">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Ofertas futuras</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyHint title="Sem ofertas futuras nesta aba" actionLabel="Limpar filtros" onAction={onResetFilters} />
        ) : (
          <Table className="min-w-[48rem]" containerClassName="max-h-[min(28rem,70vh)]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className={FIELD_LABEL}>Data</TableHead>
                <TableHead className={FIELD_LABEL}>Cia / programa</TableHead>
                <TableHead className={FIELD_LABEL}>Fonte</TableHead>
                <TableHead className={`${FIELD_LABEL} text-right`}>Milhas</TableHead>
                <TableHead className={`${FIELD_LABEL} text-right`}>Taxas (BRL)</TableHead>
                <TableHead className={`${FIELD_LABEL} text-right`}>Cash (BRL)</TableHead>
                <TableHead className={`${FIELD_LABEL} text-right`}>Milheiro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.destination}-${row.program}-${row.flight_date}-${row.source}-${row.airline}`}
                  className="odd:bg-muted/40"
                >
                  <TableCell className="text-card-foreground">{formatShortDate(row.flight_date)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.airline} · {row.program}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.source}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-card-foreground">
                    {row.miles != null ? formatMiles(row.miles) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-card-foreground">
                    {row.taxes_brl != null ? formatBrl(row.taxes_brl, true) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-card-foreground">
                    {row.amount_brl != null ? formatBrl(row.amount_brl, true) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-card-foreground">
                    {formatMilheiro(row.milheiro)}
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

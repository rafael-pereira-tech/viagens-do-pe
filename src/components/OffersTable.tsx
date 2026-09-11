import type { OfferRow } from '../types/priceSnapshot.ts'
import { formatBrl, formatMiles, formatMilheiro, formatShortDate } from '../lib/format.ts'
import { EmptyHint, Skeleton } from './Skeleton.tsx'

type Props = {
  rows: OfferRow[]
  isLoading: boolean
  onResetFilters: () => void
}

export function OffersTable({ rows, isLoading, onResetFilters }: Props) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-200 p-3 sm:p-4" aria-label="Ofertas">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Ofertas futuras</h2>
      {isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyHint
          title="Sem ofertas futuras nesta aba"
          actionLabel="Limpar filtros"
          onAction={onResetFilters}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Cia / programa</th>
                <th className="px-3 py-2">Fonte</th>
                <th className="px-3 py-2 text-right">Milhas</th>
                <th className="px-3 py-2 text-right">Taxas (BRL)</th>
                <th className="px-3 py-2 text-right">Cash (BRL)</th>
                <th className="px-3 py-2 text-right">Milheiro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.destination}-${row.program}-${row.flight_date}-${row.source}-${row.airline}`}
                  className="border-b border-slate-50 last:border-0 odd:bg-slate-50/60"
                >
                  <td className="whitespace-nowrap px-3 py-3 text-slate-800">
                    {formatShortDate(row.flight_date)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {row.airline} · {row.program}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {row.source}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-800">
                    {row.miles != null ? formatMiles(row.miles) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-800">
                    {row.taxes_brl != null ? formatBrl(row.taxes_brl, true) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-800">
                    {row.amount_brl != null ? formatBrl(row.amount_brl, true) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-900">
                    {formatMilheiro(row.milheiro)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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

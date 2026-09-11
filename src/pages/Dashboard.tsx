import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ChartPanel } from '../components/ChartPanel.tsx'
import { DestinationTabs } from '../components/DestinationTabs.tsx'
import { FiltersBar } from '../components/FiltersBar.tsx'
import { KpiStrip } from '../components/KpiStrip.tsx'
import { OffersTable } from '../components/OffersTable.tsx'
import { chartFromOffers, chartFromRouteDayStats, kpisFromOffers, PLACEHOLDER_OFFERS } from '../data/placeholders.ts'
import { useDashboardSnapshots } from '../hooks/useDashboardSnapshots.ts'
import { CAN_FETCH_SNAPSHOTS } from '../lib/config.ts'
import { applyQuery } from '../lib/filters.ts'
import { formatShortDate } from '../lib/format.ts'
import {
  defaultQuery,
  parseQuery,
  queryToSearchParams,
  todayIso,
  type ChartMode,
  type DashboardQuery,
  type Destination,
} from '../lib/query.ts'

type FilterDraft = Pick<DashboardQuery, 'from' | 'until' | 'fonte'>

function toDraft(query: DashboardQuery): FilterDraft {
  return { from: query.from, until: query.until, fonte: query.fonte }
}

function draftKey(draft: FilterDraft): string {
  return `${draft.from}|${draft.until}|${draft.fonte}`
}

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const applied = useMemo(() => parseQuery(searchParams), [searchParams])
  const urlDraft = toDraft(applied)
  const [draft, setDraft] = useState(urlDraft)
  const [syncedKey, setSyncedKey] = useState(draftKey(urlDraft))
  const nextKey = draftKey(urlDraft)
  if (syncedKey !== nextKey) {
    setSyncedKey(nextKey)
    setDraft(urlDraft)
  }

  useEffect(() => {
    if (!searchParams.has('to')) {
      setSearchParams(queryToSearchParams(applied), { replace: true })
    }
  }, [applied, searchParams, setSearchParams])

  const live = CAN_FETCH_SNAPSHOTS
  const remote = useDashboardSnapshots(applied)
  const sourceRows = live ? remote.offers : PLACEHOLDER_OFFERS
  const tabRows = useMemo(() => applyQuery(sourceRows, applied, { ignoreDay: true }), [applied, sourceRows])
  const rows = useMemo(() => applyQuery(sourceRows, applied), [applied, sourceRows])
  const kpis = kpisFromOffers(tabRows, live ? remote.windowStats : undefined)
  const chart = live && remote.routeDay.length > 0 ? chartFromRouteDayStats(remote.routeDay) : chartFromOffers(tabRows)
  const isLoading = applied.ui === 'loading' || (live && remote.isLoading)
  const forcedError = applied.ui === 'error' ? 'Erro simulado via ?ui=error — verifique o retry.' : null
  const forcedEmpty = applied.ui === 'empty'
  const effectiveError = forcedError ?? remote.error
  const effectiveIsLoading = forcedEmpty ? false : isLoading
  const effectiveRows = forcedEmpty ? [] : rows
  const effectivePoints = forcedEmpty ? [] : chart
  const effectiveKpis = forcedEmpty ? kpisFromOffers([], undefined) : kpis

  function commit(next: DashboardQuery) {
    setSearchParams(queryToSearchParams(next), { replace: true })
  }

  function applyFilters() {
    const today = todayIso()
    const from = draft.from && draft.from < today ? today : draft.from
    const until = draft.until && draft.until < today ? today : draft.until
    commit({ ...applied, from, until, fonte: draft.fonte, dia: '' })
  }

  function clearFilters() {
    commit({
      ...defaultQuery,
      to: applied.to,
      bars: applied.bars,
      ui: applied.ui,
      dry: applied.dry,
    })
  }

  function onTab(to: Destination) {
    commit({ ...applied, to, dia: '' })
  }

  function onBars(bars: ChartMode) {
    commit({ ...applied, bars })
  }

  function onSelectDate(isoDate: string) {
    commit({ ...applied, dia: applied.dia === isoDate ? '' : isoDate })
  }

  return (
    <div className="flex flex-col gap-4">
      <DestinationTabs active={applied.to} onChange={onTab} />
      <FiltersBar
        draft={draft}
        onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onApply={applyFilters}
        onClear={clearFilters}
        isLoading={effectiveIsLoading}
      />
      {effectiveError ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{effectiveError}</p>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={remote.refresh}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      <KpiStrip kpis={effectiveKpis} isLoading={effectiveIsLoading} error={effectiveError} onRetry={remote.refresh} />
      <ChartPanel
        points={effectivePoints}
        mode={applied.bars}
        isLoading={effectiveIsLoading}
        selectedDate={applied.dia}
        destination={applied.to}
        onModeChange={onBars}
        onSelectDate={onSelectDate}
        error={effectiveError}
        onRetry={remote.refresh}
      />
      {applied.dia ? (
        <p className="text-xs text-muted-foreground">
          Tabela filtrada por {formatShortDate(applied.dia)}. Clique de novo na barra para limpar o dia.
        </p>
      ) : null}
      <OffersTable
        rows={effectiveIsLoading ? [] : effectiveRows}
        isLoading={effectiveIsLoading}
        onResetFilters={clearFilters}
        error={effectiveError}
        onRetry={remote.refresh}
      />
    </div>
  )
}

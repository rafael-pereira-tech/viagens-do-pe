import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ChartPanel } from '../components/ChartPanel.tsx'
import { DestinationTabs } from '../components/DestinationTabs.tsx'
import { FiltersBar } from '../components/FiltersBar.tsx'
import { KpiStrip } from '../components/KpiStrip.tsx'
import { PriceDataStatus } from '../components/PriceDataStatus.tsx'
import { OffersTable } from '../components/OffersTable.tsx'
import { chartFromOffers, chartFromRouteDayStats, kpisFromOffers, PLACEHOLDER_OFFERS } from '../data/placeholders.ts'
import { useDashboardSnapshots } from '../hooks/useDashboardSnapshots.ts'
import { CAN_FETCH_SNAPSHOTS, CONFIG_ERROR } from '../lib/config.ts'
import { applyQuery } from '../lib/filters.ts'
import { formatShortDate } from '../lib/format.ts'
import { attachChartHistory } from '../lib/history.ts'
import {
  defaultQuery,
  parseQuery,
  queryToSearchParams,
  todayIso,
  type ChartMode,
  type DashboardQuery,
  type Destination,
  type Sentido,
} from '../lib/query.ts'
import { track } from '../lib/track.ts'

type FilterDraft = Pick<DashboardQuery, 'from' | 'until'>

function toDraft(query: DashboardQuery): FilterDraft {
  return { from: query.from, until: query.until }
}

function draftKey(draft: FilterDraft): string {
  return `${draft.from}|${draft.until}`
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

  useEffect(() => {
    track('page_view')
  }, [])

  const live = CAN_FETCH_SNAPSHOTS
  const remote = useDashboardSnapshots(applied)
  const sourceRows = useMemo(
    () => (live ? remote.offers : CONFIG_ERROR ? [] : PLACEHOLDER_OFFERS),
    [live, remote.offers],
  )
  const demo = !live && !CONFIG_ERROR
  // Demo fixtures are tagged dry-run; live requests keep the production filter.
  const displayQuery = useMemo(() => (demo ? { ...applied, dryMode: 'include' as const } : applied), [demo, applied])
  const tabRows = useMemo(() => applyQuery(sourceRows, displayQuery, { ignoreDay: true }), [displayQuery, sourceRows])
  const rows = useMemo(() => applyQuery(sourceRows, displayQuery), [displayQuery, sourceRows])
  const useApiStats = live
  const kpis = kpisFromOffers(tabRows, useApiStats ? remote.windowStats : undefined)
  const chartBase =
    useApiStats && remote.routeDay.length > 0
      ? chartFromRouteDayStats(remote.routeDay, tabRows, applied.to)
      : chartFromOffers(tabRows, applied.to)
  const chart = attachChartHistory(chartBase, remote.observationDays)
  const isLoading = applied.ui === 'loading' || (live && remote.isLoading)
  const forcedError = applied.ui === 'error' ? 'Erro simulado via ?ui=error — verifique o retry.' : null
  const forcedEmpty = applied.ui === 'empty'
  const effectiveError = forcedError ?? (forcedEmpty ? null : (CONFIG_ERROR ?? remote.error))
  const effectiveIsLoading = forcedEmpty ? false : isLoading
  const effectiveRows = forcedEmpty ? [] : rows
  const effectivePoints = forcedEmpty ? [] : chart
  const effectiveKpis = forcedEmpty ? kpisFromOffers([], undefined) : kpis

  function commit(next: DashboardQuery) {
    setSearchParams(queryToSearchParams({ ...next, fonte: '', dryMode: 'live' }), { replace: true })
  }

  function applyFilters() {
    const today = todayIso()
    const from = draft.from && draft.from < today ? today : draft.from
    const until = draft.until && draft.until < today ? today : draft.until
    track('filter_apply', { from: from || null, until: until || null })
    commit({ ...applied, from, until, fonte: '', dryMode: 'live', dia: '' })
  }

  function clearFilters() {
    commit({
      ...defaultQuery,
      to: applied.to,
      sentido: applied.sentido,
      bars: applied.bars,
      ui: applied.ui,
    })
  }

  function onTab(to: Destination) {
    track('tab_change', { to })
    commit({ ...applied, to, dia: '' })
  }

  function onSentido(sentido: Sentido) {
    commit({ ...applied, sentido, dia: '' })
  }

  function onBars(bars: ChartMode) {
    commit({ ...applied, bars })
  }

  function onSelectDate(isoDate: string) {
    track('chart_click', { date: isoDate, to: applied.to })
    commit({ ...applied, dia: applied.dia === isoDate ? '' : isoDate })
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Passagens entre Pelotas e São Paulo</h1>
        <p className="mt-2 text-sm text-muted-foreground">Compare datas, preços em reais e opções com milhas.</p>
      </header>
      <PriceDataStatus demo={demo} rows={effectiveRows} isLoading={effectiveIsLoading} error={effectiveError} />
      <DestinationTabs active={applied.to} sentido={applied.sentido} onChange={onTab} onSentidoChange={onSentido} />
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
        routeLabel={applied.sentido === 'volta' ? `${applied.to} → PET` : `PET → ${applied.to}`}
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

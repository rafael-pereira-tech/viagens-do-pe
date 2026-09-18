import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  attachClassicMilheiros,
  describeFetchError,
  fetchLatestSnapshots,
  fetchObservationSummary,
  fetchSnapshotStats,
  liveDashboardQuery,
  toOfferRow,
} from '../lib/api.ts'
import { CAN_FETCH_SNAPSHOTS } from '../lib/config.ts'
import { attachOfferHistory, type ObservationDaySummary } from '../lib/history.ts'
import type { DashboardQuery } from '../lib/query.ts'
import type { SnapshotRouteDayStats, SnapshotWindowStats } from '../types/api.ts'
import type { OfferRow } from '../types/priceSnapshot.ts'

export type DashboardSnapshots = {
  offers: OfferRow[]
  observationDays: ObservationDaySummary[]
  windowStats: SnapshotWindowStats | null
  routeDay: SnapshotRouteDayStats[]
  isLoading: boolean
  error: string | null
  refresh: () => void
}

function windowStatsFrom(data: SnapshotWindowStats | SnapshotRouteDayStats[]): SnapshotWindowStats | null {
  return Array.isArray(data) ? null : data
}

function routeDayFrom(data: SnapshotWindowStats | SnapshotRouteDayStats[]): SnapshotRouteDayStats[] {
  return Array.isArray(data) ? data : []
}

export function useDashboardSnapshots(query: DashboardQuery): DashboardSnapshots {
  const live = CAN_FETCH_SNAPSHOTS
  const filters = useMemo(
    () =>
      liveDashboardQuery({
        to: query.to,
        sentido: query.sentido,
        from: query.from,
        until: query.until,
        fonte: query.fonte,
        dryMode: query.dryMode,
        dia: '',
        bars: 'both',
        ui: '',
      }),
    [query.to, query.sentido, query.from, query.until, query.fonte, query.dryMode],
  )
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [observationDays, setObservationDays] = useState<ObservationDaySummary[]>([])
  const [windowStats, setWindowStats] = useState<SnapshotWindowStats | null>(null)
  const [routeDay, setRouteDay] = useState<SnapshotRouteDayStats[]>([])
  const [isLoading, setIsLoading] = useState(live)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!live) {
      setOffers([])
      setObservationDays([])
      setWindowStats(null)
      setRouteDay([])
      setError(null)
      setIsLoading(false)
      return
    }

    const ac = new AbortController()
    setIsLoading(true)
    setError(null)

    const { signal } = ac
    const dryOnly = query.dryMode === 'only'
    const summaryQuery = {
      origin: filters.origin,
      destination: filters.destination,
      flight_date_from: filters.flight_date_from,
      flight_date_to: filters.flight_date_to,
    }

    Promise.all([
      fetchLatestSnapshots(filters, { signal }),
      dryOnly ? Promise.resolve(null) : fetchSnapshotStats({ ...filters, group_by: 'window' }, { signal }),
      dryOnly ? Promise.resolve(null) : fetchSnapshotStats({ ...filters, group_by: 'route_day' }, { signal }),
      // History is optional — empty until cron has ≥2 observations; never block the dashboard.
      dryOnly ? Promise.resolve(null) : fetchObservationSummary(summaryQuery, { signal }).catch(() => null),
    ])
      .then(([latest, windowRes, dayRes, summary]) => {
        const base = attachClassicMilheiros(latest.data.map(toOfferRow))
        setOffers(summary ? attachOfferHistory(base, summary.data.by_source) : base)
        setObservationDays(summary?.data.by_day ?? [])
        setWindowStats(windowRes ? windowStatsFrom(windowRes.data) : null)
        setRouteDay(dayRes ? routeDayFrom(dayRes.data) : [])
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        if (signal.aborted) return
        setOffers([])
        setObservationDays([])
        setWindowStats(null)
        setRouteDay([])
        setError(describeFetchError(err))
        setIsLoading(false)
      })

    return () => ac.abort()
  }, [filters, live, nonce, query.dryMode])

  return { offers, observationDays, windowStats, routeDay, isLoading, error, refresh }
}

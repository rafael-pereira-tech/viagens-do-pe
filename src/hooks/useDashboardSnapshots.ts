import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchLatestSnapshots, fetchSnapshotStats, liveDashboardQuery, toOfferRow } from '../lib/api.ts'
import { API_URL } from '../lib/config.ts'
import type { DashboardQuery } from '../lib/query.ts'
import type { SnapshotRouteDayStats, SnapshotWindowStats } from '../types/api.ts'
import type { OfferRow } from '../types/priceSnapshot.ts'

export type DashboardSnapshots = {
  offers: OfferRow[]
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
  const live = Boolean(API_URL)
  const filters = useMemo(
    () =>
      liveDashboardQuery({
        to: query.to,
        from: query.from,
        until: query.until,
        fonte: query.fonte,
        dry: query.dry,
        dia: '',
        bars: 'both',
        ui: '',
      }),
    [query.to, query.from, query.until, query.fonte, query.dry],
  )
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [windowStats, setWindowStats] = useState<SnapshotWindowStats | null>(null)
  const [routeDay, setRouteDay] = useState<SnapshotRouteDayStats[]>([])
  const [isLoading, setIsLoading] = useState(live)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!live) {
      setOffers([])
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
    Promise.all([
      fetchLatestSnapshots(filters, { signal }),
      fetchSnapshotStats({ ...filters, group_by: 'window' }, { signal }),
      fetchSnapshotStats({ ...filters, group_by: 'route_day' }, { signal }),
    ])
      .then(([latest, windowRes, dayRes]) => {
        setOffers(latest.data.map(toOfferRow))
        setWindowStats(windowStatsFrom(windowRes.data))
        setRouteDay(routeDayFrom(dayRes.data))
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        if (signal.aborted) return
        const detail = err instanceof Error ? err.message : 'erro desconhecido'
        setOffers([])
        setWindowStats(null)
        setRouteDay([])
        setError(`Não foi possível carregar as ofertas (${detail}).`)
        setIsLoading(false)
      })

    return () => ac.abort()
  }, [filters, live, nonce])

  return { offers, windowStats, routeDay, isLoading, error, refresh }
}

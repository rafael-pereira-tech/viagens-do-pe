import { describe, expect, it } from 'vitest'
import {
  attachChartHistory,
  attachOfferHistory,
  deltaBadgeLabel,
  formatDeltaPct,
  HISTORY_DELTA_THRESHOLD,
  significantDelta,
  type ObservationDaySummary,
  type ObservationSummaryRow,
} from './history.ts'

describe('history helpers', () => {
  it('flags significant deltas at the shared threshold', () => {
    expect(HISTORY_DELTA_THRESHOLD).toBe(5)
    expect(significantDelta(4.9)).toBe(false)
    expect(significantDelta(-5)).toBe(true)
    expect(significantDelta(null)).toBe(false)
  })

  it('formats delta labels', () => {
    expect(formatDeltaPct(-12.4)).toBe('-12%')
    expect(formatDeltaPct(8.6)).toBe('+9%')
    expect(deltaBadgeLabel(-12.4)).toBe('↓12%')
    expect(deltaBadgeLabel(8.6)).toBe('↑9%')
  })

  it('attaches source history onto offers', () => {
    const rows: ObservationSummaryRow[] = [
      {
        origin: 'PET',
        destination: 'CGH',
        source: 'smiles_web',
        flight_date: '2026-10-01',
        metric: 'miles',
        current_value: 30000,
        prev_value: 35000,
        delta_pct: -14.29,
        min_value: 28000,
        max_value: 40000,
        sample_count: 4,
        latest_collected_at: null,
      },
    ]
    const [offer] = attachOfferHistory([{ source: 'smiles_web', flight_date: '2026-10-01', miles: 30000 }], rows)
    expect(offer.milesDeltaPct).toBe(-14.29)
    expect(offer.milesMin).toBe(28000)
    expect(offer.milesMax).toBe(40000)
  })

  it('attaches day rollup onto chart points', () => {
    const days: ObservationDaySummary[] = [
      {
        flight_date: '2026-10-01',
        miles: {
          origin: 'PET',
          destination: 'CGH',
          source: 'smiles_web',
          flight_date: '2026-10-01',
          metric: 'miles',
          current_value: 30000,
          prev_value: 35000,
          delta_pct: -14.29,
          min_value: 28000,
          max_value: 40000,
          sample_count: 4,
          latest_collected_at: null,
        },
        amount_brl: null,
      },
    ]
    const [point] = attachChartHistory([{ date: '2026-10-01', milhas: 30000 }], days)
    expect(point.milesDeltaPct).toBe(-14.29)
    expect(point.milesMin).toBe(28000)
  })
})

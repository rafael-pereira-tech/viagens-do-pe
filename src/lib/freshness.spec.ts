import { summarizeFreshness } from './freshness.ts'

const now = Date.parse('2026-09-25T15:00:00Z')
describe('summarizeFreshness', () => {
  it('counts stale prices even when the latest quote is fresh', () => {
    expect(
      summarizeFreshness([{ collected_at: '2026-09-25T14:00:00Z' }, { collected_at: '2026-09-24T14:00:00Z' }], now),
    ).toEqual({ total: 2, stale: 1, unknown: 0, latest: Date.parse('2026-09-25T14:00:00Z') })
  })
  it('does not describe invalid or future collection times as fresh', () => {
    expect(
      summarizeFreshness(
        [{ collected_at: '' }, { collected_at: 'invalid' }, { collected_at: '2026-09-26T14:00:00Z' }],
        now,
      ),
    ).toEqual({ total: 3, stale: 0, unknown: 3, latest: null })
  })
  it('handles an empty result and the exact 12-hour threshold', () => {
    expect(summarizeFreshness([], now)).toEqual({ total: 0, stale: 0, unknown: 0, latest: null })
    expect(summarizeFreshness([{ collected_at: '2026-09-25T03:00:00Z' }], now).stale).toBe(0)
  })
})

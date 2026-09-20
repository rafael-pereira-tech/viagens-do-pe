import { describe, expect, it } from 'vitest'
import { snapshotSearchParams, snapshotsUrl } from './api.ts'

describe('snapshotsUrl', () => {
  it('builds same-origin /api paths only', () => {
    expect(snapshotsUrl('/api/v1/snapshots/latest')).toBe('/api/v1/snapshots/latest')
    expect(snapshotsUrl('/api/v1/snapshots', { origin: 'PET' })).toBe('/api/v1/snapshots?origin=PET')
  })
})

describe('snapshotSearchParams', () => {
  it('never forwards include_raw', () => {
    const params = snapshotSearchParams({ origin: 'PET', exclude_dry_run: true })
    expect(params.has('include_raw')).toBe(false)
    expect([...params.keys()]).toEqual(['origin', 'exclude_dry_run'])
  })
})

const STALE_AFTER_MS = 12 * 60 * 60 * 1000

/** A recent quote must never hide older or undated quotes in the same result. */
export function summarizeFreshness(rows: { collected_at: string }[], now: number) {
  let stale = 0
  let unknown = 0
  let latest: number | null = null
  for (const row of rows) {
    const collected = Date.parse(row.collected_at)
    if (!Number.isFinite(collected) || collected > now) {
      unknown += 1
      continue
    }
    if (now - collected > STALE_AFTER_MS) stale += 1
    latest = Math.max(latest ?? collected, collected)
  }
  return { total: rows.length, stale, unknown, latest }
}

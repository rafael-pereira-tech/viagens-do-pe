/**
 * Collector `source` families for KPI math.
 * Keep the SQL lists in `supabase/migrations/20260911193000_price_snapshot_stats.sql`
 * in sync with these bases.
 *
 * Award / program sources persist miles (and must keep amount_brl null).
 * Cash companions persist full-fare BRL. Pre-hotfix `smiles_web` rows may
 * still have a copay written onto amount_brl — those must not drive cash KPIs.
 */

export const AWARD_MILES_SOURCE_BASES = ['smiles_web', 'tudoazul', 'latam_pass'] as const;
export const CASH_COMPANION_SOURCE_BASES = ['voegol', 'voeazul', 'latam_web', 'latam'] as const;

const AWARD = new Set<string>(AWARD_MILES_SOURCE_BASES);
const CASH = new Set<string>(CASH_COMPANION_SOURCE_BASES);

const DRY_RUN_SUFFIX = '_dry_run';

/** Live id for a source (`voegol_dry_run` → `voegol`). */
export function sourceBase(source: string): string {
  return source.endsWith(DRY_RUN_SUFFIX) ? source.slice(0, -DRY_RUN_SUFFIX.length) : source;
}

export function isAwardMilesSource(source: string): boolean {
  return AWARD.has(sourceBase(source));
}

export function isCashCompanionSource(source: string): boolean {
  return CASH.has(sourceBase(source));
}

/** Live cash ids, plus `*_dry_run` when fixture rows are in the window. */
export function cashCompanionSourceIds(includeDryRun: boolean): string[] {
  const live = [...CASH_COMPANION_SOURCE_BASES];
  if (!includeDryRun) return live;
  return [...live, ...live.map((source) => `${source}_dry_run`)];
}

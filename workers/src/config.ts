/**
 * BE-2 collection window and route matrix.
 *
 * Flight dates are civil calendar dates (YYYY-MM-DD), not timestamps.
 * Preferred days-of-week are search hints, not a hard lock: the scheduler
 * still scans the full window, preferred dates first.
 */

export const FLIGHT_WINDOW = {
  start: '2026-09-01',
  end: '2026-12-31',
} as const;

/** Workers Paid cron ceiling is 15 minutes; overlapping ticks skip rather than stack. */
export const INGEST_LEASE_MS = 15 * 60 * 1000;

export type Airline = 'GOL' | 'AZUL' | 'LATAM';
export type Program = 'smiles' | 'tudoazul' | 'latam_pass';

/** 0 = Sunday … 6 = Saturday, matching Date#getUTCDay on a YYYY-MM-DD civil date. */
export type Dow = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RouteSpec {
  origin: 'PET';
  destination: string;
  airline: Airline;
  program: Program;
  /**
   * Preferred search weekdays for this route. Empty means no preference
   * (every date in the window is equal). A function lets preference change
   * across the window (LATAM brief preference after Oct).
   */
  preferredDows: readonly Dow[] | ((flightDate: string) => readonly Dow[]);
}

/**
 * LATAM PET→GRU weekdays (research briefing 2026-09-11 + Pereira correction).
 *
 * Scheduler **preference sort** uses the brief (Mon/Wed/Fri through Oct;
 * Wed/Fri/Sat after). Not a hard lock — every Sep–Dec date is still queued.
 *
 * **Published network** (Mon/Thu/Fri through Oct; Wed/Fri/Sat from
 * ~2026-11-01) is only for interpreting empty inventory as `empty` rather
 * than `scrape_failed` on non-operating days. Do not use it as the sort key.
 * 31 Oct may still be the through-Oct grid.
 */
export const LATAM_GRU_PUBLISHED_CUTOVER = '2026-11-01';
/** Brief preference through Oct: Mon/Wed/Fri. Scheduler sort key. */
export const LATAM_GRU_DOWS_BRIEF_THROUGH_OCT: readonly Dow[] = [1, 3, 5];
/** Brief preference and published network from Nov: Wed/Fri/Sat. */
export const LATAM_GRU_DOWS_FROM_NOV: readonly Dow[] = [3, 5, 6];
/** Published operating days through Oct — empty≠scrape_failed only. */
export const LATAM_GRU_DOWS_PUBLISHED_THROUGH_OCT: readonly Dow[] = [1, 4, 5]; // Mon/Thu/Fri

export const ROUTE_MATRIX: readonly RouteSpec[] = [
  {
    origin: 'PET',
    destination: 'CGH',
    airline: 'GOL',
    program: 'smiles',
    preferredDows: [2, 4, 6], // Tue/Thu/Sat
  },
  {
    origin: 'PET',
    destination: 'VCP',
    airline: 'AZUL',
    program: 'tudoazul',
    preferredDows: [1, 5], // Mon/Fri
  },
  {
    origin: 'PET',
    destination: 'POA',
    airline: 'AZUL',
    program: 'tudoazul',
    preferredDows: [], // no published DOW preference
  },
  {
    origin: 'PET',
    destination: 'GRU',
    airline: 'LATAM',
    program: 'latam_pass',
    preferredDows: (flightDate) =>
      flightDate < LATAM_GRU_PUBLISHED_CUTOVER
        ? LATAM_GRU_DOWS_BRIEF_THROUGH_OCT
        : LATAM_GRU_DOWS_FROM_NOV,
  },
];

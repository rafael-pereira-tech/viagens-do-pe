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
   * across the window (LATAM after 31 Oct 2026).
   */
  preferredDows: readonly Dow[] | ((flightDate: string) => readonly Dow[]);
}

const LATAM_GRU_DOWS_THROUGH_OCT: readonly Dow[] = [1, 3, 5]; // Mon/Wed/Fri
const LATAM_GRU_DOWS_FROM_NOV: readonly Dow[] = [3, 5, 6]; // Wed/Fri/Sat

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
      flightDate <= '2026-10-31' ? LATAM_GRU_DOWS_THROUGH_OCT : LATAM_GRU_DOWS_FROM_NOV,
  },
];

import {
  LATAM_GRU_DOWS_BRIEF_THROUGH_OCT,
  LATAM_GRU_DOWS_FROM_NOV,
  LATAM_GRU_DOWS_PUBLISHED_THROUGH_OCT,
  LATAM_GRU_PUBLISHED_CUTOVER,
  type Dow,
  type RouteSpec,
} from './config';

const DAY_MS = 86_400_000;

export function eachUtcDate(start: string, end: string): string[] {
  const dates: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(endMs) || t > endMs) {
    throw new Error(`Invalid flight window: ${start} .. ${end}`);
  }
  while (t <= endMs) {
    dates.push(new Date(t).toISOString().slice(0, 10));
    t += DAY_MS;
  }
  return dates;
}

export function utcDow(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export type LatamDowPreference = {
  /** Date is on the brief preference grid (scheduler sort key, not a lock). */
  brief: boolean;
  /**
   * Date is on the published operating network. Used only to interpret
   * empty inventory as `empty` rather than `scrape_failed`.
   */
  published: boolean;
  cutover: typeof LATAM_GRU_PUBLISHED_CUTOVER;
  grid: 'through_oct' | 'from_nov';
};

/**
 * Brief vs published PET→GRU DOW tag for `raw_payload.dow_preference`.
 * Never used to skip collection jobs or as the scheduler sort key.
 */
export function latamGruDowPreference(flightDate: string): LatamDowPreference {
  const dow = utcDow(flightDate) as Dow;
  const fromNov = flightDate >= LATAM_GRU_PUBLISHED_CUTOVER;
  const briefDows = fromNov ? LATAM_GRU_DOWS_FROM_NOV : LATAM_GRU_DOWS_BRIEF_THROUGH_OCT;
  const publishedDows = fromNov ? LATAM_GRU_DOWS_FROM_NOV : LATAM_GRU_DOWS_PUBLISHED_THROUGH_OCT;
  return {
    brief: briefDows.includes(dow),
    published: publishedDows.includes(dow),
    cutover: LATAM_GRU_PUBLISHED_CUTOVER,
    grid: fromNov ? 'from_nov' : 'through_oct',
  };
}

/** Published operating weekday — empty inventory on other days is expected `empty`. */
export function isLatamGruPublishedOperatingDay(flightDate: string): boolean {
  return latamGruDowPreference(flightDate).published;
}

export function preferredDowsFor(route: RouteSpec, flightDate: string): readonly number[] {
  return typeof route.preferredDows === 'function'
    ? route.preferredDows(flightDate)
    : route.preferredDows;
}

export function isPreferredDate(route: RouteSpec, flightDate: string): boolean {
  const dows = preferredDowsFor(route, flightDate);
  return dows.length > 0 && dows.includes(utcDow(flightDate));
}

/**
 * All dates in the window. When the route has DOW preferences, those dates
 * come first; the remaining dates still follow so the scan is not locked.
 */
export function candidateDates(
  route: RouteSpec,
  window: { start: string; end: string },
): string[] {
  const all = eachUtcDate(window.start, window.end);
  const preferred: string[] = [];
  const rest: string[] = [];
  for (const date of all) {
    if (isPreferredDate(route, date)) preferred.push(date);
    else rest.push(date);
  }
  return [...preferred, ...rest];
}

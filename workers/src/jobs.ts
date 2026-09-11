import type { Airline, Program, RouteSpec } from './config';
import { FLIGHT_WINDOW, ROUTE_MATRIX } from './config';
import { candidateDates, isPreferredDate } from './dates';

export interface CollectionJob {
  origin: string;
  destination: string;
  airline: Airline;
  program: Program;
  flightDate: string;
  preferred: boolean;
}

export function buildJobs(
  window: { start: string; end: string } = FLIGHT_WINDOW,
  routes: readonly RouteSpec[] = ROUTE_MATRIX,
): CollectionJob[] {
  const jobs: CollectionJob[] = [];
  for (const route of routes) {
    for (const flightDate of candidateDates(route, window)) {
      jobs.push({
        origin: route.origin,
        destination: route.destination,
        airline: route.airline,
        program: route.program,
        flightDate,
        preferred: isPreferredDate(route, flightDate),
      });
    }
  }
  return jobs;
}

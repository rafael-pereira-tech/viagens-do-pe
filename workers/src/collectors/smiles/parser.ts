import type { CollectParams, Snapshot } from '../types';
import { DEFAULT_FARE_TYPES, GOL_AIRLINE_CODES, SMILES_SOURCE } from './constants';
import type { SmilesFare, SmilesFlight, SmilesSearchResponse } from './types';

const MONEY_FARE = /MONEY/i;

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function departureTimeOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const match = iso.match(/T(\d{2}:\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${match[1]}:${match[2] ?? '00'}`;
}

export function civilDateOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function airlineCode(flight: SmilesFlight): string {
  const candidates = [
    flight.airline?.code,
    flight.sourceGDS,
    flight.legList?.[0]?.marketingAirline?.code,
    flight.legList?.[0]?.operationAirline?.code,
  ];
  for (const code of candidates) {
    if (typeof code === 'string' && code.trim()) return code.trim().toUpperCase();
  }
  return '';
}

export function isGolFlight(flight: SmilesFlight): boolean {
  const code = airlineCode(flight);
  if (GOL_AIRLINE_CODES.has(code)) return true;
  const name = flight.airline?.name ?? '';
  return /\bGOL\b/i.test(name);
}

function fareTaxes(flight: SmilesFlight, fare: SmilesFare): number | null {
  const candidates = [fare.g3?.costTax, fare.airlineTax, fare.boardingTax, flight.airlineTax];
  for (const value of candidates) {
    const parsed = toFiniteNumber(value);
    if (parsed != null && parsed >= 0) return roundMoney(parsed);
  }
  return null;
}

function fareMiles(fare: SmilesFare): number | null {
  const miles = toFiniteNumber(fare.miles);
  if (miles == null || miles < 0) return null;
  return Math.round(miles);
}

function fareMoney(fare: SmilesFare): number | null {
  const money = toFiniteNumber(fare.money);
  if (money == null || money < 0) return null;
  return roundMoney(money);
}

export function isAllowedFareType(type: string | undefined, allowed: ReadonlySet<string>): boolean {
  if (!type) return false;
  return allowed.has(type.toUpperCase());
}

export function resolveFareTypes(opts: {
  configured?: string;
  includeClub: boolean;
}): Set<string> {
  const fromEnv = opts.configured
    ?.split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : [...DEFAULT_FARE_TYPES];
  const allowed = new Set(base);
  if (opts.includeClub) {
    allowed.add('SMILES_CLUB');
    allowed.add('SMILES_MONEY_CLUB');
  }
  return allowed;
}

function snapshotFromFare(
  params: CollectParams,
  flight: SmilesFlight,
  fare: SmilesFare,
): Snapshot | null {
  const miles = fareMiles(fare);
  const amount = fareMoney(fare);
  if (miles == null && amount == null) return null;
  const isMoneyMix = MONEY_FARE.test(String(fare.type ?? ''));
  // Pure-miles rows may omit money; miles+BRL rows keep a 0 copay when listed as 0.
  const amountBrl = amount ?? (isMoneyMix ? 0 : null);

  const departure = departureTimeOf(flight.departure?.date);
  return {
    origin: params.origin,
    destination: params.destination,
    airline: params.airline,
    program: params.program,
    flight_date: params.flightDate,
    departure_time: departure,
    miles,
    amount_brl: amountBrl,
    taxes_brl: fareTaxes(flight, fare),
    currency: 'BRL',
    source: SMILES_SOURCE,
    raw_payload: {
      flightUid: flight.uid ?? null,
      fareUid: fare.uid ?? null,
      fareType: fare.type ?? null,
      cabin: flight.cabin ?? null,
      stops: flight.stops ?? null,
      airline: flight.airline ?? null,
      departure: flight.departure ?? null,
      arrival: flight.arrival ?? null,
      miles: fare.miles ?? null,
      money: fare.money ?? null,
      airlineTax: fare.airlineTax ?? flight.airlineTax ?? null,
      g3: fare.g3 ?? null,
    },
  };
}

export interface ParseOptions {
  fareTypes: ReadonlySet<string>;
}

export interface ParseOutcome {
  snapshots: Snapshot[];
  golFlights: number;
  skippedFares: number;
  otherAirlineFlights: number;
}

export function parseSmilesSearch(
  payload: unknown,
  params: CollectParams,
  options: ParseOptions,
): ParseOutcome {
  const snapshots: Snapshot[] = [];
  let golFlights = 0;
  let skippedFares = 0;
  let otherAirlineFlights = 0;

  if (!payload || typeof payload !== 'object') {
    return { snapshots, golFlights, skippedFares, otherAirlineFlights };
  }

  const body = payload as SmilesSearchResponse;
  const segments = Array.isArray(body.requestedFlightSegmentList)
    ? body.requestedFlightSegmentList
    : [];

  for (const segment of segments) {
    const flights = Array.isArray(segment.flightList) ? segment.flightList : [];
    for (const flight of flights) {
      if (!isGolFlight(flight)) {
        otherAirlineFlights += 1;
        continue;
      }
      const date = civilDateOf(flight.departure?.date);
      if (date && date !== params.flightDate) continue;
      golFlights += 1;
      const fares = Array.isArray(flight.fareList) ? flight.fareList : [];
      for (const fare of fares) {
        if (!isAllowedFareType(fare.type, options.fareTypes)) {
          skippedFares += 1;
          continue;
        }
        const snapshot = snapshotFromFare(params, flight, fare);
        if (!snapshot) {
          skippedFares += 1;
          continue;
        }
        snapshots.push(snapshot);
      }
    }
  }

  return { snapshots, golFlights, skippedFares, otherAirlineFlights };
}

export function smilesBodyLooksLikeError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as SmilesSearchResponse & { errorCode?: string };
  if (typeof body.message === 'string' && /something went wrong|unauthorized|forbidden/i.test(body.message)) {
    return body.message;
  }
  if (typeof body.error === 'string' && body.error.trim()) return body.error;
  if (typeof body.errorCode === 'string' && body.errorCode.trim()) return body.errorCode;
  return null;
}

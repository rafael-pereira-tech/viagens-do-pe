import type { CollectParams, Snapshot } from '../types';
import { DEFAULT_FARE_TYPES, GOL_AIRLINE_CODES, SMILES_SOURCE } from './constants';
import type {
  SmilesFare,
  SmilesFareOption,
  SmilesFlight,
  SmilesSearchResponse,
} from './types';

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

/**
 * Quoted miles / cash. Missing, empty, or non-positive → `null`.
 * Locked BE-3: never invent price 0.
 */
export function quotedOrNull(value: unknown, kind: 'miles' | 'money'): number | null {
  const parsed = toFiniteNumber(value);
  if (parsed == null || parsed <= 0) return null;
  return kind === 'miles' ? Math.round(parsed) : roundMoney(parsed);
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function airlineCode(flight: SmilesFlight): string {
  const candidates = [
    flight.airline?.code,
    flight.airline_code,
    flight.airlineCode,
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
  const candidates = [fare.costTax, fare.g3?.costTax, fare.airlineTax, fare.boardingTax, flight.airlineTax];
  for (const value of candidates) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = toFiniteNumber(value);
    if (parsed != null && parsed >= 0) return roundMoney(parsed);
  }
  return null;
}

/** Native SMILES ≈ extractor STANDARD. Club stays SMILES_CLUB. */
export function canonicalFareType(type: string | undefined): string {
  if (!type) return '';
  const upper = type.toUpperCase();
  if (upper === 'STANDARD') return 'SMILES';
  return upper;
}

export function isAllowedFareType(type: string | undefined, allowed: ReadonlySet<string>): boolean {
  const canonical = canonicalFareType(type);
  if (!canonical) return false;
  return allowed.has(canonical) || allowed.has(type!.toUpperCase());
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
  if (allowed.has('SMILES') || allowed.has('STANDARD')) {
    allowed.add('SMILES');
    allowed.add('STANDARD');
  }
  if (opts.includeClub) {
    allowed.add('SMILES_CLUB');
    allowed.add('SMILES_MONEY_CLUB');
  }
  return allowed;
}

function fareTypeOf(fare: SmilesFare): string | undefined {
  const raw = fare.type ?? fare.fareType;
  return typeof raw === 'string' ? raw : undefined;
}

function fareOptionToFare(opt: SmilesFareOption): SmilesFare {
  return {
    uid: opt.uid,
    type: opt.fareType ?? opt.type,
    fareType: opt.fareType ?? opt.type,
    miles: opt.miles,
    money: opt.money,
    costTax: opt.costTax,
    airlineTax: opt.costTax,
    g3: {
      costTax: opt.g3?.costTax ?? opt.costTax,
      productClass: opt.g3?.productClass,
      classOfService: opt.g3?.classOfService,
      fareBasisCode: opt.g3?.fareBasisCode,
    },
  };
}

export function normalizeSmilesFlight(raw: unknown): SmilesFlight {
  const f = asRecord(raw) ?? {};
  const airline = asRecord(f.airline);
  const airlineCodeValue =
    (typeof airline?.code === 'string' && airline.code) ||
    (typeof f.airline_code === 'string' && f.airline_code) ||
    (typeof f.airlineCode === 'string' && f.airlineCode) ||
    undefined;

  const fareListRaw = Array.isArray(f.fareList) ? f.fareList : null;
  const fareOptions = Array.isArray(f.fareOptions) ? (f.fareOptions as SmilesFareOption[]) : [];
  const fareList: SmilesFare[] = fareListRaw
    ? (fareListRaw as SmilesFare[])
    : fareOptions.map(fareOptionToFare);

  const departure = asRecord(f.departure);
  const arrival = asRecord(f.arrival);
  const departureDate =
    (typeof departure?.date === 'string' && departure.date) ||
    (typeof f.departureDate === 'string' && f.departureDate) ||
    (typeof f.departureDateTime === 'string' && f.departureDateTime) ||
    undefined;
  const arrivalDate =
    (typeof arrival?.date === 'string' && arrival.date) ||
    (typeof f.arrivalDate === 'string' && f.arrivalDate) ||
    (typeof f.arrivalDateTime === 'string' && f.arrivalDateTime) ||
    undefined;

  return {
    uid: typeof f.uid === 'string' ? f.uid : undefined,
    cabin: typeof f.cabin === 'string' ? f.cabin : undefined,
    stops: f.stops as SmilesFlight['stops'],
    sourceGDS: typeof f.sourceGDS === 'string' ? f.sourceGDS : airlineCodeValue,
    availableSeats: f.availableSeats as SmilesFlight['availableSeats'],
    airlineTax: f.airlineTax as SmilesFlight['airlineTax'],
    airline: airlineCodeValue
      ? { code: airlineCodeValue, name: typeof airline?.name === 'string' ? airline.name : undefined }
      : (f.airline as SmilesFlight['airline']),
    airline_code: airlineCodeValue,
    departure: departureDate ? { ...(departure ?? {}), date: departureDate } : (departure as SmilesFlight['departure']),
    arrival: arrivalDate ? { ...(arrival ?? {}), date: arrivalDate } : (arrival as SmilesFlight['arrival']),
    fareList,
    fareOptions: fareOptions.length > 0 ? fareOptions : undefined,
    legList: Array.isArray(f.legList) ? (f.legList as SmilesFlight['legList']) : undefined,
  };
}

function rawFlightsFromPayload(payload: object): unknown[] {
  const body = payload as SmilesSearchResponse;
  const out: unknown[] = [];

  const pushFromSegments = (segments: SmilesSearchResponse['requestedFlightSegmentList']) => {
    if (!Array.isArray(segments)) return;
    for (const segment of segments) {
      const flights = segment.flightList ?? segment.flights;
      if (Array.isArray(flights)) out.push(...flights);
    }
  };

  pushFromSegments(body.requestedFlightSegmentList);
  if (out.length === 0) pushFromSegments(body.requestedFlightSegments);
  if (out.length === 0 && Array.isArray(body.flights)) out.push(...body.flights);
  if (out.length === 0 && Array.isArray(body.flightList)) out.push(...body.flightList);
  return out;
}

function snapshotFromFare(
  params: CollectParams,
  flight: SmilesFlight,
  fare: SmilesFare,
): Snapshot | null {
  const miles = quotedOrNull(fare.miles, 'miles');
  // Smiles `money` is Smiles+Money copay, NOT full cash BRL. Do not write it to amount_brl.
  const copayBrl = quotedOrNull(fare.money, 'money');
  if (miles == null) return null;

  const departure = departureTimeOf(flight.departure?.date);
  const costTax = fare.costTax ?? fare.g3?.costTax ?? null;
  return {
    origin: params.origin,
    destination: params.destination,
    airline: params.airline,
    program: params.program,
    flight_date: params.flightDate,
    departure_time: departure,
    miles,
    amount_brl: null,
    taxes_brl: fareTaxes(flight, fare),
    currency: 'BRL',
    source: SMILES_SOURCE,
    raw_payload: {
      flightUid: flight.uid ?? null,
      fareUid: fare.uid ?? null,
      fareType: fareTypeOf(fare) ?? null,
      cabin: flight.cabin ?? null,
      stops: flight.stops ?? null,
      airline: flight.airline ?? null,
      airline_code: airlineCode(flight) || null,
      departure: flight.departure ?? null,
      arrival: flight.arrival ?? null,
      miles: fare.miles ?? null,
      smiles_money: fare.money ?? null,
      copay_brl: copayBrl,
      costTax,
      airlineTax: fare.airlineTax ?? flight.airlineTax ?? null,
      g3: fare.g3 ?? null,
      amount_brl_note:
        'Smiles money is Smiles+Money copay, not full cash. Full cash BRL is source=voegol.',
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

  const flights = rawFlightsFromPayload(payload).map(normalizeSmilesFlight);

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
      if (!isAllowedFareType(fareTypeOf(fare), options.fareTypes)) {
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

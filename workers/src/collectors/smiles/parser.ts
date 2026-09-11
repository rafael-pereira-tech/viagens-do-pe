import type { CollectParams, Snapshot } from '../types';
import { DEFAULT_FARE_TYPES, GOL_AIRLINE_CODES, SMILES_SOURCE, VOEGOL_SOURCE } from './constants';
import type {
  SmilesFare,
  SmilesFlight,
  SmilesSearchResponse,
  VoegolItinerary,
  VoegolOffer,
  VoegolSearchResponse,
  VoegolSegment,
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
    if (value === undefined || value === null || value === '') continue;
    const parsed = toFiniteNumber(value);
    if (parsed != null && parsed >= 0) return roundMoney(parsed);
  }
  return null;
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
  const miles = quotedOrNull(fare.miles, 'miles');
  if (miles == null) return null;

  // Smiles `money` is SMILES_MONEY copay, never full cash BRL.
  const copay = quotedOrNull(fare.money, 'money');
  const departure = departureTimeOf(flight.departure?.date);
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
      fareType: fare.type ?? null,
      cabin: flight.cabin ?? null,
      stops: flight.stops ?? null,
      airline: flight.airline ?? null,
      departure: flight.departure ?? null,
      arrival: flight.arrival ?? null,
      miles: fare.miles ?? null,
      money: fare.money ?? null,
      copay_brl: copay,
      smiles_money: copay,
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

function snapshotBase(
  params: CollectParams,
  departureIso: string | undefined,
): Omit<Snapshot, 'miles' | 'amount_brl' | 'taxes_brl' | 'source' | 'raw_payload'> {
  return {
    origin: params.origin,
    destination: params.destination,
    airline: params.airline,
    program: params.program,
    flight_date: params.flightDate,
    departure_time: departureTimeOf(departureIso),
    currency: 'BRL',
  };
}

function segmentAirlineCodes(segment: VoegolSegment): string[] {
  const candidates = [
    segment.airlineCode,
    segment.flight?.airlineCode,
    segment.flight?.marketingAirlineCode,
    segment.flight?.operatingAirlineCode,
  ];
  const codes: string[] = [];
  for (const code of candidates) {
    if (typeof code === 'string' && code.trim()) codes.push(code.trim().toUpperCase());
  }
  return codes;
}

function itineraryAirlineCodes(itinerary: VoegolItinerary): string[] {
  const codes: string[] = [];
  for (const candidate of [itinerary.marketingAirlineCode, itinerary.operatingAirlineCode]) {
    if (typeof candidate === 'string' && candidate.trim()) codes.push(candidate.trim().toUpperCase());
  }
  for (const segment of itinerary.segments ?? []) {
    codes.push(...segmentAirlineCodes(segment));
  }
  return codes;
}

export function isGolItinerary(itinerary: VoegolItinerary): boolean {
  const codes = itineraryAirlineCodes(itinerary);
  if (codes.length === 0) return true;
  return codes.every((code) => GOL_AIRLINE_CODES.has(code));
}

export function hasNonGolCarrier(itinerary: VoegolItinerary): boolean {
  return itineraryAirlineCodes(itinerary).some((code) => !GOL_AIRLINE_CODES.has(code));
}

function unwrapVoegol(payload: unknown): VoegolSearchResponse | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as VoegolSearchResponse;
  if (Array.isArray(root.itineraries) || Array.isArray(root.flights) || Array.isArray(root.journeys)) {
    return root;
  }
  if (root.data && typeof root.data === 'object') return unwrapVoegol(root.data);
  return root;
}

function itinerariesOf(root: VoegolSearchResponse): VoegolItinerary[] {
  if (Array.isArray(root.itineraries)) return root.itineraries;
  if (Array.isArray(root.flights)) return root.flights;
  if (Array.isArray(root.journeys)) return root.journeys;
  return [];
}

function itineraryOrigin(itinerary: VoegolItinerary): string | undefined {
  return itinerary.origin ?? itinerary.departureAirportCode ?? itinerary.segments?.[0]?.origin;
}

function itineraryDestination(itinerary: VoegolItinerary): string | undefined {
  return itinerary.destination ?? itinerary.arrivalAirportCode ?? itinerary.segments?.[0]?.destination;
}

function itineraryDeparture(itinerary: VoegolItinerary): string | undefined {
  if (itinerary.departure) return itinerary.departure;
  if (itinerary.departureDate && itinerary.departureTime) {
    const time = itinerary.departureTime.length === 5 ? `${itinerary.departureTime}:00` : itinerary.departureTime;
    return `${itinerary.departureDate}T${time}`;
  }
  if (itinerary.departureDate) return itinerary.departureDate;
  return itinerary.segments?.[0]?.departure;
}

function offerMoney(offer: VoegolOffer): { amount: number | null; currency: string } {
  const total = offer.total ?? offer.totalPrice;
  const currencyRaw = total?.currency ?? total?.currencyCode;
  const currency = typeof currencyRaw === 'string' && currencyRaw.trim() ? currencyRaw.trim().toUpperCase() : 'BRL';
  return { amount: quotedOrNull(total?.amount, 'money'), currency };
}

function offerTaxes(offer: VoegolOffer): number | null {
  return quotedOrNull(offer.taxes?.amount ?? offer.tax?.amount, 'money');
}

function snapshotFromVoegolOffer(
  params: CollectParams,
  itinerary: VoegolItinerary,
  offer: VoegolOffer,
): Snapshot | null {
  const { amount, currency } = offerMoney(offer);
  if (amount == null) return null;
  if (currency !== 'BRL') return null;
  const departure = itineraryDeparture(itinerary);
  return {
    ...snapshotBase(params, departure),
    miles: null,
    amount_brl: amount,
    taxes_brl: offerTaxes(offer),
    source: VOEGOL_SOURCE,
    raw_payload: {
      pricingMode: 'cash',
      itineraryId: itinerary.id ?? null,
      offerId: offer.id ?? null,
      brandId: offer.brandId ?? null,
      brandLabel: offer.brandLabel ?? null,
      cabinClass: offer.cabinClass ?? null,
      stops: itinerary.stopsCount ?? null,
      departure: departure ?? null,
      arrival: itinerary.arrival ?? null,
      total: offer.total ?? offer.totalPrice ?? null,
    },
  };
}

export interface VoegolParseOutcome {
  snapshots: Snapshot[];
  golItineraries: number;
  skippedOffers: number;
  otherAirlineItineraries: number;
}

export function parseVoegolFlights(payload: unknown, params: CollectParams): VoegolParseOutcome {
  const snapshots: Snapshot[] = [];
  let golItineraries = 0;
  let skippedOffers = 0;
  let otherAirlineItineraries = 0;

  const root = unwrapVoegol(payload);
  if (!root) return { snapshots, golItineraries, skippedOffers, otherAirlineItineraries };

  for (const itinerary of itinerariesOf(root)) {
    if (hasNonGolCarrier(itinerary) || !isGolItinerary(itinerary)) {
      otherAirlineItineraries += 1;
      continue;
    }
    const origin = itineraryOrigin(itinerary);
    const destination = itineraryDestination(itinerary);
    if (origin && origin !== params.origin) continue;
    if (destination && destination !== params.destination) continue;
    const date = civilDateOf(itineraryDeparture(itinerary));
    if (date && date !== params.flightDate) continue;
    golItineraries += 1;
    const offers = Array.isArray(itinerary.offers) ? itinerary.offers : [];
    if (offers.length === 0) {
      skippedOffers += 1;
      continue;
    }
    let emitted = 0;
    for (const offer of offers) {
      const row = snapshotFromVoegolOffer(params, itinerary, offer);
      if (!row) {
        skippedOffers += 1;
        continue;
      }
      snapshots.push(row);
      emitted += 1;
    }
    if (emitted === 0) skippedOffers += 1;
  }

  return { snapshots, golItineraries, skippedOffers, otherAirlineItineraries };
}

export function voegolBodyLooksLikeError(payload: unknown): string | null {
  return smilesBodyLooksLikeError(payload);
}

import type { CollectParams, Snapshot } from '../types';
import { AZUL_CARRIER_CODES, TUDOAZUL_SOURCE, VOEAZUL_SOURCE } from './constants';
import type {
  AzulAvailabilityResponse,
  AzulFare,
  AzulJourney,
  AzulPointsOption,
  AzulPricingMode,
  AzulTrip,
  MoneyAmount,
} from './types';

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Quoted miles / cash. Missing, empty, or non-positive → `null`.
 * Never invent price 0.
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

function moneyAmount(value: MoneyAmount | number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'object') return quotedOrNull(value.amount, 'money');
  return quotedOrNull(value, 'money');
}

function moneyCurrency(value: MoneyAmount | null | undefined, fallback = 'BRL'): string {
  if (value && typeof value.currency === 'string' && value.currency.trim()) {
    return value.currency.trim().toUpperCase();
  }
  return fallback;
}

function productClassCode(fare: AzulFare): string | null {
  if (typeof fare.productClass === 'string' && fare.productClass.trim()) return fare.productClass.trim();
  if (fare.productClass && typeof fare.productClass === 'object' && fare.productClass.code) {
    return fare.productClass.code;
  }
  const detail = fare.details?.[0]?.productClass;
  return typeof detail === 'string' && detail.trim() ? detail.trim() : null;
}

function journeyCarrierCodes(journey: AzulJourney): string[] {
  const codes: string[] = [];
  for (const segment of journey.segments ?? []) {
    const candidates = [segment.flight?.carrierCode, segment.identifier?.carrierCode];
    for (const code of candidates) {
      if (typeof code === 'string' && code.trim()) codes.push(code.trim().toUpperCase());
    }
  }
  const key = journey.journeyKey ?? journey.id ?? '';
  const fromKey = key.match(/\b([A-Z]{2})\d{2,4}\b/);
  if (fromKey) codes.push(fromKey[1]!);
  return codes;
}

export function isAzulJourney(journey: AzulJourney): boolean {
  const codes = journeyCarrierCodes(journey);
  if (codes.length === 0) return true;
  return codes.some((code) => AZUL_CARRIER_CODES.has(code));
}

export function hasNonAzulCarrier(journey: AzulJourney): boolean {
  const codes = journeyCarrierCodes(journey);
  return codes.some((code) => !AZUL_CARRIER_CODES.has(code));
}

function unwrapRoot(payload: unknown): AzulAvailabilityResponse | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as AzulAvailabilityResponse;
  if (Array.isArray(root.trips)) return root;
  const nested = root.data;
  if (nested && typeof nested === 'object') {
    if (Array.isArray(nested.trips)) return nested;
    if ('data' in nested && nested.data && typeof nested.data === 'object') {
      return unwrapRoot(nested.data);
    }
  }
  return root;
}

function journeysOf(trip: AzulTrip): AzulJourney[] {
  if (Array.isArray(trip.journeys)) return trip.journeys;
  const byMarket = trip.journeysAvailableByMarket;
  if (byMarket && typeof byMarket === 'object') {
    return Object.values(byMarket).flatMap((rows) => (Array.isArray(rows) ? rows : []));
  }
  return [];
}

function journeyOrigin(journey: AzulJourney, fallback?: string): string | undefined {
  return journey.origin ?? journey.designator?.origin ?? fallback;
}

function journeyDestination(journey: AzulJourney, fallback?: string): string | undefined {
  return journey.destination ?? journey.designator?.destination ?? fallback;
}

function journeyDeparture(journey: AzulJourney): string | undefined {
  return journey.departure ?? journey.designator?.departure ?? journey.segments?.[0]?.departure ?? journey.segments?.[0]?.designator?.departure;
}

function fareTaxesFromPoints(option: AzulPointsOption): number | null {
  const tax = moneyAmount(option.taxesAndFees ?? undefined);
  if (tax != null) return tax;
  return null;
}

function passengerFareTaxes(fare: AzulFare): number | null {
  const charges = fare.passengerFares?.[0]?.serviceCharges ?? [];
  let total = 0;
  let found = false;
  for (const charge of charges) {
    if (charge.type && !/tax|fee/i.test(charge.type)) continue;
    const amount = toFiniteNumber(charge.amount);
    if (amount == null || amount < 0) continue;
    total += amount;
    found = true;
  }
  return found ? roundMoney(total) : null;
}

function snapshotBase(params: CollectParams, journey: AzulJourney): Omit<Snapshot, 'miles' | 'amount_brl' | 'taxes_brl' | 'source' | 'raw_payload'> {
  return {
    origin: params.origin,
    destination: params.destination,
    airline: params.airline,
    program: params.program,
    flight_date: params.flightDate,
    departure_time: departureTimeOf(journeyDeparture(journey)),
    currency: 'BRL',
  };
}

function pointsMiles(option: AzulPointsOption): number | null {
  return quotedOrNull(option.discountedPoints, 'miles') ?? quotedOrNull(option.points, 'miles');
}

/**
 * Miles+money copay is **not** full cash. Store on raw_payload only.
 * Prefer fareMoney (tariff copay); fall back to totalMoney minus taxes when that
 * leftover is still a copay, never as amount_brl.
 */
function copayBrl(option: AzulPointsOption): number | null {
  const fareMoney = moneyAmount(option.fareMoney ?? undefined);
  if (fareMoney != null) return fareMoney;
  const totalMoney = moneyAmount(option.totalMoney ?? undefined);
  const taxes = moneyAmount(option.taxesAndFees ?? undefined);
  if (totalMoney != null && taxes != null) {
    const leftover = roundMoney(totalMoney - taxes);
    return leftover > 0 ? leftover : null;
  }
  return null;
}

function snapshotFromPointsOption(
  params: CollectParams,
  journey: AzulJourney,
  fare: AzulFare,
  option: AzulPointsOption,
): Snapshot | null {
  const miles = pointsMiles(option);
  if (miles == null) return null;
  const copay = copayBrl(option);
  return {
    ...snapshotBase(params, journey),
    miles,
    amount_brl: null,
    taxes_brl: fareTaxesFromPoints(option),
    source: TUDOAZUL_SOURCE,
    raw_payload: {
      pricingMode: 'points',
      journeyKey: journey.journeyKey ?? journey.id ?? null,
      fareKey: fare.key ?? fare.fareAvailabilityKey ?? null,
      productClass: productClassCode(fare),
      cabin: fare.cabin ?? null,
      classOfService: fare.classOfService ?? fare.details?.[0]?.classOfService ?? null,
      stops: journey.stopsCount ?? journey.stops ?? null,
      departure: journeyDeparture(journey) ?? null,
      arrival: journey.arrival ?? journey.designator?.arrival ?? null,
      points: option.points ?? null,
      discountedPoints: option.discountedPoints ?? null,
      amountLevel: option.amountLevel ?? null,
      copay_brl: copay,
      fareMoney: option.fareMoney ?? null,
      taxesAndFees: option.taxesAndFees ?? null,
      convenienceFee: option.convenienceFee ?? null,
      totalMoney: option.totalMoney ?? null,
    },
  };
}

function snapshotFromCashFare(params: CollectParams, journey: AzulJourney, fare: AzulFare): Snapshot | null {
  const fromTotal = moneyAmount(fare.total ?? undefined);
  const fromPassenger = quotedOrNull(fare.passengerFares?.[0]?.fareAmount, 'money');
  const amount = fromTotal ?? fromPassenger;
  if (amount == null) return null;
  if (fare.total && moneyCurrency(fare.total) !== 'BRL') return null;
  return {
    ...snapshotBase(params, journey),
    miles: null,
    amount_brl: amount,
    taxes_brl: passengerFareTaxes(fare),
    source: VOEAZUL_SOURCE,
    raw_payload: {
      pricingMode: 'cash',
      journeyKey: journey.journeyKey ?? journey.id ?? null,
      fareKey: fare.key ?? fare.fareAvailabilityKey ?? null,
      productClass: productClassCode(fare),
      cabin: fare.cabin ?? null,
      classOfService: fare.classOfService ?? fare.details?.[0]?.classOfService ?? null,
      stops: journey.stopsCount ?? journey.stops ?? null,
      departure: journeyDeparture(journey) ?? null,
      arrival: journey.arrival ?? journey.designator?.arrival ?? null,
      total: fare.total ?? null,
      passengerFareAmount: fare.passengerFares?.[0]?.fareAmount ?? null,
    },
  };
}

function snapshotsFromNavitairePoints(
  params: CollectParams,
  journey: AzulJourney,
  fare: AzulFare,
): Snapshot[] {
  const rows: Snapshot[] = [];
  for (const passenger of fare.passengerFares ?? []) {
    const miles = quotedOrNull(passenger.discountedPoints, 'miles') ?? quotedOrNull(passenger.points, 'miles');
    if (miles == null) continue;
    const copay = quotedOrNull(passenger.fareAmount, 'money');
    rows.push({
      ...snapshotBase(params, journey),
      miles,
      amount_brl: null,
      taxes_brl: passengerFareTaxes(fare),
      source: TUDOAZUL_SOURCE,
      raw_payload: {
        pricingMode: 'points',
        journeyKey: journey.journeyKey ?? journey.id ?? null,
        fareKey: fare.key ?? fare.fareAvailabilityKey ?? null,
        productClass: productClassCode(fare),
        copay_brl: copay,
        passengerType: passenger.passengerType ?? null,
        points: passenger.points ?? null,
        fareAmount: passenger.fareAmount ?? null,
      },
    });
  }
  return rows;
}

export interface ParseOutcome {
  snapshots: Snapshot[];
  azulJourneys: number;
  skippedFares: number;
  otherAirlineJourneys: number;
}

export function parseAzulAvailability(
  payload: unknown,
  params: CollectParams,
  pricingMode: AzulPricingMode,
): ParseOutcome {
  const snapshots: Snapshot[] = [];
  let azulJourneys = 0;
  let skippedFares = 0;
  let otherAirlineJourneys = 0;

  const root = unwrapRoot(payload);
  if (!root) return { snapshots, azulJourneys, skippedFares, otherAirlineJourneys };

  const trips = Array.isArray(root.trips) ? root.trips : [];
  for (const trip of trips) {
    for (const journey of journeysOf(trip)) {
      if (journey.available === false) continue;
      if (hasNonAzulCarrier(journey) || !isAzulJourney(journey)) {
        otherAirlineJourneys += 1;
        continue;
      }
      const origin = journeyOrigin(journey, trip.origin);
      const destination = journeyDestination(journey, trip.destination);
      if (origin && origin !== params.origin) continue;
      if (destination && destination !== params.destination) continue;
      const date = civilDateOf(journeyDeparture(journey)) ?? (typeof trip.date === 'string' ? trip.date : null);
      if (date && date !== params.flightDate) continue;
      azulJourneys += 1;
      const fares = Array.isArray(journey.fares) ? journey.fares : [];
      for (const fare of fares) {
        if (pricingMode === 'points') {
          const options = Array.isArray(fare.pointsOptions) ? fare.pointsOptions : [];
          if (options.length > 0) {
            let emitted = 0;
            for (const option of options) {
              const row = snapshotFromPointsOption(params, journey, fare, option);
              if (!row) {
                skippedFares += 1;
                continue;
              }
              snapshots.push(row);
              emitted += 1;
            }
            if (emitted === 0) skippedFares += 1;
            continue;
          }
          const navitaire = snapshotsFromNavitairePoints(params, journey, fare);
          if (navitaire.length === 0) {
            skippedFares += 1;
            continue;
          }
          snapshots.push(...navitaire);
          continue;
        }

        const cash = snapshotFromCashFare(params, journey, fare);
        if (!cash) {
          skippedFares += 1;
          continue;
        }
        snapshots.push(cash);
      }
    }
  }

  return { snapshots, azulJourneys, skippedFares, otherAirlineJourneys };
}

export function azulBodyLooksLikeError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as AzulAvailabilityResponse & { errorCode?: string };
  if (typeof body.message === 'string' && /something went wrong|unauthorized|forbidden|access denied/i.test(body.message)) {
    return body.message;
  }
  if (typeof body.error === 'string' && body.error.trim()) return body.error;
  if (typeof body.errorCode === 'string' && body.errorCode.trim()) return body.errorCode;
  return null;
}

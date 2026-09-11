import type { CollectParams, Snapshot } from '../types';
import { LATAM_CARRIER_CODES, LATAMAIRLINES_SOURCE, LATAM_PASS_SOURCE, LOYALTY_CURRENCIES } from './constants';
import type {
  GeckoItem,
  LatamBrand,
  LatamEndpoint,
  LatamOffer,
  LatamOffersResponse,
  LatamPricingMode,
  LatamSegment,
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

function moneyCurrency(value: MoneyAmount | null | undefined): string | null {
  if (value && typeof value.currency === 'string' && value.currency.trim()) {
    return value.currency.trim().toUpperCase();
  }
  return null;
}

function endpointIata(point: LatamEndpoint | string | undefined): string | undefined {
  if (!point) return undefined;
  if (typeof point === 'string') return point.trim().toUpperCase() || undefined;
  const code = point.iataCode ?? point.airportCode;
  return typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : undefined;
}

function carrierFromFlightCode(code: string | undefined): string | null {
  if (!code) return null;
  const match = code.trim().toUpperCase().match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])/);
  return match?.[1] ?? null;
}

function segmentCarrier(segment: LatamSegment): string | null {
  const candidates = [
    segment.carrierCode,
    segment.marketingCarrier?.code,
    segment.operatingCarrier?.code,
    carrierFromFlightCode(segment.flightCode),
    typeof segment.flightNumber === 'string' ? carrierFromFlightCode(segment.flightNumber) : null,
  ];
  for (const code of candidates) {
    if (typeof code === 'string' && code.trim()) return code.trim().toUpperCase();
  }
  return null;
}

function offerCarrierCodes(offer: LatamOffer): string[] {
  const codes: string[] = [];
  const fromSummary = carrierFromFlightCode(offer.summary?.flightCode);
  if (fromSummary) codes.push(fromSummary);
  const segments = [...(offer.itinerary ?? []), ...(offer.segments ?? [])];
  for (const segment of segments) {
    const code = segmentCarrier(segment);
    if (code) codes.push(code);
  }
  return codes;
}

export function isLatamOffer(offer: LatamOffer): boolean {
  const codes = offerCarrierCodes(offer);
  if (codes.length === 0) return true;
  return codes.every((code) => LATAM_CARRIER_CODES.has(code));
}

export function hasNonLatamCarrier(offer: LatamOffer): boolean {
  return offerCarrierCodes(offer).some((code) => !LATAM_CARRIER_CODES.has(code));
}

function geckoCarrierCodes(item: GeckoItem): string[] {
  const codes: string[] = [];
  const fromFlight = carrierFromFlightCode(item.flight?.flightCode);
  if (fromFlight) codes.push(fromFlight);
  for (const segment of item.flight?.segments ?? []) {
    if (typeof segment.carrierCode === 'string' && segment.carrierCode.trim()) {
      codes.push(segment.carrierCode.trim().toUpperCase());
    }
  }
  return codes;
}

export function isLatamGeckoItem(item: GeckoItem): boolean {
  const codes = geckoCarrierCodes(item);
  if (codes.length === 0) return true;
  return codes.every((code) => LATAM_CARRIER_CODES.has(code));
}

function unwrapRoot(payload: unknown): LatamOffersResponse | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as LatamOffersResponse;
  if (Array.isArray(root.content) || Array.isArray(root.items)) return root;
  const nested = root.data;
  if (nested && typeof nested === 'object') {
    if (Array.isArray(nested.content) || Array.isArray(nested.items)) return nested;
  }
  return root;
}

function offerOrigin(offer: LatamOffer): string | undefined {
  return endpointIata(offer.summary?.origin) ?? endpointIata(offer.itinerary?.[0]?.origin);
}

function offerDestination(offer: LatamOffer): string | undefined {
  return endpointIata(offer.summary?.destination) ?? endpointIata(offer.itinerary?.[0]?.destination);
}

function offerDeparture(offer: LatamOffer): string | undefined {
  return offer.summary?.origin?.departure ?? offer.itinerary?.[0]?.departure;
}

function brandCabin(brand: LatamBrand): string | null {
  if (typeof brand.cabin === 'string' && brand.cabin.trim()) return brand.cabin.trim();
  if (brand.cabin && typeof brand.cabin === 'object' && brand.cabin.label) return brand.cabin.label;
  return null;
}

function isLoyaltyCurrency(currency: string | null): boolean {
  return currency != null && LOYALTY_CURRENCIES.has(currency);
}

/**
 * Miles+money copay paid in BRL alongside miles. Never `priceWithOutTax`
 * (that is the equivalent cash fare LATAM hides in miles mode, not a copay).
 */
function brandCopay(brand: LatamBrand): number | null {
  const candidates = [brand.money, brand.copay, brand.additionalAmount, brand.fareMoney];
  for (const value of candidates) {
    if (value && typeof value === 'object' && moneyCurrency(value) && moneyCurrency(value) !== 'BRL') {
      continue;
    }
    const amount = moneyAmount(value ?? undefined);
    if (amount != null) return amount;
  }
  return null;
}

function snapshotBase(
  params: CollectParams,
  departure: string | undefined,
): Omit<Snapshot, 'miles' | 'amount_brl' | 'taxes_brl' | 'source' | 'raw_payload'> {
  return {
    origin: params.origin,
    destination: params.destination,
    airline: params.airline,
    program: params.program,
    flight_date: params.flightDate,
    departure_time: departureTimeOf(departure),
    currency: 'BRL',
  };
}

function snapshotFromMilesBrand(params: CollectParams, offer: LatamOffer, brand: LatamBrand): Snapshot | null {
  const currency = moneyCurrency(brand.price ?? undefined);
  if (currency && !isLoyaltyCurrency(currency)) return null;
  const miles = quotedOrNull(brand.price?.amount, 'miles');
  if (miles == null) return null;
  const taxesCurrency = moneyCurrency(brand.taxes ?? undefined);
  const taxes = !taxesCurrency || taxesCurrency === 'BRL' ? moneyAmount(brand.taxes ?? undefined) : null;
  return {
    ...snapshotBase(params, offerDeparture(offer)),
    miles,
    amount_brl: null,
    taxes_brl: taxes,
    source: LATAM_PASS_SOURCE,
    raw_payload: {
      redemption: true,
      flightCode: offer.summary?.flightCode ?? null,
      offerId: brand.offerId ?? null,
      brandId: brand.id ?? null,
      brandText: brand.brandText ?? null,
      cabin: brandCabin(brand),
      stops: offer.summary?.stopOvers ?? offer.summary?.stops ?? null,
      departure: offerDeparture(offer) ?? null,
      arrival: offer.summary?.destination?.arrival ?? null,
      miles: brand.price?.amount ?? null,
      // Equivalent cash fare LATAM attaches next to miles — not a copay, not amount_brl.
      price_without_tax_brl: moneyAmount(brand.priceWithOutTax ?? undefined),
      copay_brl: brandCopay(brand),
      taxes_brl: taxes,
    },
  };
}

function snapshotFromCashBrand(params: CollectParams, offer: LatamOffer, brand: LatamBrand): Snapshot | null {
  const currency = moneyCurrency(brand.price ?? undefined) ?? moneyCurrency(brand.priceWithOutTax ?? undefined);
  if (currency && currency !== 'BRL') return null;
  const amount = moneyAmount(brand.price ?? undefined) ?? moneyAmount(brand.priceWithOutTax ?? undefined);
  if (amount == null) return null;
  const taxesCurrency = moneyCurrency(brand.taxes ?? undefined);
  const taxes = !taxesCurrency || taxesCurrency === 'BRL' ? moneyAmount(brand.taxes ?? undefined) : null;
  return {
    ...snapshotBase(params, offerDeparture(offer)),
    miles: null,
    amount_brl: amount,
    taxes_brl: taxes,
    source: LATAMAIRLINES_SOURCE,
    raw_payload: {
      redemption: false,
      flightCode: offer.summary?.flightCode ?? null,
      offerId: brand.offerId ?? null,
      brandId: brand.id ?? null,
      brandText: brand.brandText ?? null,
      cabin: brandCabin(brand),
      stops: offer.summary?.stopOvers ?? offer.summary?.stops ?? null,
      departure: offerDeparture(offer) ?? null,
      arrival: offer.summary?.destination?.arrival ?? null,
      price: brand.price ?? null,
      priceWithOutTax: brand.priceWithOutTax ?? null,
    },
  };
}

function geckoItemMatches(item: GeckoItem, params: CollectParams): boolean {
  const origin = item.route?.originIata;
  const destination = item.route?.destinationIata;
  if (origin && origin !== params.origin) return false;
  if (destination && destination !== params.destination) return false;
  const date = civilDateOf(item.route?.departure);
  if (date && date !== params.flightDate) return false;
  return true;
}

function snapshotFromGeckoItem(params: CollectParams, item: GeckoItem, pricingMode: LatamPricingMode): Snapshot | null {
  if (pricingMode === 'miles') {
    const miles = quotedOrNull(item.miles, 'miles') ?? quotedOrNull(item.points, 'miles');
    const loyaltyPrice = isLoyaltyCurrency(moneyCurrency(item.price ?? undefined))
      ? quotedOrNull(item.price?.amount, 'miles')
      : null;
    const quoted = miles ?? loyaltyPrice;
    if (quoted == null) return null;
    return {
      ...snapshotBase(params, item.route?.departure),
      miles: quoted,
      amount_brl: null,
      taxes_brl: moneyAmount(item.taxes ?? undefined),
      source: LATAM_PASS_SOURCE,
      raw_payload: {
        redemption: true,
        flightCode: item.flight?.flightCode ?? null,
        brandId: item.fare?.brandId ?? null,
        brandText: item.fare?.brandText ?? null,
        cabin: item.fare?.cabinLabel ?? null,
        stops: item.flight?.stops ?? null,
        departure: item.route?.departure ?? null,
        arrival: item.route?.arrival ?? null,
        copay_brl: moneyAmount(item.copay ?? undefined),
      },
    };
  }

  if (moneyCurrency(item.price ?? undefined) && moneyCurrency(item.price ?? undefined) !== 'BRL') return null;
  const amount = moneyAmount(item.price ?? undefined);
  if (amount == null) return null;
  return {
    ...snapshotBase(params, item.route?.departure),
    miles: null,
    amount_brl: amount,
    taxes_brl: moneyAmount(item.taxes ?? undefined),
    source: LATAMAIRLINES_SOURCE,
    raw_payload: {
      redemption: false,
      flightCode: item.flight?.flightCode ?? null,
      brandId: item.fare?.brandId ?? null,
      brandText: item.fare?.brandText ?? null,
      cabin: item.fare?.cabinLabel ?? null,
      stops: item.flight?.stops ?? null,
      departure: item.route?.departure ?? null,
      arrival: item.route?.arrival ?? null,
      price: item.price ?? null,
    },
  };
}

export interface ParseOutcome {
  snapshots: Snapshot[];
  latamOffers: number;
  skippedFares: number;
  otherAirlineOffers: number;
}

export function parseLatamOffers(
  payload: unknown,
  params: CollectParams,
  pricingMode: LatamPricingMode,
): ParseOutcome {
  const snapshots: Snapshot[] = [];
  let latamOffers = 0;
  let skippedFares = 0;
  let otherAirlineOffers = 0;

  const root = unwrapRoot(payload);
  if (!root) return { snapshots, latamOffers, skippedFares, otherAirlineOffers };

  const content = Array.isArray(root.content) ? root.content : [];
  for (const offer of content) {
    if (hasNonLatamCarrier(offer) || !isLatamOffer(offer)) {
      otherAirlineOffers += 1;
      continue;
    }
    const origin = offerOrigin(offer);
    const destination = offerDestination(offer);
    if (origin && origin !== params.origin) continue;
    if (destination && destination !== params.destination) continue;
    const date = civilDateOf(offerDeparture(offer));
    if (date && date !== params.flightDate) continue;
    latamOffers += 1;
    const brands = Array.isArray(offer.summary?.brands) ? offer.summary.brands : [];
    if (brands.length === 0) {
      skippedFares += 1;
      continue;
    }
    for (const brand of brands) {
      const row =
        pricingMode === 'miles'
          ? snapshotFromMilesBrand(params, offer, brand)
          : snapshotFromCashBrand(params, offer, brand);
      if (!row) {
        skippedFares += 1;
        continue;
      }
      snapshots.push(row);
    }
  }

  const items = Array.isArray(root.items) ? root.items : [];
  for (const item of items) {
    if (!isLatamGeckoItem(item)) {
      otherAirlineOffers += 1;
      continue;
    }
    if (!geckoItemMatches(item, params)) continue;
    latamOffers += 1;
    const row = snapshotFromGeckoItem(params, item, pricingMode);
    if (!row) {
      skippedFares += 1;
      continue;
    }
    snapshots.push(row);
  }

  return { snapshots, latamOffers, skippedFares, otherAirlineOffers };
}

export function latamBodyLooksLikeError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as LatamOffersResponse & { errorCode?: string };
  if (typeof body.message === 'string' && /something went wrong|unauthorized|forbidden|access denied/i.test(body.message)) {
    return body.message;
  }
  if (typeof body.error === 'string' && body.error.trim()) return body.error;
  if (typeof body.errorCode === 'string' && body.errorCode.trim()) return body.errorCode;
  return null;
}

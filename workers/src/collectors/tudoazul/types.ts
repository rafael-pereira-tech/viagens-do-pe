export type AzulPricingMode = 'points' | 'cash';

export interface MoneyAmount {
  amount?: number | string | null;
  currency?: string | null;
}

export interface AzulPointsOption {
  passengerType?: string;
  /** Mix rung (1 = more points / less cash). Copay lives on fareMoney/totalMoney. */
  amountLevel?: number | string;
  points?: number | string | null;
  discountedPoints?: number | string | null;
  fareMoney?: MoneyAmount | null;
  taxesAndFees?: MoneyAmount | null;
  convenienceFee?: MoneyAmount | null;
  totalMoney?: MoneyAmount | null;
}

export interface AzulProductClass {
  code?: string;
  category?: string;
  name?: string;
}

export interface AzulFare {
  key?: string;
  fareAvailabilityKey?: string;
  productClass?: AzulProductClass | string;
  classOfService?: string;
  cabin?: string;
  lowestFare?: boolean;
  recommended?: boolean;
  total?: MoneyAmount | null;
  pointsOptions?: AzulPointsOption[];
  details?: Array<{ productClass?: string; classOfService?: string; fareBasis?: string }>;
  passengerFares?: AzulPassengerFare[];
}

export interface AzulPassengerFare {
  passengerType?: string;
  fareAmount?: number | string | null;
  points?: number | string | null;
  discountedPoints?: number | string | null;
  serviceCharges?: Array<{ type?: string; amount?: number | string; code?: string }>;
}

export interface AzulFlightIdent {
  carrierCode?: string;
  flightNumber?: string | number;
  identifier?: string | number;
  operatedBy?: string;
}

export interface AzulSegment {
  origin?: string;
  destination?: string;
  departure?: string;
  arrival?: string;
  stopsCount?: number;
  flight?: AzulFlightIdent;
  identifier?: { carrierCode?: string; identifier?: string | number };
  designator?: AzulDesignator;
}

export interface AzulDesignator {
  origin?: string;
  destination?: string;
  departure?: string;
  arrival?: string;
}

export interface AzulJourney {
  id?: string;
  journeyKey?: string;
  origin?: string;
  destination?: string;
  departure?: string;
  arrival?: string;
  stopsCount?: number;
  stops?: number;
  available?: boolean;
  duration?: string;
  designator?: AzulDesignator;
  segments?: AzulSegment[];
  fares?: AzulFare[];
  cheapestFare?: AzulFare;
}

export interface AzulTrip {
  origin?: string;
  destination?: string;
  date?: string;
  currency?: string;
  journeys?: AzulJourney[];
  /** Native Navitaire B2C: market key → journeys. */
  journeysAvailableByMarket?: Record<string, AzulJourney[]>;
  fareInformation?: {
    lowestAmount?: number | null;
    highestAmount?: number | null;
    lowestPoints?: number | null;
    highestPoints?: number | null;
  };
}

export interface AzulFlexibleDay {
  date?: string;
  lowestFare?: MoneyAmount | number | null;
  lowestPoints?: number | null;
}

export interface AzulAvailabilityResponse {
  pricingMode?: AzulPricingMode | string;
  trips?: AzulTrip[];
  /**
   * Calendar lowest fares only. Never persist as flight snapshots.
   */
  flexibleDays?: AzulFlexibleDay[];
  data?: AzulAvailabilityResponse | { trips?: AzulTrip[] };
  message?: string;
  error?: string;
  errorCode?: string;
  notifications?: Array<{ code?: string; message?: string }>;
}

export interface AzulSession {
  cookie?: string;
  accessToken?: string;
}

export interface AzulTokenResponse {
  token?: string;
  accessToken?: string;
  access_token?: string;
  data?: AzulTokenResponse | { token?: string; accessToken?: string };
}

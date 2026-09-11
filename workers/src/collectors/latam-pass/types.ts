export type LatamPricingMode = 'miles' | 'cash';

export interface MoneyAmount {
  amount?: number | string | null;
  currency?: string | null;
  display?: string | null;
  total?: number | string | null;
}

export interface LatamCabin {
  id?: string;
  label?: string;
}

export interface LatamEndpoint {
  iataCode?: string;
  airportCode?: string;
  departure?: string;
  arrival?: string;
}

export interface LatamBrand {
  id?: string;
  offerId?: string;
  brandText?: string;
  cabin?: LatamCabin | string;
  price?: MoneyAmount | null;
  priceWithOutTax?: MoneyAmount | null;
  taxes?: MoneyAmount | null;
  /** Miles+money copay (BRL paid with miles). Not full cash. */
  money?: MoneyAmount | number | string | null;
  copay?: MoneyAmount | number | string | null;
  additionalAmount?: MoneyAmount | number | string | null;
  fareMoney?: MoneyAmount | number | string | null;
}

export interface LatamSegment {
  origin?: string | LatamEndpoint;
  destination?: string | LatamEndpoint;
  departure?: string;
  arrival?: string;
  flightCode?: string;
  flightNumber?: string | number;
  carrierCode?: string;
  marketingCarrier?: { code?: string };
  operatingCarrier?: { code?: string };
}

export interface LatamSummary {
  flightCode?: string;
  stopOvers?: number;
  stops?: number;
  origin?: LatamEndpoint;
  destination?: LatamEndpoint;
  duration?: number;
  brands?: LatamBrand[];
}

export interface LatamOffer {
  summary?: LatamSummary;
  itinerary?: LatamSegment[];
  segments?: LatamSegment[];
}

export interface GeckoRoute {
  originIata?: string;
  destinationIata?: string;
  departure?: string;
  arrival?: string;
}

export interface GeckoFlight {
  flightCode?: string;
  durationMinutes?: number;
  stops?: number;
  segments?: Array<{ flightNumber?: string; carrierCode?: string }>;
}

export interface GeckoFare {
  brandId?: string;
  brandText?: string;
  cabinLabel?: string;
}

export interface GeckoItem {
  recordType?: string;
  route?: GeckoRoute;
  flight?: GeckoFlight;
  fare?: GeckoFare;
  price?: MoneyAmount | null;
  miles?: number | string | null;
  points?: number | string | null;
  taxes?: MoneyAmount | null;
  copay?: MoneyAmount | null;
}

export interface LatamOffersResponse {
  content?: LatamOffer[];
  items?: GeckoItem[];
  data?: LatamOffersResponse | { content?: LatamOffer[]; items?: GeckoItem[] };
  message?: string;
  error?: string;
  errorCode?: string;
}

export interface LatamSession {
  cookie?: string;
  accessToken?: string;
}

export interface LatamTokenResponse {
  token?: string;
  accessToken?: string;
  access_token?: string;
  data?: LatamTokenResponse | { token?: string; accessToken?: string };
}

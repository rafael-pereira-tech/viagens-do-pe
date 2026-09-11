export type SmilesEnvName = 'blue' | 'green';

export type SmilesFareType =
  | 'SMILES'
  | 'STANDARD'
  | 'SMILES_CLUB'
  | 'SMILES_MONEY'
  | 'SMILES_MONEY_CLUB'
  | 'MONEY'
  | string;

export interface SmilesAirport {
  code?: string;
  name?: string;
  city?: string;
}

export interface SmilesAirline {
  code?: string;
  name?: string;
}

export interface SmilesDatePoint {
  date?: string;
  airport?: SmilesAirport;
}

export interface SmilesG3Fare {
  costTax?: number | string;
  productClass?: string;
  classOfService?: string;
  fareBasisCode?: string;
}

/** Extractor `fareOptions[]` (STANDARD | SMILES_CLUB) plus native `fareList[]`. */
export interface SmilesFare {
  uid?: string;
  type?: SmilesFareType;
  fareType?: SmilesFareType;
  miles?: number | string;
  /** Smiles+Money COPAY in BRL — not full cash. Never persist as amount_brl. */
  money?: number | string;
  baseMiles?: number | string;
  airlineTax?: number | string;
  boardingTax?: number | string;
  costTax?: number | string;
  airlineFare?: number | string;
  airlineFareAmount?: number | string;
  g3?: SmilesG3Fare;
}

export interface SmilesFareOption {
  uid?: string;
  fareType?: SmilesFareType;
  type?: SmilesFareType;
  miles?: number | string;
  money?: number | string;
  costTax?: number | string;
  g3?: SmilesG3Fare;
}

export interface SmilesLeg {
  flightNumber?: string | number;
  marketingAirline?: SmilesAirline;
  operationAirline?: SmilesAirline;
  cabin?: string;
}

export interface SmilesFlight {
  uid?: string;
  cabin?: string;
  stops?: number | string;
  sourceGDS?: string;
  availableSeats?: number | string;
  airlineTax?: number | string;
  airline?: SmilesAirline;
  airline_code?: string;
  airlineCode?: string;
  departure?: SmilesDatePoint;
  arrival?: SmilesDatePoint;
  departureDate?: string;
  departureDateTime?: string;
  arrivalDate?: string;
  arrivalDateTime?: string;
  fareList?: SmilesFare[];
  fareOptions?: SmilesFareOption[];
  legList?: SmilesLeg[];
}

export interface SmilesFlightSegment {
  type?: string;
  flightList?: SmilesFlight[];
  flights?: SmilesFlight[];
}

export interface SmilesSearchResponse {
  requestedFlightSegmentList?: SmilesFlightSegment[];
  requestedFlightSegments?: SmilesFlightSegment[];
  flights?: SmilesFlight[];
  flightList?: SmilesFlight[];
  message?: string;
  error?: string;
  code?: string;
}

export interface SmilesSession {
  cookie?: string;
  accessToken?: string;
  memberNumber?: string;
  includeClub: boolean;
}

export type SmilesEnvName = 'blue' | 'green';

export type SmilesFareType =
  | 'SMILES'
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

export interface SmilesFare {
  uid?: string;
  type?: SmilesFareType;
  miles?: number | string;
  money?: number | string;
  baseMiles?: number | string;
  airlineTax?: number | string;
  boardingTax?: number | string;
  airlineFare?: number | string;
  airlineFareAmount?: number | string;
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
  departure?: SmilesDatePoint;
  arrival?: SmilesDatePoint;
  fareList?: SmilesFare[];
  legList?: SmilesLeg[];
}

export interface SmilesFlightSegment {
  type?: string;
  flightList?: SmilesFlight[];
}

export interface SmilesSearchResponse {
  requestedFlightSegmentList?: SmilesFlightSegment[];
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

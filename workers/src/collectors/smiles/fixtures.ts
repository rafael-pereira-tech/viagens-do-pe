import type { SmilesSearchResponse } from './types';

/**
 * Recorded shape of GET /v1/airlines/search (guest, PET→CGH).
 * Adapted from the Smiles SPA `requestedFlightSegmentList` contract
 * (GOL G3 + one partner flight that the parser must drop).
 * Dates in the payload are ignored; the collector stamps `params.flightDate`.
 */
export const SEARCH_PET_CGH_SUCCESS: SmilesSearchResponse = {
  requestedFlightSegmentList: [
    {
      type: 'SEGMENT_1',
      flightList: [
        {
          uid: 'g3-pet-cgh-morning',
          cabin: 'ECONOMIC',
          stops: 0,
          sourceGDS: 'G3',
          availableSeats: '4',
          airline: { code: 'G3', name: 'GOL (G3)' },
          departure: {
            date: '2026-09-15T06:40:00',
            airport: { code: 'PET', name: 'Pelotas', city: 'Pelotas' },
          },
          arrival: {
            date: '2026-09-15T08:05:00',
            airport: { code: 'CGH', name: 'Congonhas', city: 'São Paulo' },
          },
          legList: [
            {
              flightNumber: '1234',
              cabin: 'ECONOMIC',
              marketingAirline: { code: 'G3', name: 'GOL (G3)' },
              operationAirline: { code: 'G3', name: 'GOL (G3)' },
            },
          ],
          fareList: [
            {
              uid: 'fare-smiles',
              type: 'SMILES',
              miles: 18500,
              money: 0,
              baseMiles: 18500,
              g3: { costTax: 39.9, productClass: 'PQ', classOfService: 'U' },
            },
            {
              uid: 'fare-club',
              type: 'SMILES_CLUB',
              miles: 17100,
              money: 0,
              baseMiles: 18500,
              g3: { costTax: 39.9, productClass: 'PQ', classOfService: 'U' },
            },
            {
              uid: 'fare-smiles-money',
              type: 'SMILES_MONEY',
              miles: 7200,
              money: 248.5,
              baseMiles: 18500,
              airlineTax: 39.9,
            },
            {
              uid: 'fare-empty',
              type: 'SMILES_MONEY',
            },
            {
              uid: 'fare-zero-placeholder',
              type: 'SMILES_MONEY',
              miles: 0,
              money: 0,
            },
            {
              uid: 'fare-miles-only-omit-money',
              type: 'SMILES',
              miles: 14100,
            },
          ],
        },
        {
          uid: 'g3-pet-cgh-evening',
          cabin: 'ECONOMIC',
          stops: 0,
          sourceGDS: 'G3',
          airline: { code: 'G3', name: 'GOL (G3)' },
          departure: {
            date: '2026-09-15T18:20:00',
            airport: { code: 'PET', name: 'Pelotas', city: 'Pelotas' },
          },
          arrival: {
            date: '2026-09-15T19:45:00',
            airport: { code: 'CGH', name: 'Congonhas', city: 'São Paulo' },
          },
          fareList: [
            {
              uid: 'fare-evening-smiles',
              type: 'SMILES',
              miles: 16200,
              money: 0,
              airlineTax: 42.1,
            },
            {
              uid: 'fare-evening-money',
              type: 'SMILES_MONEY',
              miles: 6100,
              money: 310,
              airlineTax: 42.1,
            },
          ],
        },
        {
          uid: 'latam-should-drop',
          cabin: 'ECONOMIC',
          stops: 1,
          sourceGDS: 'JJ',
          airline: { code: 'JJ', name: 'LATAM' },
          departure: {
            date: '2026-09-15T09:15:00',
            airport: { code: 'PET', name: 'Pelotas', city: 'Pelotas' },
          },
          arrival: {
            date: '2026-09-15T12:40:00',
            airport: { code: 'CGH', name: 'Congonhas', city: 'São Paulo' },
          },
          fareList: [
            {
              uid: 'fare-latam',
              type: 'SMILES',
              miles: 22000,
              money: 0,
              airlineTax: 80,
            },
          ],
        },
      ],
    },
  ],
};

export const SEARCH_PET_CGH_EMPTY: SmilesSearchResponse = {
  requestedFlightSegmentList: [
    {
      type: 'SEGMENT_1',
      flightList: [],
    },
  ],
};

export const SEARCH_PET_CGH_GOL_NO_FARES: SmilesSearchResponse = {
  requestedFlightSegmentList: [
    {
      type: 'SEGMENT_1',
      flightList: [
        {
          uid: 'g3-no-fares',
          sourceGDS: 'G3',
          airline: { code: 'G3', name: 'GOL (G3)' },
          departure: {
            date: '2026-09-17T07:00:00',
            airport: { code: 'PET' },
          },
          fareList: [],
        },
      ],
    },
  ],
};

export const SEARCH_AKAMAI_BLOCK = {
  message: 'Something went wrong',
  referenceId: 'fixture-akamai',
};

export const SEARCH_HTML_BLOCK = `<!DOCTYPE html><html><head><title>Access Denied</title></head><body>Access Denied</body></html>`;

/**
 * Extractor-shaped search (fareOptions[] STANDARD|SMILES_CLUB, airline_code=G3).
 * Used to prove we parse the documented contract, not only native fareList.
 */
export const SEARCH_PET_CGH_FARE_OPTIONS = {
  requestedFlightSegments: [
    {
      flights: [
        {
          uid: 'g3-extractor-morning',
          airline_code: 'G3',
          cabin: 'ECONOMY',
          stops: 0,
          departureDateTime: '2026-09-15T08:10:00',
          arrivalDateTime: '2026-09-15T09:20:00',
          fareOptions: [
            { fareType: 'STANDARD', miles: 15000, money: 199.9, costTax: 32.44 },
            { fareType: 'SMILES_CLUB', miles: 13200, money: 0, costTax: 32.44 },
            { fareType: 'STANDARD', miles: 0, money: 0, costTax: 32.44 },
          ],
        },
        {
          uid: 'latam-extractor-drop',
          airline_code: 'JJ',
          departureDateTime: '2026-09-15T10:00:00',
          fareOptions: [{ fareType: 'STANDARD', miles: 21000, money: 0, costTax: 80 }],
        },
      ],
    },
  ],
};

/**
 * VoeGol B2C cash offers (full BRL, not Smiles copay).
 * Shape matches the documented `offers[].total.amount` + `currency=BRL`.
 */
export const VOEGOL_PET_CGH_SUCCESS = {
  offers: [
    {
      id: 'offer-morning',
      segments: [
        {
          origin: 'PET',
          destination: 'CGH',
          departureDateTime: '2026-09-15T06:40:00',
          arrivalDateTime: '2026-09-15T08:05:00',
          flightNumber: '1234',
          airlineCode: 'G3',
        },
      ],
      total: { amount: 389.9, currency: 'BRL' },
    },
    {
      id: 'offer-evening',
      segments: [
        {
          origin: 'PET',
          destination: 'CGH',
          departureDateTime: '2026-09-15T18:20:00',
          arrivalDateTime: '2026-09-15T19:45:00',
          flightNumber: '1678',
          airlineCode: 'G3',
        },
      ],
      total: { amount: 421, currency: 'BRL' },
    },
    {
      id: 'offer-zero-skip',
      segments: [
        {
          origin: 'PET',
          destination: 'CGH',
          departureDateTime: '2026-09-15T12:00:00',
          airlineCode: 'G3',
        },
      ],
      total: { amount: 0, currency: 'BRL' },
    },
    {
      id: 'offer-missing-amount',
      segments: [
        {
          origin: 'PET',
          destination: 'CGH',
          departureDateTime: '2026-09-15T13:00:00',
          airlineCode: 'G3',
        },
      ],
      total: { currency: 'BRL' },
    },
    {
      id: 'offer-partner-drop',
      segments: [
        {
          origin: 'PET',
          destination: 'CGH',
          departureDateTime: '2026-09-15T09:15:00',
          airlineCode: 'JJ',
        },
      ],
      total: { amount: 999, currency: 'BRL' },
    },
  ],
};

export const VOEGOL_PET_CGH_EMPTY = { offers: [] };

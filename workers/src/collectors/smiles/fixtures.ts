import type { SmilesSearchResponse, VoegolSearchResponse } from './types';

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

/**
 * Recorded shape of POST /api/sabre-default/flights (VoeGol B2C cash, PET→CGH).
 * Adapted from the GOL itineraries `itineraries[].offers[].total` contract
 * (G3 + one partner itinerary that the parser must drop).
 */
export const SEARCH_PET_CGH_CASH: VoegolSearchResponse = {
  itineraries: [
    {
      id: 'g3-pet-cgh-morning-cash',
      origin: 'PET',
      destination: 'CGH',
      departure: '2026-09-15T06:40:00',
      arrival: '2026-09-15T08:05:00',
      stopsCount: 0,
      segments: [
        {
          origin: 'PET',
          destination: 'CGH',
          departure: '2026-09-15T06:40:00',
          arrival: '2026-09-15T08:05:00',
          flight: { airlineCode: 'G3', flightNumber: '1234' },
        },
      ],
      offers: [
        {
          brandId: 'LI',
          brandLabel: 'Light',
          cabinClass: 'Economy',
          seatsRemaining: 9,
          total: { currency: 'BRL', amount: 548.9 },
        },
        {
          brandId: 'ZERO',
          brandLabel: 'Placeholder',
          total: { currency: 'BRL', amount: 0 },
        },
      ],
    },
    {
      id: 'g3-pet-cgh-evening-cash',
      origin: 'PET',
      destination: 'CGH',
      departure: '2026-09-15T18:20:00',
      arrival: '2026-09-15T19:45:00',
      stopsCount: 0,
      segments: [
        {
          origin: 'PET',
          destination: 'CGH',
          flight: { airlineCode: 'G3', flightNumber: '1238' },
        },
      ],
      offers: [
        {
          brandId: 'LI',
          brandLabel: 'Light',
          cabinClass: 'Economy',
          total: { currency: 'BRL', amount: 631.2 },
        },
      ],
    },
    {
      id: 'latam-should-drop',
      origin: 'PET',
      destination: 'CGH',
      departure: '2026-09-15T09:15:00',
      arrival: '2026-09-15T12:40:00',
      stopsCount: 1,
      segments: [
        {
          origin: 'PET',
          destination: 'CGH',
          flight: { airlineCode: 'JJ', flightNumber: '3456' },
        },
      ],
      offers: [
        {
          brandId: 'LT',
          total: { currency: 'BRL', amount: 199.9 },
        },
      ],
    },
  ],
};

export const SEARCH_PET_CGH_CASH_EMPTY: VoegolSearchResponse = {
  itineraries: [],
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

import type { AzulAvailabilityResponse } from './types';

/**
 * Recorded shape of POST .../availability/v5/availability with points=true (PET→VCP).
 * Mix of gecko-normalized `pointsOptions` (official extract) plus a partner flight
 * the parser must drop. Dates are rewritten by the dry-run collector.
 */
export const SEARCH_PET_VCP_POINTS: AzulAvailabilityResponse = {
  pricingMode: 'points',
  trips: [
    {
      origin: 'PET',
      destination: 'VCP',
      date: '2026-09-14',
      currency: 'BRL',
      journeys: [
        {
          id: 'PET-VCP-20260914-AD4120',
          journeyKey: 'PET|VCP|2026-09-14|AD4120',
          origin: 'PET',
          destination: 'VCP',
          departure: '2026-09-14T06:40:00',
          arrival: '2026-09-14T08:05:00',
          stopsCount: 0,
          available: true,
          segments: [
            {
              origin: 'PET',
              destination: 'VCP',
              departure: '2026-09-14T06:40:00',
              arrival: '2026-09-14T08:05:00',
              flight: { carrierCode: 'AD', flightNumber: '4120', operatedBy: 'Azul' },
            },
          ],
          fares: [
            {
              key: 'PET-VCP-AD4120-AZUL',
              productClass: { code: 'AZUL', category: 'ECONOMY', name: 'Azul' },
              classOfService: 'P',
              cabin: 'ECONOMY',
              lowestFare: true,
              pointsOptions: [
                {
                  passengerType: 'ADT',
                  amountLevel: 1,
                  points: 18500,
                  discountedPoints: 18500,
                  fareMoney: { amount: 0, currency: 'BRL' },
                  taxesAndFees: { amount: 39.9, currency: 'BRL' },
                  totalMoney: { amount: 39.9, currency: 'BRL' },
                },
                {
                  passengerType: 'ADT',
                  amountLevel: 2,
                  points: 7200,
                  fareMoney: { amount: 248.5, currency: 'BRL' },
                  taxesAndFees: { amount: 39.9, currency: 'BRL' },
                  convenienceFee: { amount: 0, currency: 'BRL' },
                  totalMoney: { amount: 288.4, currency: 'BRL' },
                },
                {
                  passengerType: 'ADT',
                  amountLevel: 3,
                  points: 0,
                  fareMoney: { amount: 0, currency: 'BRL' },
                },
                {
                  passengerType: 'ADT',
                  points: 14100,
                },
              ],
            },
          ],
        },
        {
          id: 'PET-VCP-20260914-AD4128',
          journeyKey: 'PET|VCP|2026-09-14|AD4128',
          origin: 'PET',
          destination: 'VCP',
          departure: '2026-09-14T18:20:00',
          arrival: '2026-09-14T19:45:00',
          stopsCount: 0,
          available: true,
          segments: [
            {
              origin: 'PET',
              destination: 'VCP',
              flight: { carrierCode: 'AD', flightNumber: '4128' },
            },
          ],
          fares: [
            {
              key: 'PET-VCP-AD4128-AZUL',
              productClass: { code: 'AZUL', category: 'ECONOMY', name: 'Azul' },
              pointsOptions: [
                {
                  passengerType: 'ADT',
                  points: 16200,
                  taxesAndFees: { amount: 42.1, currency: 'BRL' },
                },
              ],
            },
          ],
        },
        {
          id: 'latam-should-drop',
          journeyKey: 'PET|VCP|2026-09-14|LA3456',
          origin: 'PET',
          destination: 'VCP',
          departure: '2026-09-14T09:15:00',
          available: true,
          segments: [
            {
              origin: 'PET',
              destination: 'VCP',
              flight: { carrierCode: 'LA', flightNumber: '3456', operatedBy: 'LATAM' },
            },
          ],
          fares: [
            {
              key: 'partner',
              pointsOptions: [{ points: 22000, taxesAndFees: { amount: 80, currency: 'BRL' } }],
            },
          ],
        },
      ],
    },
  ],
};

export const SEARCH_PET_VCP_CASH: AzulAvailabilityResponse = {
  pricingMode: 'cash',
  trips: [
    {
      origin: 'PET',
      destination: 'VCP',
      date: '2026-09-14',
      currency: 'BRL',
      journeys: [
        {
          id: 'PET-VCP-20260914-AD4120',
          journeyKey: 'PET|VCP|2026-09-14|AD4120',
          origin: 'PET',
          destination: 'VCP',
          departure: '2026-09-14T06:40:00',
          arrival: '2026-09-14T08:05:00',
          stopsCount: 0,
          available: true,
          segments: [
            {
              origin: 'PET',
              destination: 'VCP',
              flight: { carrierCode: 'AD', flightNumber: '4120' },
            },
          ],
          fares: [
            {
              key: 'PET-VCP-AD4120-AZUL-CASH',
              productClass: { code: 'AZUL', category: 'ECONOMY', name: 'Azul' },
              classOfService: 'P',
              cabin: 'ECONOMY',
              lowestFare: true,
              total: { currency: 'BRL', amount: 529.9 },
            },
            {
              key: 'zero-cash-placeholder',
              productClass: { code: 'AZUL', name: 'Azul' },
              total: { currency: 'BRL', amount: 0 },
            },
          ],
        },
        {
          id: 'PET-VCP-20260914-AD4128',
          journeyKey: 'PET|VCP|2026-09-14|AD4128',
          origin: 'PET',
          destination: 'VCP',
          departure: '2026-09-14T18:20:00',
          arrival: '2026-09-14T19:45:00',
          stopsCount: 0,
          available: true,
          segments: [
            {
              origin: 'PET',
              destination: 'VCP',
              flight: { carrierCode: 'AD', flightNumber: '4128' },
            },
          ],
          fares: [
            {
              key: 'PET-VCP-AD4128-AZUL-CASH',
              productClass: { code: 'AZUL', category: 'ECONOMY', name: 'Azul' },
              total: { currency: 'BRL', amount: 612.4 },
            },
          ],
        },
      ],
    },
  ],
};

export const SEARCH_PET_POA_POINTS: AzulAvailabilityResponse = {
  pricingMode: 'points',
  trips: [
    {
      origin: 'PET',
      destination: 'POA',
      date: '2026-09-16',
      journeys: [
        {
          id: 'PET-POA-20260916-AD2471',
          journeyKey: 'PET|POA|2026-09-16|AD2471',
          origin: 'PET',
          destination: 'POA',
          departure: '2026-09-16T11:10:00',
          arrival: '2026-09-16T12:05:00',
          stopsCount: 0,
          available: true,
          segments: [
            {
              origin: 'PET',
              destination: 'POA',
              flight: { carrierCode: 'AD', flightNumber: '2471' },
            },
          ],
          fares: [
            {
              key: 'PET-POA-AD2471-AZUL',
              productClass: { code: 'AZUL', category: 'ECONOMY', name: 'Azul' },
              pointsOptions: [
                {
                  passengerType: 'ADT',
                  points: 9800,
                  taxesAndFees: { amount: 32.5, currency: 'BRL' },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export const SEARCH_PET_POA_CASH: AzulAvailabilityResponse = {
  pricingMode: 'cash',
  trips: [
    {
      origin: 'PET',
      destination: 'POA',
      date: '2026-09-16',
      journeys: [
        {
          id: 'PET-POA-20260916-AD2471',
          journeyKey: 'PET|POA|2026-09-16|AD2471',
          origin: 'PET',
          destination: 'POA',
          departure: '2026-09-16T11:10:00',
          available: true,
          segments: [
            {
              origin: 'PET',
              destination: 'POA',
              flight: { carrierCode: 'AD', flightNumber: '2471' },
            },
          ],
          fares: [
            {
              key: 'PET-POA-AD2471-CASH',
              productClass: { code: 'AZUL', name: 'Azul' },
              total: { currency: 'BRL', amount: 389.0 },
            },
          ],
        },
      ],
    },
  ],
};

/** Native Navitaire `journeysAvailableByMarket` (cash). */
export const SEARCH_NAVITAIRE_CASH: AzulAvailabilityResponse = {
  trips: [
    {
      journeysAvailableByMarket: {
        'PET|VCP': [
          {
            journeyKey: 'navitaire-pet-vcp',
            designator: {
              origin: 'PET',
              destination: 'VCP',
              departure: '2026-09-14T07:00:00',
              arrival: '2026-09-14T08:20:00',
            },
            stops: 0,
            available: true,
            segments: [
              {
                identifier: { carrierCode: 'AD', identifier: '4101' },
                designator: { origin: 'PET', destination: 'VCP', departure: '2026-09-14T07:00:00' },
              },
            ],
            fares: [
              {
                fareAvailabilityKey: 'nav-fare',
                details: [{ productClass: 'AZUL', classOfService: 'P' }],
                passengerFares: [{ passengerType: 'ADT', fareAmount: 455.75 }],
              },
            ],
          },
        ],
      },
    },
  ],
};

export const SEARCH_EMPTY: AzulAvailabilityResponse = {
  trips: [{ origin: 'PET', destination: 'VCP', journeys: [] }],
};

export const SEARCH_NO_FARES: AzulAvailabilityResponse = {
  trips: [
    {
      origin: 'PET',
      destination: 'VCP',
      journeys: [
        {
          origin: 'PET',
          destination: 'VCP',
          departure: '2026-09-14T07:00:00',
          available: true,
          segments: [{ flight: { carrierCode: 'AD', flightNumber: '1' } }],
          fares: [],
        },
      ],
    },
  ],
};

export const SEARCH_AKAMAI_BLOCK = {
  message: 'Something went wrong',
  referenceId: 'fixture-akamai',
};

export const SEARCH_HTML_BLOCK =
  '<!DOCTYPE html><html><head><title>Access Denied</title></head><body>Access Denied</body></html>';

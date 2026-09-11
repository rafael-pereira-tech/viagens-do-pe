import type { LatamOffersResponse } from './types';

/**
 * Recorded shape of GET /bff/air-offers/offers/search?redemption=true (PET→GRU).
 * Mix of native BFF `content[].summary.brands` (milheiro / SPA contract) plus a
 * partner flight the parser must drop. Dates are rewritten by the dry-run collector.
 */
export const SEARCH_PET_GRU_MILES: LatamOffersResponse = {
  content: [
    {
      summary: {
        flightCode: 'LA3456',
        stopOvers: 0,
        origin: { iataCode: 'PET', departure: '2026-09-16T10:25:00' },
        destination: { iataCode: 'GRU', arrival: '2026-09-16T12:05:00' },
        brands: [
          {
            id: 'SL',
            offerId: 'pet-gru-la3456-light-miles',
            brandText: 'LIGHT',
            cabin: { id: 'Y', label: 'Economy' },
            price: { currency: 'LOYALTY_POINTS', amount: 12500, display: '12.500 milhas' },
            priceWithOutTax: { currency: 'BRL', amount: 359.9, display: 'BRL 359,90' },
            taxes: { currency: 'BRL', amount: 39.9, display: 'BRL 39,90' },
          },
          {
            id: 'KM',
            offerId: 'pet-gru-la3456-mix',
            brandText: 'STANDARD',
            cabin: { id: 'Y', label: 'Economy' },
            price: { currency: 'LOYALTY_POINTS', amount: 7200, display: '7.200 milhas' },
            priceWithOutTax: { currency: 'BRL', amount: 359.9, display: 'BRL 359,90' },
            taxes: { currency: 'BRL', amount: 39.9, display: 'BRL 39,90' },
            money: { currency: 'BRL', amount: 198.5, display: 'BRL 198,50' },
          },
          {
            id: 'KD',
            offerId: 'pet-gru-la3456-zero',
            brandText: 'FULL',
            cabin: { id: 'Y', label: 'Economy' },
            price: { currency: 'LOYALTY_POINTS', amount: 0 },
            money: { currency: 'BRL', amount: 0 },
          },
          {
            id: 'SL2',
            offerId: 'pet-gru-la3456-miles-only',
            brandText: 'LIGHT',
            cabin: { id: 'Y', label: 'Economy' },
            price: { currency: 'LOYALTY_POINTS', amount: 14100 },
          },
        ],
      },
    },
    {
      summary: {
        flightCode: 'LA3460',
        stopOvers: 0,
        origin: { iataCode: 'PET', departure: '2026-09-16T16:40:00' },
        destination: { iataCode: 'GRU', arrival: '2026-09-16T18:20:00' },
        brands: [
          {
            id: 'SL',
            offerId: 'pet-gru-la3460-light-miles',
            brandText: 'LIGHT',
            cabin: { id: 'Y', label: 'Economy' },
            price: { currency: 'LOYALTY_POINTS', amount: 11800, display: '11.800 milhas' },
            taxes: { currency: 'BRL', amount: 42.1, display: 'BRL 42,10' },
          },
        ],
      },
    },
    {
      summary: {
        flightCode: 'G31234',
        stopOvers: 0,
        origin: { iataCode: 'PET', departure: '2026-09-16T09:15:00' },
        destination: { iataCode: 'GRU', arrival: '2026-09-16T10:50:00' },
        brands: [
          {
            id: 'SL',
            offerId: 'gol-should-drop',
            brandText: 'LIGHT',
            price: { currency: 'LOYALTY_POINTS', amount: 22000 },
          },
        ],
      },
    },
  ],
};

export const SEARCH_PET_GRU_CASH: LatamOffersResponse = {
  content: [
    {
      summary: {
        flightCode: 'LA3456',
        stopOvers: 0,
        origin: { iataCode: 'PET', departure: '2026-09-16T10:25:00' },
        destination: { iataCode: 'GRU', arrival: '2026-09-16T12:05:00' },
        brands: [
          {
            id: 'SL',
            offerId: 'pet-gru-la3456-light-cash',
            brandText: 'LIGHT',
            cabin: { id: 'Y', label: 'Economy' },
            price: { currency: 'BRL', amount: 429.9, display: 'BRL 429,90' },
            taxes: { currency: 'BRL', amount: 39.9, display: 'BRL 39,90' },
          },
          {
            id: 'KM',
            offerId: 'pet-gru-la3456-std-cash',
            brandText: 'STANDARD',
            cabin: { id: 'Y', label: 'Economy' },
            price: { currency: 'BRL', amount: 512.4, display: 'BRL 512,40' },
          },
          {
            id: 'ZERO',
            offerId: 'pet-gru-la3456-zero-cash',
            brandText: 'LIGHT',
            price: { currency: 'BRL', amount: 0 },
          },
        ],
      },
    },
    {
      summary: {
        flightCode: 'G31234',
        stopOvers: 0,
        origin: { iataCode: 'PET', departure: '2026-09-16T09:15:00' },
        destination: { iataCode: 'GRU', arrival: '2026-09-16T10:50:00' },
        brands: [
          {
            id: 'SL',
            brandText: 'LIGHT',
            price: { currency: 'BRL', amount: 199.9 },
          },
        ],
      },
    },
  ],
};

/** Gecko-normalized cash PLP items (official extract). */
export const SEARCH_GECKO_CASH: LatamOffersResponse = {
  items: [
    {
      recordType: 'flight_price',
      route: {
        originIata: 'PET',
        destinationIata: 'GRU',
        departure: '2026-09-16T11:10:00',
        arrival: '2026-09-16T12:50:00',
      },
      flight: {
        flightCode: 'LA3470',
        durationMinutes: 100,
        stops: 0,
        segments: [{ flightNumber: '3470', carrierCode: 'LA' }],
      },
      fare: { brandId: 'LIGHT', brandText: 'Light', cabinLabel: 'Economy' },
      price: { currency: 'BRL', amount: 388.75, display: 'R$ 388,75', total: 388.75 },
    },
  ],
};

export const SEARCH_EMPTY: LatamOffersResponse = {
  content: [],
};

export const SEARCH_NO_FARES: LatamOffersResponse = {
  content: [
    {
      summary: {
        flightCode: 'LA3456',
        stopOvers: 0,
        origin: { iataCode: 'PET', departure: '2026-09-16T10:25:00' },
        destination: { iataCode: 'GRU', arrival: '2026-09-16T12:05:00' },
        brands: [],
      },
    },
  ],
};

/**
 * Connecting PET→GRU (via CGH). Valid inventory — not scrape_failed.
 * DOW preference is scheduler-only.
 */
export const SEARCH_PET_GRU_CONNECTING: LatamOffersResponse = {
  content: [
    {
      summary: {
        flightCode: 'LA3458',
        stopOvers: 1,
        origin: { iataCode: 'PET', departure: '2026-09-16T07:00:00' },
        destination: { iataCode: 'GRU', arrival: '2026-09-16T12:30:00' },
        brands: [
          {
            id: 'SL',
            offerId: 'pet-gru-connecting-cash',
            brandText: 'LIGHT',
            price: { currency: 'BRL', amount: 678.2 },
          },
        ],
      },
    },
  ],
};

export const SEARCH_AKAMAI_BLOCK = {
  message: 'Something went wrong',
  referenceId: 'fixture-akamai',
};

export const SEARCH_HTML_BLOCK =
  '<!DOCTYPE html><html><head><title>Access Denied</title></head><body>Access Denied</body></html>';

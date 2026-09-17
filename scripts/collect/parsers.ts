// Parsers: turn a captured airline search response into normalized snapshot rows
// matching public.price_snapshots. Pure functions, no I/O — easy to unit test.
//
// Schemas were reverse-engineered from real 200 responses (see docs/research/contracts).

export type Airline = 'GOL' | 'AZUL' | 'LATAM';
export type Program = 'smiles' | 'tudoazul' | 'latam_pass';

export interface SnapshotRow {
  origin: string; // IATA
  destination: string; // IATA
  airline: Airline;
  program: Program;
  flightDate: string; // YYYY-MM-DD (local requested date)
  departureTime: string | null; // HH:MM:SS
  miles: number | null;
  amountBrl: number | null;
  taxesBrl: number | null;
  currency: string; // BRL
  // Context (kept in JSONL, not a DB column):
  fareLabel?: string;
  flightCode?: string;
  stops?: number;
}

/** Extract HH:MM:SS from an ISO datetime ("2026-10-16T18:20:00") or a "HH:MM" string. */
function timeOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const iso = value.match(/T(\d{2}:\d{2})(:\d{2})?/);
  if (iso) return `${iso[1]}${iso[2] ?? ':00'}`;
  const hm = value.match(/^(\d{2}):(\d{2})$/);
  if (hm) return `${value}:00`;
  return null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// LATAM cash — GET /bff/air-offers/.../offers/search
// ---------------------------------------------------------------------------
export function parseLatamCash(
  body: unknown,
  origin: string,
  destination: string,
  flightDate: string,
): SnapshotRow[] {
  const root = body as { content?: unknown[] };
  const rows: SnapshotRow[] = [];
  for (const item of root.content ?? []) {
    const c = item as {
      summary?: {
        origin?: { departureTime?: string; departure?: string };
        flightCode?: string;
        stopOvers?: number;
        lowestPrice?: { amount?: number };
        lowestBrandText?: string;
        brands?: Array<{ brandText?: string; price?: { amount?: number } }>;
      };
      newPrices?: Array<{ fare?: number; taxes?: number; total?: number }>;
    };
    const s = c.summary;
    if (!s) continue;
    const amount = num(s.lowestPrice?.amount);
    if (amount === null) continue;
    // Match the taxes of the fare whose total equals the lowest price.
    const priced = (c.newPrices ?? []).find((p) => Math.abs((p.total ?? -1) - amount) < 0.01);
    rows.push({
      origin,
      destination,
      airline: 'LATAM',
      program: 'latam_pass',
      flightDate,
      departureTime: timeOf(s.origin?.departureTime ?? s.origin?.departure),
      miles: null,
      amountBrl: amount,
      taxesBrl: num(priced?.taxes),
      currency: 'BRL',
      fareLabel: s.lowestBrandText,
      flightCode: s.flightCode,
      stops: s.stopOvers,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Smiles — GET /v1/airlines/search  (one-way => SEGMENT_1 only)
// Emits a miles row (club price) and a cash row (MONEY fare) per flight.
// ---------------------------------------------------------------------------
export function parseSmiles(
  body: unknown,
  origin: string,
  destination: string,
  flightDate: string,
): SnapshotRow[] {
  const root = body as {
    requestedFlightSegmentList?: Array<{
      type?: string;
      flightList?: Array<{
        stops?: number;
        departure?: { date?: string };
        legList?: Array<{ flightNumber?: string }>;
        fareList?: Array<{
          type?: string;
          miles?: number;
          money?: number;
          g3?: { costTax?: string };
        }>;
      }>;
    }>;
  };
  const rows: SnapshotRow[] = [];
  const seg =
    (root.requestedFlightSegmentList ?? []).find((s) => s.type === 'SEGMENT_1') ??
    (root.requestedFlightSegmentList ?? [])[0];
  for (const f of seg?.flightList ?? []) {
    const departureTime = timeOf(f.departure?.date);
    const flightCode = f.legList?.[0]?.flightNumber
      ? `G3${f.legList[0].flightNumber}`
      : undefined;
    const fares = f.fareList ?? [];
    // Miles: prefer the club subscriber price, else the standard SMILES fare.
    const club = fares.find((x) => x.type === 'SMILES_CLUB');
    const std = fares.find((x) => x.type === 'SMILES');
    const milesFare = club ?? std;
    if (milesFare && num(milesFare.miles)) {
      rows.push({
        origin,
        destination,
        airline: 'GOL',
        program: 'smiles',
        flightDate,
        departureTime,
        miles: num(milesFare.miles),
        amountBrl: null,
        taxesBrl: num(milesFare.g3?.costTax),
        currency: 'BRL',
        fareLabel: milesFare.type,
        flightCode,
        stops: f.stops,
      });
    }
    // Cash: the MONEY fare (guest, no login).
    const money = fares.find((x) => x.type === 'MONEY');
    if (money && num(money.money)) {
      rows.push({
        origin,
        destination,
        airline: 'GOL',
        program: 'smiles',
        flightDate,
        departureTime,
        miles: null,
        amountBrl: num(money.money),
        taxesBrl: num(money.g3?.costTax),
        currency: 'BRL',
        fareLabel: 'MONEY',
        flightCode,
        stops: f.stops,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Azul — POST .../availability  (cc=BRL cash | cc=PTS points)
// ---------------------------------------------------------------------------
interface AzulTrip {
  arrivalStation?: string;
  journeys?: Array<{
    identifier?: { flightNumber?: string; std?: string; connections?: unknown };
    segments?: Array<{ legs?: unknown[] }>;
    fares?: Array<{
      productClass?: { name?: string };
      paxFares?: Array<{ totalAmount?: number }>;
      paxPoints?: Array<{
        levels?: Array<{
          points?: { amount?: number; discountedAmount?: number };
          taxesAndFees?: number;
          convenienceFee?: number;
          totalMoney?: number;
        }>;
      }>;
    }>;
  }>;
}

function azulRows(
  body: unknown,
  origin: string,
  destination: string,
  flightDate: string,
  mode: 'cash' | 'points',
): SnapshotRow[] {
  const root = body as { data?: { trips?: AzulTrip[] } };
  const rows: SnapshotRow[] = [];
  for (const trip of root.data?.trips ?? []) {
    for (const j of trip.journeys ?? []) {
      const departureTime = timeOf(j.identifier?.std);
      const stops = Math.max(0, ((j.segments?.[0]?.legs?.length ?? 1) as number) - 1);
      const flightCode = j.identifier?.flightNumber ? `AD${j.identifier.flightNumber}` : undefined;
      if (mode === 'cash') {
        let best: { amount: number; label?: string } | null = null;
        for (const fare of j.fares ?? []) {
          const amt = num(fare.paxFares?.[0]?.totalAmount);
          if (amt !== null && (best === null || amt < best.amount)) {
            best = { amount: amt, label: fare.productClass?.name };
          }
        }
        if (best) {
          rows.push({
            origin,
            destination,
            airline: 'AZUL',
            program: 'tudoazul',
            flightDate,
            departureTime,
            miles: null,
            amountBrl: best.amount,
            taxesBrl: null, // Azul cash totalAmount already includes taxes
            currency: 'BRL',
            fareLabel: best.label,
            flightCode,
            stops,
          });
        }
      } else {
        let best: { pts: number; tax: number | null; label?: string } | null = null;
        for (const fare of j.fares ?? []) {
          const lvl = fare.paxPoints?.[0]?.levels?.[0];
          const pts = num(lvl?.points?.discountedAmount) ?? num(lvl?.points?.amount);
          if (pts !== null && (best === null || pts < best.pts)) {
            best = { pts, tax: num(lvl?.totalMoney), label: fare.productClass?.name };
          }
        }
        if (best) {
          rows.push({
            origin,
            destination,
            airline: 'AZUL',
            program: 'tudoazul',
            flightDate,
            departureTime,
            miles: best.pts,
            amountBrl: null,
            taxesBrl: best.tax, // cash paid alongside points (taxes + convenience fee)
            currency: 'BRL',
            fareLabel: best.label,
            flightCode,
            stops,
          });
        }
      }
    }
  }
  return rows;
}

export const parseAzulCash = (b: unknown, o: string, d: string, f: string): SnapshotRow[] =>
  azulRows(b, o, d, f, 'cash');
export const parseAzulPoints = (b: unknown, o: string, d: string, f: string): SnapshotRow[] =>
  azulRows(b, o, d, f, 'points');

// ---------------------------------------------------------------------------
// SQL emission
// ---------------------------------------------------------------------------
function sqlValue(v: string | number | null): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

/** Build a single multi-row INSERT ... ON CONFLICT DO NOTHING statement. */
export function rowsToSql(rows: SnapshotRow[], source: string, collectedAtIso: string): string {
  if (rows.length === 0) return '-- no rows\n';
  const cols =
    '(origin, destination, airline, program, flight_date, departure_time, miles, amount_brl, taxes_brl, currency, source, collected_at)';
  const values = rows
    .map((r) =>
      `  (${[
        sqlValue(r.origin),
        sqlValue(r.destination),
        sqlValue(r.airline),
        sqlValue(r.program),
        sqlValue(r.flightDate),
        sqlValue(r.departureTime),
        r.miles === null ? 'NULL' : String(r.miles),
        r.amountBrl === null ? 'NULL' : String(r.amountBrl),
        r.taxesBrl === null ? 'NULL' : String(r.taxesBrl),
        sqlValue(r.currency),
        sqlValue(source),
        sqlValue(collectedAtIso),
      ].join(', ')})`,
    )
    .join(',\n');
  return `INSERT INTO public.price_snapshots\n  ${cols}\nVALUES\n${values}\nON CONFLICT DO NOTHING;\n`;
}

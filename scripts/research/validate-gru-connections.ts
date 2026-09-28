/**
 * Validate LATAM cash OW PET → beyond, keeping only:
 *   - exactly 1 stop
 *   - connection at GRU ≤ 4h
 *   - evening PET dep (feeds LA3251 ~19:10)
 *
 * Usage:
 *   pnpm exec tsx scripts/research/validate-gru-connections.ts --cdp=http://127.0.0.1:9222
 */
import { chromium, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATE = process.argv.find((a) => a.startsWith('--date='))?.slice(7) ?? '2026-09-25';
const CDP = process.argv.find((a) => a.startsWith('--cdp='))?.slice(6) ?? 'http://127.0.0.1:9222';
const OUT_SUFFIX = process.argv.find((a) => a.startsWith('--out-suffix='))?.slice(13) ?? '';
const DEST_FILTER = process.argv
  .find((a) => a.startsWith('--dests='))
  ?.slice('--dests='.length)
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);
const PET_DEP_FROM = '18:00';
const PET_DEP_TO = '20:30';
const MAX_CONNECT_MIN = 240;

type Dest = { iata: string; name: string; kind: 'intl' | 'domestic' };

const INTERNATIONAL: Dest[] = [
  { iata: 'SCL', name: 'Santiago', kind: 'intl' },
  { iata: 'MIA', name: 'Miami', kind: 'intl' },
  { iata: 'FRA', name: 'Frankfurt', kind: 'intl' },
  { iata: 'BOG', name: 'Bogotá', kind: 'intl' },
  { iata: 'LHR', name: 'London Heathrow', kind: 'intl' },
];

const DOMESTIC_TOP10: Dest[] = [
  { iata: 'GIG', name: 'Rio de Janeiro', kind: 'domestic' },
  { iata: 'BSB', name: 'Brasília', kind: 'domestic' },
  { iata: 'CNF', name: 'Belo Horizonte', kind: 'domestic' },
  { iata: 'FOR', name: 'Fortaleza', kind: 'domestic' },
  { iata: 'SSA', name: 'Salvador', kind: 'domestic' },
  { iata: 'MAO', name: 'Manaus', kind: 'domestic' },
  { iata: 'BEL', name: 'Belém', kind: 'domestic' },
  { iata: 'POA', name: 'Porto Alegre', kind: 'domestic' },
  { iata: 'CWB', name: 'Curitiba', kind: 'domestic' },
  { iata: 'GYN', name: 'Goiânia', kind: 'domestic' },
];

/** Extra domestic cities from the FR24 same-night LATAM wave (batch 2). */
const DOMESTIC_BATCH2: Dest[] = [
  { iata: 'FLN', name: 'Florianópolis', kind: 'domestic' },
  { iata: 'NAT', name: 'Natal', kind: 'domestic' },
  { iata: 'MCZ', name: 'Maceió', kind: 'domestic' },
  { iata: 'VIX', name: 'Vitória', kind: 'domestic' },
  { iata: 'IGU', name: 'Foz do Iguaçu', kind: 'domestic' },
  { iata: 'CGR', name: 'Campo Grande', kind: 'domestic' },
  { iata: 'CGB', name: 'Cuiabá', kind: 'domestic' },
  { iata: 'SLZ', name: 'São Luís', kind: 'domestic' },
  { iata: 'AJU', name: 'Aracaju', kind: 'domestic' },
  { iata: 'JPA', name: 'João Pessoa', kind: 'domestic' },
];

const ALL_KNOWN: Dest[] = [...INTERNATIONAL, ...DOMESTIC_TOP10, ...DOMESTIC_BATCH2];
type Segment = {
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  flightCode: string;
  durationMin: number | null;
};

type Offer = {
  stops: number;
  durationMin: number | null;
  amountBrl: number;
  petDep: string;
  finalArr: string | null;
  segments: Segment[];
  connectMin: number | null;
  hub: string | null;
  secondFlight: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function parseLocalIso(iso: string): Date {
  // LATAM returns local wall time without Z — treat as local SP/PET.
  return new Date(iso.includes('T') && !iso.endsWith('Z') ? `${iso}-03:00` : iso);
}

function diffMin(aIso: string, bIso: string): number {
  return Math.round((parseLocalIso(bIso).getTime() - parseLocalIso(aIso).getTime()) / 60000);
}

function eveningPetDep(depIso: string): boolean {
  const t = depIso.includes('T') ? depIso.split('T')[1]!.slice(0, 5) : depIso.slice(0, 5);
  const m = hhmmToMin(t);
  return m >= hhmmToMin(PET_DEP_FROM) && m <= hhmmToMin(PET_DEP_TO);
}

function flightCode(seg: {
  flight?: { airlineCode?: string; flightNumber?: number | string };
}): string {
  const al = seg.flight?.airlineCode ?? 'LA';
  const n = seg.flight?.flightNumber ?? '';
  return `${al}${n}`;
}

function parseOffers(body: unknown): Offer[] {
  const root = body as { content?: unknown[] };
  const out: Offer[] = [];
  for (const item of root.content ?? []) {
    const c = item as {
      summary?: {
        stopOvers?: number;
        duration?: number;
        lowestPrice?: { amount?: number };
        origin?: { departure?: string };
        destination?: { arrival?: string };
      };
      itinerary?: Array<{
        origin?: string;
        destination?: string;
        departure?: string;
        arrival?: string;
        duration?: number;
        flight?: { airlineCode?: string; flightNumber?: number | string };
      }>;
    };
    const amount = c.summary?.lowestPrice?.amount;
    if (amount == null || !(amount > 0)) continue;
    const segs: Segment[] = (c.itinerary ?? [])
      .filter((s) => s.origin && s.destination && s.departure && s.arrival)
      .map((s) => ({
        origin: String(s.origin),
        destination: String(s.destination),
        departure: String(s.departure),
        arrival: String(s.arrival),
        flightCode: flightCode(s),
        durationMin: s.duration ?? null,
      }));
    if (segs.length === 0) continue;

    let connectMin: number | null = null;
    let hub: string | null = null;
    let secondFlight: string | null = null;
    if (segs.length >= 2) {
      hub = segs[0].destination;
      connectMin = diffMin(segs[0].arrival, segs[1].departure);
      secondFlight = segs[1].flightCode;
    }

    out.push({
      stops: c.summary?.stopOvers ?? Math.max(0, segs.length - 1),
      durationMin: c.summary?.duration ?? null,
      amountBrl: amount,
      petDep: segs[0].departure,
      finalArr: c.summary?.destination?.arrival ?? segs[segs.length - 1]?.arrival ?? null,
      segments: segs,
      connectMin,
      hub,
      secondFlight,
    });
  }
  return out;
}

function passesFilter(o: Offer): boolean {
  if (!eveningPetDep(o.petDep)) return false;
  if (o.stops !== 1) return false;
  if (o.hub !== 'GRU') return false;
  if (o.connectMin == null || o.connectMin < 0) return false;
  if (o.connectMin > MAX_CONNECT_MIN) return false;
  return true;
}

function fmtDur(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function latamCashUrl(dest: string): string {
  const params = new URLSearchParams({
    origin: 'PET',
    destination: dest,
    outbound: `${DATE}T12:00:00.000Z`,
    adt: '1',
    chd: '0',
    inf: '0',
    trip: 'OW',
    cabin: 'Economy',
    redemption: 'false',
    sort: 'RECOMMENDED',
  });
  return `https://www.latamairlines.com/br/pt/oferta-voos?${params.toString()}`;
}

async function captureLatam(page: Page, url: string): Promise<unknown | null> {
  let body: unknown = null;
  const onResp = async (resp: import('@playwright/test').Response) => {
    if (!/air-offers\/(v\d+\/)?offers\/search/i.test(resp.url())) return;
    const method = resp.request().method();
    if (method === 'OPTIONS' || method === 'DELETE') return;
    if (resp.status() < 200 || resp.status() >= 300) return;
    const text = await resp.text().catch(() => '');
    if (text.length < 100) return;
    try {
      body = JSON.parse(text);
    } catch {
      /* ignore */
    }
  };
  page.on('response', onResp);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const deadline = Date.now() + 28000;
  while (!body && Date.now() < deadline) await sleep(400);
  if (!body) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    const d2 = Date.now() + 15000;
    while (!body && Date.now() < d2) await sleep(400);
  }
  page.off('response', onResp);
  return body;
}

type Row = {
  dest: Dest;
  status: 'ok' | 'empty' | 'no_match' | 'capture_failed';
  offersTotal: number;
  matched: number;
  best: Offer | null;
};

async function main() {
  let queue: Dest[];
  if (DEST_FILTER?.length) {
    queue = DEST_FILTER.map((iata) => {
      const known = ALL_KNOWN.find((d) => d.iata === iata);
      return known ?? { iata, name: iata, kind: 'domestic' as const };
    });
  } else {
    queue = [...INTERNATIONAL, ...DOMESTIC_TOP10];
  }
  console.log(
    `[validate] PET→dest | 1 stop | GRU connect ≤${MAX_CONNECT_MIN}m | date=${DATE} n=${queue.length}`,
  );

  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  await page
    .goto('https://www.latamairlines.com/br/pt', { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => {});
  await sleep(2500);

  const rows: Row[] = [];
  for (const dest of queue) {
    console.log(`\n→ ${dest.kind} PET→${dest.iata} (${dest.name})`);
    const body = await captureLatam(page, latamCashUrl(dest.iata));
    if (!body) {
      console.log('  capture_failed');
      rows.push({ dest, status: 'capture_failed', offersTotal: 0, matched: 0, best: null });
      await sleep(12000 + Math.floor(Math.random() * 8000));
      continue;
    }
    const offers = parseOffers(body);
    const matched = offers.filter(passesFilter).sort((a, b) => a.amountBrl - b.amountBrl);
    const best = matched[0] ?? null;
    let status: Row['status'] = 'ok';
    if (offers.length === 0) status = 'empty';
    else if (!best) status = 'no_match';

    if (best) {
      console.log(
        `  matched=${matched.length}/${offers.length} best=${best.segments[0].flightCode}+${best.secondFlight} connect=${fmtDur(best.connectMin)} total=${fmtDur(best.durationMin)} R$${best.amountBrl.toFixed(2)}`,
      );
    } else {
      console.log(`  matched=0/${offers.length} → ${status}`);
    }
    rows.push({ dest, status, offersTotal: offers.length, matched: matched.length, best });
    await sleep(14000 + Math.floor(Math.random() * 10000));
  }

  const outDir = path.join('scripts', 'research', 'out');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `pet-beyond-1stop-4h-${DATE}${OUT_SUFFIX ? `-${OUT_SUFFIX}` : ''}.json`,
  );
  await writeFile(
    outPath,
    JSON.stringify(
      {
        date: DATE,
        filters: { stops: 1, hub: 'GRU', maxConnectMin: MAX_CONNECT_MIN, petDep: [PET_DEP_FROM, PET_DEP_TO] },
        results: rows.map((r) => ({
          iata: r.dest.iata,
          name: r.dest.name,
          kind: r.dest.kind,
          status: r.status,
          offersTotal: r.offersTotal,
          matched: r.matched,
          best: r.best
            ? {
                brl: r.best.amountBrl,
                durationMin: r.best.durationMin,
                connectMin: r.best.connectMin,
                petDep: r.best.petDep,
                gruArr: r.best.segments[0]?.arrival,
                gruDep: r.best.segments[1]?.departure,
                finalArr: r.best.finalArr,
                flights: r.best.segments.map((s) => s.flightCode),
                route: r.best.segments.map((s) => `${s.origin}→${s.destination}`).join(' · '),
              }
            : null,
        })),
      },
      null,
      2,
    ),
  );

  console.log('\n======== SUMMARY (1 stop, GRU ≤4h) ========');
  console.log('kind | rota | voos | conexão | duração | data | preço');
  for (const r of rows) {
    if (!r.best) {
      console.log(`${r.dest.kind} | PET→${r.dest.iata} | — | — | — | ${DATE} | ${r.status}`);
      continue;
    }
    const b = r.best;
    console.log(
      `${r.dest.kind} | PET→${r.dest.iata} | ${b.segments.map((s) => s.flightCode).join('+')} | ${fmtDur(b.connectMin)} @GRU | ${fmtDur(b.durationMin)} | ${DATE} | R$${b.amountBrl.toFixed(0)}`,
    );
  }
  console.log(`\n[validate] wrote ${outPath}`);
  await page.close().catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

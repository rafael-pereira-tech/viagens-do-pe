/**
 * LATAM cash RT PET ↔ Europe for Christmas window.
 * Out: 2026-12-25 night (PET) · In: 2027-01-05 (aim GRU→PET on Wed 2027-01-06)
 *
 * Usage:
 *   pnpm exec tsx scripts/research/pet-europe-rt-xmas.ts --cdp=http://127.0.0.1:9222
 */
import { chromium, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CDP = process.argv.find((a) => a.startsWith('--cdp='))?.slice(6) ?? 'http://127.0.0.1:9222';
const OUT_DATE = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '2026-12-25';
const IN_DATE = process.argv.find((a) => a.startsWith('--in='))?.slice(5) ?? '2027-01-05';
const DEST_FILTER = process.argv
  .find((a) => a.startsWith('--dests='))
  ?.slice('--dests='.length)
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const PET_DEP_FROM = '18:00';
const PET_DEP_TO = '20:30';

type Dest = { iata: string; name: string };
const EUROPE: Dest[] = [
  { iata: 'LHR', name: 'Londres' },
  { iata: 'FRA', name: 'Frankfurt' },
  { iata: 'LIS', name: 'Lisboa' },
  { iata: 'MAD', name: 'Madrid' },
];

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
  taxesBrl: number | null;
  firstDep: string;
  finalArr: string | null;
  segments: Segment[];
  connects: Array<{ hub: string; min: number }>;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function parseLocalIso(iso: string): Date {
  return new Date(iso.includes('T') && !iso.endsWith('Z') ? `${iso}-03:00` : iso);
}

function diffMin(aIso: string, bIso: string): number {
  return Math.round((parseLocalIso(bIso).getTime() - parseLocalIso(aIso).getTime()) / 60000);
}

function flightCode(seg: {
  flight?: { airlineCode?: string; flightNumber?: number | string };
}): string {
  const al = seg.flight?.airlineCode ?? 'LA';
  const n = seg.flight?.flightNumber ?? '';
  return `${al}${n}`;
}

function fmtDur(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return '—';
  const sign = min < 0 ? '-' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${String(m).padStart(2, '0')}`;
}

function fmtIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  const t = iso.includes('T') ? iso.split('T')[1]!.slice(0, 5) : '';
  return t ? `${d} ${t}` : d;
}

function eveningPetDep(depIso: string): boolean {
  if (!depIso.startsWith(OUT_DATE)) return false;
  const t = depIso.includes('T') ? depIso.split('T')[1]!.slice(0, 5) : depIso.slice(0, 5);
  const m = hhmmToMin(t);
  return m >= hhmmToMin(PET_DEP_FROM) && m <= hhmmToMin(PET_DEP_TO);
}

function parseOffers(body: unknown): Offer[] {
  const root = body as { content?: unknown[] };
  const out: Offer[] = [];
  for (const item of root.content ?? []) {
    const c = item as {
      summary?: {
        stopOvers?: number;
        duration?: number;
        lowestPrice?: { amount?: number; currency?: string };
        totalPrice?: { amount?: number };
        taxes?: { amount?: number };
        origin?: { departure?: string };
        destination?: { arrival?: string };
      };
      brands?: Array<{
        price?: { amount?: number; currency?: string };
        taxes?: { amount?: number };
      }>;
      itinerary?: Array<{
        origin?: string;
        destination?: string;
        departure?: string;
        arrival?: string;
        duration?: number;
        flight?: { airlineCode?: string; flightNumber?: number | string };
      }>;
    };
    const brandBrl = c.brands?.find((b) => b.price?.currency === 'BRL' || b.price?.amount != null)
      ?.price?.amount;
    const amount =
      c.summary?.lowestPrice?.amount ?? c.summary?.totalPrice?.amount ?? brandBrl ?? null;
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

    const connects: Offer['connects'] = [];
    for (let i = 0; i < segs.length - 1; i++) {
      connects.push({
        hub: segs[i].destination,
        min: diffMin(segs[i].arrival, segs[i + 1].departure),
      });
    }

    out.push({
      stops: c.summary?.stopOvers ?? Math.max(0, segs.length - 1),
      durationMin: c.summary?.duration ?? null,
      amountBrl: amount,
      taxesBrl: c.summary?.taxes?.amount ?? c.brands?.[0]?.taxes?.amount ?? null,
      firstDep: segs[0].departure,
      finalArr: c.summary?.destination?.arrival ?? segs[segs.length - 1]?.arrival ?? null,
      segments: segs,
      connects,
    });
  }
  return out;
}

function latamUrl(origin: string, dest: string, outDate: string, inDate?: string): string {
  const params = new URLSearchParams({
    origin,
    destination: dest,
    outbound: `${outDate}T12:00:00.000Z`,
    adt: '1',
    chd: '0',
    inf: '0',
    trip: inDate ? 'RT' : 'OW',
    cabin: 'Economy',
    redemption: 'false',
    sort: 'RECOMMENDED',
  });
  if (inDate) params.set('inbound', `${inDate}T12:00:00.000Z`);
  return `https://www.latamairlines.com/br/pt/oferta-voos?${params.toString()}`;
}

async function captureLatam(page: Page, url: string, label: string): Promise<unknown | null> {
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
  console.log(`\n→ ${label}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const deadline = Date.now() + 30000;
  while (!body && Date.now() < deadline) await sleep(400);
  if (!body) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    const d2 = Date.now() + 18000;
    while (!body && Date.now() < d2) await sleep(400);
  }
  page.off('response', onResp);
  return body;
}

function summarizeLeg(offers: Offer[], label: string, preferEveningOut: boolean) {
  const sorted = [...offers].sort((a, b) => a.amountBrl - b.amountBrl);
  const evening = preferEveningOut ? sorted.filter((o) => eveningPetDep(o.firstDep)) : sorted;
  const pool = evening.length ? evening : sorted;
  const best = pool[0] ?? null;
  if (!best) {
    console.log(`  ${label}: sem ofertas`);
    return { best: null as Offer | null, eveningCount: evening.length, total: offers.length };
  }
  const connectStr = best.connects.map((c) => `${fmtDur(c.min)}@${c.hub}`).join(' · ') || 'direto';
  const flights = best.segments.map((s) => s.flightCode).join('+');
  const route = best.segments.map((s) => `${s.origin}→${s.destination}`).join(' · ');
  console.log(
    `  ${label}: n=${offers.length}` +
      (preferEveningOut ? ` eveningPET=${evening.length}` : '') +
      ` | best=${flights} stops=${best.stops}` +
      ` connect=${connectStr} dur=${fmtDur(best.durationMin)}` +
      ` dep=${fmtIso(best.firstDep)} arr=${fmtIso(best.finalArr)}` +
      ` R$${best.amountBrl.toFixed(2)}`,
  );
  console.log(`         rota: ${route}`);
  // top 3 brief
  for (const o of pool.slice(0, 3)) {
    const cs = o.connects.map((c) => `${fmtDur(c.min)}@${c.hub}`).join('/') || '—';
    console.log(
      `         · ${o.segments.map((s) => s.flightCode).join('+')} | ${o.stops}p | ${cs} | ${fmtDur(o.durationMin)} | R$${o.amountBrl.toFixed(0)}`,
    );
  }
  return { best, eveningCount: evening.length, total: offers.length, top: pool.slice(0, 5) };
}

function offerJson(o: Offer | null) {
  if (!o) return null;
  return {
    brl: o.amountBrl,
    taxesBrl: o.taxesBrl,
    stops: o.stops,
    durationMin: o.durationMin,
    firstDep: o.firstDep,
    finalArr: o.finalArr,
    flights: o.segments.map((s) => s.flightCode),
    route: o.segments.map((s) => `${s.origin}→${s.destination}`).join(' · '),
    connects: o.connects.map((c) => ({ hub: c.hub, min: c.min, label: fmtDur(c.min) })),
    segments: o.segments,
  };
}

async function main() {
  const queue = DEST_FILTER?.length
    ? DEST_FILTER.map((iata) => EUROPE.find((d) => d.iata === iata) ?? { iata, name: iata })
    : EUROPE;

  console.log(
    `[europe-rt] PET↔EUR | out=${OUT_DATE} in=${IN_DATE} | evening PET ${PET_DEP_FROM}–${PET_DEP_TO} | n=${queue.length}`,
  );

  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  await page
    .goto('https://www.latamairlines.com/br/pt', { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => {});
  await sleep(2500);

  const results: unknown[] = [];

  for (const dest of queue) {
    // 1) RT packaged search (often returns outbound leg + RT-ish price)
    const rtBody = await captureLatam(
      page,
      latamUrl('PET', dest.iata, OUT_DATE, IN_DATE),
      `RT PET↔${dest.iata} ${OUT_DATE}→${IN_DATE}`,
    );
    const rtOffers = rtBody ? parseOffers(rtBody) : [];
    const rtSum = summarizeLeg(rtOffers, `RT out-leg`, true);

    await sleep(10000 + Math.floor(Math.random() * 5000));

    // 2) OW outbound (clearer segment pricing / connections)
    const owOutBody = await captureLatam(
      page,
      latamUrl('PET', dest.iata, OUT_DATE),
      `OW PET→${dest.iata} ${OUT_DATE}`,
    );
    const owOutOffers = owOutBody ? parseOffers(owOutBody) : [];
    const owOutSum = summarizeLeg(owOutOffers, `OW ida`, true);

    await sleep(10000 + Math.floor(Math.random() * 5000));

    // 3) OW return Europe → PET on Jan 5 (should include GRU→PET arriving Jan 6)
    const owInBody = await captureLatam(
      page,
      latamUrl(dest.iata, 'PET', IN_DATE),
      `OW ${dest.iata}→PET ${IN_DATE}`,
    );
    const owInOffers = owInBody ? parseOffers(owInBody) : [];
    const owInSum = summarizeLeg(owInOffers, `OW volta`, false);

    // Flag returns that touch GRU and arrive PET on Jan 6
    const petJan6 = owInOffers.filter((o) => {
      const arr = o.finalArr ?? '';
      const hubs = o.segments.map((s) => s.destination);
      return arr.startsWith('2027-01-06') && hubs.includes('PET') && o.segments.some((s) => s.origin === 'GRU' || s.destination === 'GRU');
    });
    if (petJan6.length) {
      const b = [...petJan6].sort((a, b) => a.amountBrl - b.amountBrl)[0]!;
      console.log(
        `  ✓ volta chega PET em 06/01: ${b.segments.map((s) => s.flightCode).join('+')} connect=${b.connects.map((c) => `${fmtDur(c.min)}@${c.hub}`).join('/')} R$${b.amountBrl.toFixed(0)}`,
      );
    } else {
      console.log(`  ⚠ nenhuma volta com chegada PET em 06/01 detectada no top parse`);
    }

    const owSumBrl =
      owOutSum.best && owInSum.best ? owOutSum.best.amountBrl + owInSum.best.amountBrl : null;
    if (owSumBrl != null) {
      console.log(`  COMPARE OW+OW ≈ R$${owSumBrl.toFixed(0)} | RT best out-leg R$${rtSum.best?.amountBrl.toFixed(0) ?? '—'}`);
    }

    results.push({
      dest,
      rt: {
        status: rtBody ? (rtOffers.length ? 'ok' : 'empty') : 'capture_failed',
        total: rtOffers.length,
        eveningPet: rtSum.eveningCount,
        best: offerJson(rtSum.best),
        top: (rtSum as { top?: Offer[] }).top?.map(offerJson) ?? [],
      },
      owOut: {
        status: owOutBody ? (owOutOffers.length ? 'ok' : 'empty') : 'capture_failed',
        total: owOutOffers.length,
        eveningPet: owOutSum.eveningCount,
        best: offerJson(owOutSum.best),
        top: (owOutSum as { top?: Offer[] }).top?.map(offerJson) ?? [],
      },
      owIn: {
        status: owInBody ? (owInOffers.length ? 'ok' : 'empty') : 'capture_failed',
        total: owInOffers.length,
        best: offerJson(owInSum.best),
        top: (owInSum as { top?: Offer[] }).top?.map(offerJson) ?? [],
        arrivesPetJan6: petJan6.length,
        bestPetJan6: offerJson(
          petJan6.length ? [...petJan6].sort((a, b) => a.amountBrl - b.amountBrl)[0]! : null,
        ),
      },
      owPlusOwBrl: owSumBrl,
    });

    await sleep(12000 + Math.floor(Math.random() * 8000));
  }

  const outDir = path.join('scripts', 'research', 'out');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `pet-europe-rt-${OUT_DATE}_${IN_DATE}.json`);
  await writeFile(
    outPath,
    JSON.stringify({ outDate: OUT_DATE, inDate: IN_DATE, petEvening: [PET_DEP_FROM, PET_DEP_TO], results }, null, 2),
  );

  console.log('\n======== SUMMARY ========');
  console.log('dest | OW ida (noite) | conexões ida | OW volta | conexões volta | OW+OW | RT out');
  for (const r of results as Array<{
    dest: Dest;
    owOut: { best: ReturnType<typeof offerJson> };
    owIn: { best: ReturnType<typeof offerJson>; bestPetJan6: ReturnType<typeof offerJson> };
    rt: { best: ReturnType<typeof offerJson> };
    owPlusOwBrl: number | null;
  }>) {
    const o = r.owOut.best;
    const i = r.owIn.bestPetJan6 ?? r.owIn.best;
    const t = r.rt.best;
    console.log(
      `${r.dest.iata} | ${o ? `R$${o.brl.toFixed(0)} ${o.stops}p ${o.connects.map((c) => c.label + '@' + c.hub).join('/')}` : '—'} | ${
        i
          ? `R$${i.brl.toFixed(0)} ${i.stops}p ${i.connects.map((c) => c.label + '@' + c.hub).join('/')}`
          : '—'
      } | ${r.owPlusOwBrl != null ? `R$${r.owPlusOwBrl.toFixed(0)}` : '—'} | ${t ? `R$${t.brl.toFixed(0)}` : '—'}`,
    );
  }
  console.log(`\n[europe-rt] wrote ${outPath}`);
  await page.close().catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

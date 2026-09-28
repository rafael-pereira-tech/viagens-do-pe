/**
 * True LATAM RT for PET↔FRA / PET↔LHR (cash + miles).
 * Selects matching outbound in the SPA, then captures inbound RT totals.
 *
 * Filters (ida): evening PET 18:00–20:30 · 1 stop · hub GRU · connect ≤4h
 * Volta: prefer 1 stop via GRU arriving PET on 2027-01-06
 *
 * Usage:
 *   pnpm exec tsx scripts/research/pet-europe-rt-true.ts --cdp=http://127.0.0.1:9222
 */
import { chromium, type Page, type Response } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CDP = process.argv.find((a) => a.startsWith('--cdp='))?.slice(6) ?? 'http://127.0.0.1:9222';
const OUT_DATE = '2026-12-25';
const IN_DATE = '2027-01-05';
const PET_ARR_DATE = '2027-01-06';
const MAX_CONNECT_MIN = 240;
const PET_DEP_FROM = '18:00';
const PET_DEP_TO = '20:30';

const DESTS = [
  { iata: 'FRA', name: 'Frankfurt' },
  { iata: 'LHR', name: 'Londres' },
] as const;

type Modality = 'cash' | 'miles';

type Segment = {
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  flightCode: string;
};

type ParsedOffer = {
  stops: number;
  durationMin: number | null;
  amountBrl: number | null;
  miles: number | null;
  taxesBrl: number | null;
  currency: string | null;
  offerId: string | null;
  brandText: string | null;
  firstDep: string;
  finalArr: string | null;
  segments: Segment[];
  connects: Array<{ hub: string; min: number }>;
  flights: string;
  route: string;
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

function fmtDur(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return '—';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${min < 0 ? '-' : ''}${h}h${String(m).padStart(2, '0')}`;
}

function flightCode(seg: {
  flight?: { airlineCode?: string; flightNumber?: number | string };
}): string {
  return `${seg.flight?.airlineCode ?? 'LA'}${seg.flight?.flightNumber ?? ''}`;
}

function eveningPetDep(depIso: string): boolean {
  if (!depIso.startsWith(OUT_DATE)) return false;
  const t = depIso.includes('T') ? depIso.split('T')[1]!.slice(0, 5) : depIso.slice(0, 5);
  const m = hhmmToMin(t);
  return m >= hhmmToMin(PET_DEP_FROM) && m <= hhmmToMin(PET_DEP_TO);
}

function latamUrl(dest: string, modality: Modality): string {
  const params = new URLSearchParams({
    origin: 'PET',
    destination: dest,
    outbound: `${OUT_DATE}T12:00:00.000Z`,
    inbound: `${IN_DATE}T12:00:00.000Z`,
    adt: '1',
    chd: '0',
    inf: '0',
    trip: 'RT',
    cabin: 'Economy',
    redemption: modality === 'miles' ? 'true' : 'false',
    sort: 'RECOMMENDED',
  });
  return `https://www.latamairlines.com/br/pt/oferta-voos?${params}`;
}

function parseOffers(body: unknown, modality: Modality): ParsedOffer[] {
  const root = body as { content?: unknown[] };
  const out: ParsedOffer[] = [];
  for (const item of root.content ?? []) {
    const c = item as {
      summary?: {
        stopOvers?: number;
        duration?: number;
        lowestPrice?: { amount?: number; currency?: string };
        lowestBrandText?: string;
        brands?: Array<{
          brandText?: string;
          offerId?: string;
          price?: { amount?: number; currency?: string };
          taxes?: { amount?: number; currency?: string };
        }>;
        origin?: { departure?: string };
        destination?: { arrival?: string };
      };
      itinerary?: Array<{
        origin?: string;
        destination?: string;
        departure?: string;
        arrival?: string;
        flight?: { airlineCode?: string; flightNumber?: number | string };
      }>;
    };
    const segs: Segment[] = (c.itinerary ?? [])
      .filter((s) => s.origin && s.destination && s.departure && s.arrival)
      .map((s) => ({
        origin: String(s.origin),
        destination: String(s.destination),
        departure: String(s.departure),
        arrival: String(s.arrival),
        flightCode: flightCode(s),
      }));
    if (segs.length === 0) continue;

    const brands = c.summary?.brands ?? [];
    let amountBrl: number | null = null;
    let miles: number | null = null;
    let taxesBrl: number | null = null;
    let offerId: string | null = null;
    let brandText: string | null = c.summary?.lowestBrandText ?? null;
    let currency: string | null = c.summary?.lowestPrice?.currency ?? null;

    if (modality === 'miles') {
      for (const b of brands) {
        const cur = b.price?.currency ?? '';
        const amt = b.price?.amount;
        if (amt == null) continue;
        const isLoyalty = /LOYALTY|POINTS|MILES|LP/i.test(cur) || (cur !== 'BRL' && amt >= 1000);
        if (!isLoyalty && cur === 'BRL') continue;
        if (miles === null || amt < miles) {
          miles = Math.round(amt);
          offerId = b.offerId ?? offerId;
          brandText = b.brandText ?? brandText;
          currency = cur || currency;
          taxesBrl = b.taxes?.amount ?? taxesBrl;
        }
      }
      if (miles === null && c.summary?.lowestPrice?.amount != null) {
        const cur = c.summary.lowestPrice.currency ?? '';
        if (/LOYALTY|POINTS|MILES|LP/i.test(cur) || cur !== 'BRL') {
          miles = Math.round(c.summary.lowestPrice.amount);
          currency = cur;
        }
      }
      if (miles === null) continue;
    } else {
      amountBrl = c.summary?.lowestPrice?.amount ?? null;
      if (amountBrl == null || !(amountBrl > 0)) continue;
      currency = c.summary?.lowestPrice?.currency ?? 'BRL';
      const matchBrand =
        brands.find((b) => b.price?.amount != null && Math.abs((b.price.amount ?? 0) - amountBrl!) < 0.05) ??
        brands[0];
      offerId = matchBrand?.offerId ?? null;
      brandText = matchBrand?.brandText ?? brandText;
      taxesBrl = matchBrand?.taxes?.amount ?? null;
    }

    const connects: ParsedOffer['connects'] = [];
    for (let i = 0; i < segs.length - 1; i++) {
      connects.push({ hub: segs[i].destination, min: diffMin(segs[i].arrival, segs[i + 1].departure) });
    }

    out.push({
      stops: c.summary?.stopOvers ?? Math.max(0, segs.length - 1),
      durationMin: c.summary?.duration ?? null,
      amountBrl,
      miles,
      taxesBrl,
      currency,
      offerId,
      brandText,
      firstDep: segs[0].departure,
      finalArr: c.summary?.destination?.arrival ?? segs[segs.length - 1]?.arrival ?? null,
      segments: segs,
      connects,
      flights: segs.map((s) => s.flightCode).join('+'),
      route: segs.map((s) => `${s.origin}→${s.destination}`).join(' · '),
    });
  }
  return out;
}

function passesOutbound(o: ParsedOffer): boolean {
  if (!eveningPetDep(o.firstDep)) return false;
  if (o.stops !== 1) return false;
  if (o.connects.length !== 1 || o.connects[0].hub !== 'GRU') return false;
  const c = o.connects[0].min;
  return c >= 0 && c <= MAX_CONNECT_MIN;
}

function passesInbound(o: ParsedOffer): boolean {
  if (o.stops !== 1) return false;
  if (o.connects.length !== 1 || o.connects[0].hub !== 'GRU') return false;
  if (!o.finalArr?.startsWith(PET_ARR_DATE)) return false;
  // last segment must be GRU→PET
  const last = o.segments[o.segments.length - 1];
  return last?.origin === 'GRU' && last?.destination === 'PET';
}

function sortBest(a: ParsedOffer, b: ParsedOffer, modality: Modality): number {
  if (modality === 'miles') return (a.miles ?? 1e12) - (b.miles ?? 1e12);
  return (a.amountBrl ?? 1e12) - (b.amountBrl ?? 1e12);
}

function priceLabel(o: ParsedOffer, modality: Modality): string {
  if (modality === 'miles') {
    const tax = o.taxesBrl != null ? ` + R$${o.taxesBrl.toFixed(0)}` : '';
    return `${(o.miles ?? 0).toLocaleString('pt-BR')} mi${tax}`;
  }
  return `R$${(o.amountBrl ?? 0).toFixed(0)}`;
}

class OfferCapture {
  bodies: unknown[] = [];
  private page: Page;
  private handler: (resp: Response) => Promise<void>;

  constructor(page: Page) {
    this.page = page;
    this.handler = async (resp: Response) => {
      if (!/air-offers\/(v\d+\/)?offers\/search/i.test(resp.url())) return;
      if (resp.request().method() === 'OPTIONS') return;
      if (resp.status() < 200 || resp.status() >= 300) return;
      const text = await resp.text().catch(() => '');
      if (text.length < 100) return;
      try {
        this.bodies.push(JSON.parse(text));
      } catch {
        /* ignore */
      }
    };
  }

  start() {
    this.bodies = [];
    this.page.on('response', this.handler);
  }

  stop() {
    this.page.off('response', this.handler);
  }

  async waitNext(afterCount: number, timeoutMs = 35000): Promise<unknown | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.bodies.length > afterCount) return this.bodies[afterCount]!;
      await sleep(300);
    }
    return null;
  }
}

async function dismissNoise(page: Page) {
  const candidates = [
    'button:has-text("Aceitar")',
    'button:has-text("Accept")',
    'button:has-text("Concordo")',
    '[data-testid="cookie-banner-accept"]',
    'button:has-text("Fechar")',
  ];
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 2000 }).catch(() => {});
      await sleep(400);
    }
  }
}

async function findCardIndex(page: Page, offer: ParsedOffer): Promise<number> {
  const arrTime = offer.finalArr?.includes('T') ? offer.finalArr.split('T')[1]!.slice(0, 5) : '';
  const depTime = offer.firstDep.includes('T') ? offer.firstDep.split('T')[1]!.slice(0, 5) : '';
  const n = await page.evaluate(() => {
    let i = 0;
    while (document.querySelector(`[data-testid="wrapper-card-flight-${i}"]`)) i++;
    return i;
  });
  for (let i = 0; i < n; i++) {
    const text = await page.locator(`[data-testid="wrapper-card-flight-${i}"]`).innerText().catch(() => '');
    const compact = text.replace(/\s+/g, ' ');
    const hasArr = arrTime ? compact.includes(arrTime) : true;
    const hasDep = depTime ? compact.includes(depTime) : true;
    // Prefer 1-parada cards when our offer is 1-stop
    const oneStop = /1 parada/i.test(compact);
    if (hasArr && hasDep && (offer.stops !== 1 || oneStop || !/2 paradas|3 paradas/i.test(compact))) {
      return i;
    }
  }
  // fallback: first card mentioning arrival time
  for (let i = 0; i < n; i++) {
    const text = await page.locator(`[data-testid="wrapper-card-flight-${i}"]`).innerText().catch(() => '');
    if (arrTime && text.includes(arrTime)) return i;
  }
  return 0;
}

async function selectOutboundCard(page: Page, offer: ParsedOffer): Promise<boolean> {
  await page.waitForSelector('[data-testid="wrapper-card-flight-0"]', { timeout: 45000 }).catch(() => {});
  const idx = await findCardIndex(page, offer);
  console.log(`  card index=${idx}`);

  // Open brand list
  await page.evaluate((i) => {
    (document.querySelector(`[data-testid="card-expander-${i}"]`) as HTMLElement | null)?.click();
  }, idx);
  await sleep(1800);

  // Prefer LIGHT / cheapest brand select button
  const selectBtn = page.locator('[data-testid="bundle-detail-0-flight-select"]');
  if (await selectBtn.count()) {
    await selectBtn.click({ timeout: 8000 }).catch(async () => {
      await page.evaluate(() => {
        (document.querySelector('[data-testid="bundle-detail-0-flight-select"]') as HTMLElement | null)?.click();
      });
    });
    await sleep(2000);
    return true;
  }

  // Fallback: any "Escolher" in brand sheet
  const any = page.locator('button').filter({ hasText: /Escolher/i }).first();
  if (await any.count()) {
    await any.click({ timeout: 5000 }).catch(() => {});
    await sleep(2000);
    return true;
  }
  return false;
}

async function runCase(page: Page, dest: string, modality: Modality) {
  const label = `${modality.toUpperCase()} RT PET↔${dest}`;
  console.log(`\n======== ${label} ========`);
  const url = latamUrl(dest, modality);
  const cap = new OfferCapture(page);
  cap.start();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
    console.log('  goto warn', String(e).slice(0, 120));
  });
  await dismissNoise(page);
  const outBody = await cap.waitNext(0, 40000);
  if (!outBody) {
    console.log('  capture_failed outbound');
    cap.stop();
    return { dest, modality, status: 'outbound_failed' as const };
  }

  const outboundAll = parseOffers(outBody, modality);
  const outboundMatch = outboundAll.filter(passesOutbound).sort((a, b) => sortBest(a, b, modality));
  console.log(`  outbound offers=${outboundAll.length} matched=${outboundMatch.length}`);
  if (!outboundMatch.length) {
    console.log('  no_match outbound (1p GRU≤4h evening)');
    // show nearest candidates
    for (const o of outboundAll.slice(0, 5)) {
      const cs = o.connects.map((c) => `${fmtDur(c.min)}@${c.hub}`).join('/') || '—';
      console.log(`    cand ${o.flights} ${o.stops}p ${cs} ${priceLabel(o, modality)} dep=${o.firstDep}`);
    }
    cap.stop();
    return {
      dest,
      modality,
      status: 'outbound_no_match' as const,
      outboundAll: outboundAll.length,
    };
  }

  const chosenOut = outboundMatch[0]!;
  console.log(
    `  OUT pick: ${chosenOut.flights} | ${fmtDur(chosenOut.connects[0]?.min)}@GRU | ${priceLabel(chosenOut, modality)} | ${chosenOut.route}`,
  );

  const beforeIn = cap.bodies.length;
  const clicked = await selectOutboundCard(page, chosenOut);
  console.log(`  UI select outbound: ${clicked ? 'ok' : 'FAIL'}`);

  let inBody = await cap.waitNext(beforeIn, 50000);
  // Brand sheet might need a moment; retry choose once
  if (!inBody) {
    await page.evaluate(() => {
      (document.querySelector('[data-testid="bundle-detail-0-flight-select"]') as HTMLElement | null)?.click();
    });
    inBody = await cap.waitNext(beforeIn, 25000);
  }

  if (!inBody) {
    console.log('  capture_failed inbound (RT total)');
    // dump page hint
    const title = await page.title().catch(() => '');
    console.log(`  page title: ${title}`);
    cap.stop();
    return {
      dest,
      modality,
      status: 'inbound_failed' as const,
      outbound: chosenOut,
    };
  }

  const inboundAll = parseOffers(inBody, modality);
  const inboundMatch = inboundAll.filter(passesInbound).sort((a, b) => sortBest(a, b, modality));
  console.log(`  inbound offers=${inboundAll.length} matched(1p GRU→PET ${PET_ARR_DATE})=${inboundMatch.length}`);

  // If strict inbound filter empty, still show best 1p via GRU
  const inboundFallback = inboundAll
    .filter((o) => o.stops === 1 && o.connects.some((c) => c.hub === 'GRU'))
    .sort((a, b) => sortBest(a, b, modality));

  const chosenIn = inboundMatch[0] ?? inboundFallback[0] ?? inboundAll.sort((a, b) => sortBest(a, b, modality))[0] ?? null;
  if (chosenIn) {
    const cs = chosenIn.connects.map((c) => `${fmtDur(c.min)}@${c.hub}`).join(' · ');
    console.log(
      `  IN pick: ${chosenIn.flights} | ${chosenIn.stops}p | ${cs} | arr=${chosenIn.finalArr} | RT ${priceLabel(chosenIn, modality)}`,
    );
    console.log(`         rota: ${chosenIn.route}`);
    for (const o of (inboundMatch.length ? inboundMatch : inboundFallback).slice(0, 3)) {
      const c = o.connects.map((x) => `${fmtDur(x.min)}@${x.hub}`).join('/');
      console.log(`         · ${o.flights} | ${c} | RT ${priceLabel(o, modality)}`);
    }
  } else {
    console.log('  inbound empty');
  }

  cap.stop();
  return {
    dest,
    modality,
    status: chosenIn ? 'ok' : 'inbound_empty',
    outbound: chosenOut,
    inbound: chosenIn,
    inboundMatched: inboundMatch.length,
    inboundTotal: inboundAll.length,
    note: inboundMatch.length ? 'strict PET 06/01' : 'fallback best inbound',
  };
}

async function main() {
  console.log(
    `[rt-true] PET↔FRA/LHR | out=${OUT_DATE} in=${IN_DATE} | filter 1p GRU≤${MAX_CONNECT_MIN}m eveningPET | modalities=cash,miles`,
  );

  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  await page.goto('https://www.latamairlines.com/br/pt', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(2500);
  await dismissNoise(page);

  const results: unknown[] = [];
  for (const dest of DESTS) {
    for (const modality of ['cash', 'miles'] as Modality[]) {
      const r = await runCase(page, dest.iata, modality);
      results.push({
        ...r,
        outbound: r && 'outbound' in r && r.outbound
          ? {
              flights: r.outbound.flights,
              route: r.outbound.route,
              connectMin: r.outbound.connects[0]?.min ?? null,
              brl: r.outbound.amountBrl,
              miles: r.outbound.miles,
              taxesBrl: r.outbound.taxesBrl,
              brand: r.outbound.brandText,
              dep: r.outbound.firstDep,
              arr: r.outbound.finalArr,
            }
          : null,
        inbound: r && 'inbound' in r && r.inbound
          ? {
              flights: r.inbound.flights,
              route: r.inbound.route,
              connects: r.inbound.connects,
              brl: r.inbound.amountBrl,
              miles: r.inbound.miles,
              taxesBrl: r.inbound.taxesBrl,
              brand: r.inbound.brandText,
              dep: r.inbound.firstDep,
              arr: r.inbound.finalArr,
              // RT total lives on inbound offer after selection
              rtBrl: r.inbound.amountBrl,
              rtMiles: r.inbound.miles,
            }
          : null,
      });
      await sleep(12000 + Math.floor(Math.random() * 6000));
    }
  }

  const outDir = path.join('scripts', 'research', 'out');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `pet-europe-rt-true-${OUT_DATE}_${IN_DATE}.json`);
  await writeFile(outPath, JSON.stringify({ outDate: OUT_DATE, inDate: IN_DATE, results }, null, 2));

  console.log('\n======== SUMMARY (RT total após selecionar ida) ========');
  for (const r of results as Array<{
    dest: string;
    modality: string;
    status: string;
    outbound?: { flights: string; connectMin: number | null; brl: number | null; miles: number | null };
    inbound?: { flights: string; rtBrl: number | null; rtMiles: number | null; taxesBrl: number | null; connects: Array<{ hub: string; min: number }>; arr: string | null };
  }>) {
    if (r.status !== 'ok' || !r.inbound || !r.outbound) {
      console.log(`${r.dest} ${r.modality}: ${r.status}`);
      continue;
    }
    const cs = r.inbound.connects.map((c) => `${fmtDur(c.min)}@${c.hub}`).join('/');
    const price =
      r.modality === 'miles'
        ? `${(r.inbound.rtMiles ?? 0).toLocaleString('pt-BR')} mi` +
          (r.inbound.taxesBrl != null ? ` + R$${r.inbound.taxesBrl.toFixed(0)}` : '')
        : `R$${(r.inbound.rtBrl ?? 0).toFixed(0)}`;
    console.log(
      `${r.dest} ${r.modality}: OUT ${r.outbound.flights} (${fmtDur(r.outbound.connectMin)}@GRU) → IN ${r.inbound.flights} (${cs}) arr=${r.inbound.arr} | RT ${price}`,
    );
  }
  console.log(`\n[rt-true] wrote ${outPath}`);
  await page.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

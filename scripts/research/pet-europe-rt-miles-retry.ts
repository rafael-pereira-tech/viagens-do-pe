/**
 * Retry LATAM Pass (miles) RT only for PET↔FRA / PET↔LHR.
 * Waits for login if the SPA redirects to auth.
 *
 *   pnpm exec tsx scripts/research/pet-europe-rt-miles-retry.ts --cdp=http://127.0.0.1:9222
 */
import { chromium, type Page, type Response } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CDP = process.argv.find((a) => a.startsWith('--cdp='))?.slice(6) ?? 'http://127.0.0.1:9222';
const OUT_DATE = '2026-12-25';
const IN_DATE = '2027-01-05';
const PET_ARR_DATE = '2027-01-06';
const MAX_CONNECT_MIN = 240;
const LOGIN_WAIT_MS = 180_000;

const DESTS = ['FRA', 'LHR'] as const;

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
  miles: number | null;
  taxesBrl: number | null;
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
  return m >= hhmmToMin('18:00') && m <= hhmmToMin('20:30');
}

function latamMilesUrl(dest: string): string {
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
    redemption: 'true',
    sort: 'RECOMMENDED',
  });
  return `https://www.latamairlines.com/br/pt/oferta-voos?${params}`;
}

function parseMilesOffers(body: unknown): ParsedOffer[] {
  const root = body as { content?: unknown[] };
  const out: ParsedOffer[] = [];
  for (const item of root.content ?? []) {
    const c = item as {
      summary?: {
        stopOvers?: number;
        duration?: number;
        lowestPrice?: { amount?: number; currency?: string };
        brands?: Array<{
          price?: { amount?: number; currency?: string };
          taxes?: { amount?: number; currency?: string };
        }>;
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
    if (!segs.length) continue;

    let miles: number | null = null;
    let taxesBrl: number | null = null;
    for (const b of c.summary?.brands ?? []) {
      const cur = b.price?.currency ?? '';
      const amt = b.price?.amount;
      if (amt == null) continue;
      const loyalty = /LOYALTY|POINTS|MILES|LP/i.test(cur) || cur !== 'BRL';
      if (!loyalty) continue;
      if (miles === null || amt < miles) {
        miles = Math.round(amt);
        taxesBrl = b.taxes?.amount ?? taxesBrl;
      }
    }
    if (miles === null && c.summary?.lowestPrice?.amount != null) {
      const cur = c.summary.lowestPrice.currency ?? '';
      if (/LOYALTY|POINTS|MILES|LP/i.test(cur) || cur !== 'BRL') {
        miles = Math.round(c.summary.lowestPrice.amount);
      }
    }
    if (miles === null) continue;

    const connects: ParsedOffer['connects'] = [];
    for (let i = 0; i < segs.length - 1; i++) {
      connects.push({ hub: segs[i].destination, min: diffMin(segs[i].arrival, segs[i + 1].departure) });
    }
    out.push({
      stops: c.summary?.stopOvers ?? Math.max(0, segs.length - 1),
      durationMin: c.summary?.duration ?? null,
      miles,
      taxesBrl,
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

function passesOut(o: ParsedOffer): boolean {
  if (!eveningPetDep(o.firstDep)) return false;
  if (o.stops !== 1) return false;
  if (o.connects.length !== 1 || o.connects[0].hub !== 'GRU') return false;
  const c = o.connects[0].min;
  return c >= 0 && c <= MAX_CONNECT_MIN;
}

function passesIn(o: ParsedOffer): boolean {
  if (o.stops !== 1) return false;
  if (o.connects.length !== 1 || o.connects[0].hub !== 'GRU') return false;
  if (!o.finalArr?.startsWith(PET_ARR_DATE)) return false;
  const last = o.segments[o.segments.length - 1];
  return last?.origin === 'GRU' && last?.destination === 'PET';
}

class Capture {
  bodies: unknown[] = [];
  private handler: (resp: Response) => Promise<void>;
  constructor(private page: Page) {
    this.handler = async (resp: Response) => {
      if (!/air-offers\/(v\d+\/)?offers\/search/i.test(resp.url())) return;
      if (resp.request().method() === 'OPTIONS') return;
      if (resp.status() < 200 || resp.status() >= 300) return;
      const text = await resp.text().catch(() => '');
      if (text.length < 100) return;
      try {
        this.bodies.push(JSON.parse(text));
      } catch {
        /* */
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
  async waitNext(after: number, ms = 45000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (this.bodies.length > after) return this.bodies[after]!;
      await sleep(300);
    }
    return null;
  }
}

async function isLoginWall(page: Page): Promise<boolean> {
  const url = page.url();
  if (/auth\.latamairlines\.com|login|signin|oidc|sso|mfa-/i.test(url)) return true;
  return page.evaluate(() => {
    const t = document.body?.innerText ?? '';
    return /Insira seu usuário|Faça seu login|Ingresa tu usuario|Verificação de identidade|Inserir código|Email, CPF ou Número/i.test(
      t,
    );
  });
}

async function waitForLogin(page: Page): Promise<boolean> {
  console.log(`\n⚠ Login LATAM Pass necessário no Chrome (CDP).`);
  console.log(`  Se estiver no MFA, cola o código do email — espero até ${LOGIN_WAIT_MS / 1000}s…`);
  const deadline = Date.now() + LOGIN_WAIT_MS;
  while (Date.now() < deadline) {
    const url = page.url();
    const wall = await isLoginWall(page);
    if (!wall && !/auth\.latamairlines\.com/i.test(url)) {
      // confirm session can load redemption offers page chrome
      console.log('  login detectado ✓', url.slice(0, 80));
      await sleep(2500);
      return true;
    }
    await sleep(2500);
  }
  console.log('  timeout sem login');
  return false;
}

async function selectOutbound(page: Page, offer: ParsedOffer): Promise<boolean> {
  await page.waitForSelector('[data-testid="wrapper-card-flight-0"]', { timeout: 45000 }).catch(() => {});
  const arrTime = offer.finalArr?.includes('T') ? offer.finalArr.split('T')[1]!.slice(0, 5) : '';
  const n = await page.evaluate(() => {
    let i = 0;
    while (document.querySelector(`[data-testid="wrapper-card-flight-${i}"]`)) i++;
    return i;
  });
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const text = await page.locator(`[data-testid="wrapper-card-flight-${i}"]`).innerText().catch(() => '');
    if (arrTime && text.includes(arrTime) && /1 parada/i.test(text)) {
      idx = i;
      break;
    }
  }
  console.log(`  card index=${idx}`);
  await page.evaluate((i) => {
    (document.querySelector(`[data-testid="card-expander-${i}"]`) as HTMLElement | null)?.click();
  }, idx);
  await sleep(1800);
  const btn = page.locator('[data-testid="bundle-detail-0-flight-select"]');
  if (await btn.count()) {
    await btn.click({ timeout: 8000 }).catch(async () => {
      await page.evaluate(() => {
        (document.querySelector('[data-testid="bundle-detail-0-flight-select"]') as HTMLElement | null)?.click();
      });
    });
    await sleep(2000);
    return true;
  }
  return false;
}

async function runDest(page: Page, dest: string) {
  console.log(`\n======== MILES RT PET↔${dest} ========`);
  const url = latamMilesUrl(dest);
  const cap = new Capture(page);
  cap.start();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(2500);

  if (await isLoginWall(page)) {
    const ok = await waitForLogin(page);
    if (!ok) {
      cap.stop();
      return { dest, status: 'login_required' };
    }
    // re-navigate after login
    cap.bodies = [];
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  }

  let outBody = await cap.waitNext(0, 45000);
  if (!outBody && (await isLoginWall(page))) {
    const ok = await waitForLogin(page);
    if (!ok) {
      cap.stop();
      return { dest, status: 'login_required' };
    }
    cap.bodies = [];
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    outBody = await cap.waitNext(0, 45000);
  }

  if (!outBody) {
    console.log('  capture_failed outbound');
    console.log('  ui:', (await page.title().catch(() => '')) + ' | ' + page.url().slice(0, 100));
    cap.stop();
    return { dest, status: 'outbound_failed' };
  }

  const all = parseMilesOffers(outBody);
  const matched = all.filter(passesOut).sort((a, b) => (a.miles ?? 1e12) - (b.miles ?? 1e12));
  console.log(`  outbound offers=${all.length} matched=${matched.length}`);
  if (!matched.length) {
    for (const o of all.slice(0, 5)) {
      const cs = o.connects.map((c) => `${fmtDur(c.min)}@${c.hub}`).join('/');
      console.log(`    cand ${o.flights} ${o.stops}p ${cs} ${o.miles} mi`);
    }
    cap.stop();
    return { dest, status: 'outbound_no_match', outboundTotal: all.length };
  }

  const chosen = matched[0]!;
  console.log(
    `  OUT pick: ${chosen.flights} | ${fmtDur(chosen.connects[0]?.min)}@GRU | ${chosen.miles?.toLocaleString('pt-BR')} mi | ${chosen.route}`,
  );

  const before = cap.bodies.length;
  const clicked = await selectOutbound(page, chosen);
  console.log(`  UI select: ${clicked ? 'ok' : 'FAIL'}`);
  let inBody = await cap.waitNext(before, 50000);
  if (!inBody) {
    await page.evaluate(() => {
      (document.querySelector('[data-testid="bundle-detail-0-flight-select"]') as HTMLElement | null)?.click();
    });
    inBody = await cap.waitNext(before, 25000);
  }
  if (!inBody) {
    console.log('  capture_failed inbound');
    cap.stop();
    return { dest, status: 'inbound_failed', outbound: chosen };
  }

  const inAll = parseMilesOffers(inBody);
  const inMatch = inAll.filter(passesIn).sort((a, b) => (a.miles ?? 1e12) - (b.miles ?? 1e12));
  const fallback = inAll
    .filter((o) => o.stops === 1 && o.connects.some((c) => c.hub === 'GRU'))
    .sort((a, b) => (a.miles ?? 1e12) - (b.miles ?? 1e12));
  const inbound = inMatch[0] ?? fallback[0] ?? null;
  console.log(`  inbound offers=${inAll.length} matched=${inMatch.length}`);
  if (inbound) {
    const cs = inbound.connects.map((c) => `${fmtDur(c.min)}@${c.hub}`).join('/');
    const tax = inbound.taxesBrl != null ? ` + R$${inbound.taxesBrl.toFixed(0)}` : '';
    console.log(
      `  IN pick: ${inbound.flights} | ${cs} | arr=${inbound.finalArr} | RT ${inbound.miles?.toLocaleString('pt-BR')} mi${tax}`,
    );
  } else console.log('  inbound empty/no miles parse');

  cap.stop();
  return {
    dest,
    status: inbound ? 'ok' : 'inbound_empty',
    outbound: {
      flights: chosen.flights,
      route: chosen.route,
      connectMin: chosen.connects[0]?.min ?? null,
      miles: chosen.miles,
      taxesBrl: chosen.taxesBrl,
    },
    inbound: inbound
      ? {
          flights: inbound.flights,
          route: inbound.route,
          connectMin: inbound.connects[0]?.min ?? null,
          miles: inbound.miles,
          taxesBrl: inbound.taxesBrl,
          arr: inbound.finalArr,
        }
      : null,
  };
}

async function main() {
  console.log(`[miles-retry] PET↔FRA/LHR RT miles | ${OUT_DATE} → ${IN_DATE}`);
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();

  // Warm: open first miles URL so user can login once
  await page.goto(latamMilesUrl('FRA'), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(2000);
  if (await isLoginWall(page)) {
    const ok = await waitForLogin(page);
    if (!ok) {
      console.log('\nAbortando: sem login LATAM Pass não dá pra cotar milhas.');
      await page.close().catch(() => {});
      process.exit(2);
    }
  }

  const results = [];
  for (const dest of DESTS) {
    results.push(await runDest(page, dest));
    await sleep(10000);
  }

  const outDir = path.join('scripts', 'research', 'out');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `pet-europe-rt-miles-${OUT_DATE}_${IN_DATE}.json`);
  // merge note with prior cash results path
  await writeFile(
    outPath,
    JSON.stringify(
      {
        outDate: OUT_DATE,
        inDate: IN_DATE,
        modality: 'miles',
        cashCompanion: `pet-europe-rt-true-${OUT_DATE}_${IN_DATE}.json`,
        results,
      },
      null,
      2,
    ),
  );

  console.log('\n======== SUMMARY MILES RT ========');
  for (const r of results) {
    if (r.status !== 'ok' || !r.inbound) {
      console.log(`${r.dest}: ${r.status}`);
      continue;
    }
    const tax = r.inbound.taxesBrl != null ? ` + R$${r.inbound.taxesBrl.toFixed(0)}` : '';
    console.log(
      `${r.dest}: OUT ${r.outbound?.flights} (${fmtDur(r.outbound?.connectMin ?? null)}@GRU) → IN ${r.inbound.flights} (${fmtDur(r.inbound.connectMin)}@GRU) | RT ${r.inbound.miles?.toLocaleString('pt-BR')} mi${tax}`,
    );
  }
  console.log(`\n[miles-retry] wrote ${outPath}`);
  await page.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

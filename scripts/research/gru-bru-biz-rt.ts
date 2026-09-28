/**
 * LATAM Premium Business GRU ↔ BRU
 * Out 2026-12-26 · In 2027-01-03
 *
 * True Biz+Biz RT: LATAM BFF returns 0 inbound offers when outOfferId is a
 * Premium Business brand (UI "Escolher" on Biz is a no-op). We still try RT,
 * then fall back to OW Biz each way + note mixed RT (Y out + Biz in) if present.
 *
 *   pnpm exec tsx scripts/research/gru-bru-biz-rt.ts --cdp=http://127.0.0.1:9222
 */
import { chromium, type Page, type Response } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CDP = process.argv.find((a) => a.startsWith('--cdp='))?.slice(6) ?? 'http://127.0.0.1:9222';
const OUT_DATE = '2026-12-26';
const IN_DATE = '2027-01-03';
const CABIN = 'PremiumBusiness';
const LOGIN_WAIT_MS = 120_000;

type Modality = 'cash' | 'miles';

type Segment = {
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  flightCode: string;
};

type ParsedOffer = {
  offerId: string | null;
  stops: number;
  durationMin: number | null;
  amountBrl: number | null;
  miles: number | null;
  taxesBrl: number | null;
  brandText: string | null;
  firstDep: string;
  finalArr: string | null;
  segments: Segment[];
  connects: Array<{ hub: string; min: number }>;
  flights: string;
  route: string;
  nonstop: boolean;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

function isBizBrand(text: string | null | undefined): boolean {
  return /PREMIUM\s*BUSINESS/i.test(text ?? '');
}

function ofertaUrl(opts: {
  origin: string;
  destination: string;
  outbound: string;
  inbound?: string;
  trip: 'RT' | 'OW';
  modality: Modality;
}): string {
  const params = new URLSearchParams({
    origin: opts.origin,
    destination: opts.destination,
    outbound: `${opts.outbound}T12:00:00.000Z`,
    adt: '1',
    chd: '0',
    inf: '0',
    trip: opts.trip,
    cabin: CABIN,
    redemption: opts.modality === 'miles' ? 'true' : 'false',
    sort: 'RECOMMENDED',
  });
  if (opts.trip === 'RT' && opts.inbound) {
    params.set('inbound', `${opts.inbound}T12:00:00.000Z`);
  }
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
        brands?: Array<{
          offerId?: string;
          brandText?: string;
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

    const bizBrands = (c.summary?.brands ?? []).filter((b) => isBizBrand(b.brandText));
    if (!bizBrands.length) continue;

    let amountBrl: number | null = null;
    let miles: number | null = null;
    let taxesBrl: number | null = null;
    let brandText: string | null = null;
    let offerId: string | null = null;

    if (modality === 'miles') {
      for (const b of bizBrands) {
        const cur = b.price?.currency ?? '';
        const amt = b.price?.amount;
        if (amt == null) continue;
        const loyalty = /LOYALTY|POINTS|MILES|LP/i.test(cur) || cur !== 'BRL';
        if (!loyalty) continue;
        if (miles === null || amt < miles) {
          miles = Math.round(amt);
          taxesBrl = b.taxes?.amount ?? taxesBrl;
          brandText = b.brandText ?? brandText;
          offerId = b.offerId ?? offerId;
        }
      }
      if (miles === null) continue;
    } else {
      for (const b of bizBrands) {
        const amt = b.price?.amount;
        if (amt == null) continue;
        if (amountBrl === null || amt < amountBrl) {
          amountBrl = amt;
          taxesBrl = b.taxes?.amount ?? taxesBrl;
          brandText = b.brandText ?? brandText;
          offerId = b.offerId ?? offerId;
        }
      }
      if (amountBrl == null) continue;
    }

    const connects: ParsedOffer['connects'] = [];
    for (let i = 0; i < segs.length - 1; i++) {
      connects.push({ hub: segs[i].destination, min: diffMin(segs[i].arrival, segs[i + 1].departure) });
    }

    out.push({
      offerId,
      stops: c.summary?.stopOvers ?? Math.max(0, segs.length - 1),
      durationMin: c.summary?.duration ?? null,
      amountBrl,
      miles,
      taxesBrl,
      brandText,
      firstDep: segs[0].departure,
      finalArr: c.summary?.destination?.arrival ?? segs[segs.length - 1]?.arrival ?? null,
      segments: segs,
      connects,
      flights: segs.map((s) => s.flightCode).join('+'),
      route: segs.map((s) => `${s.origin}→${s.destination}`).join(' · '),
      nonstop: segs.length === 1,
    });
  }
  return out;
}

function sortBest(a: ParsedOffer, b: ParsedOffer, modality: Modality): number {
  if (a.nonstop !== b.nonstop) return a.nonstop ? -1 : 1;
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

function slimOffer(o: ParsedOffer | null | undefined) {
  if (!o) return null;
  return {
    flights: o.flights,
    route: o.route,
    stops: o.stops,
    brand: o.brandText,
    brl: o.amountBrl,
    miles: o.miles,
    taxesBrl: o.taxesBrl,
    dep: o.firstDep,
    arr: o.finalArr,
    durationMin: o.durationMin,
    connects: o.connects,
    offerId: o.offerId,
  };
}

class Capture {
  bodies: Array<{ url: string; body: unknown }> = [];
  private handler: (resp: Response) => Promise<void>;
  constructor(private page: Page) {
    this.handler = async (resp: Response) => {
      if (!/air-offers\/(v\d+\/)?offers\/search/i.test(resp.url())) return;
      if (resp.request().method() === 'OPTIONS') return;
      if (resp.status() < 200 || resp.status() >= 300) return;
      const text = await resp.text().catch(() => '');
      if (text.length < 50) return;
      try {
        this.bodies.push({ url: resp.url(), body: JSON.parse(text) });
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
  if (/auth\.latamairlines\.com|mfa-/i.test(page.url())) return true;
  return page.evaluate(() =>
    /Insira seu usuário|Verificação de identidade|Inserir código|Ingresa tu usuario/i.test(
      document.body?.innerText ?? '',
    ),
  );
}

async function waitLogin(page: Page): Promise<boolean> {
  console.log(`\n⚠ Login LATAM Pass (Chrome CDP) — MFA se pedir. Espero ${LOGIN_WAIT_MS / 1000}s…`);
  const deadline = Date.now() + LOGIN_WAIT_MS;
  while (Date.now() < deadline) {
    if (!(await isLoginWall(page)) && !/auth\.latamairlines\.com/i.test(page.url())) {
      console.log('  login ok');
      await sleep(2000);
      return true;
    }
    await sleep(2500);
  }
  return false;
}

async function clickLightToAdvance(page: Page): Promise<boolean> {
  await page.evaluate(() => {
    (document.querySelector('[data-testid="card-expander-0"]') as HTMLElement | null)?.click();
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    const ok = await page.evaluate(() => {
      (document.querySelector('[data-testid="flight-0-price-LIGHT"]') as HTMLElement | null)
        ?.querySelector('a')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const hit = [...document.querySelectorAll('button')].find((b) =>
        /Escolher a tarifa LIGHT/i.test(b.innerText || ''),
      );
      if (!hit) return false;
      (hit as HTMLElement).click();
      return true;
    });
    if (ok) {
      await sleep(6000);
      return true;
    }
    await sleep(400);
  }
  return false;
}

/** Probe true Biz RT by swapping outOfferId on the inbound search request. */
async function probeBizRtInbound(
  page: Page,
  bizOutOfferId: string,
): Promise<{ status: number; n: number; offers: ParsedOffer[] }> {
  let result: { status: number; n: number; body: unknown } | null = null;

  await page.route(/air-offers\/v2\/offers\/search/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const outId = u.searchParams.get('outOfferId');
    if (outId && outId !== 'null' && !result) {
      u.searchParams.set('outOfferId', bizOutOfferId);
      const res = await route.fetch({ url: u.toString() });
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 200) };
      }
      const n = (body as { content?: unknown[] })?.content?.length ?? 0;
      result = { status: res.status(), n, body };
      return route.fulfill({ status: res.status(), body: text, contentType: 'application/json' });
    }
    return route.continue();
  });

  const advanced = await clickLightToAdvance(page);
  const deadline = Date.now() + 25000;
  while (!result && Date.now() < deadline) await sleep(200);
  await page.unroute(/air-offers\/v2\/offers\/search/).catch(() => {});

  if (!advanced || !result) {
    return { status: 0, n: 0, offers: [] };
  }
  const r = result as { status: number; n: number; body: unknown };
  return { status: r.status, n: r.n, offers: parseOffers(r.body, 'cash') };
}

async function captureSearch(
  page: Page,
  url: string,
  modality: Modality,
): Promise<{ status: string; offers: ParsedOffer[]; rawUrl?: string }> {
  const cap = new Capture(page);
  cap.start();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(2000);

  if (modality === 'miles' && (await isLoginWall(page))) {
    if (!(await waitLogin(page))) {
      cap.stop();
      return { status: 'login_required', offers: [] };
    }
    cap.bodies = [];
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  }

  const hit = await cap.waitNext(0, 45000);
  cap.stop();
  if (!hit) return { status: 'capture_failed', offers: [] };
  const offers = parseOffers(hit.body, modality).sort((a, b) => sortBest(a, b, modality));
  return { status: offers.length ? 'ok' : 'no_biz', offers, rawUrl: hit.url };
}

async function runCase(page: Page, modality: Modality) {
  console.log(`\n======== ${modality.toUpperCase()} Biz GRU↔BRU ========`);

  const rtUrl = ofertaUrl({
    origin: 'GRU',
    destination: 'BRU',
    outbound: OUT_DATE,
    inbound: IN_DATE,
    trip: 'RT',
    modality,
  });
  const outCap = await captureSearch(page, rtUrl, modality);
  console.log(`  outbound biz offers=${outCap.offers.length} (${outCap.status})`);
  for (const o of outCap.offers.slice(0, 4)) {
    console.log(
      `    · ${o.flights} | ${o.stops}p | ${fmtDur(o.durationMin)} | ${o.brandText} | ${priceLabel(o, modality)} | ${o.route}`,
    );
  }
  if (!outCap.offers.length) {
    return { modality, status: outCap.status, trueRt: null, owSum: null };
  }

  const chosenOut = outCap.offers[0]!;
  console.log(`  OUT pick: ${chosenOut.flights} | ${priceLabel(chosenOut, modality)} | ${chosenOut.brandText}`);

  // True RT probe (cash path uses offerId swap; miles too if we have offerId)
  let trueRt: {
    available: boolean;
    status: number;
    n: number;
    inbound: ParsedOffer | null;
    note: string;
  } | null = null;

  if (chosenOut.offerId && modality === 'cash') {
    console.log('  probing true Biz RT inbound via outOfferId swap…');
    await page.goto(rtUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForSelector('[data-testid="wrapper-card-flight-0"]', { timeout: 45000 }).catch(() => {});
    const probe = await probeBizRtInbound(page, chosenOut.offerId);
    const inboundSorted = [...probe.offers].sort((a, b) => sortBest(a, b, modality));
    trueRt = {
      available: probe.n > 0 && inboundSorted.length > 0,
      status: probe.status,
      n: probe.n,
      inbound: inboundSorted[0] ?? null,
      note:
        probe.n === 0
          ? 'BFF returns 0 inbound offers when outOfferId is Premium Business — true Biz+Biz RT unavailable'
          : 'true Biz RT inbound found',
    };
    console.log(`  true RT: status=${probe.status} n=${probe.n} bizParsed=${inboundSorted.length}`);
    if (trueRt.inbound) {
      console.log(
        `  RT pick: ${trueRt.inbound.flights} | ${priceLabel(trueRt.inbound, modality)} | ${trueRt.inbound.brandText}`,
      );
    }
  } else if (modality === 'miles') {
    trueRt = {
      available: false,
      status: 0,
      n: 0,
      inbound: null,
      note: 'Biz UI select is a no-op; miles true-RT skipped (same empty-inbound behavior expected)',
    };
  }

  // OW return leg BRU→GRU
  const inUrl = ofertaUrl({
    origin: 'BRU',
    destination: 'GRU',
    outbound: IN_DATE,
    trip: 'OW',
    modality,
  });
  console.log('  capturing OW return BRU→GRU…');
  const inCap = await captureSearch(page, inUrl, modality);
  console.log(`  inbound OW biz offers=${inCap.offers.length} (${inCap.status})`);
  const chosenIn = inCap.offers[0] ?? null;
  if (chosenIn) {
    console.log(
      `  IN OW pick: ${chosenIn.flights} | ${priceLabel(chosenIn, modality)} | ${chosenIn.brandText} | ${chosenIn.route}`,
    );
  }

  const owSum =
    chosenIn && modality === 'cash' && chosenOut.amountBrl != null && chosenIn.amountBrl != null
      ? {
          brl: chosenOut.amountBrl + chosenIn.amountBrl,
          out: chosenOut,
          in: chosenIn,
        }
      : chosenIn && modality === 'miles' && chosenOut.miles != null && chosenIn.miles != null
        ? {
            miles: chosenOut.miles + chosenIn.miles,
            taxesBrl: (chosenOut.taxesBrl ?? 0) + (chosenIn.taxesBrl ?? 0),
            out: chosenOut,
            in: chosenIn,
          }
        : null;

  if (owSum && 'brl' in owSum) {
    console.log(`  OW+OW Biz approx: R$${owSum.brl.toFixed(0)}`);
  } else if (owSum && 'miles' in owSum) {
    console.log(
      `  OW+OW Biz approx: ${owSum.miles.toLocaleString('pt-BR')} mi + R$${owSum.taxesBrl.toFixed(0)}`,
    );
  }

  // Mixed RT reference: Economy out + Biz in (only meaningful for cash)
  let mixedRt: ParsedOffer | null = null;
  if (modality === 'cash') {
    console.log('  capturing mixed RT (LIGHT out → Biz brands on inbound)…');
    await page.goto(rtUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForSelector('[data-testid="wrapper-card-flight-0"]', { timeout: 45000 }).catch(() => {});
    const cap = new Capture(page);
    cap.start();
    const before = cap.bodies.length;
    await clickLightToAdvance(page);
    const inBody = await cap.waitNext(before, 30000);
    cap.stop();
    if (inBody) {
      const mixed = parseOffers(inBody.body, modality).sort((a, b) => sortBest(a, b, modality));
      mixedRt = mixed[0] ?? null;
      if (mixedRt) {
        console.log(
          `  mixed RT (Y out + Biz in): ${mixedRt.flights} | ${priceLabel(mixedRt, modality)} | ${mixedRt.brandText}`,
        );
      }
    }
  }

  const status = trueRt?.available
    ? 'true_rt_ok'
    : owSum
      ? 'ow_fallback'
      : outCap.status === 'ok'
        ? 'outbound_only'
        : outCap.status;

  return {
    modality,
    status,
    trueRt,
    outbound: chosenOut,
    inboundOw: chosenIn,
    owSum,
    mixedRt,
    outboundAlternatives: outCap.offers.slice(0, 5),
    inboundOwAlternatives: inCap.offers.slice(0, 5),
  };
}

async function main() {
  console.log(`[gru-bru-biz] Premium Business | GRU↔BRU | ${OUT_DATE} → ${IN_DATE}`);
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();

  const results = [];
  for (const modality of ['cash', 'miles'] as Modality[]) {
    results.push(await runCase(page, modality));
    await sleep(3000);
  }

  const slim = results.map((r) => ({
    modality: r.modality,
    status: r.status,
    trueRt: r.trueRt
      ? {
          available: r.trueRt.available,
          status: r.trueRt.status,
          n: r.trueRt.n,
          note: r.trueRt.note,
          inbound: slimOffer(r.trueRt.inbound),
        }
      : null,
    outbound: slimOffer(r.outbound),
    inboundOw: slimOffer(r.inboundOw),
    owSum:
      r.owSum && 'brl' in r.owSum
        ? { brl: r.owSum.brl }
        : r.owSum && 'miles' in r.owSum
          ? { miles: r.owSum.miles, taxesBrl: r.owSum.taxesBrl }
          : null,
    mixedRt: slimOffer(r.mixedRt),
  }));

  const outDir = path.join('scripts', 'research', 'out');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `gru-bru-biz-rt-${OUT_DATE}_${IN_DATE}.json`);
  await writeFile(
    outPath,
    JSON.stringify({ outDate: OUT_DATE, inDate: IN_DATE, cabin: CABIN, results: slim }, null, 2),
  );

  console.log('\n======== SUMMARY GRU↔BRU Premium Business ========');
  for (const r of slim) {
    console.log(`\n${r.modality}: ${r.status}`);
    if (r.trueRt) console.log(`  true Biz RT: ${r.trueRt.available ? 'YES' : 'NO'} — ${r.trueRt.note}`);
    if (r.outbound) {
      console.log(
        `  OUT: ${r.outbound.flights} ${r.outbound.route} | ${r.outbound.brand} | ${
          r.modality === 'miles'
            ? `${(r.outbound.miles ?? 0).toLocaleString('pt-BR')} mi`
            : `R$${(r.outbound.brl ?? 0).toFixed(0)}`
        }`,
      );
    }
    if (r.inboundOw) {
      console.log(
        `  IN OW: ${r.inboundOw.flights} ${r.inboundOw.route} | ${r.inboundOw.brand} | ${
          r.modality === 'miles'
            ? `${(r.inboundOw.miles ?? 0).toLocaleString('pt-BR')} mi`
            : `R$${(r.inboundOw.brl ?? 0).toFixed(0)}`
        }`,
      );
    }
    if (r.owSum && 'brl' in r.owSum) console.log(`  OW+OW: R$${r.owSum.brl.toFixed(0)}`);
    if (r.owSum && 'miles' in r.owSum) {
      console.log(`  OW+OW: ${r.owSum.miles.toLocaleString('pt-BR')} mi + R$${r.owSum.taxesBrl.toFixed(0)}`);
    }
    if (r.mixedRt) {
      console.log(
        `  mixed RT (Y+Biz): ${r.mixedRt.flights} | R$${((r.mixedRt.brl as number) ?? 0).toFixed(0)} | ${r.mixedRt.brand}`,
      );
    }
  }
  console.log(`\n[gru-bru-biz] wrote ${outPath}`);
  await page.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

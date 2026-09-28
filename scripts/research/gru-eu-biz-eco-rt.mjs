/**
 * True RT GRU → AMS/CDG/BRU/FRA
 * 2026-12-26 → 2027-01-03 · 1 adult + 1 child
 * Out: Premium Business Standard · In: Economy Standard
 * Max 1 stop. Prices are the per-adult amounts LATAM shows on each leg.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const CDP = 'http://127.0.0.1:9222';
const OUT = '2026-12-26';
const IN = '2027-01-03';

/** Biz Standard only exists on BRU nonstop and FRA via BRU. Others: Biz Full. */
const JOBS = [
  { dest: 'AMS', dep: '22:55', brand: 'PREMIUM BUSINESS FULL', note: 'direto sem Biz Standard' },
  { dest: 'CDG', dep: '18:20', brand: 'PREMIUM BUSINESS FULL', note: 'direto sem Biz Standard' },
  { dest: 'FRA', dep: '23:10', brand: 'PREMIUM BUSINESS FULL', note: 'direto sem Biz Standard' },
  { dest: 'FRA', dep: '18:00', brand: 'PREMIUM BUSINESS STANDARD', note: '1 parada via BRU' },
  { dest: 'BRU', dep: '18:00', brand: 'PREMIUM BUSINESS STANDARD', note: 'direto' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hhmm(iso) {
  return iso?.slice(11, 16) ?? '';
}
function fmtDur(min) {
  if (min == null || Number.isNaN(min)) return null;
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}
function diffMin(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}

function parseOffers(body) {
  const rows = [];
  for (const o of body?.content ?? []) {
    const segs = (o.itinerary ?? []).filter((s) => s.origin && s.destination && s.departure && s.arrival);
    if (!segs.length) continue;
    const stops = o.summary?.stopOvers ?? Math.max(0, segs.length - 1);
    if (stops > 1) continue;
    const connects = [];
    for (let i = 0; i < segs.length - 1; i++) {
      connects.push({
        hub: segs[i].destination,
        min: diffMin(segs[i].arrival, segs[i + 1].departure),
      });
    }
    const brands = {};
    for (const b of o.summary?.brands ?? []) {
      if (b.price?.amount == null) continue;
      brands[b.brandText] = {
        amount: b.price.amount,
        offerId: b.offerId,
        cabin: b.cabin?.id ?? null,
        taxes: b.taxes?.amount ?? null,
      };
    }
    const newPrices = Array.isArray(o.newPrices) ? o.newPrices : null;
    rows.push({
      stops,
      durationMin: o.summary?.duration ?? diffMin(segs[0].departure, segs.at(-1).arrival),
      flights: segs.map((s) => `${s.flight?.airlineCode ?? ''}${s.flight?.flightNumber ?? ''}`).join('+'),
      route: segs.map((s) => `${s.origin}→${s.destination}`).join(' · '),
      dep: segs[0].departure,
      arr: segs.at(-1).arrival,
      connects,
      brands,
      newPrices,
    });
  }
  return rows;
}

function rPrice(row, brand) {
  return row.brands[brand]?.amount ?? Infinity;
}
function bizStd(row) {
  return row.brands['PREMIUM BUSINESS STANDARD'] ?? null;
}
function ecoStd(row) {
  const b = row.brands.STANDARD;
  if (!b || b.cabin === 'J') return null;
  return b;
}

function urlFor(dest) {
  const p = new URLSearchParams({
    origin: 'GRU',
    destination: dest,
    outbound: `${OUT}T12:00:00.000Z`,
    inbound: `${IN}T12:00:00.000Z`,
    adt: '1',
    chd: '1',
    inf: '0',
    trip: 'RT',
    cabin: 'PremiumBusiness',
    redemption: 'false',
    sort: 'RECOMMENDED',
  });
  return `https://www.latamairlines.com/br/pt/oferta-voos?${p}`;
}

async function dismiss(page) {
  for (const sel of ['button:has-text("Aceitar")', '[data-testid="cookie-banner-accept"]']) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) await loc.click({ timeout: 1500 }).catch(() => {});
  }
}

async function selectBrand(page, dep, arr, brand) {
  await page.waitForSelector('[data-testid="wrapper-card-flight-0"]', { timeout: 30000 });
  const idx = await page.evaluate(({ dep, arr }) => {
    let i = 0;
    let fallback = -1;
    const arrShort = arr.replace(/^0/, '');
    while (document.querySelector(`[data-testid="wrapper-card-flight-${i}"]`)) {
      const t = document.querySelector(`[data-testid="wrapper-card-flight-${i}"]`).innerText || '';
      if (t.includes(dep) && (t.includes(arr) || t.includes(arrShort))) {
        if (fallback < 0) fallback = i;
        if (/direto/i.test(t)) return i;
      }
      i++;
    }
    return fallback;
  }, { dep, arr });
  if (idx < 0) throw new Error(`card not found for ${dep}`);
  await page.locator(`[data-testid="card-expander-${idx}"]`).click({ timeout: 8000 });
  const btn = page.locator('button').filter({ hasText: new RegExp(`Escolher a tarifa ${brand}`, 'i') }).first();
  await btn.waitFor({ timeout: 15000 });
  await btn.click({ timeout: 8000 });
  if (/STANDARD/i.test(brand)) {
    const cont = page.locator('[data-testid="current-brand-button"]');
    if (await cont.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
      await cont.click({ timeout: 8000 });
    }
  }
  return idx;
}

function stripHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (/^(host|content-length|connection|cookie|accept-encoding)$/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0];
  const page = await context.newPage();
  const results = [];

  for (const job of JOBS) {
    const dest = job.dest;
    console.log(`\n===== ${dest} ${job.brand} ${job.dep} =====`);
    let outboundBody = null;
    let inboundBody = null;
    let inboundUrl = null;
    let inboundHeaders = null;
    const onResp = async (resp) => {
      if (!/offers\/search/i.test(resp.url()) || resp.request().method() === 'OPTIONS') return;
      const u = new URL(resp.url());
      const outId = u.searchParams.get('outOfferId');
      const text = await resp.text().catch(() => '');
      if (text.length < 50) return;
      let json = null;
      try { json = JSON.parse(text); } catch { return; }
      if (!outId || outId === 'null') {
        if (!outboundBody) outboundBody = json;
      } else if (!inboundBody) {
        inboundBody = json;
        inboundUrl = resp.url();
        inboundHeaders = stripHeaders(resp.request().headers());
      }
    };
    page.on('response', onResp);
    await page.goto(urlFor(dest), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
      console.log('  goto', String(e).slice(0, 100));
    });
    await dismiss(page);
    const t0 = Date.now();
    while (!outboundBody && Date.now() - t0 < 35000) await sleep(300);
    if (!outboundBody) {
      console.log('  no outbound');
      page.off('response', onResp);
      results.push({ dest, error: 'no_outbound' });
      continue;
    }
    const outbound = parseOffers(outboundBody).filter((r) => r.brands[job.brand] && hhmm(r.dep) === job.dep);
    outbound.sort((a, b) => a.stops - b.stops || a.durationMin - b.durationMin || rPrice(a, job.brand) - rPrice(b, job.brand));
    const chosen = outbound[0];
    if (!chosen) {
      console.log('  no matching outbound');
      page.off('response', onResp);
      results.push({ dest, error: 'no_match', job });
      continue;
    }
    console.log(`  OUT ${chosen.flights} ${hhmm(chosen.dep)} ${job.brand}=${rPrice(chosen, job.brand)} stops=${chosen.stops}`);
    try {
      await selectBrand(page, hhmm(chosen.dep), hhmm(chosen.arr), job.brand);
    } catch (e) {
      console.log('  select fail', String(e).slice(0, 160));
      page.off('response', onResp);
      results.push({ dest, error: 'select_failed', outbound: chosen });
      continue;
    }
    const t1 = Date.now();
    while (!inboundBody && Date.now() - t1 < 25000) await sleep(300);
    page.off('response', onResp);
    if (!inboundBody) {
      console.log('  no inbound');
      results.push({ dest, error: 'no_inbound', outbound: chosen });
      continue;
    }
    const inbound = parseOffers(inboundBody).filter((r) => ecoStd(r));
    inbound.sort((a, b) => a.stops - b.stops || ecoStd(a).amount - ecoStd(b).amount || a.durationMin - b.durationMin);
    console.log(`  IN n=${inbound.length} direct=${inbound.filter((r) => r.stops === 0).length} top=${inbound[0] ? ecoStd(inbound[0]).amount : '-'}`);
    const cabinLine = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ');
      const m = t.match(/cabine [A-Z ]{4,40}/i);
      return m ? m[0] : null;
    });
    console.log('  cabin', cabinLine);

    results.push({
      dest,
      job,
      cabinLine,
      outboundChosen: chosen,
      outboundOptions: outbound.slice(0, 6).map((r) => ({
        flights: r.flights,
        route: r.route,
        dep: r.dep,
        arr: r.arr,
        stops: r.stops,
        durationMin: r.durationMin,
        connects: r.connects,
        brand: job.brand,
        amount: rPrice(r, job.brand),
      })),
      inbound: inbound.slice(0, 6).map((r) => ({
        flights: r.flights,
        route: r.route,
        dep: r.dep,
        arr: r.arr,
        stops: r.stops,
        durationMin: r.durationMin,
        connects: r.connects,
        ecoStandard: ecoStd(r).amount,
        newPrices: r.newPrices,
      })),
    });
  }

  await mkdir('scripts/research/out', { recursive: true });
  const outPath = 'scripts/research/out/gru-eu-biz-eco-rt-full-2026-12-26_2027-01-03.json';
  await writeFile(outPath, JSON.stringify({ out: OUT, in: IN, pax: '1 adt + 1 chd', results }, null, 2));
  console.log('\nWROTE', outPath);
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

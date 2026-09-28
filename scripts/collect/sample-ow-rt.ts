/**
 * Quick OW vs RT price samples over CDP for product decision.
 * Usage: pnpm exec tsx scripts/collect/sample-ow-rt.ts --cdp=http://127.0.0.1:9222
 */
import { chromium } from '@playwright/test';
import { parseSmiles, parseLatamCash } from './parsers.ts';

const cdp = process.argv.find((a) => a.startsWith('--cdp='))?.slice(6) ?? 'http://127.0.0.1:9222';

function smilesUrl(origin: string, dest: string, outDate: string, retDate?: string): string {
  const departureMs = new Date(`${outDate}T03:00:00.000Z`).getTime();
  const params = new URLSearchParams({
    adults: '1',
    cabin: 'ECONOMIC',
    children: '0',
    departureDate: String(departureMs),
    infants: '0',
    isElegible: 'false',
    isFlexibleDateChecked: 'false',
    returnDate: retDate ? String(new Date(`${retDate}T03:00:00.000Z`).getTime()) : '',
    searchType: 'g3',
    segments: retDate ? '2' : '1',
    tripType: retDate ? '1' : '2',
    originAirport: origin,
    originAirportIsAny: 'false',
    destinationAirport: dest,
    destinAirportIsAny: 'false',
    'novo-resultado-voos': 'true',
  });
  return `https://www.smiles.com.br/mfe/emissao-passagem/?${params.toString()}`;
}

function latamUrl(origin: string, dest: string, outDate: string, retDate?: string): string {
  const params = new URLSearchParams({
    origin,
    destination: dest,
    outbound: `${outDate}T12:00:00.000Z`,
    adt: '1',
    chd: '0',
    inf: '0',
    trip: retDate ? 'RT' : 'OW',
    cabin: 'Economy',
    redemption: 'false',
    sort: 'RECOMMENDED',
  });
  if (retDate) params.set('inbound', `${retDate}T12:00:00.000Z`);
  return `https://www.latamairlines.com/br/pt/oferta-voos?${params.toString()}`;
}

async function capture(
  page: import('@playwright/test').Page,
  url: string,
  match: RegExp,
  label: string,
): Promise<unknown | null> {
  let body: unknown = null;
  const onResp = async (resp: import('@playwright/test').Response) => {
    if (!match.test(resp.url())) return;
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
  console.log(`  ${url.slice(0, 120)}…`);
  await page.goto('https://www.smiles.com.br/home', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const deadline = Date.now() + 28000;
  while (!body && Date.now() < deadline) await new Promise((r) => setTimeout(r, 400));
  page.off('response', onResp);
  if (!body) {
    // retry reload once
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    page.on('response', onResp);
    const d2 = Date.now() + 15000;
    while (!body && Date.now() < d2) await new Promise((r) => setTimeout(r, 400));
    page.off('response', onResp);
  }
  return body;
}

function summarizeSmiles(body: unknown, leg: string) {
  const rows = parseSmiles(body, 'X', 'Y', '2026-11-10');
  const mi = rows.filter((r) => r.miles != null).sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0))[0];
  const cash = rows.filter((r) => r.amountBrl != null).sort((a, b) => (a.amountBrl ?? 0) - (b.amountBrl ?? 0))[0];
  console.log(
    `  ${leg}: flights≈${rows.length / 2 || rows.length} | best mi=${mi?.miles ?? '—'} cash=${cash?.amountBrl ?? '—'} tax=${mi?.taxesBrl ?? cash?.taxesBrl ?? '—'}`,
  );
  return { mi: mi?.miles ?? null, cash: cash?.amountBrl ?? null };
}

function summarizeLatam(body: unknown, leg: string) {
  const rows = parseLatamCash(body, 'X', 'Y', '2026-11-11');
  const best = [...rows].sort((a, b) => (a.amountBrl ?? 0) - (b.amountBrl ?? 0))[0];
  console.log(`  ${leg}: offers=${rows.length} | best cash=${best?.amountBrl ?? '—'} tax=${best?.taxesBrl ?? '—'}`);
  return { cash: best?.amountBrl ?? null };
}

async function main() {
  const browser = await chromium.connectOverCDP(cdp);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();

  const out = '2026-11-10'; // Tue
  const ret = '2026-11-14'; // Sat
  const outL = '2026-11-11'; // Wed
  const retL = '2026-11-14';

  // --- Smiles ---
  await page.goto('https://www.smiles.com.br/home', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));

  const sOwOut = await capture(page, smilesUrl('PET', 'CGH', out), /airlines\/search/i, `Smiles OW PET→CGH ${out}`);
  const owOut = sOwOut ? summarizeSmiles(sOwOut, 'OW out') : (console.log('  FAIL'), null);

  const sOwRet = await capture(page, smilesUrl('CGH', 'PET', ret), /airlines\/search/i, `Smiles OW CGH→PET ${ret}`);
  const owRet = sOwRet ? summarizeSmiles(sOwRet, 'OW ret') : (console.log('  FAIL'), null);

  const sRt = await capture(page, smilesUrl('PET', 'CGH', out, ret), /airlines\/search/i, `Smiles RT PET↔CGH ${out}→${ret}`);
  if (sRt) {
    // RT response may have SEGMENT_1 and SEGMENT_2 — parseSmiles only reads SEGMENT_1
    const root = sRt as {
      requestedFlightSegmentList?: Array<{ type?: string; flightList?: unknown[] }>;
    };
    for (const seg of root.requestedFlightSegmentList ?? []) {
      const fake = { requestedFlightSegmentList: [seg] };
      summarizeSmiles(fake, `RT ${seg.type ?? '?'}`);
    }
    if (owOut && owRet) {
      const sumMi = (owOut.mi ?? 0) + (owRet.mi ?? 0);
      const sumCash = (owOut.cash ?? 0) + (owRet.cash ?? 0);
      console.log(`  COMPARE: OW+OW mi=${sumMi || '—'} cash=${sumCash || '—'} (vs RT segments above)`);
    }
  } else console.log('  FAIL RT');

  // --- LATAM cash ---
  await page.goto('https://www.latamairlines.com/br/pt', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));

  // reuse capture but don't force smiles home first — patch by going latam home in capture for latam
  async function captureLatam(url: string, label: string) {
    let body: unknown = null;
    const match = /air-offers\/(v\d+\/)?offers\/search/i;
    const onResp = async (resp: import('@playwright/test').Response) => {
      if (!match.test(resp.url())) return;
      if (resp.request().method() === 'OPTIONS') return;
      if (resp.status() < 200 || resp.status() >= 300) return;
      const text = await resp.text().catch(() => '');
      if (text.length < 100) return;
      try {
        body = JSON.parse(text);
      } catch {
        /* */
      }
    };
    page.on('response', onResp);
    console.log(`\n→ ${label}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    const deadline = Date.now() + 25000;
    while (!body && Date.now() < deadline) await new Promise((r) => setTimeout(r, 400));
    page.off('response', onResp);
    return body;
  }

  const lOwOut = await captureLatam(latamUrl('PET', 'GRU', outL), `LATAM OW PET→GRU ${outL}`);
  if (lOwOut) summarizeLatam(lOwOut, 'OW out');
  else console.log('  FAIL');

  const lOwRet = await captureLatam(latamUrl('GRU', 'PET', retL), `LATAM OW GRU→PET ${retL}`);
  if (lOwRet) summarizeLatam(lOwRet, 'OW ret');
  else console.log('  FAIL');

  const lRt = await captureLatam(latamUrl('PET', 'GRU', outL, retL), `LATAM RT PET↔GRU ${outL}→${retL}`);
  if (lRt) {
    summarizeLatam(lRt, 'RT (parser reads outbound only — check raw if needed)');
    const content = (lRt as { content?: unknown[] }).content ?? [];
    console.log(`  RT raw content items=${content.length}`);
  } else console.log('  FAIL RT');

  await page.close().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

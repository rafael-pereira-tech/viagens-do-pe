import { chromium } from '@playwright/test';
import { parseSmiles, parseLatamCash } from './parsers.ts';

const cdp = 'http://127.0.0.1:9222';

function smilesUrl(o: string, d: string, date: string) {
  const ms = new Date(`${date}T03:00:00.000Z`).getTime();
  const p = new URLSearchParams({
    adults: '1',
    cabin: 'ECONOMIC',
    children: '0',
    departureDate: String(ms),
    infants: '0',
    isElegible: 'false',
    isFlexibleDateChecked: 'false',
    returnDate: '',
    searchType: 'g3',
    segments: '1',
    tripType: '2',
    originAirport: o,
    originAirportIsAny: 'false',
    destinationAirport: d,
    destinAirportIsAny: 'false',
    'novo-resultado-voos': 'true',
  });
  return `https://www.smiles.com.br/mfe/emissao-passagem/?${p}`;
}

function latam(o: string, d: string, out: string, ret?: string) {
  const p = new URLSearchParams({
    origin: o,
    destination: d,
    outbound: `${out}T12:00:00.000Z`,
    adt: '1',
    chd: '0',
    inf: '0',
    trip: ret ? 'RT' : 'OW',
    cabin: 'Economy',
    redemption: 'false',
    sort: 'RECOMMENDED',
  });
  if (ret) p.set('inbound', `${ret}T12:00:00.000Z`);
  return `https://www.latamairlines.com/br/pt/oferta-voos?${p}`;
}

async function main() {
  const b = await chromium.connectOverCDP(cdp);
  const page = await (b.contexts()[0] ?? (await b.newContext())).newPage();

  async function waitBody(match: RegExp, ms = 25000) {
    let body: unknown = null;
    const h = async (r: Awaited<ReturnType<typeof page.waitForResponse>>) => {
      if (!match.test(r.url())) return;
      if (r.request().method() === 'OPTIONS') return;
      if (r.status() < 200 || r.status() >= 300) return;
      const t = await r.text().catch(() => '');
      if (t.length < 100) return;
      try {
        body = JSON.parse(t);
      } catch {
        /* */
      }
    };
    page.on('response', h);
    const end = Date.now() + ms;
    while (!body && Date.now() < end) await new Promise((r) => setTimeout(r, 400));
    page.off('response', h);
    return body;
  }

  await page.goto('https://www.smiles.com.br/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  await page.goto(smilesUrl('CGH', 'PET', '2026-11-14'), { waitUntil: 'domcontentloaded' }).catch(() => {});
  let body = await waitBody(/airlines\/search/i);
  if (!body) {
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    body = await waitBody(/airlines\/search/i, 15000);
  }
  if (body) {
    const rows = parseSmiles(body, 'CGH', 'PET', '2026-11-14');
    const mi = rows.find((r) => r.miles);
    const cash = rows.find((r) => r.amountBrl);
    console.log('Smiles OW CGH->PET 11-14:', mi?.miles, 'mi', cash?.amountBrl, 'BRL tax', mi?.taxesBrl);
  } else console.log('Smiles reverse FAIL');

  await page.goto('https://www.latamairlines.com/br/pt', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  await page.goto(latam('PET', 'GRU', '2026-11-11'), { waitUntil: 'domcontentloaded' }).catch(() => {});
  body = await waitBody(/air-offers\/(v\d+\/)?offers\/search/i);
  if (body) {
    const rows = parseLatamCash(body, 'PET', 'GRU', '2026-11-11');
    console.log('LATAM OW PET->GRU 11-11:', rows[0]?.amountBrl, 'tax', rows[0]?.taxesBrl, 'n', rows.length);
  } else console.log('LATAM OW out FAIL');

  await page.goto(latam('PET', 'GRU', '2026-11-11', '2026-11-14'), { waitUntil: 'domcontentloaded' }).catch(() => {});
  body = await waitBody(/air-offers\/(v\d+\/)?offers\/search/i);
  if (body) {
    const root = body as Record<string, unknown>;
    const content = (root.content as unknown[]) ?? [];
    console.log('LATAM RT content len', content.length);
    for (let i = 0; i < Math.min(content.length, 3); i++) {
      const s = (content[i] as { summary?: Record<string, unknown> }).summary;
      console.log(
        `  [${i}] flight=${s?.flightCode} lowest=${JSON.stringify(s?.lowestPrice)} dep=${JSON.stringify((s?.origin as { departureTime?: string })?.departureTime)}`,
      );
    }
    const str = JSON.stringify(body);
    console.log('mentions return/inbound', /inbound|returnFlight|itineraryPart/i.test(str));
  } else console.log('LATAM RT FAIL');

  await page.close().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

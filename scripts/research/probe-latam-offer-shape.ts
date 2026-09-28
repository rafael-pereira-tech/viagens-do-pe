/**
 * Probe one LATAM PET→dest cash offer JSON shape (segments / layover).
 * Usage: pnpm exec tsx scripts/research/probe-latam-offer-shape.ts --cdp=http://127.0.0.1:9222
 */
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const CDP = process.argv.find((a) => a.startsWith('--cdp='))?.slice(6) ?? 'http://127.0.0.1:9222';
const DATE = '2026-09-25';
const DEST = 'BSB';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  let body: unknown = null;
  page.on('response', async (resp) => {
    if (!/air-offers\/(v\d+\/)?offers\/search/i.test(resp.url())) return;
    if (resp.request().method() === 'OPTIONS') return;
    if (resp.status() < 200 || resp.status() >= 300) return;
    const text = await resp.text().catch(() => '');
    if (text.length < 100) return;
    try {
      body = JSON.parse(text);
    } catch {
      /* ignore */
    }
  });
  const params = new URLSearchParams({
    origin: 'PET',
    destination: DEST,
    outbound: `${DATE}T12:00:00.000Z`,
    adt: '1',
    chd: '0',
    inf: '0',
    trip: 'OW',
    cabin: 'Economy',
    redemption: 'false',
    sort: 'RECOMMENDED',
  });
  const url = `https://www.latamairlines.com/br/pt/oferta-voos?${params}`;
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const deadline = Date.now() + 30000;
  while (!body && Date.now() < deadline) await sleep(400);
  if (!body) throw new Error('no body');
  const root = body as { content?: unknown[] };
  const first = root.content?.[0] as Record<string, unknown>;
  console.log('top keys', Object.keys(first ?? {}));
  const summary = first?.summary as Record<string, unknown> | undefined;
  console.log('summary keys', summary && Object.keys(summary));
  // dump nested interesting bits
  const pick = JSON.stringify(
    {
      summary,
      itinerary: first?.itinerary,
      segments: first?.segments,
      flights: first?.flights,
      legs: first?.legs,
      detail: first?.detail,
    },
    null,
    2,
  );
  await mkdir('scripts/research/out', { recursive: true });
  const out = path.join('scripts/research/out', `probe-pet-${DEST}.json`);
  await writeFile(out, pick.slice(0, 200000));
  console.log('wrote', out, 'chars', pick.length);
  // Also list all 1-stop offers' summary fields briefly
  for (const item of (root.content ?? []).slice(0, 8)) {
    const s = (item as { summary?: Record<string, unknown> }).summary;
    console.log('offer', {
      flightCode: s?.flightCode,
      stopOvers: s?.stopOvers,
      departure: s?.origin,
      destination: s?.destination,
      lowest: s?.lowestPrice,
      duration: s?.duration,
      totalTime: s?.totalTime,
    });
  }
  await page.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

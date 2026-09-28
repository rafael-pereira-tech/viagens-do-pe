/**
 * LATAM cash PET→GRU, one real page search per operating day.
 * Measures when Akamai starts refusing. Does not touch port 9222 or the slow-crawl snapshots.
 *
 *   pnpm exec tsx scripts/collect/latam-page-gap-test.ts --month=2026-11 --gap=3000
 */
import { chromium, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseLatamCash } from './parsers.ts';

const ORIGIN = 'PET';
const DEST = 'GRU';
const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const MONTH = arg('month', '2026-10');
const GAP_MS = Number(arg('gap', '5000'));
const CAPTURE_MS = 25_000;
const PROFILE = path.join(os.homedir(), '.cache', 'chrome-pw-vdp-latam');
const [year, monthNum] = MONTH.split('-').map(Number);
const lastDay = new Date(year!, monthNum!, 0).getDate();
const RANGE = `${MONTH}-01_to_${MONTH}-${String(lastDay).padStart(2, '0')}`;
const BASELINE = `scripts/collect/out/${RANGE}/latam/snapshots.jsonl`;
const OUT = `scripts/collect/out/${RANGE}/latam-page-${GAP_MS / 1000}s.json`;

function dates(): string[] {
  const out: string[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const iso = `${MONTH}-${String(day).padStart(2, '0')}`;
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    // Through 2026-10-30: Mon/Wed/Fri. From then on: Wed/Fri/Sat.
    const ok = iso <= '2026-10-30' ? dow === 1 || dow === 3 || dow === 5 : dow === 3 || dow === 5 || dow === 6;
    if (ok) out.push(iso);
  }
  return out;
}

function oferta(date: string): string {
  const params = new URLSearchParams({
    origin: ORIGIN,
    destination: DEST,
    outbound: `${date}T12:00:00.000Z`,
    adt: '1',
    chd: '0',
    inf: '0',
    trip: 'OW',
    cabin: 'Economy',
    redemption: 'false',
    sort: 'RECOMMENDED',
  });
  return `https://www.latamairlines.com/br/pt/oferta-voos?${params}`;
}

async function search(page: Page, date: string) {
  let status = 0;
  let body: unknown = null;
  let note = '';
  const onResponse = async (resp: { url: () => string; status: () => number; text: () => Promise<string>; request: () => { method: () => string } }) => {
    if (!/offers\/search/i.test(resp.url()) || resp.request().method() === 'OPTIONS') return;
    if (!resp.url().includes(date.slice(0, 7)) && !resp.url().includes(date)) {
      /* still accept: outFrom may be the date */
    }
    status = resp.status();
    const text = await resp.text().catch(() => '');
    if (text.includes('Access Denied')) {
      note = 'Access Denied';
      return;
    }
    try {
      body = JSON.parse(text);
    } catch {
      note = text.slice(0, 60).replace(/\s+/g, ' ');
    }
  };
  page.on('response', onResponse);
  const t = Date.now();
  await page.goto(oferta(date), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
    note = String(e).slice(0, 80);
  });
  const deadline = Date.now() + CAPTURE_MS;
  while (!body && !note && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  page.off('response', onResponse);
  const title = await page.title().catch(() => '');
  if (/access denied/i.test(title)) note = note || 'Access Denied';
  const parsed = body ? parseLatamCash(body, ORIGIN, DEST, date) : [];
  const best = parsed.slice().sort((a, b) => (a.amountBrl ?? 1e12) - (b.amountBrl ?? 1e12))[0];
  return {
    date,
    status: status || (note ? 0 : 200),
    ms: Date.now() - t,
    offers: parsed.length,
    flightCode: best?.flightCode ?? null,
    departureTime: best?.departureTime ?? null,
    amountBrl: best?.amountBrl ?? null,
    note,
  };
}

async function main() {
  const all = dates();
  const t0 = Date.now();
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled'],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const rows = [];
  let firstBlock: string | null = null;
  for (let i = 0; i < all.length; i++) {
    const date = all[i]!;
    const row = await search(page, date);
    rows.push(row);
    if (!firstBlock && (row.status === 403 || /access denied/i.test(row.note))) firstBlock = date;
    console.log(
      `[page5s] ${row.date} status=${row.status} offers=${row.offers} ${row.ms}ms ${row.flightCode ?? ''} ${row.amountBrl ?? row.note ?? 'empty'}`,
    );
    if (i < all.length - 1) await new Promise((r) => setTimeout(r, GAP_MS));
  }

  let baseline: Array<{ flightDate: string; amountBrl: number | null; flightCode?: string }> = [];
  try {
    baseline = (await readFile(BASELINE, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    /* none */
  }
  const baseByDate = new Map(baseline.map((r) => [r.flightDate, r]));
  let same = 0;
  let diff = 0;
  let missed = 0;
  for (const r of rows) {
    const b = baseByDate.get(r.date);
    if (b?.amountBrl != null && r.amountBrl == null) missed++;
    else if (b && r.amountBrl != null && Math.abs((b.amountBrl ?? 0) - r.amountBrl) < 0.02) same++;
    else if (b && r.amountBrl != null) diff++;
  }
  const summary = {
    gapMs: GAP_MS,
    totalMs: Date.now() - t0,
    dates: all.length,
    withPrice: rows.filter((r) => r.amountBrl != null).length,
    blocked: rows.filter((r) => r.status === 403 || /access denied/i.test(r.note)).length,
    firstBlock,
    vsBaseline: { same, diff, missed, baselineRows: baseline.length },
    rows,
  };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(summary, null, 2));
  console.log(
    `[page5s] DONE ${summary.totalMs}ms priced=${summary.withPrice}/${all.length} blocked=${summary.blocked} firstBlock=${firstBlock ?? 'none'} same=${same} diff=${diff} missed=${missed}`,
  );
  await context.close();
}

main().catch((err) => {
  console.error('[page5s] fatal', err);
  process.exit(1);
});

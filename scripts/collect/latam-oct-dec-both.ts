/**
 * LATAM cash, Oct–Dec 2026, page search every operating day, 1s apart.
 * PET→GRU first, then GRU→PET. Records prices and per-search timing.
 *
 *   pnpm exec tsx scripts/collect/latam-oct-dec-both.ts
 */
import { chromium, type Page, type Response } from '@playwright/test';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { requireIproyalProxy, scrub } from './iproyal.ts';
import { parseLatamCash, type SnapshotRow } from './parsers.ts';
import { TrafficMeter } from './traffic.ts';

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const GAP_MS = Number(arg('gap', '1000'));
const CAPTURE_MS = 25_000;
const PROFILE = path.join(os.homedir(), '.cache', 'chrome-pw-vdp-latam');
const ROUTE_ARG = arg('routes', 'PET-GRU,GRU-PET');
const LIMIT = Number(arg('limit', '0'));
const MONTH = arg('month', '');
const RANGE = MONTH ? `${MONTH}-01_to_${MONTH}-${String(new Date(Number(MONTH.slice(0, 4)), Number(MONTH.slice(5, 7)), 0).getDate()).padStart(2, '0')}` : '2026-10-01_to_2026-12-31';
const OUT_DIR = `scripts/collect/out/${RANGE}/latam-${ROUTE_ARG.replace(/,/g, '_')}-${GAP_MS / 1000}s-iproyal`;
const JSONL = path.join(OUT_DIR, 'snapshots.jsonl');
const STATS = path.join(OUT_DIR, 'stats.json');

const ROUTES: Array<[string, string]> = ROUTE_ARG.split(',')
  .filter(Boolean)
  .map((pair) => {
    const [origin, destination] = pair.split('-');
    if (!origin || !destination) throw new Error(`bad route ${pair}`);
    return [origin, destination];
  });

function operatingDates(): string[] {
  const out: string[] = [];
  for (const month of MONTH ? [MONTH] : ['2026-10', '2026-11', '2026-12']) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y!, m!, 0).getDate();
    for (let day = 1; day <= last; day++) {
      const iso = `${month}-${String(day).padStart(2, '0')}`;
      const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
      const ok = iso <= '2026-10-30' ? dow === 1 || dow === 3 || dow === 5 : dow === 3 || dow === 5 || dow === 6;
      if (ok) out.push(iso);
    }
  }
  return out;
}

function oferta(origin: string, destination: string, date: string): string {
  const params = new URLSearchParams({
    origin,
    destination,
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

function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)] ?? null;
}

function rate(part: number, whole: number): number | null {
  return whole ? Math.round((part / whole) * 10000) / 10000 : null;
}

async function search(page: Page, origin: string, destination: string, date: string, traffic: TrafficMeter) {
  let status = 0;
  let body: unknown = null;
  let note = '';
  const onResponse = async (resp: Response) => {
    if (!/offers\/search/i.test(resp.url()) || resp.request().method() === 'OPTIONS') return;
    if (!resp.url().includes(date)) return;
    status = resp.status();
    const text = await resp.text().catch(() => '');
    if (text.includes('Access Denied') || resp.status() === 403) {
      note = 'Access Denied';
      return;
    }
    try {
      body = JSON.parse(text);
    } catch {
      note = text.slice(0, 80).replace(/\s+/g, ' ');
    }
  };
  page.on('response', onResponse);
  const t = Date.now();
  traffic.take();
  await page.goto(oferta(origin, destination, date), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
    note = scrub(String(e));
  });
  const deadline = Date.now() + CAPTURE_MS;
  while (!body && !note && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  page.off('response', onResponse);
  const title = await page.title().catch(() => '');
  if (/access denied/i.test(title)) note = note || 'Access Denied';
  const offers = body ? parseLatamCash(body, origin, destination, date) : [];
  const best = offers.slice().sort((a, b) => (a.amountBrl ?? 1e12) - (b.amountBrl ?? 1e12))[0] ?? null;
  const blocked = status === 403 || /access denied/i.test(note);
  const bytes = traffic.take();
  return {
    origin,
    destination,
    date,
    status: status || (note ? 0 : 0),
    ms: Date.now() - t,
    offers: offers.length,
    blocked,
    empty: Boolean(body) && offers.length === 0,
    failed: !body && !blocked,
    flightCode: best?.flightCode ?? null,
    departureTime: best?.departureTime ?? null,
    amountBrl: best?.amountBrl ?? null,
    taxesBrl: best?.taxesBrl ?? null,
    fareLabel: best?.fareLabel ?? null,
    note,
    bytesIn: bytes.bytesIn,
    bytesOut: bytes.bytesOut,
    parsed: offers,
  };
}

async function main() {
  const proxy = requireIproyalProxy();
  const dates = operatingDates().slice(0, LIMIT > 0 ? LIMIT : undefined);
  const t0 = Date.now();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(JSONL, '');
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', '--disable-http2'],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1280, height: 900 },
    proxy,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const traffic = new TrafficMeter();
  traffic.attach(page);
  let exitIp = '';
  let stopped = '';
  const runs: Array<Record<string, unknown>> = [];
  try {
    exitIp = await page
      .goto('https://api.ipify.org', { waitUntil: 'domcontentloaded', timeout: 30000 })
      .then(() => page.locator('body').innerText())
      .catch((e) => scrub(String(e)));
    console.log(`[oct-dec] exitIp=${exitIp.trim().slice(0, 64)}`);
    traffic.take();
    console.log('[oct-dec] warm-up home');
    const warm = await page
      .goto('https://www.latamairlines.com/br/pt', { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch((e) => {
        console.error('[oct-dec] warm-up failed', scrub(String(e)));
        return null;
      });
    const warmBytes = traffic.take();
    if (!warm) {
      stopped = 'warm-up failed';
      return;
    }
    console.log(`[oct-dec] warm-up status=${warm.status()} title=${await page.title()} bytesIn=${warmBytes.bytesIn}`);
    let n = 0;
    const total = dates.length * ROUTES.length;
    for (const [origin, destination] of ROUTES) {
      console.log(`[oct-dec] ${origin}->${destination} ${dates.length} dates`);
      for (const date of dates) {
        n++;
        const row = await search(page, origin, destination, date, traffic);
        const collectedAt = new Date().toISOString();
        if (row.parsed.length) {
          const lines = row.parsed
            .map((r: SnapshotRow) =>
              JSON.stringify({ ...r, collectedAt, modality: 'cash', source: 'latam_web' }),
            )
            .join('\n');
          await appendFile(JSONL, lines + '\n');
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop parsed rows from stats
        const { parsed: _parsed, ...stat } = row;
        runs.push(stat);
        console.log(
          `[oct-dec] ${n}/${total} ${origin}->${destination} ${date} ${row.ms}ms in=${row.bytesIn} out=${row.bytesOut} status=${row.status} ${row.flightCode ?? ''} ${row.amountBrl ?? row.note ?? (row.empty ? 'empty' : 'fail')}`,
        );
        const dead = row.blocked || /ERR_HTTP2_PROTOCOL_ERROR|INTERNAL_ERROR/i.test(row.note);
        if (dead) {
          stopped = `${origin}->${destination} ${date}`;
          console.log(`[oct-dec] stop ${stopped}`);
          return;
        }
        if (n < total) await new Promise((r) => setTimeout(r, GAP_MS));
      }
    }
  } finally {
    const ms = runs.map((r) => Number(r.ms)).sort((a, b) => a - b);
    const bucket = (rows: typeof runs) => {
      const searches = rows.length;
      const priced = rows.filter((r) => r.amountBrl != null).length;
      const empty = rows.filter((r) => r.empty).length;
      const failed = rows.filter((r) => r.failed).length;
      const blocked = rows.filter((r) => r.blocked).length;
      const bytesIn = rows.reduce((s, r) => s + Number(r.bytesIn ?? 0), 0);
      const bytesOut = rows.reduce((s, r) => s + Number(r.bytesOut ?? 0), 0);
      return {
        searches,
        priced,
        empty,
        failed,
        blocked,
        bytesIn,
        bytesOut,
        bytesTotal: bytesIn + bytesOut,
        successRate: rate(priced + empty, searches),
        pricedRate: rate(priced, searches),
        errorRate: rate(failed + blocked, searches),
        avgMs: searches ? Math.round(rows.reduce((s, r) => s + Number(r.ms), 0) / searches) : null,
      };
    };
    const byRoute: Record<string, ReturnType<typeof bucket>> = {};
    for (const [origin, destination] of ROUTES) {
      byRoute[`${origin}->${destination}`] = bucket(
        runs.filter((r) => r.origin === origin && r.destination === destination),
      );
    }
    const byMonth: Record<string, ReturnType<typeof bucket>> = {};
    for (const month of ['2026-10', '2026-11', '2026-12']) {
      byMonth[month] = bucket(runs.filter((r) => String(r.date).startsWith(month)));
    }
    const summary = bucket(runs);
    const stats = {
      gapMs: GAP_MS,
      exitIp: exitIp.trim(),
      stopped: stopped || null,
      totalMs: Date.now() - t0,
      avgMs: ms.length ? Math.round(ms.reduce((s, x) => s + x, 0) / ms.length) : null,
      p50Ms: pct(ms, 50),
      p95Ms: pct(ms, 95),
      ...summary,
      firstBlock: (runs.find((r) => r.blocked)?.date as string | undefined) ?? null,
      byRoute,
      byMonth,
      runs,
    };
    await writeFile(STATS, JSON.stringify(stats, null, 2));
    if (stopped) process.exitCode = 1;
    console.log(
      `[oct-dec] DONE ${stats.totalMs}ms priced=${summary.priced}/${summary.searches} empty=${summary.empty} failed=${summary.failed} blocked=${summary.blocked} success=${summary.successRate} error=${summary.errorRate} bytes=${summary.bytesTotal} avg=${stats.avgMs}ms p50=${stats.p50Ms}ms p95=${stats.p95Ms}ms`,
    );
    console.log(`[oct-dec] ${JSONL}`);
    console.log(`[oct-dec] ${STATS}`);
    await context.close();
  }
}

main().catch((err) => {
  console.error('[oct-dec] fatal', scrub(String(err)));
  process.exit(1);
});

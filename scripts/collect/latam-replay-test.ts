/**
 * One Chrome session, then replay LATAM cash search for every October operating day.
 *   pnpm exec tsx scripts/collect/latam-replay-test.ts
 *
 * Does not use port 9222. Writes a side file so the slow-crawl snapshots stay intact.
 */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseLatamCash } from './parsers.ts';

const ORIGIN = 'PET';
const DEST = 'GRU';
const PROFILE = path.join(os.homedir(), '.cache', 'chrome-pw-vdp-latam');
const BASELINE = 'scripts/collect/out/2026-10-01_to_2026-10-31/latam/snapshots.jsonl';
const OUT = 'scripts/collect/out/2026-10-01_to_2026-10-31/latam-replay.json';
const GAP_MS = 5000;

function dates(): string[] {
  const out: string[] = [];
  for (let day = 1; day <= 31; day++) {
    const iso = `2026-10-${String(day).padStart(2, '0')}`;
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
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

function usableHeaders(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (/^(host|connection|content-length|cookie|accept-encoding|sec-|upgrade-insecure)$/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

function withDate(template: string, date: string): string {
  const u = new URL(template);
  const stamp = `${date}T00:00:00.000Z`;
  if (u.searchParams.has('outFrom')) u.searchParams.set('outFrom', date);
  if (u.searchParams.has('outbound')) u.searchParams.set('outbound', `${date}T12:00:00.000Z`);
  if (u.searchParams.has('outFlightDate')) u.searchParams.set('outFlightDate', 'null');
  // Some builds send the departure as outFrom already; also cover a full timestamp variant.
  for (const key of ['departureDate', 'outFromDate']) {
    if (u.searchParams.has(key)) u.searchParams.set(key, stamp);
  }
  return u.toString();
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
  let template = '';
  let headers: Record<string, string> = {};
  let firstBody: unknown = null;

  page.on('request', (req) => {
    if (!/offers\/search/i.test(req.url()) || req.method() === 'OPTIONS' || template) return;
    template = req.url();
    headers = usableHeaders(req.headers());
  });
  page.on('response', async (resp) => {
    if (!/offers\/search/i.test(resp.url()) || resp.request().method() === 'OPTIONS' || firstBody) return;
    const text = await resp.text().catch(() => '');
    if (text.length < 100) return;
    try {
      firstBody = JSON.parse(text);
    } catch {
      /* ignore */
    }
  });

  console.log(`[replay] warm ${all[0]}`);
  await page.goto(oferta(all[0]!), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
    console.log('[replay] goto', String(e).slice(0, 120));
  });
  const deadline = Date.now() + 35000;
  while ((!template || !firstBody) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!template || !firstBody) {
    const title = await page.title().catch(() => '');
    throw new Error(`warm failed title=${title} template=${Boolean(template)} body=${Boolean(firstBody)}`);
  }
  const warmMs = Date.now() - t0;
  console.log(`[replay] session ready in ${warmMs}ms`);
  console.log(`[replay] url ${template.slice(0, 180)}`);

  const rows: Array<Record<string, unknown>> = [];
  const started = Date.now();
  for (const date of all) {
    const t = Date.now();
    let status = 0;
    let json: unknown = null;
    let note = '';
    const replay = async () => {
      const url = withDate(template, date);
      return page.evaluate(
        async ({ url, headers }) => {
          const r = await fetch(url, { headers, credentials: 'include' });
          const text = await r.text();
          return { status: r.status, text: text.slice(0, 500000) };
        },
        { url, headers },
      );
    };
    if (date === all[0] && firstBody) {
      json = firstBody;
      status = 200;
      note = 'warm';
      firstBody = null;
    } else {
      let res = await replay();
      status = res.status;
      const blocked = res.status === 403 || res.text.includes('Access Denied');
      if (blocked) {
        note = 'blocked, rewarm';
        template = '';
        headers = {};
        console.log(`[replay] ${date} 403, rewarming via the page`);
        await page.goto(oferta(date), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        const until = Date.now() + 25000;
        while (!template && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
        res = await replay();
        status = res.status;
      }
      try {
        json = JSON.parse(res.text);
      } catch {
        note = (note ? note + ' ' : '') + res.text.slice(0, 60).replace(/\s+/g, ' ');
      }
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    const parsed = json ? parseLatamCash(json, ORIGIN, DEST, date) : [];
    const best = parsed.slice().sort((a, b) => (a.amountBrl ?? 1e12) - (b.amountBrl ?? 1e12))[0];
    const ms = Date.now() - t;
    console.log(
      `[replay] ${date} ${status} ${parsed.length} rows ${ms}ms ${best ? `${best.flightCode} ${best.departureTime} R$${best.amountBrl}` : note || 'empty'}`,
    );
    rows.push({
      date,
      status,
      ms,
      offers: parsed.length,
      flightCode: best?.flightCode ?? null,
      departureTime: best?.departureTime ?? null,
      amountBrl: best?.amountBrl ?? null,
      taxesBrl: best?.taxesBrl ?? null,
      fareLabel: best?.fareLabel ?? null,
      note,
    });
  }
  const fetchMs = Date.now() - started;

  let baseline: Array<{ flightDate: string; amountBrl: number | null; flightCode?: string }> = [];
  try {
    const text = await readFile(BASELINE, 'utf8');
    baseline = text
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    /* no baseline */
  }
  const baseByDate = new Map(baseline.map((r) => [r.flightDate, r]));
  let same = 0;
  let diff = 0;
  let onlyReplay = 0;
  for (const r of rows) {
    const b = baseByDate.get(String(r.date));
    if (!b && r.amountBrl != null) onlyReplay++;
    else if (b && r.amountBrl != null && Math.abs((b.amountBrl ?? 0) - Number(r.amountBrl)) < 0.02) same++;
    else if (b && r.amountBrl != null) diff++;
  }

  const summary = {
    warmMs,
    fetchMs,
    totalMs: Date.now() - t0,
    dates: all.length,
    withPrice: rows.filter((r) => r.amountBrl != null).length,
    empty: rows.filter((r) => r.status === 200 && r.offers === 0).length,
    failed: rows.filter((r) => r.status !== 200).length,
    vsBaseline: { same, diff, onlyReplay, baselineRows: baseline.length },
    rows,
  };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(summary, null, 2));
  console.log(
    `[replay] DONE warm=${warmMs}ms fetches=${fetchMs}ms total=${summary.totalMs}ms priced=${summary.withPrice}/${all.length} failed=${summary.failed} same=${same} diff=${diff}`,
  );
  console.log(`[replay] wrote ${OUT}`);
  await context.close();
}

main().catch((err) => {
  console.error('[replay] fatal', err);
  process.exit(1);
});

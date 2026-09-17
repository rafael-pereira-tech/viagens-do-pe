/**
 * Batch price collector.
 *
 * Sweeps a date range for PET->SP one-way across LATAM (cash), Smiles (miles+cash),
 * and Azul (cash+points), driving a REAL Chrome via CDP (webdriver=false) so the
 * airline anti-bot defenses treat it like a human. Human-like behavior (think-time,
 * mouse movement, scrolling, occasional clicks) is inserted between searches.
 *
 * Outputs (resumable, streaming):
 *   scripts/collect/out/<range>/snapshots.jsonl   (source of truth, includes raw)
 *   scripts/collect/out/<range>/snapshots.sql     (INSERT ... ON CONFLICT DO NOTHING)
 *   scripts/collect/out/<range>/progress.json     (completed searches, for resume)
 *
 * Usage:
 *   # Default: launches installed Chrome via launchPersistentContext (webdriver=false).
 *   # Optional CDP (may fail on newer Chrome that rejects Browser.setDownloadBehavior):
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/chrome-debug-vdp" about:blank
 *   pnpm collect -- --cdp=http://127.0.0.1:9222 --month=2026-10 --origin=PET
 *
 *   pnpm collect -- --month=2026-10 --origin=PET
 *   pnpm collect -- --from=2026-10-01 --to=2026-10-02 --sources=latam,smiles
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseLatamCash,
  parseLatamMiles,
  parseSmiles,
  parseAzulCash,
  parseAzulPoints,
  rowsToSql,
  type SnapshotRow,
} from './parsers.ts';

/** Dashboard Fonte filter ids (must match FILTER_FONTES in the app).
 * Smiles search returns miles + MONEY cash together; cash is stored as `voegol`
 * so `price_snapshots_latest` (1 row per source/day) keeps both, matching the
 * Worker collector model (smiles_web miles + voegol cash).
 * LATAM cash → latam_web; LATAM miles (redemption) → latam_pass. */
function sourceIdFor(task: Task, row?: SnapshotRow): string {
  if (task.source === 'smiles') {
    // Pure cash MONEY fare → VoeGOL companion source.
    if (row && row.miles == null && row.amountBrl != null) return 'voegol';
    return 'smiles_web';
  }
  if (task.source === 'latam') return task.modality === 'points' ? 'latam_pass' : 'latam_web';
  // Azul cash vs points collectors use different source labels in the UI.
  return task.modality === 'points' ? 'tudoazul' : 'voeazul';
}

// PET -> São Paulo airport per airline (matches price_snapshots route notes).
const SP_DEST: Record<string, string> = { latam: 'GRU', smiles: 'CGH', azul: 'VCP' };

interface Task {
  source: 'latam' | 'smiles' | 'azul';
  modality: 'cash' | 'points' | 'mixed';
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
}

interface SourceCfg {
  home: string;
  match: RegExp; // primary search XHR
  needsReloadRetry: boolean; // Azul: cold token => reload
  deepLink(t: Task): string;
  parse(body: unknown, t: Task): SnapshotRow[];
  // Optional per-source think-time overrides (win over global --min/max-wait).
  minWaitMs?: number;
  maxWaitMs?: number;
  // Smiles MFE only re-fires its search XHR when it boots fresh from home; a
  // direct deep-link->deep-link navigation goes stale. Re-warm home each search.
  rewarmEachSearch?: boolean;
  // Default weekdays to search (getUTCDay: 0=Sun..6=Sat). Overridden by --dow / --dow-<source>.
  dow?: number[];
  /** Prefer this over `dow` when set — supports schedule windows (e.g. Azul only after Oct 26). */
  dateOk?: (isoDate: string) => boolean;
}

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------
function parseArgs() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const get = (k: string, d = '') => {
    const p = argv.find((a) => a.startsWith(`--${k}=`));
    return p ? p.slice(k.length + 3) : d;
  };
  const origin = get('origin', 'PET').toUpperCase();
  let from = get('from');
  let to = get('to');
  const month = get('month'); // YYYY-MM
  if (month && !from) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    from = `${month}-01`;
    to = `${month}-${String(last).padStart(2, '0')}`;
  }
  if (!from) throw new Error('provide --month=YYYY-MM or --from/--to');
  if (!to) to = from;
  const sources = (get('sources', 'latam,smiles,azul').split(',').filter(Boolean)) as Task['source'][];
  // Weekday filter: comma list of getUTCDay() numbers (0=Sun..6=Sat).
  // Global --dow overrides every source; else --dow-<source> or SourceCfg.dow defaults.
  const parseDow = (raw: string): number[] | null => {
    if (!raw) return null;
    const nums = raw.split(',').map(Number).filter((n) => n >= 0 && n <= 6);
    return nums.length ? nums : null;
  };
  const dowGlobal = parseDow(get('dow'));
  const dowBySource: Partial<Record<Task['source'], number[] | null>> = {
    latam: parseDow(get('dow-latam')),
    smiles: parseDow(get('dow-smiles')),
    azul: parseDow(get('dow-azul')),
  };
  // outbound | reverse | both  (--both-ways is an alias for both)
  const directionsRaw = get('directions', argv.includes('--both-ways') ? 'both' : 'outbound');
  const directions = (['outbound', 'reverse', 'both'].includes(directionsRaw)
    ? directionsRaw
    : 'outbound') as 'outbound' | 'reverse' | 'both';
  // --cdp=URL tries connectOverCDP first; omit (or --no-cdp) to launch Chrome directly.
  const cdpRaw = get('cdp', '');
  return {
    cdpUrl: argv.includes('--no-cdp') ? '' : cdpRaw,
    origin,
    from,
    to,
    sources,
    dowGlobal,
    dowBySource,
    directions,
    bothWays: directions === 'both',
    minWaitMs: Number(get('min-wait', '18000')),
    maxWaitMs: Number(get('max-wait', '42000')),
    // When set explicitly, CLI wait overrides per-source think-time (handy for validation).
    waitExplicit: argv.some((a) => a.startsWith('--min-wait=') || a.startsWith('--max-wait=')),
    captureMs: Number(get('capture-timeout', '30000')),
  };
}

/** Drop identical rows within a single search (DB also dedupes via ON CONFLICT). */
function dedupeRows(rows: SnapshotRow[]): SnapshotRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.departureTime}|${r.miles}|${r.amountBrl}|${r.taxesBrl}|${r.fareLabel}|${r.flightCode}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// --------------------------------------------------------------------------
// Source configs (deep links mirror the discovery tool's proven contracts)
// --------------------------------------------------------------------------
const SOURCES: Record<Task['source'], SourceCfg> = {
  latam: {
    home: 'https://www.latamairlines.com/br/pt',
    match: /air-offers\/(v\d+\/)?offers\/search/i,
    needsReloadRetry: false,
    // Through 2026-10-30: Mon/Wed/Fri. From Nov: Wed/Fri/Sat.
    dateOk(iso) {
      const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
      if (iso <= '2026-10-30') return dow === 1 || dow === 3 || dow === 5;
      return dow === 3 || dow === 5 || dow === 6;
    },
    deepLink(t) {
      const params = new URLSearchParams({
        origin: t.origin,
        destination: t.destination,
        outbound: `${t.date}T12:00:00.000Z`,
        adt: '1',
        chd: '0',
        inf: '0',
        trip: 'OW',
        cabin: 'Economy',
        redemption: t.modality === 'points' ? 'true' : 'false',
        sort: 'RECOMMENDED',
      });
      return `https://www.latamairlines.com/br/pt/oferta-voos?${params.toString()}`;
    },
    parse: (b, t) =>
      t.modality === 'points'
        ? parseLatamMiles(b, t.origin, t.destination, t.date)
        : parseLatamCash(b, t.origin, t.destination, t.date),
  },
  smiles: {
    home: 'https://www.smiles.com.br/home',
    match: /airlines\/search/i,
    needsReloadRetry: true, // reload re-boots the MFE if the first deep-link goes stale
    rewarmEachSearch: true, // MFE only fires search when booted from a fresh home load
    // Tue / Thu / Sat
    dow: [2, 4, 6],
    // One search per ~1 minute (with jitter) to stay well under the radar.
    minWaitMs: 55000,
    maxWaitMs: 72000,
    deepLink(t) {
      const departureMs = new Date(`${t.date}T03:00:00.000Z`).getTime();
      const params = new URLSearchParams({
        adults: '1',
        cabin: 'ECONOMIC',
        children: '0',
        departureDate: String(departureMs),
        infants: '0',
        isElegible: 'false',
        isFlexibleDateChecked: 'false',
        returnDate: '',
        searchType: 'g3',
        segments: '1',
        tripType: '2',
        originAirport: t.origin,
        originAirportIsAny: 'false',
        destinationAirport: t.destination,
        destinAirportIsAny: 'false',
        'novo-resultado-voos': 'true',
      });
      return `https://www.smiles.com.br/mfe/emissao-passagem/?${params.toString()}`;
    },
    parse: (b, t) => parseSmiles(b, t.origin, t.destination, t.date),
  },
  azul: {
    home: 'https://www.voeazul.com.br/br/pt/home',
    match: /availability/i,
    needsReloadRetry: true,
    rewarmEachSearch: true,
    // On/after 2026-10-26: Mon/Fri. From Nov some PET↔VCP legs move Fri→Thu,
    // so include Thu as well (empty searches are cheap vs missing a week).
    dateOk(iso) {
      if (iso < '2026-10-26') return false;
      const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
      if (iso < '2026-11-01') return dow === 1 || dow === 5;
      return dow === 1 || dow === 4 || dow === 5;
    },
    minWaitMs: 40000,
    maxWaitMs: 60000,
    deepLink(t) {
      const [y, m, d] = t.date.split('-');
      const std = `${m}/${d}/${y}`;
      const cc = t.modality === 'points' ? 'PTS' : 'BRL';
      const qs = [
        `c[0].ds=${t.origin}`,
        `c[0].std=${std}`,
        `c[0].as=${t.destination}`,
        `p[0].t=ADT`,
        `p[0].c=1`,
        `p[0].cp=false`,
        `f.dl=3`,
        `f.dr=3`,
        `cc=${cc}`,
      ].join('&');
      return `https://www.voeazul.com.br/br/pt/home/selecao-voo?${qs}`;
    },
    parse: (b, t) => (t.modality === 'points' ? parseAzulPoints : parseAzulCash)(b, t.origin, t.destination, t.date),
  },
};

// --------------------------------------------------------------------------
// Human-like behavior
// --------------------------------------------------------------------------
const rnd = (min: number, max: number) => Math.floor(min + Math.random() * (max - min));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fidget(page: Page): Promise<void> {
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  const moves = rnd(2, 5);
  for (let i = 0; i < moves; i++) {
    await page.mouse
      .move(rnd(20, vp.width - 20), rnd(80, vp.height - 40), { steps: rnd(4, 12) })
      .catch(() => {});
    await sleep(rnd(150, 600));
  }
  await page.mouse.wheel(0, rnd(200, 900)).catch(() => {});
  await sleep(rnd(300, 900));
  // Occasionally click a neutral background spot (safe: next search re-navigates).
  if (Math.random() < 0.35) {
    await page.mouse.click(rnd(30, vp.width - 30), rnd(300, vp.height - 150)).catch(() => {});
  }
  await page.mouse.wheel(0, -rnd(100, 500)).catch(() => {});
}

async function humanPause(page: Page, minMs: number, maxMs: number): Promise<void> {
  const total = rnd(minMs, maxMs);
  const deadline = Date.now() + total;
  while (Date.now() < deadline) {
    await fidget(page);
    await sleep(rnd(800, 2200));
  }
}

async function acceptCookies(page: Page): Promise<void> {
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button:has-text("Aceitar")',
    'button:has-text("Aceito")',
    'button:has-text("Concordo")',
    'button:has-text("OK")',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await sleep(300);
      return;
    }
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
interface OpenedBrowser {
  context: BrowserContext;
  page: Page;
  /** If true, we own the browser and must close the context on exit. */
  owned: boolean;
}

/**
 * Prefer CDP when asked, but Chrome 153+ rejects Playwright's
 * Browser.setDownloadBehavior on connectOverCDP. Fall back to launching the
 * installed Chrome channel with automation flags stripped (navigator.webdriver=false).
 */
async function openBrowser(cdpUrl: string, log: (m: string) => void): Promise<OpenedBrowser> {
  if (cdpUrl) {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const browser = await chromium.connectOverCDP(cdpUrl);
        const context = browser.contexts()[0] ?? (await browser.newContext());
        const page = await context.newPage();
        log(`browser: CDP ${cdpUrl}`);
        return { context, page, owned: false };
      } catch (err) {
        lastErr = err;
        log(`browser: CDP attempt ${attempt} failed: ${(err as Error).message.split('\n')[0]}`);
        await sleep(1000);
      }
    }
    log(`browser: CDP unavailable (${(lastErr as Error).message?.split('\n')[0] ?? 'error'}) — falling back to persistent Chrome`);
  }

  const userDataDir = path.join(os.homedir(), '.cache', 'chrome-pw-vdp');
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled'],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const wd = await page.evaluate(() => (navigator as { webdriver?: boolean }).webdriver);
  log(`browser: persistent Chrome (webdriver=${wd ?? false})`);
  return { context, page, owned: true };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const label = args.from === args.to ? args.from : `${args.from}_to_${args.to}`;
  const outDir = path.join('scripts', 'collect', 'out', label);
  await mkdir(outDir, { recursive: true });
  const jsonlPath = path.join(outDir, 'snapshots.jsonl');
  const sqlPath = path.join(outDir, 'snapshots.sql');
  const progressPath = path.join(outDir, 'progress.json');

  const log = (m: string) => console.log(`[collect] ${m}`);

  // Resume state
  const done = new Set<string>();
  if (existsSync(progressPath)) {
    try {
      const arr = JSON.parse(await readFile(progressPath, 'utf8')) as string[];
      arr.forEach((k) => done.add(k));
      log(`resume: ${done.size} searches already done`);
    } catch {
      /* ignore */
    }
  }
  if (!existsSync(sqlPath)) {
    await writeFile(
      sqlPath,
      `-- price_snapshots load — generated by scripts/collect/run.ts\n-- range ${label}\n-- Sources: smiles_web / latam_web / voeazul / tudoazul\n-- Safe to re-run: every statement is ON CONFLICT DO NOTHING.\n\n`,
    );
  }

  // Build task list grouped by source (keeps each source session warm).
  const allDates = datesInRange(args.from, args.to);
  const tasks: Task[] = [];
  const utcDow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  for (const source of args.sources) {
    const cfg = SOURCES[source];
    const cliDow = args.dowGlobal ?? args.dowBySource[source] ?? null;
    const dates = allDates.filter((d) => {
      if (cliDow) return cliDow.includes(utcDow(d));
      if (cfg.dateOk) return cfg.dateOk(d);
      if (cfg.dow) return cfg.dow.includes(utcDow(d));
      return true;
    });
    log(`${source}: ${dates.length} dates (directions=${args.directions})`);
    const sp = SP_DEST[source];
    const routes: Array<[string, string]> =
      args.directions === 'both'
        ? [
            [args.origin, sp],
            [sp, args.origin],
          ]
        : args.directions === 'reverse'
          ? [[sp, args.origin]]
          : [[args.origin, sp]];
    for (const [origin, destination] of routes) {
      for (const date of dates) {
        if (source === 'azul' || source === 'latam') {
          // Cash + miles/points as separate searches (LATAM needs login for points).
          tasks.push({ source, modality: 'cash', origin, destination, date });
          tasks.push({ source, modality: 'points', origin, destination, date });
        } else {
          tasks.push({
            source,
            modality: 'mixed',
            origin,
            destination,
            date,
          });
        }
      }
    }
  }
  log(`queue: ${tasks.length} searches`);

  const { context, page, owned } = await openBrowser(args.cdpUrl, log);

  // Single response listener; `active` is swapped per search.
  const active: { match: RegExp | null; body: unknown } = { match: null, body: null };
  page.on('response', async (resp) => {
    if (!active.match || !active.match.test(resp.url())) return;
    const method = resp.request().method();
    if (method === 'DELETE' || method === 'OPTIONS') return;
    if (resp.status() < 200 || resp.status() >= 300) return;
    const text = await resp.text().catch(() => '');
    if (!text || text.length < 100) return;
    try {
      active.body = JSON.parse(text);
    } catch {
      /* not json */
    }
  });

  const waitForBody = async (ms: number): Promise<boolean> => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (active.body) return true;
      await sleep(500);
    }
    return false;
  };

  let warmed: string | null = null;
  let totals = { searches: 0, rows: 0, empty: 0, failed: 0 };

  for (const task of tasks) {
    // Route is part of the key so both directions are tracked independently.
    const key = `${task.source}:${task.modality}:${task.origin}-${task.destination}:${task.date}`;
    if (done.has(key)) continue;
    const cfg = SOURCES[task.source];

    // Warm the source home once (Azul token) — or before every search when the
    // SPA needs a fresh boot to re-fire its search XHR (Smiles MFE).
    if (warmed !== task.source || cfg.rewarmEachSearch) {
      log(`warm-up ${task.source} home`);
      await page.goto(cfg.home, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await acceptCookies(page);
      await sleep(rnd(2500, 5000));
      warmed = task.source;
    }

    const deep = cfg.deepLink(task);
    active.match = cfg.match;
    active.body = null;
    log(`search ${key} -> ${task.origin}->${task.destination}`);

    const attempts = cfg.needsReloadRetry ? 3 : 1;
    let ok = false;
    for (let attempt = 1; attempt <= attempts && !ok; attempt++) {
      if (attempt === 1) {
        await page.goto(deep, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      } else {
        await sleep(2000);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      }
      await acceptCookies(page);
      ok = await waitForBody(args.captureMs);
    }

    totals.searches++;
    if (!ok || !active.body) {
      // Do NOT mark done: a future resume run should re-attempt captures that failed.
      totals.failed++;
      log(`  no data captured for ${key} (will retry on resume)`);
    } else {
      const rows = dedupeRows(cfg.parse(active.body, task));
      const collectedAt = new Date().toISOString();
      if (rows.length === 0) {
        totals.empty++;
        log(`  empty (search ok, 0 offers) — empty_confirmed`);
      } else {
        // Stream outputs — Smiles cash rows use source `voegol` (see sourceIdFor).
        const jsonl = rows
          .map((r) =>
            JSON.stringify({ ...r, collectedAt, modality: task.modality, source: sourceIdFor(task, r) }),
          )
          .join('\n');
        await appendFile(jsonlPath, jsonl + '\n');
        // Group by dashboard source so SQL INSERTs carry the right source id.
        const bySource = new Map<string, SnapshotRow[]>();
        for (const r of rows) {
          const sid = sourceIdFor(task, r);
          const list = bySource.get(sid) ?? [];
          list.push(r);
          bySource.set(sid, list);
        }
        for (const [sid, group] of bySource) {
          await appendFile(sqlPath, rowsToSql(group, sid, collectedAt));
        }
        totals.rows += rows.length;
        const sample = rows[0];
        log(
          `  ${rows.length} rows (e.g. ${sample.airline}/${sample.program} ${sample.flightCode ?? ''} ` +
            `${sample.miles ? sample.miles + 'mi' : 'R$' + sample.amountBrl}${sample.taxesBrl != null ? ' +R$' + sample.taxesBrl : ''})`,
        );
      }
      // Only a captured result (offers or confirmed empty) counts as done.
      done.add(key);
      await writeFile(progressPath, JSON.stringify([...done], null, 0));
    }

    // Behave like a human before the next search. Per-source think-time wins,
    // unless the CLI passed --min/max-wait explicitly.
    const minW = args.waitExplicit ? args.minWaitMs : cfg.minWaitMs ?? args.minWaitMs;
    const maxW = args.waitExplicit ? args.maxWaitMs : cfg.maxWaitMs ?? args.maxWaitMs;
    await humanPause(page, minW, maxW);
  }

  if (owned) {
    await context.close().catch(() => {});
  } else {
    await page.close().catch(() => {});
  }
  log('');
  log(`DONE — searches=${totals.searches} rows=${totals.rows} empty=${totals.empty} failed=${totals.failed}`);
  log(`artifacts: ${outDir}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[collect] fatal', err);
  process.exit(1);
});

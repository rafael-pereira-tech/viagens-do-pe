/**
 * Public-flow discovery runner (LATAM cash / Smiles award).
 *
 * Goal (docs/plans/crawler-rebuild.md — C02/C04): drive the REAL public search
 * ORGANICALLY (home -> form -> search) with a real browser so Akamai's sensor JS
 * runs and seeds cookies before the search fires. Capture the actual request/
 * session sequence + visual evidence. This is a DISCOVERY probe, not a collector;
 * it never persists to production.
 *
 * Usage:
 *   pnpm discover:latam                          # PET->GRU, default date, headed
 *   pnpm discover:smiles                         # PET->CGH
 *   pnpm discover -- --source=latam --origin=GRU --destination=GIG --date=2026-10-20
 *   pnpm discover -- --source=smiles --headless --deadline=120000
 *
 * Output under scripts/discover/out/<runId>/ (gitignored):
 *   manifest.json  sanitized summary   network.har  full HAR (SENSITIVE)
 *   *.json         captured XHR bodies screenshot.png / page.html  final state
 */
import { chromium, devices, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type SourceId = 'latam' | 'smiles' | 'azul';

interface Args {
  source: SourceId;
  origin: string;
  destination: string;
  originCity: string;
  destCity: string;
  date: string; // YYYY-MM-DD
  headless: boolean;
  deadlineMs: number;
  cdpUrl: string; // if set, connect to a user-launched real Chrome via CDP
  channel: string; // if set (e.g. "chrome"), launch installed Chrome instead of bundled Chromium
  skipForm: boolean; // skip form interaction; go straight to the (warmed) deep link, same tab
  redemption: boolean; // LATAM: true = miles (redemption), false = cash
}

interface CaptureSpec {
  kind: string;
  match: RegExp;
}

interface SourcePlugin {
  id: SourceId;
  homeUrl: string;
  captures: CaptureSpec[];
  /** Which capture kind represents the actual price search (drives outcome). */
  primaryKind: string;
  /** Best-effort organic form interaction. Returns true if it believes it triggered a search. */
  runForm(page: Page, args: Args, log: (m: string) => void): Promise<boolean>;
  /** Warmed-context fallback: navigate straight to the search deep link. */
  deepLinkUrl(args: Args): string;
}

/** IATA -> a city string that autocomplete widgets tend to match. */
const CITY_HINTS: Record<string, string> = {
  PET: 'Pelotas',
  GRU: 'Guarulhos',
  CGH: 'Congonhas',
  GIG: 'Rio de Janeiro',
  POA: 'Porto Alegre',
  VCP: 'Campinas',
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string, fallback: string): string => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const source = get('source', 'latam') as SourceId;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  const defaultDate = d.toISOString().slice(0, 10);

  const origin = get('origin', 'PET').toUpperCase();
  const defaultDest = source === 'smiles' ? 'CGH' : source === 'azul' ? 'VCP' : 'GRU';
  const destination = get('destination', defaultDest).toUpperCase();
  return {
    source,
    origin,
    destination,
    originCity: get('origin-city', CITY_HINTS[origin] ?? origin),
    destCity: get('dest-city', CITY_HINTS[destination] ?? destination),
    date: get('date', defaultDate),
    headless: has('--headless'),
    deadlineMs: Number(get('deadline', '90000')),
    cdpUrl: get('cdp', ''),
    channel: get('channel', ''),
    skipForm: has('--skip-form'),
    redemption: get('redemption', 'false') === 'true',
  };
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted = new Set(['cookie', 'set-cookie', 'authorization']);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    // Redact anything that smells like a token/captcha, plus known auth headers.
    const lower = k.toLowerCase();
    if (redacted.has(lower) || /captcha|token|authorization/.test(lower)) {
      out[k] = `[redacted:${v.length}chars]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function looksBlocked(status: number, body: string): boolean {
  const head = body.trimStart().slice(0, 500).toLowerCase();
  return (
    status === 403 ||
    status === 406 ||
    head.includes('access denied') ||
    head.includes('<!doctype html') ||
    head.includes('<html')
  );
}

async function acceptCookies(page: Page, log: (m: string) => void): Promise<void> {
  // Known consent button ids first (OneTrust etc.), then generic labels.
  for (const sel of ['#onetrust-accept-btn-handler', '#onetrust-reject-all-handler']) {
    const btn = page.locator(sel);
    if (await btn.count().catch(() => 0)) {
      await btn
        .first()
        .click({ timeout: 2500 })
        .then(() => log(`cookie consent clicked (${sel})`))
        .catch(() => {});
      return;
    }
  }
  for (const label of [/aceitar todos/i, /aceitar/i, /accept all/i, /accept/i, /concordo/i, /ok/i]) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.count().catch(() => 0)) {
      await btn
        .first()
        .click({ timeout: 2500 })
        .then(() => log(`cookie consent clicked (${label})`))
        .catch(() => {});
      return;
    }
  }
}

/** Type into an autocomplete combobox and pick the option matching code or city. */
async function fillCombobox(
  page: Page,
  fieldMatchers: Array<() => ReturnType<Page['locator']>>,
  query: string,
  code: string,
  city: string,
  log: (m: string) => void,
  what: string,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  for (const make of fieldMatchers) {
    const field = make().first();
    if (!(await field.count().catch(() => 0))) continue;
    try {
      await field.click({ timeout: 4000, force: opts.force });
      await field.fill('').catch(() => {});
      await field.pressSequentially(query, { delay: 120 });
      await page.waitForTimeout(1200);
      await dumpDebug(page, `combobox-${what}`);
      // Prefer the exact airport option by its IATA attribute (commits the value),
      // then fall back to text-based matching.
      const candidates = [
        () => page.locator(`[role="option"]`).filter({ has: page.locator(`[iata="${code}"]`) }),
        () => page.locator(`[iata="${code}"]`),
        () => page.locator(`[title*="${code} -"]`),
        () => page.locator('.dropdown-menu li button, .dropdown-menu button').filter({ hasText: code }),
        () => page.getByRole('option').filter({ hasText: new RegExp(`${code}|${city}`, 'i') }),
      ];
      let clicked = false;
      for (const make of candidates) {
        const option = make().first();
        if (await option.count().catch(() => 0)) {
          await option.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
          try {
            await option.click({ timeout: 3000 });
            clicked = true;
            break;
          } catch {
            /* next */
          }
        }
      }
      if (!clicked) throw new Error('no matching option clickable');
      log(`${what}: picked "${query}" -> option matching ${code}/${city}`);
      return true;
    } catch (err) {
      log(`${what}: attempt failed (${(err as Error).message.split('\n')[0]})`);
    }
  }
  log(`${what}: could not fill combobox`);
  return false;
}

/** Set in main(); lets plugin flows dump live DOM snapshots for selector discovery. */
let CURRENT_OUT_DIR = '';
async function dumpDebug(page: Page, name: string): Promise<void> {
  if (!CURRENT_OUT_DIR) return;
  await writeFile(path.join(CURRENT_OUT_DIR, `${name}.html`), await page.content().catch(() => '')).catch(
    () => {},
  );
  await page.screenshot({ path: path.join(CURRENT_OUT_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}

const PT_MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Open a calendar via the given trigger and click the target day. */
async function pickCalendarDate(
  page: Page,
  triggers: Array<() => ReturnType<Page['locator']>>,
  dateStr: string,
  log: (m: string) => void,
): Promise<boolean> {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayNum = String(d);
  const monthName = PT_MONTHS[m - 1];
  await clickFirst(triggers, log, 'open date picker');
  await page.waitForTimeout(1000);
  const strategies: Array<() => ReturnType<Page['locator']>> = [
    () => page.locator(`[aria-label*="${dayNum} de ${monthName} de ${y}"]`),
    () => page.locator(`[aria-label*="${dayNum} de ${monthName}"]`),
    () => page.getByRole('gridcell', { name: new RegExp(`(^|\\s)${dayNum}(\\s|$)`) }),
    () => page.getByRole('button', { name: new RegExp(`^${dayNum}$`) }),
  ];
  for (const make of strategies) {
    const loc = make().filter({ hasNot: page.locator('[disabled],[aria-disabled="true"]') }).first();
    if (await loc.count().catch(() => 0)) {
      try {
        await loc.click({ timeout: 3000 });
        log(`date: picked ${dayNum} de ${monthName} de ${y}`);
        return true;
      } catch {
        /* next strategy */
      }
    }
  }
  log(`date: could not pick ${dateStr}`);
  return false;
}

async function clickFirst(
  candidates: Array<() => ReturnType<Page['locator']>>,
  log: (m: string) => void,
  what: string,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  for (const make of candidates) {
    const loc = make().first();
    if (await loc.count().catch(() => 0)) {
      try {
        await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await loc.click({ timeout: 4000, force: opts.force });
        log(`${what}: clicked`);
        return true;
      } catch {
        /* try next */
      }
    }
  }
  log(`${what}: not found`);
  return false;
}

// ---------------------------------------------------------------------------
// LATAM (cash)
// ---------------------------------------------------------------------------
const latam: SourcePlugin = {
  id: 'latam',
  homeUrl: 'https://www.latamairlines.com/br/pt',
  primaryKind: 'offers-search',
  captures: [
    { kind: 'offers-search', match: /air-offers\/(v\d+\/)?offers\/search/i },
    { kind: 'session', match: /user-session\/.*\/session/i },
  ],
  deepLinkUrl(args) {
    const params = new URLSearchParams({
      origin: args.origin,
      destination: args.destination,
      outbound: `${args.date}T12:00:00.000Z`,
      adt: '1',
      chd: '0',
      inf: '0',
      trip: 'OW',
      cabin: 'Economy',
      redemption: args.redemption ? 'true' : 'false',
      sort: 'RECOMMENDED',
    });
    return `https://www.latamairlines.com/br/pt/oferta-voos?${params.toString()}`;
  },
  async runForm(page, args, log) {
    // Trip type -> one-way chip (real widget id from home DOM; force past overlays).
    await clickFirst(
      [() => page.locator('[data-testid="fsb-one-way"]'), () => page.locator('#fsb-one-way')],
      log,
      'one-way toggle',
      { force: true },
    );
    await page.waitForTimeout(500);
    await fillCombobox(
      page,
      [() => page.locator('#fsb-origin--text-field'), () => page.getByLabel(/origem/i)],
      args.originCity,
      args.origin,
      args.originCity,
      log,
      'origin',
    );
    await fillCombobox(
      page,
      [() => page.locator('#fsb-destination--text-field'), () => page.getByLabel(/destino/i)],
      args.destCity,
      args.destination,
      args.destCity,
      log,
      'destination',
    );
    await pickCalendarDate(
      page,
      [() => page.locator('#fsb-departure--text-field'), () => page.locator('#fsb-departure')],
      args.date,
      log,
    );
    await dumpDebug(page, 'calendar-open');
    // Close the open calendar so it stops covering the search button.
    await clickFirst(
      [() => page.getByRole('button', { name: /confirmar|aplicar|pronto|ok/i })],
      log,
      'confirm date',
    );
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
    return clickFirst(
      [
        () => page.locator('[data-testid="fsb-search-flights--button"]'),
        () => page.getByRole('button', { name: /buscar/i }),
      ],
      log,
      'search button',
      { force: true },
    );
  },
};

// ---------------------------------------------------------------------------
// Smiles (award / miles)
// ---------------------------------------------------------------------------
const smiles: SourcePlugin = {
  id: 'smiles',
  homeUrl: 'https://www.smiles.com.br/home',
  primaryKind: 'airlines-search',
  captures: [
    { kind: 'airlines-search', match: /airlines\/search/i },
    { kind: 'login', match: /oauth\/token/i },
  ],
  deepLinkUrl(args) {
    // Real results contract observed from the site: epoch-ms departureDate, tripType=2
    // for one-way, cabin=ECONOMIC, novo-resultado-voos=true.
    const departureMs = new Date(`${args.date}T03:00:00.000Z`).getTime(); // ~local midnight BRT
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
      originAirport: args.origin,
      originAirportIsAny: 'false',
      destinationAirport: args.destination,
      destinAirportIsAny: 'false',
      'novo-resultado-voos': 'true',
    });
    return `https://www.smiles.com.br/mfe/emissao-passagem/?${params.toString()}`;
  },
  async runForm(page, args, log) {
    // The flight search is a lazily-loaded micro-frontend; wait for it and ensure its tab is active.
    await clickFirst([() => page.locator('#smiles-react-flight-search-tab')], log, 'flight tab');
    await page
      .locator('#inp_flightOrigin_1')
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => log('flight widget ready'))
      .catch(() => log('flight widget not detected within 15s'));
    // Trip type is a dropdown: open it, then choose one-way (before filling, since it can reset dates).
    await clickFirst(
      [
        () => page.getByRole('button', { name: /ida e volta/i }),
        () => page.locator('button:has(.smls-icon-round-trip)'),
      ],
      log,
      'open trip-type',
    );
    await clickFirst(
      [() => page.locator('#opt_oneWay'), () => page.locator('[data-testid="opt_oneWay"]')],
      log,
      'one-way option',
    );
    await fillCombobox(
      page,
      [() => page.locator('#inp_flightOrigin_1'), () => page.getByLabel(/origem/i)],
      args.originCity,
      args.origin,
      args.originCity,
      log,
      'origin',
    );
    await fillCombobox(
      page,
      [() => page.locator('#inp_flightDestination_1'), () => page.getByLabel(/destino/i)],
      args.destCity,
      args.destination,
      args.destCity,
      log,
      'destination',
    );
    await pickCalendarDate(
      page,
      [() => page.getByText(/selecione.*data/i), () => page.getByLabel(/ida|data/i)],
      args.date,
      log,
    );
    return clickFirst(
      [
        () => page.locator('#smiles-react-flight-search-search-btn'),
        () => page.getByRole('button', { name: /buscar|pesquisar/i }),
      ],
      log,
      'search button',
      { force: true },
    );
  },
};

// ---------------------------------------------------------------------------
// Azul (TudoAzul points / cash) — discovery skeleton, selectors refined via home dump
// ---------------------------------------------------------------------------
const azul: SourcePlugin = {
  id: 'azul',
  homeUrl: 'https://www.voeazul.com.br/br/pt/home',
  primaryKind: 'availability',
  captures: [
    { kind: 'availability', match: /availability/i },
    { kind: 'token', match: /(oauth|token|dtm\/token|session)/i },
  ],
  deepLinkUrl(args) {
    // Real results deep link (from availability response `deepLinks[].url`).
    // cc=BRL => cash, cc=PTS => TudoAzul points (both work guest, no login).
    const [y, m, d] = args.date.split('-');
    const std = `${m}/${d}/${y}`; // MM/DD/YYYY, literal slashes like the site uses
    const cc = args.redemption ? 'PTS' : 'BRL';
    const qs = [
      `c[0].ds=${args.origin}`,
      `c[0].std=${std}`,
      `c[0].as=${args.destination}`,
      `p[0].t=ADT`,
      `p[0].c=1`,
      `p[0].cp=false`,
      `f.dl=3`,
      `f.dr=3`,
      `cc=${cc}`,
    ].join('&');
    return `https://www.voeazul.com.br/br/pt/home/selecao-voo?${qs}`;
  },
  async runForm(page, args, log) {
    // Desktop-specific inputs (there are hidden mobile duplicates with the same aria-label).
    const originInput = () => page.locator('input[aria-label="Origem"]');
    const destInput = () => page.locator('input[aria-label="Destino"]');
    await page.waitForTimeout(2500); // let the search widget hydrate
    await fillCombobox(page, [originInput], args.originCity, args.origin, args.originCity, log, 'origin', { force: true });
    await fillCombobox(page, [destInput], args.destCity, args.destination, args.destCity, log, 'destination', { force: true });
    await pickCalendarDate(
      page,
      [() => page.locator('[aria-label^="Datas"]'), () => page.getByLabel(/datas/i)],
      args.date,
      log,
    );
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
    return clickFirst(
      [
        () => page.getByRole('button', { name: /buscar passagens/i }),
        () => page.getByText(/buscar passagens/i),
      ],
      log,
      'search button',
      { force: true },
    );
  },
};

const PLUGINS: Record<SourceId, SourcePlugin> = { latam, smiles, azul };

interface CapturedCall {
  kind: string;
  url: string;
  method: string;
  status: number;
  requestHeaders: Record<string, string>;
  blocked: boolean;
  bodyFile?: string;
  bodyBytes?: number;
  error?: string;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const plugin = PLUGINS[args.source];
  if (!plugin) throw new Error(`unknown source: ${args.source}`);

  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${args.source}_${args.origin}-${args.destination}`;
  const outDir = path.join('scripts', 'discover', 'out', runId);
  await mkdir(outDir, { recursive: true });
  CURRENT_OUT_DIR = outDir;
  const log = (m: string): void => console.log(`[discover] ${m}`);

  log(`run ${runId}`);
  log(`source=${args.source} route=${args.origin}->${args.destination} date=${args.date} headless=${args.headless}`);

  let browser: Browser;
  let context: BrowserContext;
  const connectedOverCdp = Boolean(args.cdpUrl);
  if (connectedOverCdp) {
    // Attach to a real Chrome the user launched (navigator.webdriver=false, real fingerprint).
    log(`connecting over CDP to ${args.cdpUrl}`);
    browser = await chromium.connectOverCDP(args.cdpUrl);
    context = browser.contexts()[0] ?? (await browser.newContext());
  } else {
    browser = await chromium.launch({ headless: args.headless, channel: args.channel || undefined });
    context = await browser.newContext({
      ...devices['Desktop Chrome'],
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      recordHar: { path: path.join(outDir, 'network.har'), mode: 'full' },
    });
  }
  const page = await context.newPage();

  // Track the active page: LATAM's "Buscar" may open results in a new tab.
  let activePage: Page = page;
  context.on('page', (p) => {
    activePage = p;
    log('new tab/page opened — following it');
  });

  const calls: CapturedCall[] = [];
  let bodySeq = 0;
  const onResponse = async (response: Awaited<ReturnType<Page['waitForResponse']>>): Promise<void> => {
    const url = response.url();
    const spec = plugin.captures.find((c) => c.match.test(url));
    if (!spec) return;
    const req = response.request();
    const call: CapturedCall = {
      kind: spec.kind,
      url,
      method: req.method(),
      status: response.status(),
      requestHeaders: sanitizeHeaders(await req.allHeaders()),
      blocked: false,
    };
    try {
      const body = await response.text();
      call.blocked = looksBlocked(response.status(), body);
      const fileName = `${spec.kind}-${++bodySeq}.txt`;
      await writeFile(path.join(outDir, fileName), body);
      call.bodyFile = fileName;
      call.bodyBytes = body.length;
    } catch (err) {
      call.error = (err as Error).message;
    }
    calls.push(call);
    log(`captured ${spec.kind} ${call.method} ${call.status}${call.blocked ? ' (BLOCKED)' : ''}`);
  };
  const onRequestFailed = (req: {
    url(): string;
    method(): string;
    failure(): { errorText: string } | null;
  }): void => {
    const spec = plugin.captures.find((c) => c.match.test(req.url()));
    if (!spec) return;
    calls.push({
      kind: spec.kind,
      url: req.url(),
      method: req.method(),
      status: -1,
      requestHeaders: {},
      blocked: false,
      error: req.failure()?.errorText ?? 'requestfailed',
    });
    log(`request FAILED ${spec.kind} ${req.method()} — ${req.failure()?.errorText ?? 'unknown'}`);
  };
  // Listen at context level, and also per-page (covers popups/new tabs, incl. over CDP).
  context.on('response', onResponse);
  context.on('requestfailed', onRequestFailed);
  const attachPage = (p: Page): void => {
    p.on('response', onResponse);
    p.on('requestfailed', onRequestFailed);
  };
  context.on('page', (p) => attachPage(p));

  const startedAt = new Date().toISOString();
  let path_used: 'form' | 'warmed-deeplink' | 'none' = 'none';
  let navError: string | undefined;

  try {
    // 1) Organic warm-up: load home so Akamai sensor JS runs and seeds cookies.
    log(`warm-up: ${plugin.homeUrl}`);
    await page.goto(plugin.homeUrl, { waitUntil: 'domcontentloaded', timeout: args.deadlineMs });
    await acceptCookies(page, log);
    await page.mouse.move(200, 200).catch(() => {});
    await page.waitForTimeout(2500);
    // Snapshot the home form so we can inspect real selectors offline.
    await writeFile(path.join(outDir, 'home.html'), await page.content().catch(() => '')).catch(() => {});
    await page.screenshot({ path: path.join(outDir, 'home.png'), fullPage: true }).catch(() => {});

    // 2) Try the real form (unless skipping straight to the deep link).
    let triggered = false;
    if (!args.skipForm) {
      log('form: attempting home -> form -> search');
      triggered = await plugin.runForm(page, args, log).catch((e) => {
        log(`form error: ${(e as Error).message.split('\n')[0]}`);
        return false;
      });
      if (triggered) path_used = 'form';
      await activePage.screenshot({ path: path.join(outDir, 'post-form.png'), fullPage: true }).catch(() => {});
    } else {
      log('form: skipped (--skip-form) — going straight to deep link');
    }

    // A "good" primary is a real data response: 2xx, not a preflight/DELETE, non-trivial body.
    const hasGoodPrimary = (): boolean =>
      calls.some(
        (c) =>
          c.kind === plugin.primaryKind &&
          c.status >= 200 &&
          c.status < 300 &&
          c.method !== 'DELETE' &&
          c.method !== 'OPTIONS' &&
          !c.error &&
          (c.bodyBytes ?? 0) > 100,
      );
    // Wait for the primary search XHR (either from form or about to fall back).
    const waitForPrimary = async (ms: number): Promise<boolean> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (hasGoodPrimary()) return true;
        await new Promise((r) => setTimeout(r, 750));
      }
      return false;
    };

    if (triggered) {
      await new Promise((r) => setTimeout(r, 1500));
      log(`form submitted; now on ${activePage.url()}`);
    }
    // The Smiles award search can take a long time; wait generously once submitted.
    let gotPrimary = await waitForPrimary(triggered ? 75000 : 4000);

    // 3) Fallback: warmed-context deep link — only if the form never submitted a search.
    if (!gotPrimary && !triggered) {
      const deep = plugin.deepLinkUrl(args);
      // Some SPAs (Azul) need an auth/session token that isn't ready on a cold nav — the
      // first attempt warms it and a reload then succeeds. Retry a couple of times.
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts && !gotPrimary; attempt++) {
        if (attempt === 1) {
          log(`fallback: warmed deep link ${deep}`);
          await page.goto(deep, { waitUntil: 'domcontentloaded', timeout: args.deadlineMs });
        } else {
          log(`deep link retry ${attempt}/${maxAttempts} (reload — token should be warm now)`);
          await page.waitForTimeout(2000);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: args.deadlineMs }).catch(() => {});
        }
        await acceptCookies(page, log);
        gotPrimary = await waitForPrimary(attempt === 1 ? 15000 : 12000);
      }
      if (gotPrimary || path_used === 'none') path_used = 'warmed-deeplink';
    }
    await page.waitForTimeout(2500).catch(() => {});
  } catch (err) {
    navError = (err as Error).message;
    log(`navigation error: ${navError}`);
  }

  await activePage.screenshot({ path: path.join(outDir, 'screenshot.png'), fullPage: true }).catch(() => {});
  await writeFile(path.join(outDir, 'page.html'), await activePage.content().catch(() => '')).catch(() => {});

  const primary = calls.find((c) => c.kind === plugin.primaryKind);
  const outcome = navError
    ? 'nav_error'
    : !primary
      ? 'no_search_captured'
      : primary.blocked
        ? 'blocked'
        : primary.status === 200
          ? 'search_ok'
          : `search_status_${primary.status}`;

  const manifest = {
    runId,
    tool: 'discover/run.ts',
    source: args.source,
    startedAt,
    finishedAt: new Date().toISOString(),
    route: { origin: args.origin, destination: args.destination, date: args.date },
    pathUsed: path_used,
    headless: args.headless,
    outcome,
    navError,
    calls,
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  if (connectedOverCdp) {
    // Don't kill the user's Chrome; just close our tab and drop the CDP connection.
    await page.close().catch(() => {});
  } else {
    await context.close();
    await browser.close();
  }

  log('');
  log(`OUTCOME: ${outcome} (via ${path_used})`);
  log(`artifacts: ${outDir}`);
  if (primary) {
    log(`primary(${plugin.primaryKind}) -> ${primary.status}${primary.blocked ? ' BLOCKED' : ''}, body: ${primary.bodyFile ?? 'n/a'}`);
  } else {
    log(`no ${plugin.primaryKind} XHR observed — inspect page.html / screenshot.png`);
  }
  // Over CDP we intentionally leave the user's Chrome open; force-exit so the open
  // connection doesn't keep the process alive.
  process.exit(0);
}

main().catch((err) => {
  console.error('[discover] fatal', err);
  process.exit(1);
});

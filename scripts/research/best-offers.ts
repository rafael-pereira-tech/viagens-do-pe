/**
 * Melhores oportunidades por trecho a partir de PET até uma data.
 *
 * Lê o read API (`/api/v1/snapshots/latest`: última observação por rota/dia/fonte)
 * e imprime, por destino: cobertura da coleta, menor tarifa em reais, menor
 * preço em milhas, melhor milheiro (mesma regra do app: tarifa cash ÷ milhas da
 * mesma rota/dia/companhia), os N dias mais baratos e o mínimo por mês.
 * Com `--json`, grava o mesmo resultado para alimentar o post "Partidas".
 *
 * Uso (de uma máquina com acesso ao site; o Pages Function injeta o token):
 *   pnpm exec tsx scripts/research/best-offers.ts                       # PET → GRU,CGH,VCP,POA até 2027-03-31
 *   pnpm exec tsx scripts/research/best-offers.ts --to=2026-12-31 --top=3
 *   pnpm exec tsx scripts/research/best-offers.ts --dests=GRU,POA --from=2026-11-01
 *   pnpm exec tsx scripts/research/best-offers.ts --base=https://<worker> --token=$API_READ_SECRET
 *   pnpm exec tsx scripts/research/best-offers.ts --json=scripts/research/out/best-offers.json
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

interface Snapshot {
  id: string
  origin: string
  destination: string
  airline: string
  program: string
  flight_date: string
  departure_time: string | null
  stops: number | null
  miles: number | null
  amount_brl: number | null
  taxes_brl: number | null
  currency: string
  source: string
  collected_at: string
}

interface Envelope {
  data: Snapshot[]
  meta: { limit: number; offset: number; total: number | null }
}

interface Offer {
  flight_date: string
  airline: string
  source: string
  departure_time: string | null
  collected_at: string
  amount_brl?: number
  miles?: number
  taxes_brl?: number | null
  /** R$ por 1.000 milhas; maior = milhas valem mais */
  milheiro?: number
  /** tarifa cash usada no milheiro */
  cash_ref?: number
}

interface RouteReport {
  destination: string
  coverage: {
    rows: number
    first_flight_date: string | null
    last_flight_date: string | null
    latest_collected_at: string | null
    by_source: Record<string, number>
  }
  best_cash: Offer | null
  best_miles: Offer | null
  best_milheiro: Offer | null
  top_cash: Offer[]
  top_miles: Offer[]
  by_month: { month: string; cash: Offer | null; miles: Offer | null }[]
}

// Mesmas famílias de workers/src/api/sources.ts
const AWARD_SOURCES = new Set(['smiles_web', 'tudoazul', 'latam_pass'])
const CASH_SOURCES = new Set(['voegol', 'voeazul', 'latam_web', 'latam'])
const sourceBase = (source: string): string => source.replace(/_dry_run$/, '')
const isAward = (s: Snapshot): boolean => AWARD_SOURCES.has(sourceBase(s.source)) && s.miles != null && s.miles > 0
const isCash = (s: Snapshot): boolean =>
  CASH_SOURCES.has(sourceBase(s.source)) && s.amount_brl != null && s.amount_brl > 0

const PAGE = 500
const MAX_PAGES = 40

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of argv) {
    if (!a.startsWith('--')) continue
    const [k, ...rest] = a.slice(2).split('=')
    out[k] = rest.length ? rest.join('=') : 'true'
  }
  return out
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function fetchLatest(
  base: string,
  token: string | undefined,
  params: Record<string, string>,
): Promise<Snapshot[]> {
  const rows: Snapshot[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      ...params,
      limit: String(PAGE),
      offset: String(page * PAGE),
      exclude_dry_run: '1',
    })
    const url = `${base.replace(/\/$/, '')}/api/v1/snapshots/latest?${qs}`
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} em ${url}`)
    const body = (await res.json()) as Envelope
    rows.push(...body.data)
    const total = body.meta.total
    const got = (page + 1) * PAGE
    if (body.data.length < PAGE || (total != null && got >= total)) break
  }
  return rows
}

function toOffer(s: Snapshot): Offer {
  return {
    flight_date: s.flight_date,
    airline: s.airline,
    source: s.source,
    departure_time: s.departure_time,
    collected_at: s.collected_at,
    ...(s.amount_brl != null ? { amount_brl: s.amount_brl } : {}),
    ...(s.miles != null ? { miles: s.miles, taxes_brl: s.taxes_brl } : {}),
  }
}

function minBy<T>(items: T[], key: (t: T) => number): T | null {
  let best: T | null = null
  let bestKey = Infinity
  for (const it of items) {
    const k = key(it)
    if (k < bestKey) {
      best = it
      bestKey = k
    }
  }
  return best
}

function report(destination: string, rows: Snapshot[], top: number): RouteReport {
  const cash = rows.filter(isCash)
  const award = rows.filter(isAward)

  // milheiro: cash mais barato da mesma rota/dia/companhia (regra de src/lib/api.ts)
  const cashByKey = new Map<string, number>()
  for (const s of cash) {
    const key = `${s.flight_date}|${s.airline}`
    const prev = cashByKey.get(key)
    if (prev == null || s.amount_brl! < prev) cashByKey.set(key, s.amount_brl!)
  }
  const awardOffers: Offer[] = award.map((s) => {
    const o = toOffer(s)
    const ref = cashByKey.get(`${s.flight_date}|${s.airline}`)
    if (ref != null) {
      o.cash_ref = ref
      o.milheiro = (ref / s.miles!) * 1000
    }
    return o
  })
  const cashOffers = cash.map(toOffer)

  const bestCash = minBy(cashOffers, (o) => o.amount_brl!)
  const bestMiles = minBy(awardOffers, (o) => o.miles! + (o.taxes_brl ?? 0) / 1e6)
  const bestMilheiro = minBy(
    awardOffers.filter((o) => o.milheiro != null),
    (o) => -o.milheiro!,
  )

  const perDay = (offers: Offer[], key: (o: Offer) => number): Offer[] => {
    const byDay = new Map<string, Offer>()
    for (const o of offers) {
      const prev = byDay.get(o.flight_date)
      if (!prev || key(o) < key(prev)) byDay.set(o.flight_date, o)
    }
    return [...byDay.values()].sort((a, b) => key(a) - key(b)).slice(0, top)
  }

  const months = new Map<string, { cash: Offer | null; miles: Offer | null }>()
  for (const s of rows) {
    const m = s.flight_date.slice(0, 7)
    if (!months.has(m)) months.set(m, { cash: null, miles: null })
  }
  for (const o of cashOffers) {
    const m = months.get(o.flight_date.slice(0, 7))!
    if (!m.cash || o.amount_brl! < m.cash.amount_brl!) m.cash = o
  }
  for (const o of awardOffers) {
    const m = months.get(o.flight_date.slice(0, 7))!
    if (!m.miles || o.miles! < m.miles.miles!) m.miles = o
  }

  const bySource: Record<string, number> = {}
  for (const s of rows) bySource[s.source] = (bySource[s.source] ?? 0) + 1
  const dates = rows.map((s) => s.flight_date).sort()
  const collected = rows.map((s) => s.collected_at).sort()

  return {
    destination,
    coverage: {
      rows: rows.length,
      first_flight_date: dates[0] ?? null,
      last_flight_date: dates[dates.length - 1] ?? null,
      latest_collected_at: collected[collected.length - 1] ?? null,
      by_source: bySource,
    },
    best_cash: bestCash,
    best_miles: bestMiles,
    best_milheiro: bestMilheiro,
    top_cash: perDay(cashOffers, (o) => o.amount_brl!),
    top_miles: perDay(awardOffers, (o) => o.miles!),
    by_month: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
  }
}

const brl = (n: number): string => `R$ ${Math.round(n).toLocaleString('pt-BR')}`
const milhas = (n: number): string => `${Math.round(n).toLocaleString('pt-BR')} milhas`
const dia = (d: string): string =>
  new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' })
    .format(new Date(`${d}T12:00:00Z`))
    .replace('.', '')
const mes = (m: string): string => {
  const nome = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(`${m}-15T12:00:00Z`))
    .replace('.', '')
  return `${nome}/${m.slice(2, 4)}`
}

function ago(iso: string | null, now: Date): string {
  if (!iso) return '—'
  const h = (now.getTime() - new Date(iso).getTime()) / 36e5
  if (h < 1) return 'há menos de 1 h'
  if (h < 48) return `há ${Math.round(h)} h`
  return `há ${Math.round(h / 24)} dias`
}

function printRoute(origin: string, r: RouteReport, now: Date): void {
  const c = r.coverage
  console.log(`\n## ${origin} → ${r.destination}`)
  if (!c.rows) {
    console.log('sem observações no período')
    return
  }
  const sources = Object.entries(c.by_source)
    .map(([s, n]) => `${s} ${n}`)
    .join(' · ')
  const stale = c.latest_collected_at && now.getTime() - new Date(c.latest_collected_at).getTime() > 48 * 36e5
  console.log(
    `cobertura ${c.first_flight_date} → ${c.last_flight_date} · ${c.rows} observações · ${sources} · última coleta ${ago(c.latest_collected_at, now)}${stale ? ' (velha: > 48 h)' : ''}`,
  )
  console.log('| | valor | dia | cia · fonte | visto |')
  console.log('| --- | --- | --- | --- | --- |')
  if (r.best_cash)
    console.log(
      `| menor em reais | ${brl(r.best_cash.amount_brl!)} | ${dia(r.best_cash.flight_date)}${r.best_cash.departure_time ? ' ' + r.best_cash.departure_time : ''} | ${r.best_cash.airline} · ${r.best_cash.source} | ${ago(r.best_cash.collected_at, now)} |`,
    )
  else console.log('| menor em reais | — | | nenhuma fonte cash no período | |')
  if (r.best_miles)
    console.log(
      `| menor em milhas | ${milhas(r.best_miles.miles!)}${r.best_miles.taxes_brl != null ? ' + ' + brl(r.best_miles.taxes_brl) : ''} | ${dia(r.best_miles.flight_date)} | ${r.best_miles.airline} · ${r.best_miles.source} | ${ago(r.best_miles.collected_at, now)} |`,
    )
  else console.log('| menor em milhas | — | | nenhuma fonte de milhas no período | |')
  if (r.best_milheiro)
    console.log(
      `| melhor milheiro | R$ ${r.best_milheiro.milheiro!.toFixed(1).replace('.', ',')} / mil (${brl(r.best_milheiro.cash_ref!)} ÷ ${milhas(r.best_milheiro.miles!)}) | ${dia(r.best_milheiro.flight_date)} | ${r.best_milheiro.airline} | ${ago(r.best_milheiro.collected_at, now)} |`,
    )
  else console.log('| melhor milheiro | — | | sem par cash + milhas no mesmo dia/cia | |')

  if (r.top_cash.length) {
    console.log(
      `\nDias mais baratos em reais: ${r.top_cash.map((o) => `${dia(o.flight_date)} ${brl(o.amount_brl!)} (${o.airline})`).join(' · ')}`,
    )
  }
  if (r.top_miles.length) {
    console.log(
      `Dias mais baratos em milhas: ${r.top_miles.map((o) => `${dia(o.flight_date)} ${milhas(o.miles!)} (${o.airline})`).join(' · ')}`,
    )
  }
  console.log('\n| mês | menor em reais | menor em milhas |')
  console.log('| --- | --- | --- |')
  for (const m of r.by_month) {
    console.log(
      `| ${mes(m.month)} | ${m.cash ? `${brl(m.cash.amount_brl!)} · ${dia(m.cash.flight_date)} · ${m.cash.airline}` : '—'} | ${m.miles ? `${milhas(m.miles.miles!)} · ${dia(m.miles.flight_date)} · ${m.miles.airline}` : '—'} |`,
    )
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const base = args.base ?? 'https://viagens-do-pe.pages.dev'
  const token = args.token ?? process.env.API_READ_SECRET
  const origin = (args.origin ?? 'PET').toUpperCase()
  const dests = (args.dests ?? 'GRU,CGH,VCP,POA')
    .split(',')
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean)
  const now = new Date()
  const from = args.from ?? isoDate(now)
  const to = args.to ?? '2027-03-31'
  const top = Math.max(1, Number(args.top ?? 5))

  console.log(
    `# Melhores oportunidades a partir de ${origin} · voos de ${from} a ${to} · consulta em ${now.toISOString()}`,
  )
  console.log(`fonte: ${base}/api/v1/snapshots/latest (última observação por rota/dia/fonte, sem fixtures)`)

  const routes: RouteReport[] = []
  for (const destination of dests) {
    const rows = await fetchLatest(base, token, { origin, destination, flight_date_from: from, flight_date_to: to })
    const r = report(destination, rows, top)
    routes.push(r)
    printRoute(origin, r, now)
  }

  if (args.json) {
    const file = path.resolve(args.json)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({ generated_at: now.toISOString(), origin, from, to, routes }, null, 2))
    console.log(`\nJSON: ${file}`)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

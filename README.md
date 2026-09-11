# Viagens do Pé

Dashboard FE-2 (Vite + React + TypeScript + **shadcn/ui**) alinhado ao wireframe **D-1 v2** e tokens **D-2**. Origem fixa **PET**, só ida, abas de destino **GRU | CGH | VCP**. Com `VITE_API_URL` o shell lê `price_snapshots` via Worker (BE-6); sem a variável, o app continua nos stubs locais.

Ingest BE-2/BE-5: coleta agendada de preços em [`workers/`](workers/). Smiles/GOL PET→CGH (`smiles_web` + `voegol`), TudoAzul/AZUL PET→VCP e PET→POA (`tudoazul` + `voeazul`) e LATAM Pass/LATAM PET→GRU (`latam_pass` + `latam_web`) são collectors HTTP reais.

## Stack

- Vite + React + TypeScript (Node **24**, `.nvmrc` + `engines.node`)
- ESLint 9+ (flat, ESLint 10) + typescript-eslint + Prettier
- Tailwind CSS v4 + shadcn/ui (tokens D-2)
- Cloudflare Pages (`npm run build` → `dist`, SPA fallback)
- Cloudflare Workers (ingest) + Supabase Postgres

## Desenvolvimento

```bash
nvm use          # Node 24 (Active LTS Krypton; ver `.nvmrc`)
npm install
cp .env.example .env   # inclui VITE_API_URL do Worker de ingest
npm run dev
```

Abre `http://localhost:5173`. Para desenvolver só com stubs, deixe `VITE_API_URL` vazio no `.env` e reinicie o Vite.

### Ferramentas (lint / format / types)

O app Vite usa ESLint 9+ (flat config + typescript-eslint) e Prettier. `eslint-config-prettier` desliga regras de estilo que brigam com o formatter. O worker de ingest (`workers/`) fica de fora do lint/format do FE — use `cd workers && npm run typecheck` / `npm test` lá.

```bash
nvm use
npm install
npm run lint
npm run lint:fix       # opcional
npm run format         # opcional; não rode em massa no CI
npm run format:check
npm run typecheck
npm run build
npm run preview
```

## Variáveis de ambiente

| Variável         | Obrigatória | Uso                                                                                                                                                                                                                 |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`   | Não         | Base URL do Workers read API. Vazia = stubs locais. Padrão no `.env.example`: `https://viagens-do-pe-ingest.rafaellimapereira.workers.dev`. Contrato: [`docs/api-price-snapshots.md`](docs/api-price-snapshots.md). |
| `VITE_API_TOKEN` | Não         | Só se o Worker tiver `API_READ_SECRET`. **Nunca** coloque `SUPABASE_SERVICE_ROLE_KEY` aqui.                                                                                                                         |

### Local

```bash
cp .env.example .env
# VITE_API_URL já aponta para o Worker de ingest. Edite se for usar wrangler dev:
# VITE_API_URL=http://localhost:8787
npm run dev
```

O Vite só expõe variáveis com prefixo `VITE_`. Reinicie `npm run dev` depois de mudar o `.env`. Sem `VITE_API_URL`, o Dashboard usa `src/data/placeholders.ts`. O client está em `src/lib/api.ts`. Query extra: `?dry=1` inclui fontes `*_dry_run` (o padrão é `exclude_dry_run=1`).

**Nunca** coloque `SUPABASE_SERVICE_ROLE_KEY` nem qualquer `VITE_SUPABASE*` no frontend — Security grepa o bundle.

### Cloudflare Pages

`VITE_*` é inlined no `npm run build`. Sem a variável no ambiente de build, o site de produção fica nos stubs.

1. Pages → projeto → **Settings** → **Environment variables**.
2. Adicione `VITE_API_URL=https://viagens-do-pe-ingest.rafaellimapereira.workers.dev` (Production e Preview).
3. `VITE_API_TOKEN` só se o Worker tiver `API_READ_SECRET`.
4. **Redeploy** o deploy mais recente (ou um push novo) — mudar o env sem rebuild não atualiza o JS.

## D-2 + shadcn (FE-1.1)

Tokens semânticos em `src/index.css` (`:root` HSL). Primitivos em `src/components/ui/`. O gráfico de barras continua custom (SVG), com cores `--chart-1` / `--chart-2` e Tooltip no chrome.

- Topbar: logo, **Viagens do Pé**, Badge success/soft `Origem fixa · PET · ida`, Button outline Entrar/Sair, Avatar+Fallback.
- Abas **GRU | CGH | VCP** (Tabs) trocam KPIs, gráfico e tabela na hora. Persistido em `?to=GRU`.
- Filtros (batch no **Aplicar**): Input date (janela futura) + Select da fonte. **Limpar** (outline) reseta a janela/fonte. Query: `from`, `until`, `fonte`.
- KPIs (Card): menor milhas, menor BRL (cash), melhor milheiro — `text-2xl font-semibold tracking-tight tabular-nums`.
- Gráfico: barras agrupadas **só em datas futuras**; ToggleGroup Milhas+BRL / Só milhas / Só BRL (`bars`); clique na barra filtra a tabela (`dia`).
- Tabela (Table, thead sticky): Data, Cia/programa, Fonte, Milhas, Taxas (BRL), Cash (BRL), Milheiro. Só voos futuros. Vazio: _Sem ofertas futuras nesta aba_.
- Loading: Skeleton enquanto o fetch roda (e `?ui=loading` para forçar).
- Erro de API: faixa inline com **Tentar de novo** (sem Dialog).

## D-1 v2 (comportamento)

- Origem fixa PET · ida — sem picker de rota; sem nav Alertas/Fontes.
- Com `VITE_API_URL`: KPIs, gráfico e tabela vêm de `/api/v1/snapshots/latest` + `/stats` (`group_by=window` e `route_day`).
- Sem `VITE_API_URL`: dados em `src/data/placeholders.ts`. Ofertas no passado são ignoradas.
- Milheiro de milhas = `(taxes_brl / miles) * 1000`. Linhas só-cash (`voegol` / `voeazul` / `latam_web`) mostram —.
- Fonte: `smiles_web`, `voegol`, `tudoazul`, `voeazul`, `latam_pass`, `latam_web`.
- Query preservada: `to`, `from`, `until`, `fonte`, `dia`, `bars` (e `dry` opcional).

## Deploy — Cloudflare Pages

1. Conecte o repositório em [Cloudflare Pages](https://developers.cloudflare.com/pages/).
2. Build: `npm run build`
3. Output: `dist`
4. Node: `24` (veja `.nvmrc`)
5. SPA: `public/_redirects` (`/* /index.html 200`) vai para `dist`.
6. **Obrigatório para dados reais:** `VITE_API_URL` no ambiente de build + **redeploy** (veja [Cloudflare Pages](#cloudflare-pages) acima).

Ou Wrangler:

```bash
npx wrangler pages deploy dist
```

`wrangler.toml` aponta `pages_build_output_dir = "dist"`.

## Ingest worker (BE-2 / BE-3 / BE-4 / BE-5)

Scheduled collection lives in [`workers/`](workers/). **Smiles / GOL PET→CGH** (`smiles_web` miles, `voegol` cash), **TudoAzul / AZUL PET→VCP + PET→POA** (`tudoazul` miles, `voeazul` cash), and **LATAM Pass / LATAM PET→GRU** (`latam_pass` miles, `latam_web` cash) are implemented.

- Cron: 00:00, 06:00, 12:00, 18:00 **UTC** (21:00, 03:00, 09:00, 15:00 America/Sao_Paulo)
- Local: `cd workers && npm install && npm run dev` — see [`workers/README.md`](workers/README.md) for `SMILES_*` / `TUDOAZUL_LOGIN`+`TUDOAZUL_PASSWORD` / `LATAM_PASS_LOGIN`+`LATAM_PASS_PASSWORD` placeholders, dry-run fixtures, and a manual `/run` tick
- **BE-6 read API** (same Worker): `GET /api/v1/snapshots`, `/latest`, `/stats`. Contract + curl: [`docs/api-price-snapshots.md`](docs/api-price-snapshots.md)

## Schema

- [`supabase/migrations/20260911174910_price_snapshots.sql`](supabase/migrations/20260911174910_price_snapshots.sql) (BE-1, merged)
- [`supabase/migrations/20260911180100_ingest_runs.sql`](supabase/migrations/20260911180100_ingest_runs.sql)
- [`supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql`](supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql)
- [`supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql`](supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql)
- [`supabase/migrations/20260911192000_price_snapshots_latest.sql`](supabase/migrations/20260911192000_price_snapshots_latest.sql) (BE-6 latest-per-route/day view)

## Estrutura

```
src/
  components/     shell, abas, filtros, KPIs, gráfico, tabela
  components/ui/  primitivos shadcn
  data/           stubs PET → GRU/CGH/VCP
  lib/            query URL, filtros, formatação, VITE_API_URL, client BE-6
  hooks/          fetch latest + stats do Dashboard
  pages/Dashboard.tsx
  types/          priceSnapshot (stubs) + api.ts (Worker contract)
workers/          ingest + BE-6 read API (`/api/v1/snapshots*`)
docs/             FE contract for the read API
supabase/         Postgres migrations
```

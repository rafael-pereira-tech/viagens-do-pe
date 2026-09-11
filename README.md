# Viagens do Pé

Dashboard FE-1.1 (Vite + React + TypeScript + **shadcn/ui**) alinhado ao wireframe **D-1 v2** e tokens **D-2**. Origem fixa **PET**, só ida, abas de destino **GRU | CGH | VCP**. O backend (Workers + Supabase) fica em outro lugar — este app não inventa APIs.

Ingest BE-2/BE-5: coleta agendada de preços em [`workers/`](workers/). Smiles/GOL PET→CGH (`smiles_web`), TudoAzul/AZUL PET→VCP e PET→POA (`tudoazul` + `voeazul`) e LATAM Pass/LATAM PET→GRU (`latam_pass` + `latamairlines`) são collectors HTTP reais.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4 + shadcn/ui (tokens D-2)
- Cloudflare Pages (`npm run build` → `dist`, SPA fallback)
- Cloudflare Workers (ingest) + Supabase Postgres

## Desenvolvimento

```bash
npm install
cp .env.example .env   # opcional
npm run dev
```

Abre `http://localhost:5173`. Typecheck + bundle:

```bash
npm run build
npm run preview
```

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `VITE_API_URL` | Não (FE-1 / FE-1.1) | Base URL do Workers API. Vazia = stubs locais. Ex.: `https://api.exemplo.workers.dev` |

Copie `.env.example` para `.env` ou `.env.local`. O Vite só expõe variáveis com prefixo `VITE_`. **Não há fetch neste milestone.**

## D-2 + shadcn (FE-1.1)

Tokens semânticos em `src/index.css` (`:root` HSL). Primitivos em `src/components/ui/`. O gráfico de barras continua custom (SVG), com cores `--chart-1` / `--chart-2` e Tooltip no chrome.

- Topbar: logo, **Viagens do Pé**, Badge success/soft `Origem fixa · PET · ida`, Button outline Entrar/Sair, Avatar+Fallback.
- Abas **GRU | CGH | VCP** (Tabs) trocam KPIs, gráfico e tabela na hora. Persistido em `?to=GRU`.
- Filtros (batch no **Aplicar**): Input date (janela futura) + Select da fonte. **Limpar** (outline) reseta a janela/fonte. Query: `from`, `until`, `fonte`.
- KPIs (Card): menor milhas, menor BRL (cash), melhor milheiro — `text-2xl font-semibold tracking-tight tabular-nums`.
- Gráfico: barras agrupadas **só em datas futuras**; ToggleGroup Milhas+BRL / Só milhas / Só BRL (`bars`); clique na barra filtra a tabela (`dia`).
- Tabela (Table, thead sticky): Data, Cia/programa, Fonte, Milhas, Taxas (BRL), Cash (BRL), Milheiro. Só voos futuros. Vazio: *Sem ofertas futuras nesta aba*.
- Loading: Skeleton (`?ui=loading`).

## D-1 v2 (comportamento)

- Origem fixa PET · ida — sem picker de rota; sem nav Alertas/Fontes.
- Dados em `src/data/placeholders.ts` (`PriceSnapshot` + milheiro derivado). Ofertas no passado são ignoradas.
- Query preservada: `to`, `from`, `until`, `fonte`, `dia`, `bars`.

## Deploy — Cloudflare Pages

1. Conecte o repositório em [Cloudflare Pages](https://developers.cloudflare.com/pages/).
2. Build: `npm run build`
3. Output: `dist`
4. Node: `22` (veja `.nvmrc`)
5. SPA: `public/_redirects` (`/* /index.html 200`) vai para `dist`.

Ou Wrangler:

```bash
npx wrangler pages deploy dist
```

`wrangler.toml` aponta `pages_build_output_dir = "dist"`. Defina `VITE_API_URL` nos build settings quando o Workers existir.

## Ingest worker (BE-2 / BE-3 / BE-4 / BE-5)

Scheduled collection lives in [`workers/`](workers/). **Smiles / GOL PET→CGH** (`source: smiles_web`), **TudoAzul / AZUL PET→VCP + PET→POA** (`tudoazul` miles, `voeazul` cash), and **LATAM Pass / LATAM PET→GRU** (`latam_pass` miles, `latamairlines` cash) are implemented.

- Cron: 00:00, 06:00, 12:00, 18:00 **UTC** (21:00, 03:00, 09:00, 15:00 America/Sao_Paulo)
- Local: `cd workers && npm install && npm run dev` — see [`workers/README.md`](workers/README.md) for `SMILES_*` / `TUDOAZUL_LOGIN`+`TUDOAZUL_PASSWORD` / `LATAM_PASS_LOGIN`+`LATAM_PASS_PASSWORD` placeholders, dry-run fixtures, and a manual `/run` tick

## Schema

- [`supabase/migrations/20260911174910_price_snapshots.sql`](supabase/migrations/20260911174910_price_snapshots.sql) (BE-1, merged)
- [`supabase/migrations/20260911180100_ingest_runs.sql`](supabase/migrations/20260911180100_ingest_runs.sql)
- [`supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql`](supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql)
- [`supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql`](supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql)

## Estrutura

```
src/
  components/     shell, abas, filtros, KPIs, gráfico, tabela
  components/ui/  primitivos shadcn
  data/           stubs PET → GRU/CGH/VCP
  lib/            query URL, filtros, formatação, VITE_API_URL, tokens de UI
  pages/Dashboard.tsx
  types/priceSnapshot.ts
workers/          ingest Worker (BE-2/BE-3 Smiles + BE-4 TudoAzul + BE-5 LATAM Pass collectors + wrangler.toml)
supabase/         Postgres migrations
```

# Viagens do Pé

Dashboard FE-1 (Vite + React + TypeScript) alinhado ao wireframe **D-1 v2 MVP**. Origem fixa **PET**, só ida, abas de destino **GRU | CGH | VCP**. O backend (Workers + Supabase) fica em outro lugar — este app não inventa APIs.

Ingest BE-2/BE-3: coleta agendada de preços em [`workers/`](workers/). Smiles/GOL PET→CGH é um collector HTTP real (`smiles_web`); TudoAzul e LATAM Pass continuam stubs até BE-4/5.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
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
| `VITE_API_URL` | Não (FE-1) | Base URL do Workers API. Vazia = stubs locais. Ex.: `https://api.exemplo.workers.dev` |

Copie `.env.example` para `.env` ou `.env.local`. O Vite só expõe variáveis com prefixo `VITE_`. **Não há fetch neste milestone.**

## D-1 v2 (comportamento)

- Topbar: logo, **Viagens do Pé**, pill `Origem fixa · PET · ida`, avatar (stub Entrar/Sair).
- Abas **GRU | CGH | VCP** trocam KPIs, gráfico e tabela na hora. Persistido em `?to=GRU`.
- Filtros (batch no **Aplicar**): janela futura + fonte. **Limpar** reseta a janela/fonte. Query: `from`, `until`, `fonte`.
- KPIs (3, da aba ativa): menor milhas, menor BRL (cash), melhor milheiro.
- Gráfico: barras agrupadas **só em datas futuras**; toggle Milhas+BRL / Só milhas / Só BRL (`bars`); clique na barra filtra a tabela (`dia`).
- Tabela: Data, Cia/programa, Fonte, Milhas, Taxas (BRL), Cash (BRL), Milheiro. Só voos futuros. Vazio: *Sem ofertas futuras nesta aba*.

Dados em `src/data/placeholders.ts` (`PriceSnapshot` + milheiro derivado). Ofertas no passado são ignoradas.

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

## Ingest worker (BE-2 / BE-3)

Scheduled collection lives in [`workers/`](workers/). **Smiles / GOL PET→CGH** is implemented: miles via Smiles (`source: smiles_web`; Smiles `money` is copay, not cash) and full cash BRL via VoeGol (`source: voegol`). TudoAzul and LATAM Pass stay stubs until BE-4/5.

- Cron: 00:00, 06:00, 12:00, 18:00 **UTC** (21:00, 03:00, 09:00, 15:00 America/Sao_Paulo)
- Local: `cd workers && npm install && npm run dev` — see [`workers/README.md`](workers/README.md) for `SMILES_*` secrets, dry-run fixtures, and a manual `/run` tick

## Schema

- [`supabase/migrations/20260911174910_price_snapshots.sql`](supabase/migrations/20260911174910_price_snapshots.sql) (BE-1, merged)
- [`supabase/migrations/20260911180100_ingest_runs.sql`](supabase/migrations/20260911180100_ingest_runs.sql)
- [`supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql`](supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql)
- [`supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql`](supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql)

## Estrutura

```
src/
  components/     shell, abas, filtros, KPIs, gráfico, tabela
  data/           stubs PET → GRU/CGH/VCP
  lib/            query URL, filtros, formatação, VITE_API_URL
  pages/Dashboard.tsx
  types/priceSnapshot.ts
workers/          ingest Worker (BE-2/BE-3 Smiles collector + wrangler.toml)
supabase/         Postgres migrations
```

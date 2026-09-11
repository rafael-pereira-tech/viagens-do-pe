# Viagens do Pé

Dashboard FE-1 (Vite + React + TypeScript) alinhado ao wireframe **D-1 v2 MVP**. Origem fixa **PET**, só ida, abas de destino **GRU | CGH | VCP**. O backend (Workers + Supabase) fica em outro lugar — este app não inventa APIs.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Cloudflare Pages (`npm run build` → `dist`, SPA fallback)

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

## Estrutura

```
src/
  components/     shell, abas, filtros, KPIs, gráfico, tabela
  data/           stubs PET → GRU/CGH/VCP
  lib/            query URL, filtros, formatação, VITE_API_URL
  pages/Dashboard.tsx
  types/priceSnapshot.ts
```

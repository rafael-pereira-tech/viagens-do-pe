# Viagens do Pé

Dashboard de preços de passagem **a partir de Pelotas (PET)** — ida para GRU, CGH e VCP. Compara milhas, tarifa em dinheiro e milheiro das três grandes, num gráfico diário e numa tabela filtrável.

**Demo:** [viagens-do-pe.pages.dev](https://viagens-do-pe.pages.dev)

## Por quê

Quem mora no interior não tem a mesma densidade de ofertas de quem busca a partir de GRU. O app responde, para os próximos 45 dias: qual dia está barato em milhas, qual está barato em reais, e qual o milheiro faz sentido.

## Interface

- Abas **GRU · CGH · VCP** com origem fixa PET (ida)
- KPIs: menor milhas, menor BRL, melhor milheiro
- Gráfico SVG de barras por dia (milhas, BRL ou os dois); a cor é a companhia vencedora daquele dia
- Clique na barra filtra a tabela; filtros de janela e fonte ficam na URL
- Só voos futuros; skeleton, vazio, erro inline com retry, aviso de dados atrasados

Estado da UI (aba, datas, fonte, dia, modo do gráfico) vive na query string — compartilhar o link reabre o mesmo recorte.

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Vitest · Playwright · Cloudflare Pages + Workers · Supabase Postgres

O frontend não fala com o banco. Um Worker coleta snapshots, persiste no Postgres e expõe uma read API autenticada por Bearer. Sem `VITE_API_URL`, o app sobe com stubs locais.

## Desenvolvimento

```bash
nvm use          # Node 24; ver .nvmrc
npm install
cp .env.example .env
npm run dev
```

`http://localhost:5173`. Deixe `VITE_API_URL` vazio para trabalhar só com stubs.

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

Operação (env, Pages, Worker, schema): [`docs/operations.md`](docs/operations.md). Contrato da API: [`docs/api-price-snapshots.md`](docs/api-price-snapshots.md).

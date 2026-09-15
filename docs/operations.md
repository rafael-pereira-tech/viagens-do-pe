# Operação — Viagens do Pé

Detalhes de ambiente, deploy e ingest. O README do repositório é a vitrine do produto.

## Produção

- Frontend: [https://viagens-do-pe.pages.dev](https://viagens-do-pe.pages.dev)
- Worker/API: `https://viagens-do-pe-ingest.rafaellimapereira.workers.dev`
- Supabase: valor de `SUPABASE_URL` no Worker (a service role **não** vai para o frontend)

## Desenvolvimento

```bash
nvm use          # Node 24; ver .nvmrc
npm install
cp .env.example .env
npm run dev
```

Abre `http://localhost:5173`. Para stubs locais, deixe `VITE_API_URL` vazio e reinicie o Vite.

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run preview
```

O app Vite usa ESLint 9+ (flat + typescript-eslint) e Prettier. O worker (`workers/`) fica de fora do lint do FE — use `cd workers && npm run typecheck` / `npm test` lá.

Pre-commit (Husky + lint-staged): `pnpm install` liga o hook via `prepare`. No commit, ESLint + Prettier rodam nos arquivos staged de `src/`.

## Variáveis de ambiente (frontend)

| Variável            | Obrigatória                                      | Uso                                                                                                       |
| ------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`      | Sim no Pages (dados reais)                       | Base URL da read API. Vazia = stubs locais. Contrato: [`api-price-snapshots.md`](api-price-snapshots.md). |
| `VITE_API_TOKEN`    | Sim no Pages se o Worker tiver `API_READ_SECRET` | `Authorization: Bearer …` — mesmo valor que `API_READ_SECRET` / `READ_API_KEY`. **Nunca** `SUPABASE_*`.   |
| `VITE_READ_API_KEY` | Alias de `VITE_API_TOKEN`                        | Mesmo header.                                                                                             |

O Vite só expõe prefixo `VITE_`. Reinicie `npm run dev` depois de mudar o `.env`. Sem `VITE_API_URL` o Dashboard usa `src/data/placeholders.ts`. Com a URL, o client chama o Worker e manda Bearer se o token existir. Sem token o `/api/v1` responde 401.

**Nunca** coloque `SUPABASE_SERVICE_ROLE_KEY` nem `VITE_SUPABASE*` no frontend.

### Modo de dados (query)

| Modo              | Query        | API                 |
| ----------------- | ------------ | ------------------- |
| Produção (padrão) | `?live=1`    | `exclude_dry_run=1` |
| Incluir dry-run   | `?dry=1`     | live + fixtures     |
| Só dry-run        | `?dry_run=1` | somente `*_dry_run` |

### Cloudflare Pages

`VITE_*` é inlined no `npm run build`. Sem a variável no ambiente de build, o site fica nos stubs.

1. Pages → projeto → **Settings** → **Environment variables**.
2. Production e Preview:
   - `VITE_API_URL=https://viagens-do-pe-ingest.rafaellimapereira.workers.dev`
   - `VITE_API_TOKEN` = o mesmo valor de `API_READ_SECRET` / `READ_API_KEY` no Worker.
3. Não use `SUPABASE_*` nem `INGEST_TRIGGER_SECRET` no Pages.
4. Redeploy depois de mudar env — sem rebuild o JS não atualiza.

Build: `npm run build` → `dist`. Node 24. SPA: `public/_redirects` (`/* /index.html 200`).

```bash
npx wrangler pages deploy dist
```

`wrangler.toml` aponta `pages_build_output_dir = "dist"`.

## Worker (ingest + read API)

Coleta agendada em [`../workers/`](../workers/). Ver [`../workers/README.md`](../workers/README.md) para credenciais, dry-run e `POST /run`.

- Cron: 09:00 e 21:00 UTC (06:00 e 18:00 em São Paulo); janela móvel de 45 dias.
- Rotas: PET→CGH (Smiles/GOL), PET→VCP (TudoAzul/Azul), PET→GRU (LATAM Pass/LATAM). PET→POA e pontos LATAM podem estar desligados por flag no Worker.
- Read API (mesmo Worker): `GET /health`, `/api/v1/health`, `/api/v1/snapshots`, `/latest`, `/stats`. Contrato: [`api-price-snapshots.md`](api-price-snapshots.md).
- CORS liberado para o domínio do Pages, previews e desenvolvimento local.

## Schema

- [`../supabase/migrations/20260911174910_price_snapshots.sql`](../supabase/migrations/20260911174910_price_snapshots.sql)
- [`../supabase/migrations/20260911180100_ingest_runs.sql`](../supabase/migrations/20260911180100_ingest_runs.sql)
- [`../supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql`](../supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql)
- [`../supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql`](../supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql)
- [`../supabase/migrations/20260911192000_price_snapshots_latest.sql`](../supabase/migrations/20260911192000_price_snapshots_latest.sql)

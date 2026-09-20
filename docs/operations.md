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

Abre `http://localhost:5173`. Sem `VITE_API_URL` o Vite usa stubs locais. Para o proxy same-origin: `npm run build && npx wrangler pages dev dist` (lê `.dev.vars`).

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

| Variável          | Onde                         | Uso                                                                                         |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `VITE_API_URL`    | Só Vite local (opcional)     | Origem absoluta. Vazia = same-origin. **Não** usar no Pages — Functions cobrem `/api/v1/*`. |
| `VITE_USE_STUBS`  | Só local / e2e               | `1` = placeholders. Produção deve ficar unset.                                              |
| `API_READ_SECRET` | **Pages Functions** (secret) | Bearer injetado no proxy. Mesmo valor que `READ_API_KEY` no Worker. **Nunca** `VITE_*`.     |
| `WORKER_API_URL`  | Pages Functions (var)        | Origin do Worker. Default no `wrangler.toml`.                                               |

O Vite só expõe prefixo `VITE_`, e **qualquer** `VITE_*` é inlined no JS público. **Não** use `VITE_READ_API_KEY`, `VITE_API_TOKEN` nem Bearer no browser. Reinicie `npm run dev` depois de mudar o `.env`. Sem `VITE_API_URL` no Vite o Dashboard usa `src/data/placeholders.ts`. Em produção o client chama same-origin `/api/v1/*` **sem** header de autorização.

**Nunca** coloque `SUPABASE_SERVICE_ROLE_KEY` nem `VITE_SUPABASE*` no frontend.

### Modo de dados (query)

| Modo              | Query        | API                 |
| ----------------- | ------------ | ------------------- |
| Produção (padrão) | `?live=1`    | `exclude_dry_run=1` |
| Incluir dry-run   | `?dry=1`     | live + fixtures     |
| Só dry-run        | `?dry_run=1` | somente `*_dry_run` |

### Cloudflare Pages

`VITE_*` é inlined no `npm run build`. Pages de produção **não** precisa de nenhuma variável `VITE_*` — o browser fala só com `/api/v1/*` na mesma origem.

1. Pages → projeto → **Settings** → **Environment variables** (Functions / Production e Preview):
   - `API_READ_SECRET` = o mesmo valor de `READ_API_KEY` no Worker (**Encrypt** / secret).
   - `WORKER_API_URL` opcional (já tem default no `wrangler.toml`).
2. Remova `VITE_READ_API_KEY`, `VITE_API_TOKEN` e qualquer outro `VITE_*` secret. **Rotacione** o token que vazou no bundle antigo.
3. Não use `SUPABASE_*` nem `INGEST_TRIGGER_SECRET` no Pages.
4. Redeploy o Pages **depois** de gravar o secret das Functions (`npx wrangler pages secret put API_READ_SECRET --project-name viagens-do-pe`).

Build: `npm run build` → `dist`. Node 24. SPA: `public/_redirects` (`/* /index.html 200`). Functions em `functions/` têm precedência sobre o fallback SPA.

```bash
npx wrangler pages secret put API_READ_SECRET --project-name viagens-do-pe
npx wrangler pages deploy dist
```

`wrangler.toml` aponta `pages_build_output_dir = "dist"`.

## Worker (ingest + read API)

Coleta agendada em [`../workers/`](../workers/). Ver [`../workers/README.md`](../workers/README.md) para credenciais, dry-run e `POST /run`.

- Cron (prod): 09:00 e 21:00 UTC (06:00 e 18:00 em São Paulo); janela móvel de 45 dias.
- Cron (staging): a cada 6h UTC; janela móvel de 120 dias (soak de histórico/alertas).
- Rotas: PET→CGH (Smiles/GOL), PET→VCP (TudoAzul/Azul), PET→GRU (LATAM Pass/LATAM). PET→POA e pontos LATAM podem estar desligados por flag no Worker.
- Read API (mesmo Worker): `GET /health`, `/api/v1/health`, `/api/v1/snapshots`, `/latest`, `/stats`. Contrato: [`api-price-snapshots.md`](api-price-snapshots.md).
- CORS liberado para o domínio do Pages, previews e desenvolvimento local.
- Após cada ingest: deriva `price_observations` (melhor oferta por série) e avalia `price_alerts` (canal `log`).

## Schema

- [`../supabase/migrations/20260911174910_price_snapshots.sql`](../supabase/migrations/20260911174910_price_snapshots.sql)
- [`../supabase/migrations/20260911180100_ingest_runs.sql`](../supabase/migrations/20260911180100_ingest_runs.sql)
- [`../supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql`](../supabase/migrations/20260911180101_price_snapshots_nonneg_check.sql)
- [`../supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql`](../supabase/migrations/20260911180500_price_snapshots_ingest_run_id.sql)
- [`../supabase/migrations/20260911192000_price_snapshots_latest.sql`](../supabase/migrations/20260911192000_price_snapshots_latest.sql)
- [`../supabase/migrations/20260918000000_price_observations.sql`](../supabase/migrations/20260918000000_price_observations.sql)
- [`../supabase/migrations/20260918000001_price_alerts.sql`](../supabase/migrations/20260918000001_price_alerts.sql)

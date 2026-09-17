# Contrato público — LATAM cash (BRL)

Evidência de descoberta capturada com `pnpm discover:latam` (Playwright, Chromium
headed, rede residencial). Ferramenta: `scripts/discover/latam.ts`. Artefatos brutos
(HAR/cookies/captcha token) ficam em `scripts/discover/out/` e **não** são versionados.

## Run 2026-09-15 — PET→GRU, 2026-10-15, ida, 1 adt, Economy, cash

- **Resultado:** `blocked`. A busca retornou **HTTP 403** com página Akamai
  "Access Denied" (`Reference Code: #0.84421502...`), mesmo em navegador real headed
  navegando direto para o deep link de resultados.
- **Endpoint real observado:** `GET /bff/air-offers/v2/offers/search`
  (o coletor atual usa `/bff/air-offers/offers/search` — **caminho e query divergem**).
- **Query real (parcial):** `origin`, `destination`, `outFrom=YYYY-MM-DD`,
  `cabinType=Economy`, `redemption=false`, `adult`, `child`, `infant`, `sort=RECOMMENDED`,
  `outOfferId=null`, `inOfferId=null`, `locale=pt-br` + vários `utm_*=undefined`.
  Não é `outbound` ISO como o coletor assume.
- **Headers que o coletor NÃO envia (e são exigidos pelo fluxo real):**
  - `x-latam-captcha-token` — token grande (reCAPTCHA Enterprise). O fluxo real
    passa por avaliação de captcha por busca.
  - `x-latam-search-token` — JWT emitido pelo frontend.
  - `x-latam-request-id`, `x-latam-track-id`, `x-latam-app-session-id`,
    `x-latam-device-width`, `sec-ch-ua*`.

### Easter egg anti-scraper

O payload do `x-latam-search-token` (JWT) contém, além de origin/destination/país:

> `"message": "Hi Hacker friend, if you need to see our offers out of our site, feel free to contact us and we will see how we can help you. Thank you."`

Ou seja, a LATAM fingerprint-a scrapers deliberadamente e sinaliza um canal de contato
para acesso a dados fora do site.

## Run 2026-09-15 (2) — fluxo orgânico home→form→busca

Rodado com `pnpm discover:latam` já com fluxo orgânico: warm-up na home, aceite de
cookies, preenchimento real do formulário (chip "somente ida" `#fsb-one-way`,
autocomplete `#fsb-origin--text-field`/`#fsb-destination--text-field` selecionando a
opção pelo atributo `iata`, calendário `[data-testid="date-YYYY-MM-DD"]`) e submit em
`[data-testid="fsb-search-flights--button"]`.

- Datas testadas: sexta `2026-10-16` (a própria UI informa que PET→São Paulo só voa
  seg/qui/sex).
- Mesmo com a sessão aquecida e o form preenchido, o `offers-search` continua **403**
  (Akamai "Access Denied"). O bloqueio é comportamental/fingerprint de automação, não
  falta de cookie ou de captcha token.
- Observação de UX: a página de resultados renderiza e trata o 403 como estado de erro
  gracioso ("A busca está demorando mais que o normal"), com "Código para equipe de
  suporte".

## Run 2026-09-15 (3) — teste manual (navegador real do usuário) — DECISIVO

Busca feita manualmente no Chrome normal do usuário (perfil real, rede residencial,
sem Playwright), mesmos parâmetros de rota.

- `offers/search` retornou **HTTP 200 com preços reais**. Ex.: PET→GRU, voo **LA4745**,
  brand LIGHT **R$ 437,53** (`newPrices`: fare 388,90 + taxes 48,63), STANDARD 544,53,
  FULL 590,53, Premium Economy 615,53. `seatsRemaining` por brand.
- Conclusão: o mesmo endpoint que dá **403 sob Playwright** funciona **200 no navegador
  real**. O bloqueio é **detecção de automação** (não IP, não contrato, não sessão fria).

### Schema real da resposta (cash)

Objeto tipo Spring `Page`:

- `content[].summary`: `flightCode`, `stopOvers`, `duration`, `origin/destination`
  (`iataCode`, `departure/arrival`, times), `flightOperators`, `lowestPrice`.
- `content[].summary.brands[]`: `brandText` (LIGHT/STANDARD/FULL/PREMIUM ECONOMY),
  `cabin`, `price` (`currency` BRL, `amount`), `offerId`, `seatsRemaining`.
- `content[].newPrices[]`: `{ fare, taxes, total }` por brand (ordem = brands).
- `content[].itinerary[]`: segmentos com `flight.flightNumber/airlineCode`, `equipment`,
  `origin/destination`, `departure/arrival`.

## Run 2026-09-15 (4) — CDP em Chrome real — BREAKTHROUGH

Chrome real (`Google Chrome`, não o Chromium do Playwright) aberto normalmente com
`--remote-debugging-port` (sem flags de automação → `navigator.webdriver=false`),
Playwright conectado via `chromium.connectOverCDP`. Comando:

```
pnpm discover -- --source=latam --cdp=http://127.0.0.1:9222 --skip-form \
  --origin=GRU --destination=GIG --date=2026-10-16
```

- `offers-search` → **HTTP 200 com 30 ofertas reais** (LA3342 R$ 453,86, ...).
- Mesma máquina/IP/URL que dava **403** sob o Chromium do Playwright. A única variável é
  o navegador ser um Chrome real dirigido por CDP.
- Deep-link que funciona (mesma aba): `GET /br/pt/oferta-voos?origin&destination&
outbound=<ISO>&adt=1&trip=OW&cabin=Economy&redemption=false&sort=RECOMMENDED` → a SPA
  dispara `/bff/air-offers/v2/offers/search`.

**Implicação:** a coleta deve dirigir um Chrome real via CDP (não `fetch` cru nem o
Chromium do Playwright), a partir de um ambiente não-datacenter. Isso mata a opção do
Worker como executor e valida o runner Node do plano — hospedando um Chrome real.

## Conclusões

1. O contrato HTTP hardcoded do coletor atual (`latam-pass/`) está **errado/desatualizado**:
   endpoint, formato de query e conjunto de headers não batem com o fluxo real. Replay
   HTTP cru nunca produziria resultado.
2. Mesmo um **navegador real automatizado** (Playwright) é bloqueado (403) ao ir direto
   ao deep link — sem warm-up de sessão / captcha o Akamai recusa.
3. Próximas hipóteses a isolar (ver plano C10):
   - **Warm-up orgânico:** abrir a home, preencher o formulário e deixar o Akamai semear
     cookies (`_abck`, `bm_sz`) e gerar captcha token, em vez do deep link direto.
   - Persistent context / IP residencial vs datacenter.
4. Product-level: dado o convite explícito ("contact us"), avaliar acordo de dados com a
   LATAM e reconsiderar coleta agendada vs busca sob demanda vs fornecedor.

# Contrato público — Smiles (pontos / award)

Evidência de descoberta capturada com `pnpm discover:smiles` (Playwright, Chromium
headed, rede residencial). Ferramenta: `scripts/discover/run.ts`. Artefatos brutos
(HAR/cookies) em `scripts/discover/out/` — não versionados.

## Run 2026-09-15 — PET→CGH, 2026-10-15 (quinta), ida, 1 adt, Economy

Fluxo orgânico completo, reproduzido de verdade:

1. Warm-up em `https://www.smiles.com.br/home`.
2. O buscador de voos é um micro-frontend (`data-testid="flight-search"`); só fica
   utilizável após aguardar o carregamento e ativar a aba
   (`#smiles-react-flight-search-tab`).
3. Tipo de viagem é um dropdown: abrir e escolher `#opt_oneWay` ("Somente ida").
4. Origem `#inp_flightOrigin_1` / destino `#inp_flightDestination_1`; opções são
   `ul.dropdown-menu li button` com o código IATA no texto.
5. Calendário react-dates; submit em `#smiles-react-flight-search-search-btn`.

### Contrato real observado

- **Sessão guest:** `POST /oauth/token` retorna **200** (token guest obtido pelo
  próprio fluxo). Sinal positivo — sessão pública é obtível.
- **URL de resultados:** `/mfe/emissao-passagem/` com params reais:
  `tripType=2` (ida), `cabin=ECONOMIC`, `departureDate=<epoch_ms>`, `searchType=g3`,
  `adults/children/infants`, `originAirport=PET`, `destinationAirport=CGH`,
  `novo-resultado-voos=true`. (O coletor atual assume `departureDate` ISO e
  `tripType=1` — divergente.)
- **Busca de preços:** `GET https://api-air-flightsearch-blue.smiles.com.br/v1/airlines/search`
  com `originAirportCode`, `destinationAirportCode`, `cabin=ECONOMIC`, `departureDate`.
  Endpoint/host batem com o coletor.

### Resultado

- A busca `airlines/search` **falha com `net::ERR_FAILED`** (equivalente ao 406
  observado em produção — resposta de bloqueio sem headers CORS aparece como
  ERR_FAILED no browser).
- A página de resultados fica **travada no spinner** "Aguarde enquanto buscamos os
  melhores voos para sua viagem"; "Taxas da viagem" nunca é preenchida.
- Isso ocorreu no **fluxo real do site, em navegador real, na rede residencial**, com
  token guest válido. Ou seja, o bloqueio da busca não é exclusivo do IP de datacenter
  do Worker.

## Run 2026-09-15 (2) — teste manual (navegador real do usuário) — DECISIVO

Busca feita manualmente no Chrome normal do usuário (perfil real, rede residencial,
sem Playwright).

- `airlines/search` retornou **HTTP 200 com award real**. Ex.: PET→SDU (via CGH, 1
  parada), **65.500 milhas** + R$ 48,63 (`SMILES`); também `SMILES_CLUB` 63.600,
  `SMILES_TIER` 35.000 (DIAMOND_FARE), `SMILES_MONEY` 11.800mi + R$990, `MONEY` R$1.260,90.
- Conclusão: o mesmo endpoint que dá **ERR_FAILED sob Playwright** funciona **200 no
  navegador real**. O bloqueio é **detecção de automação**.

### Schema real da resposta (award)

- `requestedFlightSegmentList[]` (um por trecho: SEGMENT_1, SEGMENT_2 se RT).
- `.flightList[]`: `stops`, `airportStop`, `departure/arrival` (`date`, `airport.code`),
  `airline`, `duration`, `availableSeats`, `legList[]` (voos reais, `flightNumber`,
  `equipment`, `isConnection`).
- `.flightList[].fareList[]`: `type` (`SMILES`, `SMILES_CLUB`, `SMILES_TIER`,
  `SMILES_MONEY`, `SMILES_MONEY_CLUB`, `MONEY`), `miles`, `money` (copay BRL),
  `g3.costTax` (taxas BRL), `baseMiles`.
- `bestPricing` por segmento; `calendarDayList` (preços de dias vizinhos); `passenger`.
- **Guest puro** = `type: "SMILES"` (miles + taxas, money=0). `CLUB`/`TIER` exigem
  perfil e não devem ser tratados como tarifa pública.

## Run 2026-09-15 (3) — CDP em Chrome real — BREAKTHROUGH

Mesmo método do LATAM (Chrome real via `connectOverCDP`, `webdriver=false`). Comando:

```
pnpm discover -- --source=smiles --cdp=http://127.0.0.1:9222 --skip-form \
  --origin=PET --destination=CGH --date=2026-10-15
```

- `airlines-search` → **HTTP 200 com award real**: PET→CGH direto (0 paradas),
  `SMILES` **31.700 milhas** (+ taxas), `MONEY` R$ 609,90.
- Mesma URL que dava **ERR_FAILED** sob Playwright agora responde 200.
- Deep-link que funciona (mesma aba): `/mfe/emissao-passagem/?adults=1&cabin=ECONOMIC&
departureDate=<epoch_ms>&tripType=2&segments=1&searchType=g3&originAirport=PET&
destinationAirport=CGH&novo-resultado-voos=true` → dispara `/v1/airlines/search`.
- Nota: automatizar o formulário react-dates do Smiles é flaky; o deep-link com o
  contrato real é o caminho estável.

**Implicação:** idem LATAM — coletar via Chrome real dirigido por CDP, em ambiente
não-datacenter (runner Node do plano).

## Conclusões

1. O endpoint e o host do coletor estão corretos, mas os params (`tripType`, formato de
   `departureDate`) divergem do fluxo real.
2. A sessão guest (`/oauth/token` 200) é obtível, mas a **busca de tarifas é bloqueada**
   mesmo em navegador real — reproduzindo o 406 de produção.
3. Como no LATAM, o bloqueio não some com warm-up nem com sessão aquecida; aparenta ser
   detecção de automação/anti-bot na camada de busca.

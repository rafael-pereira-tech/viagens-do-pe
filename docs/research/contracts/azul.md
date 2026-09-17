# Contrato observado — Azul (voeazul.com.br)

Descoberta via runner CDP (Chrome real). Ainda **não** capturamos o XHR de
`availability` (o form em gaveta precisa de mais trabalho), mas o retrato estratégico
está claro.

## Run 2026-09-15 — CDP em Chrome real

Comando:

```
pnpm discover -- --source=azul --cdp=http://127.0.0.1:9222 \
  --origin=PET --destination=VCP --date=2026-10-16
```

### O que confirmamos

- **Não é bloqueio de automação diferente dos outros:** o site carrega normalmente via
  CDP, com várias chamadas de sessão/token retornando **200/204** (guest, sem login).
  Mesma história de LATAM/Smiles — CDP + Chrome real deve destravar a coleta.
- **Azul tem pontos E dinheiro na mesma busca.** O i18n da home expõe o toggle
  `firstButtonLabel: "...pontos"` / `secondButtonLabel: "Continuar em reais"`. Ou seja,
  dá pra coletar milhas (TudoAzul) e cash alternando o modo de preço.
- **Aba de voos ("Voos") já vem ativa** por padrão (`aria-selected="true"`).
- **Botão de busca:** texto "Buscar passagens".
- **Sem login necessário** para a busca (tokens guest fluem 200).

### Seletores da home (widget de busca)

- Origem: `input[role="combobox"][aria-label="Origem"]` (`data-cy="autocomplete-desktop-input"`).
- Destino: `input[role="combobox"][aria-label="Destino"]`.
- Datas: `input[aria-label^="Datas"]` (padrão ida-e-volta).
- Os campos abrem **drawer** de autocomplete (i18n tem `drawerTitle`); o input só fica
  interativo depois de abrir a gaveta — automação genérica não basta.

## Run 2026-09-15 (2) — contrato confirmado (manual + CDP) — RESOLVIDO

Busca manual do usuário + validação via CDP fecharam o contrato. **Cash e pontos
funcionam guest (sem login).**

### Deep-link de resultados (estável)

Veio no próprio response (`data.deepLinks[].url`, tipo `MetaSearch`):

```
https://www.voeazul.com.br/br/pt/home/selecao-voo?c[0].ds=PET&c[0].std=MM/DD/YYYY&c[0].as=VCP&p[0].t=ADT&p[0].c=1&p[0].cp=false&f.dl=3&f.dr=3&cc=BRL
```

- `c[0].ds`/`c[0].as`: origem/destino (IATA). `c[0].std`: data **MM/DD/YYYY** (barras literais).
- `p[0].t=ADT`, `p[0].c`: pax. `f.dl`/`f.dr`: dias flexíveis (±3).
- **`cc=BRL` = dinheiro, `cc=PTS` = pontos TudoAzul** — o toggle é só esse parâmetro.
- A SPA dispara `POST .../availability` (b2c-api). **Importante:** num perfil frio o POST
  falha (`ERR_FAILED` → modal "Ops! Tivemos um problema") porque o token/sessão ainda não
  está pronto; **basta 1 reload** (token já aquecido) que o POST volta 200. O runner faz
  esse retry automaticamente.

### Schema — CASH (`cc=BRL`)

- `data.trips[].fareInformation`: `{ lowestAmount, highestAmount }` (BRL).
- `data.trips[].journeys[].fares[]`: `productClass` (`F+`=Azul, `PR`=Mais Azul),
  `classOfService`, `lowestFare`, `key`, `paxFares[]` → `{ totalAmount, originalAmount,
paxType, currencyCode, discount }`.
- Ex.: PET→VCP AD2833, Azul **R$ 342,64**, Mais Azul **R$ 475,14**.

### Schema — PONTOS (`cc=PTS`)

- `data.trips[].fareInformation`: `{ lowestPoints, highestPoints }`.
- `fares[].paxPoints[].levels[]`: `points.amount` (base), `points.discountedAmount`
  (com desconto Clube TudoAzul, `restriction: DiscountForContactPax`), `taxesAndFees`,
  `convenienceFee`, `totalMoney` (BRL a pagar junto), `currencyCode`.
- Ex.: PET→VCP **18.000 pts** base → **16.200 pts** (clube) + **R$ 88,53** (48,63 taxa +
  39,90 conveniência). Há vários `amountLevel` (tiers de pontos).

### Identificação de voo (ambos)

`journeys[].identifier`: `carrierCode` (AD), `flightNumber`, `std`/`sta`, `duration`;
`segments[].legs[].legInfo`: `capacity`/`remainingSeats`. `flexibleDays` = calendário de
datas vizinhas.

## Implicação — RESOLVIDO

Azul: coletar via **Chrome real por CDP**, guest, sem login, deep-link `selecao-voo`
com `cc=BRL|PTS`, +1 reload pra aquecer o token. Cash e pontos (com preço de clube)
disponíveis sem conta. **As 3 fontes estão provadas 200 via CDP.**

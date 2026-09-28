# Destinos alcançáveis a partir de PET via LATAM (conexão em GRU)

Pesquisa exploratória: o que dá para alcançar **no mesmo dia** saindo de Pelotas (PET) no voo noturno LATAM para Guarulhos (GRU), com bilhete **through** PET→destino (cash OW).

## Âncora operacional

| Campo          | Valor                      |
| -------------- | -------------------------- |
| Voo âncora     | **LA3251** PET→GRU         |
| Partida PET    | **19:10**                  |
| Chegada GRU    | **21:10** (T2)             |
| Data amostrada | **sexta-feira 2026-09-25** |
| Produto        | LATAM cash OW Economy      |
| Hub            | GRU                        |

### Critérios de “alcançável” (validação LATAM)

1. Origem da busca = **PET** (não GRU→destino isolado)
2. Exatamente **1 parada**
3. Conexão no hub **GRU**
4. Tempo de conexão em GRU **≤ 4h** (e tipicamente ≥ ~1h doméstico / ~2h intl no schedule)
5. Partida PET entre **18:00–20:30** (faixa do LA3251)

### Fontes usadas

| Fonte                                                                             | Papel                                              |
| --------------------------------------------------------------------------------- | -------------------------------------------------- |
| [FR24 PET departures](https://www.flightradar24.com/airport/pet/departures)       | Confirma LA3251 19:10→21:10                        |
| [FR24 GRU departures](https://www.flightradar24.com/data/airports/gru/departures) | Mapa de partidas LATAM na noite (schedule)         |
| FlightConnections (GRU / LATAM)                                                   | Contexto de rede (opcional)                        |
| LATAM `oferta-voos` via CDP                                                       | Preço + segmentos + duração real do through ticket |

Script: [`scripts/research/validate-gru-connections.ts`](../scripts/research/validate-gru-connections.ts)  
Artefato batch 1: [`scripts/research/out/pet-beyond-1stop-4h-2026-09-25.json`](../scripts/research/out/pet-beyond-1stop-4h-2026-09-25.json)  
Artefato batch 2: [`scripts/research/out/pet-beyond-1stop-4h-2026-09-25-batch2.json`](../scripts/research/out/pet-beyond-1stop-4h-2026-09-25-batch2.json)

## Mapa mental

```text
PET ──LA3251──► GRU 21:10
                 │
     conexão ≤4h │  (1 parada no bilhete)
                 ▼
        destinos BR / intl na onda noturna LATAM
```

## Internacionais validados (cash, 25/09/2026)

Todos com 1 parada PET→GRU→destino e conexão GRU ≤4h.

| Destino           | Voos          | Conexão GRU | Duração total | Chegada dest |        Preço |
| ----------------- | ------------- | ----------- | ------------- | ------------ | -----------: |
| **SCL** Santiago  | LA3251+LA610  | 2h20        | 8h40          | 03:50+1      | **R$ 1.489** |
| **BOG** Bogotá    | LA3251+LA4908 | 2h35        | 10h45         | 03:55+1      | **R$ 1.840** |
| **LHR** Londres   | LA3251+LA8084 | 2h40        | 15h55         | 15:05+1      |     R$ 4.279 |
| **FRA** Frankfurt | LA3251+LA8070 | 2h30        | 16h15         | 16:25+1      |     R$ 5.440 |
| **MIA** Miami     | LA3251+LA8190 | 2h20        | 12h50         | 07:00+1      |     R$ 5.840 |

### Intl no FR24 mas fora do MCT 2h (não validados como “boa conexão”)

Partem de GRU cedo demais após 21:10 se exigirmos ≥2h: **MVD** (~22:35), **LIS** (~22:45), **JFK** (~22:50), **MAD** (~23:00).

## Domésticos validados — batch 1 (cash, 25/09/2026)

| Destino                | Voos          | Conexão GRU | Duração | Chegada |        Preço |
| ---------------------- | ------------- | ----------- | ------- | ------- | -----------: |
| **BSB** Brasília       | LA3251+LA3656 | 1h35        | 5h15    | 00:25+1 | **R$ 1.786** |
| **CWB** Curitiba       | LA3251+LA4708 | 1h50        | 4h55    | 00:05+1 | **R$ 1.798** |
| **BEL** Belém          | LA3251+LA3872 | 1h10        | 6h45    | 01:55+1 | **R$ 1.864** |
| **FOR** Fortaleza      | LA3251+LA3324 | 2h10        | 7h35    | 02:45+1 | **R$ 1.964** |
| **POA** Porto Alegre   | LA3251+LA3426 | 2h20        | 6h05    | 01:15+1 |     R$ 2.094 |
| **CNF** Belo Horizonte | LA3251+LA4544 | 1h50        | 5h00    | 00:10+1 |     R$ 2.480 |
| **MAO** Manaus         | LA3251+LA4545 | 1h45        | 7h40    | 01:50+1 |     R$ 2.792 |
| **GYN** Goiânia        | LA3251+LA3546 | 1h15        | 4h55    | 00:05+1 |     R$ 2.979 |
| **SSA** Salvador       | LA3251+LA4674 | 2h25        | 6h45    | 01:55+1 |     R$ 3.085 |
| **GIG** Rio (Galeão)   | LA3251+LA3352 | 1h30        | 4h30    | 23:40   |     R$ 3.848 |

> **Nota:** na primeira varredura sem filtro de conexão, alguns destinos (ex.: GIG, CNF) apareciam mais baratos com **2 paradas**. Com o critério “1 stop + ≤4h em GRU”, o preço through sobe nesses casos.

## Domésticos validados — batch 2 (cash, 25/09/2026)

Todos os 10 destinos do batch **bateram** o filtro (1 stop + GRU ≤4h + PET 18:00–20:30). Nenhum sem match.

| Destino               | Voos          | Conexão GRU | Duração | Chegada |        Preço |
| --------------------- | ------------- | ----------- | ------- | ------- | -----------: |
| **CGB** Cuiabá        | LA3251+LA3566 | 2h35        | 6h55    | 01:05+1 | **R$ 1.709** |
| **CGR** Campo Grande  | LA3251+LA3119 | 2h35        | 6h25    | 00:35+1 | **R$ 2.231** |
| **SLZ** São Luís      | LA3251+LA3294 | 2h10        | 7h30    | 02:40+1 |     R$ 2.612 |
| **MCZ** Maceió        | LA3251+LA3198 | 2h05        | 6h55    | 02:05+1 |     R$ 2.794 |
| **NAT** Natal         | LA3251+LA3444 | 2h10        | 7h25    | 02:35+1 |     R$ 3.089 |
| **AJU** Aracaju       | LA3251+LA3224 | 2h20        | 6h55    | 02:05+1 |     R$ 3.095 |
| **JPA** João Pessoa   | LA3251+LA4726 | 1h30        | 6h40    | 01:50+1 |     R$ 3.197 |
| **IGU** Foz do Iguaçu | LA3251+LA3206 | 1h10        | 4h55    | 00:05+1 |     R$ 3.200 |
| **FLN** Florianópolis | LA3251+LA3308 | 1h20        | 4h35    | 23:45   |     R$ 3.390 |
| **VIX** Vitória       | LA3251+LA3336 | 1h50        | 5h15    | 00:25+1 |     R$ 3.816 |

### Domésticos FR24 ainda não validados

Outros vistos no board FR24 (candidatos futuros): NVT, JDO, VDC, SJP, RAO, THE, UDI, LDB, MGF, PNZ, PMW, BPS, IMP.

## Destaques de produto

- **Melhor custo/benefício intl:** SCL e BOG (~R$1,5–1,8k) com conexão ~2h20–2h35.
- **Melhor custo/benefício BR (batch 1):** BSB, CWB, BEL, FOR (~R$1,8–2,0k).
- **Melhor custo/benefício BR (batch 2):** CGB (~R$1,7k) e CGR (~R$2,2k); Centro-Oeste sai bem neste sample.
- **GIG / VIX through 1-stop** na noite saem caros (~R$3,8k); vale comparar com PET→CGH/SDU via outras cias ou 2 paradas.
- FR24 = **schedule**; LATAM = **inventário vendável**. Os dois precisam bater.

## Como reproduzir

```bash
# Batch 1 (intl + top 10 BR) — já rodado
pnpm exec tsx scripts/research/validate-gru-connections.ts \
  --cdp=http://127.0.0.1:9222 --date=2026-09-25

# Batch 2 (mais 10 domésticos)
pnpm exec tsx scripts/research/validate-gru-connections.ts \
  --cdp=http://127.0.0.1:9222 --date=2026-09-25 \
  --dests=FLN,NAT,MCZ,VIX,IGU,CGR,CGB,SLZ,AJU,JPA \
  --out-suffix=batch2
```

## Limitações

- Amostra de **um** dia (sexta). Grade PET→GRU é tipicamente Mon/Wed/Fri (e variações sazonais).
- Preços oscilam; revalidar perto da compra.
- Estimativas FR24 no board estavam ~+20 min; conexão “no papel” pode apertar na operação.
- Não inclui milhas / Premium Business nesta rodada.

## Próximos passos sugeridos

1. Rodada **milhas** (LATAM Pass) no mesmo set (batch 1 + 2)
2. Expandir restantes do FR24 (NVT, JDO, VDC, etc.)
3. Opcional: comparar PET→GIG / VIX baratos com 2 paradas vs 1 stop

---

_Última atualização: 2026-09-21 — batch 1 e batch 2 validados (10/10 matches no batch 2)._

# pelotas-trips.app — spec de design (handoff v2)

Fonte: canvas "pelotas-trips.app — theme" no Claude Design (4 pranchas: theme sheet, rota em 390 / 834 / 1280).
Este arquivo é o contrato que o código deve seguir. Referências visuais em `reference/` (HTML das pranchas). PRD: "Viagens do PE — PRD v2.0".

## 1. Direção

Painel de embarque + cartão de embarque sobre o Pereira UI (shadcn/ui new-york-v4). Calmo, mobile-first, o preço é o herói.

- Base **Zinc** (light padrão, dark por `[data-theme="zinc-dark"]` ou `.dark`).
- Accent **Blue** (`data-accent="blue"` no `<html>`): a única coisa azul da tela é a ação principal ("Buscar na LATAM") e a escala de preço.
- **Orange** aparece só como (a) a marca (roundel "PET" com `data-accent="orange"` escopado) e (b) o âmbar do painel (`--board-amber` = `orange-chart-1`).
- Nunca hex hard-coded em componente: sempre token semântico (`bg-primary`, `text-muted-foreground`, `bg-price-1`…). Tudo em OKLCH — `theme.css`.

## 2. Tipografia

| Uso | Família | Regras |
| --- | --- | --- |
| Tudo (UI, corpo, títulos) | Geist (`font-sans`) | `tabular-nums` global. h1 36/40 800 −0.025em (preço-herói e título de página), h2 24/32 600, h4 20/28 600, body 14/20, caption 12/16. |
| IATA, horários, metadados | Geist Mono (`font-mono`) | `.pt-iata` (600, caixa alta, +8% tracking) para códigos; `.pt-meta` (11px, 500, caixa alta, +6%) para "VISTO HÁ 3 H", rótulos de campo, cabeçalhos de coluna. Horários 500. |
| Painel de embarque | Doto (`font-board`, `.pt-flap`) | 800, caixa alta, +5% tracking. **Só dentro do painel e na faixa preta do cartão de embarque.** Nunca em corpo de texto. Fallback: Geist Mono. |

Fontes: `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, Doto via `@fontsource-variable/doto` (ou Google Fonts `Doto:wght@100..900` se preferir). Carregar com `font-display: swap`.

## 3. Tokens de extensão (além do Pereira UI)

Definidos em `theme.css`, mapeados no `@theme inline` como `--color-*`.

- `board`, `board-foreground`, `board-muted`, `board-border`, `board-amber`, `board-amber-foreground`, `board-row-selected` — superfície do painel. No light é a única superfície escura; no dark é mais fundo que `background`. Trama de pontos via `.pt-board`.
- `price-1…5` (+ `-foreground`) — escala sequencial do calendário. **1 = mais barato = mais saturado** (azul cheio, texto claro); 5 = mais caro = sem preenchimento, texto `muted-foreground`, borda `border`. Faixas por padrão: ≤ p20 → 1, ≤ p40 → 2, ≤ p60 → 3, ≤ p80 → 4, resto → 5, calculadas sobre os menores preços diários do período filtrado (nunca limites fixos em R$ — os do mockup eram amostra).
- `airline-latam`, `airline-gol`, `airline-azul` — só em ponto de 8px + nome, ou texto. Nunca em preenchimento de célula (competiria com a escala).
- `fresh` (ponto verde "atualizado há 2 h"), `--stale-opacity` (0.55 light / 0.5 dark) para preço com > 48 h.

## 4. Motivos

### 4.1 Painel de embarque (= seletor de rota)
Substitui tabs de destino. Uma faixa escura (`.pt-board`, `text-board-foreground`) com:
1. Título em `.pt-flap` âmbar: **PARTIDAS** ou **CHEGADAS**, ícone de avião num retângulo âmbar 30×24 (radius 4) à esquerda; à direita, toggle de direção (dois botões `.pt-meta`, ativo = fundo âmbar / texto `board-amber-foreground`, inativo = transparente / `board-muted`; `aria-pressed`).
2. Cabeçalho de colunas em `.pt-meta` `board-muted`, hairline `board-border` embaixo: DESTINO (ou ORIGEM) · CIA · MÍN · MÉD (390) — + MÁX · MAIS BARATO (834) — + COLETA (1280).
3. Uma linha por rota (`<button role="radio">` dentro de `role="radiogroup"`), 44–50px de altura, `.pt-flap` 16/18/20px, IATA + cidade em 12–14px a 80%; hairline entre linhas; **selecionada = texto `board-amber` + fundo `board-row-selected`**, radius 4.
4. Uma linha de rodapé 12px `board-muted` explicando a métrica.
Rotas na v2.0: GRU (LATAM), CGH (GOL), VCP (Azul), POA (Azul). Ordem = a do `routes.priority`.

### 4.2 Cartão de embarque (= detalhe do dia)
Card `bg-card border border-border rounded-xl shadow-sm`, `overflow: visible`:
1. Faixa preta no topo (`bg-board`, cantos superiores `rounded-xl`): "CARTÃO DE EMBARQUE" em `.pt-flap` âmbar 13–15px; à direita ponto + nome da cia.
2. Rota: IATA origem/destino `.pt-iata` 28–34px com cidade 11–12px `muted-foreground` embaixo; entre eles linha tracejada `border` + ícone de avião 14–16px.
3. Grid 3 colunas de campos de bilhete: rótulo `.pt-meta` 10px `muted-foreground` sobre valor 13–15px (`font-mono` 500 para DATA/PARTIDA/CHEGADA; sans 500 para CIA/PARADAS/VISTO). VISTO é campo fixo — frescor nunca fica só em tooltip.
4. Bloco de preço (hairline `border` acima): rótulo "MENOR PREÇO DO DIA · TARIFA + TAXAS", valor h1 tabular, `Badge secondary` com a posição vs mediana ("Abaixo da mediana" etc.), régua da faixa (barra 6px `linear-gradient(price-1 → price-3 45% → price-4)`, marcador 16px `bg-card border-2 border-foreground` em `left: (preço − mín)/(máx − mín)`), uma linha de nota 12px.
5. Picote: `border-top: 1px dashed border` com dois furos (círculos 18px `bg-background border border-border`, centrados na borda do card).
6. Canhoto: rota `.pt-iata` 13–15px · data mono · preço 700; código de barras decorativo (`.pt-barcode`, 36–40px, `aria-hidden`); `Button size="lg"` "Buscar na {cia}" com ícone external-link, largura total no mobile.
Fora do cartão, embaixo: outras ofertas do dia (linha por oferta, borda `border`, radius md) e "Variação desde {data}" (bloco `bg-muted`, sparkline SVG 2px `stroke-primary`, mín/máx vistos).

### 4.3 Calendário
`role="grid"`, cabeçalho D S T Q Q S S (390) / Dom…Sáb (834+) em `.pt-meta`. Células `<button>` 48px (390) / 58px (834) / 64px (1280), radius md, gap 4–6px; número do dia 11–12px a 75%, preço 12–15px 600 (`R$ 489` só no desktop, `489` nos menores). Estados:
- preço → `bg-price-N text-price-N-foreground` (N=5 ganha `border border-border`)
- selecionado → `box-shadow: 0 0 0 2px var(--foreground)`
- > 48 h → `opacity: var(--stale-opacity)` + "visto há mais de 48 h" no `aria-label`
- **sem voo** → "—", `border border-border`, `text-muted-foreground`
- **sem dado** → "·", `.pt-nodata` + `border-dashed`
- > 7 dias → some (regra do PRD)
`aria-label` da célula: "Qua 14, R$ 389". Legenda embaixo: barato / normal / caro / — sem voo / ▨ sem dado / esmaecido = > 48 h.

### 4.4 Marca
Roundel 28–30px: `border-[1.5px] border-primary text-primary` com "PET" em `font-mono` 8–9px 700, dentro de `data-accent="orange"`; wordmark "pelotas‑trips" 600 + ".app" `muted-foreground` 500. Rodapé: "Feito em Pelotas · preços de LATAM, GOL e Azul · não vendemos passagem." + coleta/status por fonte em `.pt-meta`.

## 5. Layout por largura

| Largura | Layout |
| --- | --- |
| 390 (mobile) | Tudo empilhado: barra 56px → painel (full-bleed) → chips de filtro (scroll horizontal) → mês → calendário → cartão → outras ofertas → variação → rodapé. Padding lateral 16px. |
| 834 (tablet) | Painel full-bleed com 6 colunas; abaixo, grid `1fr 300px`: calendário à esquerda, cartão + blocos à direita. Padding 24px. |
| 1280 (desktop) | Container 1184px centrado; barra 64px com nav (Rotas a partir de PET · Como medimos · Sobre); painel como card `rounded-2xl` com 7 colunas; grid `1fr 400px`. |

Container queries para o cartão (`@container`), não media queries por página. View Transitions entre rota e dia; `@starting-style` nas entradas; `prefers-reduced-motion` respeitado.

## 6. Componentes Pereira UI usados como vêm

`Button` (default = a única ação azul; `outline`/`secondary` para chips de filtro; `ghost size="icon"` para navegação de mês, sempre com `aria-label`), `Badge` (`secondary` para posição vs mediana; `destructive` para "Fonte falhou" — a palavra carrega o significado), `Tabs variant="line"` (só na theme sheet; na tela o painel substitui), `Card`, `Skeleton` (skeleton com o tamanho final do calendário: 5 linhas × altura de célula).

## 7. Acessibilidade e performance (do PRD, já desenhados)

- Alvos ≥ 44px; contraste ≥ 4.5:1 (3:1 a partir de 24px). `price-2` usa texto escuro no light por isso.
- Calendário navegável por teclado (setas entre células, Enter abre o dia), `role="grid"`/`gridcell` ou botões com `aria-label` completo.
- Sem status bar falsa, sem emoji como UI; ícones lucide 16px, `currentColor`.
- LCP < 2,0 s: painel e calendário renderizados no servidor; fontes com `swap`; Doto só nos nós do painel.

## 8. O que era amostra no mockup

Preços de outubro, ofertas (06:15 → 08:05 etc.), "mín/máx vistos" e a variação são dados de exemplo. Os limites da escala de preço no mockup (≤ 450, ≤ 560…) eram fixos só para desenhar — no código, percentis do período (seção 3).

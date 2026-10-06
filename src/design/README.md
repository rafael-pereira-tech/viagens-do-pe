# src/design — marca satolep-trips no código

Esqueleto do design system da marca (direção **Painel**) sobre o tema shadcn/Pereira UI. Fonte visual: `docs/design/DESIGN.md` §4.4 e o canvas "Marca satolep-trips".

## O que tem

| Arquivo                      | Papel                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `brand.css`                  | Tokens da marca (`--board*`, `--board-amber`, `--fresh`) mapeados em `@theme inline` (`bg-board`, `text-board-amber`…) e utilities `pt-iata`, `pt-meta`, `pt-flap`, `pt-board`, `pt-tile`, `pt-tile-hy`, `pt-tile-on-board`, `pt-tile-skeleton`, `pt-tile-flip`. Aditivo: não altera os tokens semânticos do tema atual. Importado em `src/index.css`. |
| `tokens.ts`                  | Os mesmos valores em JS (oklch + hex), fontes, geometria da placa (`tileGeometry`, `brandMarkWidth`) e textos fixos da marca. Para OG, Instagram, e-mail e testes.                                                                                                                                                                                     |
| `components/Tile.tsx`        | `Tile` (uma placa; `"-"` vira a placa invertida) e `TileRow` (uma palavra em placas).                                                                                                                                                                                                                                                                  |
| `components/BrandMark.tsx`   | O logo: link para `/`, `aria-label`, placas decorativas, `size` sm/md, `compact`, `onBoard`, `flip`, skeleton até a Doto carregar.                                                                                                                                                                                                                     |
| `components/Board.tsx`       | `Board` (superfície do painel), `BoardHeader`, `FlapTitle` (Doto âmbar, só dentro do painel), `Iata`, `Meta`.                                                                                                                                                                                                                                          |
| `components/BrandFooter.tsx` | Rodapé com o nome em texto e frescor por fonte (ponto + palavra).                                                                                                                                                                                                                                                                                      |

Fontes: `@fontsource-variable/doto`, `geist` e `geist-mono`, importadas em `src/main.tsx` com `font-display: swap`.

## Regras que o código não pode quebrar

- Doto só em `pt-flap` dentro de `bg-board`/`pt-board`, nas placas e na faixa do cartão de embarque. Nunca em texto, nunca abaixo de 14px.
- A placa do hífen é sempre invertida (`pt-tile-hy`). A proporção 3:4 e a linha a 50% não mudam.
- O azul é da ação (botão principal, escala de preço). Não entra no logo.
- Rodapé, e-mails e títulos de aba usam o nome em texto: `satolep-trips`, minúsculo, hífen normal.
- Frescor e erro de fonte levam ponto **e** palavra ("Azul falhou"); a cor nunca carrega o significado sozinha.

## Uso

```tsx
import { BrandMark, Board, BoardHeader, BrandFooter } from '@/design'

<BrandMark size="sm" />                      // barra 56px
<BrandMark size="md" flip />                 // barra 64px, anima uma vez
<BrandMark compact />                        // menos de 200px disponíveis

<Board className="p-4">
  <BoardHeader title="Partidas" meta="Pelotas · PET" icon={<Plane />} />
</Board>

<BrandFooter sources={[{ name: 'LATAM', at: '02:10' }, { name: 'Azul', ok: false }]} />
```

Com react-router: `<BrandMark as={Link} href="/" />` (o `href` vira `to`).

## Próximos passos

- Migrar o tema para Zinc/OKLCH (`docs/design/theme.css`) na v2; este arquivo já usa OKLCH e não depende disso.
- `DepartureBoard`, `PriceCalendar` e `BoardingPass` (DESIGN.md 4.1–4.3) entram aqui quando a v2 começar.
- Mover para `packages/ui` quando o monorepo existir.

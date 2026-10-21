# docs/design/instagram — templates na marca satolep-trips

HTML em 1080px renderizado em PNG 2x com Playwright, no mesmo esquema de `docs/research/instagram`, mas na identidade Painel (placas em Doto, Geist, painel escuro / papel). Fontes vêm do `node_modules` (`@fontsource-variable`), sem rede.

```bash
pnpm install                                   # já traz @playwright/test e as fontes
node docs/design/instagram/render.mjs          # lê data.json, escreve out/*.png
node docs/design/instagram/render.mjs --data=outro.json --out=out-outro
```

| Arquivo | Papel |
| --- | --- |
| `template.html` | As peças: `post-1-capa`, `post-2-brasil`, `post-3-exterior`, `post-4-como-funciona` (1080 × 1080) e `story-sabado` (1080 × 1920). Cada `[data-slide]` vira um PNG. Texto e listas entram por `data-text`, `data-rows`, `data-codes`, `data-steps`. |
| `data.json` | Conteúdo do post: handle, textos, destinos, preços. Muda aqui, não no HTML. |
| `render.mjs` | Injeta `data.json` em `window.DATA`, espera as fontes e fotografa cada peça. |
| `legenda.md` | Legenda, horário e plano de publicação do sábado. |
| `out/` | PNGs prontos para subir. |

Regras da marca que valem aqui: Doto só nas placas e em títulos sobre o painel; preço sempre com data da amostra; "não vendemos passagem" em toda peça; o @ é o único lugar com ponto no nome (o Instagram não aceita hífen).

## D0 do "Aonde dá pra chegar" (`d0/`)

Três stories e o carrossel de 5 pranchas do lançamento, na paleta nova (painel `#18181b`, âmbar `#ffb86a`).

```bash
node docs/design/instagram/render.mjs --template=d0/template.html   # escreve d0/out/*.png
```

Os prints entram por `assets/` com estes nomes: `phone-dark-mapa-tudo.png` (story 1), `phone-dark-popup-scl.png` (story 3) e `desktop-dark-mapa-tudo.png` (capa do carrossel, a 60 %). Sem o arquivo, os stories mostram um aviso no lugar do celular e a capa usa um mapa desenhado com as rotas citadas no carrossel.

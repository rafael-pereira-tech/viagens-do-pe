# Prompt para o Claude Code

Copie o bloco abaixo como primeira mensagem, com a pasta `design/` já dentro do repo (sugestão: `packages/ui/design/` no monorepo da v2, ou `design/` na raiz enquanto a v2 não existe).

---

Lê `design/DESIGN.md` inteiro antes de escrever código — é o contrato visual do app. Depois:

1. Substitui o tema do `src/index.css` pelo `design/theme.css` (Tailwind v4 + shadcn/ui new-york-v4, tokens OKLCH, `data-theme`/`data-accent` no `<html>`). Instala `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` e `@fontsource-variable/doto`. Roda o app e confirma que os componentes shadcn existentes continuam iguais em light e dark.
2. Cria os componentes novos, nesta ordem, cada um com teste no Vitest e story/preview simples: `DepartureBoard` (seletor de rota, seção 4.1), `PriceCalendar` (seção 4.3, incluindo estados sem voo / sem dado / > 48 h e navegação por teclado), `BoardingPass` (seção 4.2), `BrandMark` (4.4). Use `design/reference/*.dc.html` como referência de medidas e hierarquia — o markup lá é de mockup, não copie o JS.
3. Monta a página `/voos/:rota` com os três layouts da seção 5 usando container queries; estado (rota, direção, mês, dia) na URL como na v1.
4. Ao final, roda `lint`, `typecheck`, `test` e me mostra screenshots em 390, 834 e 1280 (Playwright) em light e dark, lado a lado com as referências.

Regras que não podem quebrar: nenhuma cor hard-coded (só tokens), Doto só dentro do painel e da faixa do cartão, cor de companhia só em ponto/texto, valor do preço sempre escrito ao lado da cor, alvos ≥ 44px, contraste AA.

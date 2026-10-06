/**
 * Tokens da marca satolep-trips (direção Painel) em JS, para quem não lê CSS:
 * renderizadores de imagem (OG, Instagram), e-mails e testes.
 * A fonte da verdade visual é brand.css + docs/design/DESIGN.md §4.4.
 */

export const BRAND_NAME = 'satolep-trips'
export const BRAND_DOMAIN = 'satolep-trips.app'
export const BRAND_WORD = 'SATOLEP-TRIPS'
export const BRAND_HANDLE = '@satolep.trips'
export const BRAND_TAGLINE = 'Partidas e chegadas de Pelotas.'
export const BRAND_DISCLAIMER = 'não vendemos passagem'
export const BRAND_FOOTER = `${BRAND_DOMAIN} · Feito em Pelotas · preços de LATAM, GOL e Azul · ${BRAND_DISCLAIMER}.`

export const colors = {
  board: { oklch: 'oklch(0.21 0.006 285.885)', hex: '#18181B' },
  boardTile: { oklch: 'oklch(0.17 0.006 285.885)', hex: '#121214' },
  boardAmber: { oklch: 'oklch(0.837 0.128 66.29)', hex: '#FDBA74' },
  boardAmberForeground: { oklch: 'oklch(0.17 0.006 285.885)', hex: '#121214' },
  boardMuted: { oklch: 'oklch(0.75 0.012 286)', hex: '#B4B4BC' },
  boardBorder: { oklch: 'oklch(1 0 0 / 14%)', hex: '#FFFFFF24' },
  paper: { oklch: 'oklch(1 0 0)', hex: '#FFFFFF' },
  ink: { oklch: 'oklch(0.141 0.005 285.823)', hex: '#09090B' },
  /** azul da ação: botão e escala de preço. Nunca no logo. */
  action: { oklch: 'oklch(0.488 0.243 264.376)', hex: '#1D4ED8' },
  fresh: { oklch: 'oklch(0.55 0.15 160)', hex: '#1F8A5B' },
} as const

export const fonts = {
  sans: "'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif",
  mono: "'Geist Mono Variable', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  /** Só nas placas, nos títulos do painel e na faixa do cartão de embarque. Nunca em texto. */
  board: "'Doto Variable', 'Doto', 'Geist Mono Variable', ui-monospace, monospace",
} as const

/** Geometria da placa, tudo relativo à altura (u). */
export const tile = {
  widthRatio: 0.75,
  radiusRatio: 0.09,
  gapRatio: 0.09,
  glyphRatio: 0.62,
  /** linha a 50%: 1px até 48px de altura, 2px acima */
  lineAt: 0.5,
  lineAlpha: 0.6,
  hyphenLineAlpha: 0.3,
  /** ícone/avatar: a placa do hífen quadrada */
  symbolRadiusRatio: 0.22,
  /** tamanhos oficiais do BrandMark */
  sizes: { sm: 20, md: 24 },
  /** abaixo disso o nome vai em texto */
  minHeight: 16,
  minStackedHeight: 20,
  minSymbol: 12,
} as const

export type TileGeometry = {
  height: number
  width: number
  radius: number
  gap: number
  fontSize: number
  lineHeight: number
}

/** Medidas em px de uma placa com altura `h`. */
export function tileGeometry(h: number): TileGeometry {
  return {
    height: h,
    width: Math.round(h * tile.widthRatio),
    radius: Math.max(2, Math.round(h * tile.radiusRatio)),
    gap: Math.max(1, Math.round(h * tile.gapRatio)),
    fontSize: Math.round(h * tile.glyphRatio),
    lineHeight: h > 48 ? 2 : 1,
  }
}

/** Largura total do nome em placas de altura `h` (13 placas + 12 vãos). */
export function brandMarkWidth(h: number, word: string = BRAND_WORD): number {
  const g = tileGeometry(h)
  return word.length * g.width + (word.length - 1) * g.gap
}

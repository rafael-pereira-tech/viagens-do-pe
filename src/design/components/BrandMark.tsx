import { useEffect, useState, type AnchorHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { BRAND_NAME, BRAND_WORD, tile } from '../tokens.ts'
import { Tile, TileRow } from './Tile.tsx'

export type BrandMarkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
  /** sm = 20px (390/834), md = 24px (1280) */
  size?: keyof typeof tile.sizes
  /** com menos de 200px disponíveis: símbolo + nome em Geist */
  compact?: boolean
  /** placas sobre uma superfície bg-board */
  onBoard?: boolean
  /** vira as placas uma vez ao montar (só na home) */
  flip?: boolean
  /** componente de link (ex.: Link do react-router). Padrão: <a>. */
  as?: React.ElementType
}

function useBoardFontReady() {
  const [ready, setReady] = useState(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return true
    return document.fonts.check('800 20px "Doto Variable"') || document.fonts.check('800 20px Doto')
  })
  useEffect(() => {
    if (ready || typeof document === 'undefined' || !('fonts' in document)) return
    let alive = true
    Promise.all([document.fonts.load('800 20px "Doto Variable"'), document.fonts.load('800 20px Doto')])
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [ready])
  return ready
}

/**
 * O nome como uma linha do painel de partidas (DESIGN.md §4.4).
 * É um link para "/" com aria-label; as placas são decorativas.
 */
export function BrandMark({
  size = 'sm',
  compact,
  onBoard,
  flip,
  as: Comp = 'a',
  className,
  href = '/',
  ...rest
}: BrandMarkProps) {
  const h = tile.sizes[size]
  const ready = useBoardFontReady()
  const linkProps = Comp === 'a' ? { href } : { to: href }
  return (
    <Comp
      aria-label={`${BRAND_NAME}, início`}
      data-slot="brand-mark"
      className={cn(
        'inline-flex min-h-11 items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...linkProps}
      {...rest}
    >
      {compact ? (
        <span className="inline-flex items-center gap-2">
          <Tile
            char="-"
            size={24}
            className="aspect-square w-6 rounded-[5px]"
            style={{ '--tile': '24px', width: 24 } as React.CSSProperties}
          />
          <span className="text-base font-semibold tracking-tight text-foreground">{BRAND_NAME}</span>
        </span>
      ) : (
        <TileRow word={BRAND_WORD} size={h} onBoard={onBoard} skeleton={!ready} flip={flip && ready} />
      )}
    </Comp>
  )
}

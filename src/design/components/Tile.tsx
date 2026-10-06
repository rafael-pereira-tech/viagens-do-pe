import type { CSSProperties, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { tileGeometry } from '../tokens.ts'

export type TileProps = HTMLAttributes<HTMLSpanElement> & {
  /** o caractere da placa; "-" vira a placa invertida */
  char: string
  /** altura em px (u). Padrão 20. */
  size?: number
  /** placa sobre a superfície do painel (bg-board): usa a cor de placa, não a do painel */
  onBoard?: boolean
  /** skeleton enquanto a Doto não carregou */
  skeleton?: boolean
  /** índice para a animação escalonada (pt-tile-flip) */
  flipIndex?: number
}

/** Uma placa do painel. Decorativa: o texto acessível fica no pai. */
export function Tile({ char, size = 20, onBoard, skeleton, flipIndex, className, style, ...rest }: TileProps) {
  const hy = char === '-'
  const vars = { '--tile': `${size}px`, '--tile-i': flipIndex } as CSSProperties
  return (
    <span
      aria-hidden="true"
      data-slot="tile"
      data-hyphen={hy ? '' : undefined}
      className={cn(
        'pt-tile',
        hy && 'pt-tile-hy',
        onBoard && !hy && 'pt-tile-on-board',
        skeleton && 'pt-tile-skeleton',
        flipIndex !== undefined && 'pt-tile-flip',
        className,
      )}
      style={{ ...vars, ...style }}
      {...rest}
    >
      {char}
    </span>
  )
}

export type TileRowProps = HTMLAttributes<HTMLSpanElement> & {
  word: string
  size?: number
  onBoard?: boolean
  skeleton?: boolean
  /** anima as placas (uma vez) */
  flip?: boolean
}

/** Uma linha de placas. Espaços viram vãos maiores. */
export function TileRow({ word, size = 20, onBoard, skeleton, flip, className, style, ...rest }: TileRowProps) {
  const g = tileGeometry(size)
  return (
    <span
      data-slot="tile-row"
      className={cn('inline-flex items-center', className)}
      style={{ gap: g.gap, ...style }}
      {...rest}
    >
      {Array.from(word).map((ch, i) =>
        ch === ' ' ? (
          <span key={i} aria-hidden="true" style={{ width: Math.round(size * 0.3) }} />
        ) : (
          <Tile key={i} char={ch} size={size} onBoard={onBoard} skeleton={skeleton} flipIndex={flip ? i : undefined} />
        ),
      )}
    </span>
  )
}

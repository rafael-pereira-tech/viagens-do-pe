import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Superfície do painel de embarque: a única superfície escura do tema claro. */
export function Board({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="board" className={cn('pt-board rounded-2xl', className)} {...rest} />
}

export type FlapTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  /** nível do heading; o visual não muda */
  as?: 'h1' | 'h2' | 'h3' | 'span'
  /** 20–24px dentro do painel; maior só em peças de marca */
  size?: 'sm' | 'md' | 'lg'
}

const FLAP_SIZE = { sm: 'text-[18px] leading-5', md: 'text-[22px] leading-6', lg: 'text-[26px] leading-7' }

/** Título em Doto âmbar. Só dentro de <Board>; fora dele o título é h2 em Geist. */
export function FlapTitle({ as: Comp = 'h2', size = 'md', className, ...rest }: FlapTitleProps) {
  return (
    <Comp data-slot="flap-title" className={cn('pt-flap text-board-amber', FLAP_SIZE[size], className)} {...rest} />
  )
}

export type BoardHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  /** metadado à direita, em pt-meta (ex.: "Pelotas · PET") */
  meta?: ReactNode
  /** ícone num retângulo âmbar 30×24 à esquerda do título */
  icon?: ReactNode
  /** controles à direita (toggle Partidas/Chegadas) */
  actions?: ReactNode
}

/** Cabeçalho do painel: ícone âmbar, título em Doto, meta e ações. */
export function BoardHeader({ title, meta, icon, actions, className, ...rest }: BoardHeaderProps) {
  return (
    <div data-slot="board-header" className={cn('flex items-center gap-2.5', className)} {...rest}>
      {icon ? (
        <span
          aria-hidden="true"
          className="flex h-6 w-[30px] flex-none items-center justify-center rounded-[4px] bg-board-amber text-board-amber-foreground [&>svg]:size-4"
        >
          {icon}
        </span>
      ) : null}
      <FlapTitle>{title}</FlapTitle>
      {meta ? <span className="pt-meta text-board-muted">{meta}</span> : null}
      {actions ? <div className="ml-auto flex items-center gap-0.5">{actions}</div> : null}
    </div>
  )
}

/** Código IATA em mono 600, caixa alta. */
export function Iata({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="iata" className={cn('pt-iata', className)} {...rest} />
}

/** Rótulo/metadado em mono 11px, caixa alta. */
export function Meta({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="meta" className={cn('pt-meta text-muted-foreground', className)} {...rest} />
}

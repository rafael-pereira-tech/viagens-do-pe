import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { BRAND_DISCLAIMER, BRAND_DOMAIN, BRAND_NAME } from '../tokens.ts'

export type SourceStatus = {
  name: string
  /** hora da última coleta, já formatada ("02:10"); omitida quando falhou */
  at?: string
  /** false = fonte falhou: ponto destructive e a palavra "falhou" */
  ok?: boolean
}

export type BrandFooterProps = HTMLAttributes<HTMLElement> & {
  sources?: SourceStatus[]
}

/**
 * Rodapé: nome em texto (nunca placas), "Feito em Pelotas", companhias e o aviso.
 * Frescor por fonte com ponto + palavra: a cor nunca carrega o significado sozinha.
 */
export function BrandFooter({ sources, className, ...rest }: BrandFooterProps) {
  return (
    <footer
      data-slot="brand-footer"
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-4 text-[13px] leading-[18px] text-muted-foreground',
        className,
      )}
      {...rest}
    >
      <p className="m-0">
        <a href="/" className="font-bold text-foreground no-underline">
          {BRAND_NAME}
        </a>
        <span className="font-medium">{BRAND_DOMAIN.slice(BRAND_NAME.length)}</span> · Feito em Pelotas · preços de
        LATAM, GOL e Azul · {BRAND_DISCLAIMER}.
      </p>
      {sources?.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0" aria-label="Última coleta por fonte">
          {sources.map((s) => {
            const failed = s.ok === false
            return (
              <li key={s.name} className="pt-meta flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', failed ? 'bg-destructive' : 'bg-fresh')}
                />
                {s.name} {failed ? 'falhou' : s.at}
              </li>
            )
          })}
        </ul>
      ) : null}
    </footer>
  )
}

import { summarizeFreshness } from '../lib/freshness.ts'

type Props = {
  demo: boolean
  rows: { collected_at: string }[]
  isLoading: boolean
  error: string | null
  now?: number
}

export function PriceDataStatus({ demo, rows, isLoading, error, now = Date.now() }: Props) {
  const freshness = summarizeFreshness(rows, now)
  const latest =
    freshness.latest === null
      ? null
      : new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(freshness.latest)
  return (
    <aside aria-label="Sobre os preços" className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
      {demo ? (
        <>
          <p className="font-semibold text-foreground">Demonstração · dados fictícios</p>
          <p className="mt-1 text-muted-foreground">
            Explore os filtros e o gráfico com valores ilustrativos. Estes preços não são ofertas disponíveis para
            compra.
          </p>
        </>
      ) : (
        <>
          <p role="status" className="font-semibold text-foreground">
            {isLoading
              ? 'Consultando preços…'
              : error
                ? 'Não foi possível atualizar os preços.'
                : freshness.total === 0
                  ? 'Nenhum preço encontrado neste recorte.'
                  : latest
                    ? `Consulta mais recente: ${latest}`
                    : 'Horário das consultas indisponível.'}
          </p>
          {!isLoading && !error && freshness.stale > 0 && (
            <p className="mt-1 text-muted-foreground">
              {freshness.stale} de {freshness.total} preços foram consultados há mais de 12 horas.
            </p>
          )}
          {!isLoading && !error && freshness.unknown > 0 && (
            <p className="mt-1 text-muted-foreground">
              Não foi possível verificar a atualização de {freshness.unknown}{' '}
              {freshness.unknown === 1 ? 'preço' : 'preços'}.
            </p>
          )}
          <p className="mt-1 text-muted-foreground">
            Preço e disponibilidade podem mudar. Confirme na companhia antes de comprar.
          </p>
        </>
      )}
    </aside>
  )
}

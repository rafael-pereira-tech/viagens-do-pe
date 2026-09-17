import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { todayIso, type DashboardQuery } from '../lib/query.ts'
import { FIELD_LABEL } from '../lib/ui.ts'

type Draft = Pick<DashboardQuery, 'from' | 'until'>

type Props = {
  draft: Draft
  onDraftChange: (patch: Partial<Draft>) => void
  onApply: () => void
  onClear: () => void
  isLoading?: boolean
}

const dateInputClass = 'h-10 bg-card tabular-nums'

export function FiltersBar({ draft, onDraftChange, onApply, onClear, isLoading }: Props) {
  const minDate = todayIso()

  return (
    <Card size="sm" aria-label="Filtros">
      <CardContent>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            onApply()
          }}
        >
          <fieldset className="block min-w-0 flex-1">
            <legend className={`${FIELD_LABEL} mb-1`}>Janela futura</legend>
            <div className="grid max-w-sm grid-cols-2 gap-1.5">
              <Input
                type="date"
                className={dateInputClass}
                min={minDate}
                value={draft.from}
                onChange={(e) => onDraftChange({ from: e.target.value })}
                aria-label="Início da janela"
                disabled={isLoading}
              />
              <Input
                type="date"
                className={dateInputClass}
                min={draft.from || minDate}
                value={draft.until}
                onChange={(e) => onDraftChange({ until: e.target.value })}
                aria-label="Fim da janela"
                disabled={isLoading}
              />
            </div>
          </fieldset>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClear} disabled={isLoading}>
              Limpar
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={isLoading} aria-busy={isLoading || undefined}>
              {isLoading ? 'Carregando…' : 'Aplicar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

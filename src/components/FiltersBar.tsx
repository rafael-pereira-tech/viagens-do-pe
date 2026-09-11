import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'
import { FILTER_FONTES, sourceLabel } from '../lib/filters.ts'
import { todayIso, type DashboardQuery } from '../lib/query.ts'
import { FIELD_LABEL } from '../lib/ui.ts'

type Draft = Pick<DashboardQuery, 'from' | 'until' | 'fonte'>

type Props = {
  draft: Draft
  dry: boolean
  onDraftChange: (patch: Partial<Draft>) => void
  onDryChange: (dry: boolean) => void
  onApply: () => void
  onClear: () => void
}

const ALL_FONTES = 'todas'
const dateInputClass = 'h-10 bg-card tabular-nums'

export function FiltersBar({ draft, dry, onDraftChange, onDryChange, onApply, onClear }: Props) {
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
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <fieldset className="block min-w-0">
              <legend className={`${FIELD_LABEL} mb-1`}>Janela futura</legend>
              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  type="date"
                  className={dateInputClass}
                  min={minDate}
                  value={draft.from}
                  onChange={(e) => onDraftChange({ from: e.target.value })}
                  aria-label="Início da janela"
                />
                <Input
                  type="date"
                  className={dateInputClass}
                  min={draft.from || minDate}
                  value={draft.until}
                  onChange={(e) => onDraftChange({ until: e.target.value })}
                  aria-label="Fim da janela"
                />
              </div>
            </fieldset>
            <div className="block min-w-0">
              <span className={`${FIELD_LABEL} mb-1 block`} id="fonte-label">
                Fonte
              </span>
              <Select
                value={draft.fonte || ALL_FONTES}
                onValueChange={(fonte) => onDraftChange({ fonte: fonte === ALL_FONTES ? '' : fonte })}
              >
                <SelectTrigger aria-labelledby="fonte-label" className="h-10 w-full bg-card">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)">
                  <SelectItem value={ALL_FONTES}>Todas</SelectItem>
                  {FILTER_FONTES.map((fonte) => (
                    <SelectItem key={fonte} value={fonte}>
                      {sourceLabel(fonte)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Toggle
              variant="outline"
              size="lg"
              pressed={dry}
              onPressedChange={onDryChange}
              aria-label="Incluir fontes dry-run"
              className="h-10 px-3"
            >
              Incluir dry-run
            </Toggle>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClear}>
              Limpar
            </Button>
            <Button type="submit" className="h-10 px-4">
              Aplicar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

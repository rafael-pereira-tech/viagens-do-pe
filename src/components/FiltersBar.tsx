import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FILTER_FONTES, sourceLabel } from '../lib/filters.ts'
import { todayIso, type DashboardQuery, type DryMode } from '../lib/query.ts'
import { FIELD_LABEL } from '../lib/ui.ts'

type Draft = Pick<DashboardQuery, 'from' | 'until' | 'fonte'>

type Props = {
  draft: Draft
  dryMode: DryMode
  onDraftChange: (patch: Partial<Draft>) => void
  onDryModeChange: (mode: DryMode) => void
  onApply: () => void
  onClear: () => void
}

const ALL_FONTES = 'todas'
const dateInputClass = 'h-10 bg-card tabular-nums'

const DRY_MODES: { value: DryMode; label: string }[] = [
  { value: 'only', label: 'Só dry-run (padrão)' },
  { value: 'include', label: 'Incluir dry-run' },
  { value: 'live', label: 'Produção (exclude dry-run)' },
]

export function FiltersBar({ draft, dryMode, onDraftChange, onDryModeChange, onApply, onClear }: Props) {
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
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <fieldset className="block min-w-0 sm:col-span-1">
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
            <div className="block min-w-0">
              <span className={`${FIELD_LABEL} mb-1 block`} id="dados-label">
                Dados
              </span>
              <Select value={dryMode} onValueChange={(value) => onDryModeChange(value as DryMode)}>
                <SelectTrigger aria-labelledby="dados-label" className="h-10 w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)">
                  {DRY_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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

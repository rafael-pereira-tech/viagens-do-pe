import { FILTER_FONTES } from '../lib/filters.ts'
import { todayIso, type DashboardQuery } from '../lib/query.ts'

type Draft = Pick<DashboardQuery, 'from' | 'until' | 'fonte'>

type Props = {
  draft: Draft
  onDraftChange: (patch: Partial<Draft>) => void
  onApply: () => void
  onClear: () => void
}

const fieldLabel = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400'
const fieldInput =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100'

export function FiltersBar({ draft, onDraftChange, onApply, onClear }: Props) {
  const minDate = todayIso()

  return (
    <section className="rounded-2xl border border-dashed border-slate-200 p-3 sm:p-4" aria-label="Filtros">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          onApply()
        }}
      >
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <fieldset className="block min-w-0">
            <legend className={fieldLabel}>Janela futura</legend>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="date"
                className={fieldInput}
                min={minDate}
                value={draft.from}
                onChange={(e) => onDraftChange({ from: e.target.value })}
                aria-label="Início da janela"
              />
              <input
                type="date"
                className={fieldInput}
                min={draft.from || minDate}
                value={draft.until}
                onChange={(e) => onDraftChange({ until: e.target.value })}
                aria-label="Fim da janela"
              />
            </div>
          </fieldset>
          <label className="block min-w-0">
            <span className={fieldLabel}>Fonte</span>
            <select
              className={fieldInput}
              value={draft.fonte}
              onChange={(e) => onDraftChange({ fonte: e.target.value })}
            >
              <option value="">Todas</option>
              {FILTER_FONTES.map((fonte) => (
                <option key={fonte} value={fonte}>
                  {fonte}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={onClear}
            className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Limpar
          </button>
          <button
            type="submit"
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            Aplicar
          </button>
        </div>
      </form>
    </section>
  )
}

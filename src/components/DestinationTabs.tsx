import { AIRPORT_LABEL, DESTINATIONS, ORIGIN, type Destination } from '../lib/query.ts'

type Props = {
  active: Destination
  onChange: (to: Destination) => void
}

export function DestinationTabs({ active, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        Destino · {ORIGIN} → {AIRPORT_LABEL[active]}
      </p>
      <div
        className="grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-50 p-1"
        role="tablist"
        aria-label="Aeroporto de destino"
      >
        {DESTINATIONS.map((code) => {
          const selected = code === active
          return (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(code)}
              className={[
                'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                selected ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              ].join(' ')}
            >
              {code}
            </button>
          )
        })}
      </div>
    </div>
  )
}

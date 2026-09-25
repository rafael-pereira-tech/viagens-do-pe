import { AIRPORT_LABEL, DESTINATIONS, ORIGIN, type Destination, type Sentido } from '../lib/query.ts'

type Props = {
  active: Destination
  sentido: Sentido
  onChange: (to: Destination) => void
  onSentidoChange: (sentido: Sentido) => void
}

const optionClass =
  'min-h-9 rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-background/60 aria-pressed:bg-background aria-pressed:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function DestinationTabs({ active, sentido, onChange, onSentidoChange }: Props) {
  const routeLabel =
    sentido === 'volta' ? `${AIRPORT_LABEL[active]} → ${ORIGIN}` : `${ORIGIN} → ${AIRPORT_LABEL[active]}`
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-sm text-muted-foreground">
          Rota · <span className="font-medium text-foreground">{routeLabel}</span>
        </p>
        <div role="group" aria-label="Sentido da viagem" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          <button
            type="button"
            className={optionClass}
            aria-pressed={sentido === 'ida'}
            onClick={() => onSentidoChange('ida')}
          >
            Ida · {ORIGIN}→SP
          </button>
          <button
            type="button"
            className={optionClass}
            aria-pressed={sentido === 'volta'}
            onClick={() => onSentidoChange('volta')}
          >
            Volta · SP→{ORIGIN}
          </button>
        </div>
      </div>
      <div role="group" aria-label="Aeroporto em São Paulo" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {DESTINATIONS.map((code) => (
          <button
            key={code}
            type="button"
            className={`${optionClass} min-w-16`}
            aria-pressed={active === code}
            onClick={() => onChange(code)}
          >
            {code}
          </button>
        ))}
      </div>
    </div>
  )
}

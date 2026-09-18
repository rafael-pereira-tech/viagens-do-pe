import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AIRPORT_LABEL, DESTINATIONS, ORIGIN, type Destination, type Sentido } from '../lib/query.ts'

type Props = {
  active: Destination
  sentido: Sentido
  onChange: (to: Destination) => void
  onSentidoChange: (sentido: Sentido) => void
}

export function DestinationTabs({ active, sentido, onChange, onSentidoChange }: Props) {
  const routeLabel =
    sentido === 'volta' ? `${AIRPORT_LABEL[active]} → ${ORIGIN}` : `${ORIGIN} → ${AIRPORT_LABEL[active]}`

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-sm text-muted-foreground">
          Rota · <span className="font-medium text-foreground">{routeLabel}</span>
        </p>
        <Tabs value={sentido} onValueChange={(value) => onSentidoChange(value as Sentido)} className="gap-0">
          <TabsList aria-label="Sentido da viagem" className="grid h-9 w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="ida" className="px-3 text-xs font-semibold sm:text-sm">
              Ida · {ORIGIN}→SP
            </TabsTrigger>
            <TabsTrigger value="volta" className="px-3 text-xs font-semibold sm:text-sm">
              Volta · SP→{ORIGIN}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Tabs value={active} onValueChange={(value) => onChange(value as Destination)} className="gap-0">
        <TabsList aria-label="Aeroporto em São Paulo" className="grid h-10 w-full grid-cols-3 sm:w-auto">
          {DESTINATIONS.map((code) => (
            <TabsTrigger key={code} value={code} className="min-w-16 px-3 font-semibold">
              {code}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

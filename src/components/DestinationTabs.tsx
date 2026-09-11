import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AIRPORT_LABEL, DESTINATIONS, ORIGIN, type Destination } from '../lib/query.ts'

type Props = {
  active: Destination
  onChange: (to: Destination) => void
}

export function DestinationTabs({ active, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Destino · {ORIGIN} → {AIRPORT_LABEL[active]}
      </p>
      <Tabs value={active} onValueChange={(value) => onChange(value as Destination)} className="gap-0">
        <TabsList aria-label="Aeroporto de destino" className="grid h-10 w-full grid-cols-3 sm:w-auto">
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

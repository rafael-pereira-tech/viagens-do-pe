import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ChartPanel } from '../components/ChartPanel.tsx'
import { FiltersBar } from '../components/FiltersBar.tsx'
import { KpiStrip } from '../components/KpiStrip.tsx'
import { OffersTable } from '../components/OffersTable.tsx'
import { StateView } from '../components/StateView.tsx'
import { chartFromOffers, kpisFromOffers, PLACEHOLDER_OFFERS } from '../data/placeholders.ts'
import { applyQuery } from '../lib/filters.ts'
import { type ChartMode, type Destination, DESTINATIONS } from '../lib/query.ts'

type Variant = 'success' | 'loading' | 'error' | 'empty'

const VARIANTS: { value: Variant; label: string }[] = [
  { value: 'success', label: 'Success' },
  { value: 'loading', label: 'Loading' },
  { value: 'error', label: 'Error' },
  { value: 'empty', label: 'Empty' },
]

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
    </div>
  )
}

export function Playground() {
  const [globalVariant, setGlobalVariant] = useState<Variant>('success')
  const [destination, setDestination] = useState<Destination>('GRU')
  const [chartMode, setChartMode] = useState<ChartMode>('both')
  const [draft, setDraft] = useState({ from: '', until: '', fonte: '' })

  const isLoading = globalVariant === 'loading'
  const isError = globalVariant === 'error'
  const isEmpty = globalVariant === 'empty'
  const errorMsg = isError ? 'Não foi possível carregar as ofertas (API 500).' : null

  const baseQuery = useMemo(
    () => ({ to: destination, from: draft.from, until: draft.until, fonte: draft.fonte, dia: '', bars: chartMode, ui: '' as const, dry: false }),
    [destination, draft, chartMode],
  )

  const tabRows = useMemo(() => applyQuery(PLACEHOLDER_OFFERS, baseQuery, { ignoreDay: true }), [baseQuery])
  const rows = useMemo(() => applyQuery(PLACEHOLDER_OFFERS, baseQuery), [baseQuery])
  const kpis = useMemo(() => kpisFromOffers(isEmpty ? [] : tabRows), [tabRows, isEmpty])
  const chart = useMemo(() => (isEmpty ? [] : chartFromOffers(tabRows)), [tabRows, isEmpty])

  const effectiveKpis = isEmpty ? kpisFromOffers([], undefined) : kpis
  const effectiveChart = isEmpty ? [] : chart
  const effectiveRows = isEmpty ? [] : rows

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Playground · estados</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Rota pública <code className="rounded bg-muted px-1 py-0.5 text-xs">/playground</code> para validar{' '}
            <span className="font-medium text-foreground">loading / empty / error / success</span> dos componentes
            principais. Use também <code className="rounded bg-muted px-1 py-0.5 text-xs">?ui=loading|error|empty</code> no{' '}
            <Link to="/" className="underline underline-offset-4">
              Dashboard
            </Link>{' '}
            para forçar o estado via URL.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          público · sem auth
        </Badge>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Controles globais</CardTitle>
          <CardDescription>Altera todos os componentes abaixo de uma vez.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Variante</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={globalVariant}
              onValueChange={(v) => v && setGlobalVariant(v as Variant)}
            >
              {VARIANTS.map((v) => (
                <ToggleGroupItem key={v.value} value={v.value} aria-label={v.label}>
                  {v.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <span className="text-xs font-medium text-muted-foreground">Destino</span>
            <ToggleGroup type="single" variant="outline" size="sm" value={destination} onValueChange={(v) => v && setDestination(v as Destination)}>
              {DESTINATIONS.map((d) => (
                <ToggleGroupItem key={d} value={d}>
                  {d}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <FiltersBar
            draft={draft}
            onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            onApply={() => {}}
            onClear={() => setDraft({ from: '', until: '', fonte: '' })}
            isLoading={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Dica: alterne para <span className="font-medium text-foreground">loading</span> para ver skeletons + inputs
            desabilitados; <span className="font-medium text-foreground">error</span> para alert + retry;{' '}
            <span className="font-medium text-foreground">empty</span> para mensagens filtradas.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <section className="space-y-3">
          <SectionTitle title="KpiStrip" subtitle="3 indicadores · loading skeletons · empty (—) · error alert" />
          <KpiStrip kpis={effectiveKpis} isLoading={isLoading} error={errorMsg} onRetry={() => setGlobalVariant('success')} />
        </section>

        <section className="space-y-3">
          <SectionTitle title="ChartPanel" subtitle="barras agrupadas · toggle milhas/BRL · seleção de data" />
          <ChartPanel
            points={effectiveChart}
            mode={chartMode}
            isLoading={isLoading}
            selectedDate=""
            destination={destination}
            onModeChange={setChartMode}
            onSelectDate={() => {}}
            error={errorMsg}
            onRetry={() => setGlobalVariant('success')}
          />
        </section>

        <section className="space-y-3">
          <SectionTitle title="OffersTable" subtitle="tabela paginada · empty com Limpar filtros · error com retry" />
          <OffersTable
            rows={effectiveRows}
            isLoading={isLoading}
            onResetFilters={() => setDraft({ from: '', until: '', fonte: '' })}
            error={errorMsg}
            onRetry={() => setGlobalVariant('success')}
          />
        </section>

        <section className="space-y-3">
          <SectionTitle title="StateView (primitivo)" subtitle="usado por EmptyHint — 3 variantes" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-xs">empty</CardTitle>
              </CardHeader>
              <CardContent>
                <StateView variant="empty" title="Sem dados" description="Nenhum registro ainda." />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-xs">filtered-empty</CardTitle>
              </CardHeader>
              <CardContent>
                <StateView
                  variant="filtered-empty"
                  title="Sem ofertas futuras nesta aba"
                  description="Ajuste a janela ou a fonte."
                  actionLabel="Limpar filtros"
                  onAction={() => {}}
                />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-xs">error</CardTitle>
              </CardHeader>
              <CardContent>
                <StateView variant="error" title="Falha ao carregar" description="API 500" actionLabel="Tentar de novo" onAction={() => {}} />
              </CardContent>
            </Card>
          </div>
        </section>

        <Card size="sm" className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Matriz de estados (todos de uma vez)</CardTitle>
            <CardDescription>Útil para revisão visual rápida / screenshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">KpiStrip</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">loading</p>
                  <KpiStrip kpis={effectiveKpis} isLoading error={null} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">error</p>
                  <KpiStrip kpis={effectiveKpis} isLoading={false} error="API 500" onRetry={() => {}} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">empty</p>
                  <KpiStrip kpis={kpisFromOffers([], undefined)} isLoading={false} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">success</p>
                  <KpiStrip kpis={kpis} isLoading={false} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button asChild variant="outline">
            <Link to="/">Voltar ao Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ChartPanel } from './ChartPanel.tsx'
import type { ChartPoint } from '../data/placeholders.ts'

const points: ChartPoint[] = [
  { date: '2026-04-10', milhas: 12000, brl: 580, sampleSize: 2, milesAirline: 'LATAM', brlAirline: 'LATAM' },
  { date: '2026-04-11', milhas: 14000, brl: 690, sampleSize: 1, milesAirline: 'GOL', brlAirline: 'AZUL' },
]

function renderChart(props: Partial<React.ComponentProps<typeof ChartPanel>> = {}) {
  return render(
    <TooltipProvider>
      <ChartPanel
        points={points}
        mode="both"
        isLoading={false}
        selectedDate=""
        destination="GRU"
        onModeChange={vi.fn()}
        onSelectDate={vi.fn()}
        {...props}
      />
    </TooltipProvider>,
  )
}

describe('ChartPanel', () => {
  it('loading: shows skeleton with aria-busy', () => {
    renderChart({ isLoading: true, points: [] })
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('error: shows alert and retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderChart({ error: 'API 500', onRetry, points: [] })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('API 500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('empty: shows filtered-empty message', () => {
    renderChart({ points: [] })
    expect(screen.getByText('Sem ofertas futuras nesta aba')).toBeInTheDocument()
    expect(screen.getByText(/Ajuste a janela/)).toBeInTheDocument()
  })

  it('success: renders bars and legend', () => {
    renderChart({ points })
    // chart renders accessible buttons per date
    expect(screen.getAllByRole('listitem').length).toBe(2)
    expect(screen.getByText(/Menor milhas.*cia vencedora/)).toBeInTheDocument()
  })

  it('mode toggle: calls onModeChange', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    renderChart({ points, onModeChange })
    await user.click(screen.getByRole('radio', { name: 'Só milhas' }))
    expect(onModeChange).toHaveBeenCalledWith('milhas')
  })

  it('loading takes precedence over error', () => {
    renderChart({ isLoading: true, error: 'boom', points: [] })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

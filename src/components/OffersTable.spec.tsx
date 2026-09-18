import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OffersTable } from './OffersTable.tsx'
import type { OfferRow } from '../types/priceSnapshot.ts'

const row: OfferRow = {
  origin: 'PET',
  destination: 'GRU',
  airline: 'LATAM',
  program: 'latam_pass',
  flight_date: '2026-04-10',
  departure_time: '10:25',
  miles: 12000,
  taxes_brl: 58,
  currency: 'BRL',
  source: 'latam_pass',
  collected_at: '2026-04-01T12:00:00Z',
  milheiro: 4.83,
}

describe('OffersTable', () => {
  it('loading: shows skeletons', () => {
    render(<OffersTable rows={[]} isLoading onResetFilters={vi.fn()} />)
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('error: shows alert and retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<OffersTable rows={[]} isLoading={false} onResetFilters={vi.fn()} error="API 500" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('API 500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('empty: shows filtered-empty with Limpar filtros', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(<OffersTable rows={[]} isLoading={false} onResetFilters={onReset} />)
    expect(screen.getByText('Sem ofertas futuras nesta aba')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('success: renders rows', () => {
    render(<OffersTable rows={[row]} isLoading={false} onResetFilters={vi.fn()} />)
    expect(screen.getByText(/10.*abr/)).toBeInTheDocument()
    expect(screen.getAllByText(/LATAM/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows delta badge and min–max when history is significant', () => {
    render(
      <OffersTable
        rows={[
          {
            ...row,
            milesDeltaPct: -12.4,
            milesMin: 10000,
            milesMax: 15000,
            amount_brl: 580,
            brlDeltaPct: 8.2,
            brlMin: 500,
            brlMax: 700,
          },
        ]}
        isLoading={false}
        onResetFilters={vi.fn()}
      />,
    )
    expect(screen.getByText('↓12%')).toBeInTheDocument()
    expect(screen.getByText('↑8%')).toBeInTheDocument()
    expect(screen.getByText(/10\.000–15\.000|10,000–15,000/)).toBeInTheDocument()
  })

  it('loading takes precedence over error and empty', () => {
    render(<OffersTable rows={[]} isLoading error="boom" onResetFilters={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Sem ofertas futuras')).not.toBeInTheDocument()
  })
})

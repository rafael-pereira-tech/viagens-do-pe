import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KpiStrip } from './KpiStrip.tsx'
import type { KpiModel } from '../data/placeholders.ts'

const kpisEmpty: KpiModel = {
  menorMilhas: null,
  menorBrl: null,
  melhorMilheiro: null,
}

const kpisFilled: KpiModel = {
  menorMilhas: { value: 12000, caption: 'LATAM Pass · 06 abr' },
  menorBrl: { value: 580, caption: 'AZUL · 08 abr' },
  melhorMilheiro: { value: 4.83, caption: 'Smiles · 06 abr' },
}

describe('KpiStrip', () => {
  it('loading: shows skeletons with aria-busy', () => {
    render(<KpiStrip kpis={kpisEmpty} isLoading />)
    expect(screen.getByLabelText('Indicadores')).toHaveAttribute('aria-busy', 'true')
    // 3 cards => 9 skeletons (3 per card)
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
  })

  it('error: shows alert and retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<KpiStrip kpis={kpisEmpty} isLoading={false} error="API 500" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('API 500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('error without retry: no button', () => {
    render(<KpiStrip kpis={kpisEmpty} isLoading={false} error="falha" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })

  it('success empty: shows placeholders', () => {
    render(<KpiStrip kpis={kpisEmpty} isLoading={false} />)
    expect(screen.getByText('Menor milhas')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Sem ofertas futuras nesta aba').length).toBe(3)
  })

  it('success filled: shows values', () => {
    render(<KpiStrip kpis={kpisFilled} isLoading={false} />)
    // values are formatted pt-BR, just check captions appear
    expect(screen.getByText('LATAM Pass · 06 abr')).toBeInTheDocument()
    expect(screen.getByText('AZUL · 08 abr')).toBeInTheDocument()
  })

  it('loading takes precedence over error', () => {
    render(<KpiStrip kpis={kpisEmpty} isLoading error="boom" onRetry={vi.fn()} />)
    expect(screen.getByLabelText('Indicadores')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

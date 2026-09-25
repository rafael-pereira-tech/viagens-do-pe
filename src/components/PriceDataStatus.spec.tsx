import { render, screen } from '@testing-library/react'
import { PriceDataStatus } from './PriceDataStatus.tsx'

const props = { demo: false, rows: [], isLoading: false, error: null, now: Date.parse('2026-09-25T15:00:00Z') }
describe('PriceDataStatus', () => {
  it('labels simulated quotes without claiming they can be purchased', () => {
    render(<PriceDataStatus {...props} demo />)
    expect(screen.getByText('Demonstração · dados fictícios')).toBeInTheDocument()
    expect(screen.getByText(/não são ofertas disponíveis/)).toBeInTheDocument()
    expect(screen.queryByText(/Consulta mais recente/)).not.toBeInTheDocument()
  })
  it('shows mixed freshness and unknown times in the displayed result', () => {
    render(
      <PriceDataStatus
        {...props}
        rows={[
          { collected_at: '2026-09-25T14:00:00Z' },
          { collected_at: '2026-09-24T14:00:00Z' },
          { collected_at: '' },
        ]}
      />,
    )
    expect(screen.getByText(/1 de 3 preços/)).toBeInTheDocument()
    expect(screen.getByText(/atualização de 1 preço/)).toBeInTheDocument()
  })
  it.each([
    [{ isLoading: true }, 'Consultando preços…'],
    [{ error: 'Offline' }, 'Não foi possível atualizar os preços.'],
    [{}, 'Nenhum preço encontrado neste recorte.'],
  ])('explains the current fetch state', (overrides, message) => {
    render(<PriceDataStatus {...props} {...overrides} />)
    expect(screen.getByRole('status')).toHaveTextContent(message)
  })
})

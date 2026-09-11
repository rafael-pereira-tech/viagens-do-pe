import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateView } from './StateView.tsx'

describe('StateView', () => {
  it('renders empty variant', () => {
    render(<StateView variant="empty" title="Sem ofertas" description="Nada por aqui" />)
    expect(screen.getByText('Sem ofertas')).toBeInTheDocument()
    expect(screen.getByText('Nada por aqui')).toBeInTheDocument()
  })

  it('renders filtered-empty with action', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<StateView variant="filtered-empty" title="Vazio" actionLabel="Limpar filtros" onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders error with alert role', () => {
    render(
      <StateView variant="error" title="Erro" description="falha" actionLabel="Tentar de novo" onAction={vi.fn()} />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('falha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('does not render button when no handler', () => {
    render(<StateView variant="error" title="Erro" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

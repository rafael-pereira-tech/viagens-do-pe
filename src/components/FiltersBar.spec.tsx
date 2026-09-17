import { render, screen } from '@testing-library/react'
import { FiltersBar } from './FiltersBar.tsx'

describe('FiltersBar', () => {
  const draft = { from: '', until: '' }

  it('disabled when isLoading', () => {
    render(<FiltersBar draft={draft} onDraftChange={vi.fn()} onApply={vi.fn()} onClear={vi.fn()} isLoading />)
    expect(screen.getByLabelText('Início da janela')).toBeDisabled()
    expect(screen.getByLabelText('Fim da janela')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Carregando…' })).toBeDisabled()
  })

  it('enabled by default', () => {
    render(<FiltersBar draft={draft} onDraftChange={vi.fn()} onApply={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  })

  it('does not render Fonte or Dados selects', () => {
    render(<FiltersBar draft={draft} onDraftChange={vi.fn()} onApply={vi.fn()} onClear={vi.fn()} />)
    expect(screen.queryByText('Fonte')).toBeNull()
    expect(screen.queryByText('Dados')).toBeNull()
  })
})

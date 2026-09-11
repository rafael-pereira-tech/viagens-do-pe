import { render, screen } from '@testing-library/react'
import { FiltersBar } from './FiltersBar.tsx'

describe('FiltersBar', () => {
  const draft = { from: '', until: '', fonte: '' }

  it('disabled when isLoading', () => {
    render(
      <FiltersBar
        draft={draft}
        dryMode="only"
        onDraftChange={vi.fn()}
        onDryModeChange={vi.fn()}
        onApply={vi.fn()}
        onClear={vi.fn()}
        isLoading
      />,
    )
    expect(screen.getByLabelText('Início da janela')).toBeDisabled()
    expect(screen.getByLabelText('Fim da janela')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Carregando…' })).toBeDisabled()
  })

  it('enabled by default', () => {
    render(
      <FiltersBar
        draft={draft}
        dryMode="only"
        onDraftChange={vi.fn()}
        onDryModeChange={vi.fn()}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  })
})

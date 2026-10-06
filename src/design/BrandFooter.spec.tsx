import { render, screen } from '@testing-library/react'
import { BrandFooter } from './components/BrandFooter.tsx'

describe('BrandFooter', () => {
  it('names the brand in text and keeps the disclaimer', () => {
    render(<BrandFooter />)
    expect(screen.getByRole('link', { name: 'satolep-trips' })).toHaveAttribute('href', '/')
    expect(screen.getByText(/não vendemos passagem/)).toBeInTheDocument()
    expect(document.querySelector('[data-slot="tile"]')).toBeNull()
  })

  it('says in words when a source failed', () => {
    render(
      <BrandFooter
        sources={[
          { name: 'LATAM', at: '02:10' },
          { name: 'Azul', ok: false },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Última coleta por fonte' })
    expect(list).toHaveTextContent('LATAM 02:10')
    expect(list).toHaveTextContent('Azul falhou')
  })
})

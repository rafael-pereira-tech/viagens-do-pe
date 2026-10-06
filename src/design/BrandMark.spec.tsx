import { render, screen } from '@testing-library/react'
import { BrandMark } from './components/BrandMark.tsx'
import { BRAND_WORD, brandMarkWidth, tileGeometry } from './tokens.ts'

describe('BrandMark', () => {
  it('is a link to / with an accessible name and decorative tiles', () => {
    render(<BrandMark />)
    const link = screen.getByRole('link', { name: 'satolep-trips, início' })
    expect(link).toHaveAttribute('href', '/')
    const tiles = link.querySelectorAll('[data-slot="tile"]')
    expect(tiles).toHaveLength(BRAND_WORD.length)
    tiles.forEach((t) => expect(t).toHaveAttribute('aria-hidden', 'true'))
  })

  it('inverts exactly one tile: the hyphen', () => {
    render(<BrandMark />)
    const hy = document.querySelectorAll('[data-slot="tile"][data-hyphen]')
    expect(hy).toHaveLength(1)
    expect(hy[0]).toHaveTextContent('-')
    expect(hy[0]).toHaveClass('pt-tile-hy')
  })

  it('sizes tiles by --tile: sm = 20px, md = 24px', () => {
    const { rerender } = render(<BrandMark size="sm" />)
    expect(document.querySelector<HTMLElement>('[data-slot="tile"]')?.style.getPropertyValue('--tile')).toBe('20px')
    rerender(<BrandMark size="md" />)
    expect(document.querySelector<HTMLElement>('[data-slot="tile"]')?.style.getPropertyValue('--tile')).toBe('24px')
  })

  it('compact: symbol + name in text, no tile row', () => {
    render(<BrandMark compact />)
    expect(screen.getByText('satolep-trips')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="tile-row"]')).toBeNull()
    expect(document.querySelectorAll('[data-slot="tile"]')).toHaveLength(1)
  })

  it('accepts another link component and forwards href as to', () => {
    const Fake = ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a data-to={to} href={to} {...rest}>
        {children}
      </a>
    )
    render(<BrandMark as={Fake} href="/voos/pet-gru" />)
    expect(screen.getByRole('link')).toHaveAttribute('data-to', '/voos/pet-gru')
  })
})

describe('tile geometry', () => {
  it('derives everything from the height', () => {
    expect(tileGeometry(20)).toEqual({ height: 20, width: 15, radius: 2, gap: 2, fontSize: 12, lineHeight: 1 })
    expect(tileGeometry(24)).toEqual({ height: 24, width: 18, radius: 2, gap: 2, fontSize: 15, lineHeight: 1 })
    expect(tileGeometry(68).lineHeight).toBe(2)
  })

  it('knows how wide the mark is', () => {
    expect(brandMarkWidth(20)).toBe(13 * 15 + 12 * 2)
    expect(brandMarkWidth(24)).toBe(13 * 18 + 12 * 2)
  })
})

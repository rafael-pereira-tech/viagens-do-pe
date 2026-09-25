import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DestinationTabs } from './DestinationTabs.tsx'

it('announces the selected filters and supports keyboard activation', async () => {
  const onChange = vi.fn()
  const onSentidoChange = vi.fn()
  const user = userEvent.setup()
  render(<DestinationTabs active="GRU" sentido="ida" onChange={onChange} onSentidoChange={onSentidoChange} />)
  expect(screen.getByRole('button', { name: 'GRU' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'CGH' })).toHaveAttribute('aria-pressed', 'false')
  await user.tab()
  await user.tab()
  await user.keyboard('{Enter}')
  expect(onSentidoChange).toHaveBeenCalledWith('volta')
  await user.click(screen.getByRole('button', { name: 'CGH' }))
  expect(onChange).toHaveBeenCalledWith('CGH')
})

import { expect, test } from '@playwright/test'

test.describe('Dashboard ?ui states', () => {
  test('?ui=loading shows skeletons', async ({ page }) => {
    await page.goto('/?ui=loading')
    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Carregando…' })).toBeVisible()
  })

  test('?ui=error shows alerts and retry', async ({ page }) => {
    await page.goto('/?ui=error')
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page.getByText('Erro simulado via ?ui=error')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tentar de novo' }).first()).toBeVisible()
  })

  test('?ui=empty shows filtered-empty', async ({ page }) => {
    await page.goto('/?ui=empty')
    await expect(page.getByText('Sem ofertas futuras nesta aba').first()).toBeVisible()
    // FiltersBar still visible
    await expect(page.getByText('Janela futura')).toBeVisible()
  })

  test('default shows success with tabs and chart', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('tab', { name: 'GRU' })).toBeVisible()
    await expect(page.getByText('Ofertas futuras por data')).toBeVisible()
    // KpiStrip may be in success (Menor milhas) or loading (skeletons) depending on VITE_API_URL
    await expect(page.getByText('Menor milhas').or(page.locator('[aria-busy="true"]')).first()).toBeVisible()
  })
})

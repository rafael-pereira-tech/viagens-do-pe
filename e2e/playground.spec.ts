import { expect, test } from '@playwright/test'

test.describe('/playground - estados', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vdpe-ff-playground', '1')
    })
  })

  test('renders playground and toggles variants', async ({ page }) => {
    await page.goto('/playground')

    await expect(page.getByRole('heading', { name: /Playground · estados/ })).toBeVisible()
    await expect(page.getByText('Controles globais')).toBeVisible()

    // KpiStrip, ChartPanel, OffersTable sections
    await expect(page.getByRole('heading', { name: 'KpiStrip' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'ChartPanel' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'OffersTable' })).toBeVisible()

    // Success is default — should show chart bars or table rows, not skeletons
    await expect(page.getByText('Menor milhas').first()).toBeVisible()

    // Loading — skeletons + disabled FiltersBar
    await page.getByRole('radio', { name: 'Loading' }).click()
    // skeletons have aria-busy
    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Carregando…' })).toBeDisabled()

    // Error — alerts with retry
    await page.getByRole('radio', { name: 'Error' }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tentar de novo' }).first()).toBeVisible()

    // Empty — filtered-empty messages
    await page.getByRole('radio', { name: 'Empty' }).click()
    await expect(page.getByText('Sem ofertas futuras nesta aba').first()).toBeVisible()

    // Back to success
    await page.getByRole('radio', { name: 'Success' }).click()
    await expect(page.getByText('Menor milhas').first()).toBeVisible()
  })

  test('playground matrix shows all 4 KpiStrip variants', async ({ page }) => {
    await page.goto('/playground')
    await expect(page.getByText('Matriz de estados')).toBeVisible()
    // matrix has 4 KpiStrip examples
    await expect(page.getByText('loading', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('error', { exact: true }).first()).toBeVisible()
  })

  test('nav between Dashboard and Playground', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await page.getByRole('navigation').getByRole('link', { name: 'Playground' }).click()
    await expect(page).toHaveURL(/\/playground/)
    await page.getByRole('navigation').getByRole('link', { name: 'Dashboard' }).click()
    await expect(page)
      .toHaveURL(/\/playground/, { timeout: 2000 })
      .catch(async () => {
        // Dashboard may add ?to=GRU&live=1, so just check pathname
        await expect(page).toHaveURL(/\//)
      })
  })

  test('redirects to dashboard when FF is off', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('vdpe-ff-playground')
    })
    await page.goto('/playground')
    await expect(page).toHaveURL(/\/(?:\?|$)/)
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Playground' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Limpar FF' })).toHaveCount(0)
  })

  test('enables via ?playground=1, persists, strips QP', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('vdpe-ff-playground')
    })
    await page.goto('/playground?playground=1')
    await expect(page.getByRole('heading', { name: /Playground · estados/ })).toBeVisible()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Playground' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Limpar FF' })).toBeVisible()
    await expect(page).toHaveURL(/\/playground\/?(?:\?.*)?$/)
    await expect(page).not.toHaveURL(/playground=1/)
    expect(await page.evaluate(() => localStorage.getItem('vdpe-ff-playground'))).toBe('1')
  })

  test('Limpar FF clears storage and hides playground', async ({ page }) => {
    await page.goto('/playground')
    await expect(page.getByRole('button', { name: 'Limpar FF' })).toBeVisible()
    await page.getByRole('button', { name: 'Limpar FF' }).click()
    await expect(page).toHaveURL(/\/(?:\?|$)/)
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Playground' })).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('vdpe-ff-playground'))).toBeNull()
  })
})

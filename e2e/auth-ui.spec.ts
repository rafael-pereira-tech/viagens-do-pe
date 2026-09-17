import { expect, test } from '@playwright/test'

test.describe('Auth UI feature flag', () => {
  test('hides Entrar and Avatar when FF is off', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('vdpe-ff-auth')
    })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0)
    await expect(page.getByLabel('Sem sessão')).toHaveCount(0)
    await expect(page.getByLabel('Conta conectada')).toHaveCount(0)
  })

  test('enables via ?auth=1, persists, strips QP', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('vdpe-ff-auth')
    })
    await page.goto('/?auth=1')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(page.getByLabel('Sem sessão')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Limpar FF' })).toBeVisible()
    await expect(page).not.toHaveURL(/[?&]auth=1/)
    expect(await page.evaluate(() => localStorage.getItem('vdpe-ff-auth'))).toBe('1')
  })

  test('Limpar FF clears auth UI flag', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vdpe-ff-auth', '1')
    })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await page.getByRole('button', { name: 'Limpar FF' }).click()
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('vdpe-ff-auth'))).toBeNull()
  })
})

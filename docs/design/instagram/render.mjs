// Renderiza template.html (com data.json) em PNGs 2x para o Instagram.
// Uso: node docs/design/instagram/render.mjs [--template=pasta/template.html] [--data=outro.json] [--out=pasta]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const templateFile = path.resolve(here, args.template ?? 'template.html')
const dataFile = path.resolve(path.dirname(templateFile), args.data ?? 'data.json')
const outDir = path.resolve(path.dirname(templateFile), args.out ?? 'out')

async function loadChromium() {
  for (const mod of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      return (await import(mod)).chromium
    } catch {
      /* próximo */
    }
  }
  throw new Error('Playwright não encontrado: pnpm add -D @playwright/test')
}

const chromium = await loadChromium()
const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : {}
fs.mkdirSync(outDir, { recursive: true })

// Em ambientes com Chromium pré-instalado (CHROMIUM_PATH ou /opt/pw-browsers/chromium),
// usa esse binário quando a versão do Playwright não bate com a baixada.
async function launch() {
  try {
    return await chromium.launch()
  } catch (err) {
    const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].filter(Boolean)
    const executablePath = candidates.find((p) => fs.existsSync(p))
    if (!executablePath) throw err
    return chromium.launch({ executablePath })
  }
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 2000 }, deviceScaleFactor: 2 })
await page.addInitScript((d) => {
  window.DATA = d
}, data)
await page.goto('file://' + templateFile, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(300)

for (const el of await page.locator('[data-slide]').all()) {
  const name = await el.getAttribute('data-slide')
  const file = path.join(outDir, `${name}.png`)
  await el.scrollIntoViewIfNeeded()
  await el.screenshot({ path: file, type: 'png' })
  console.log('wrote', path.relative(process.cwd(), file))
}

await browser.close()

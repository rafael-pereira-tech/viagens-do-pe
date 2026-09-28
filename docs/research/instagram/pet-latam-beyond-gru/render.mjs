import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = path.join(__dirname, 'slides.html');
const outDir = __dirname;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 1080 },
  deviceScaleFactor: 2,
});
await page.goto(`file://${html}`, { waitUntil: 'networkidle' });
// wait fonts
await page.waitForTimeout(800);

for (let i = 1; i <= 4; i++) {
  const el = page.locator(`#slide-${i}`);
  await el.scrollIntoViewIfNeeded();
  const file = path.join(outDir, `slide-${i}.png`);
  await el.screenshot({ path: file, type: 'png' });
  console.log('wrote', file);
}

await browser.close();

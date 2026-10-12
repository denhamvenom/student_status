import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const failures = [];
const results = [];
await mkdir('test-results', { recursive: true });
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(`${width}: ${error.message}`));
    for (const role of ['student', 'parent', 'coach', 'travelLead', 'mentor']) {
      await page.goto(`http://127.0.0.1:5173/?review=${role}`);
      await page.locator('h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const brokenImages = await page.locator('img').evaluateAll(images => images.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src')));
      if (overflow) failures.push(`${role} at ${width}: horizontal overflow`);
      if (brokenImages.length) failures.push(`${role} at ${width}: broken images ${brokenImages.join(', ')}`);
      await page.screenshot({ path: `test-results/${role}-${width}.png`, fullPage: true });
      results.push({ role, width, heading: await page.locator('h1').innerText(), overflow, brokenImages });
    }
    await context.close();
  }
  await writeFile('test-results/browser-check.json', JSON.stringify({ results, failures }, null, 2));
  console.log(JSON.stringify({ pages: results.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally { await browser.close(); }

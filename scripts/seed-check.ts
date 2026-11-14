import { chromium } from 'playwright-core';
import { PREVIEW_URL, chromePath } from './preview';

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.goto(`${PREVIEW_URL}run`, { waitUntil: 'networkidle' });
await page.getByLabel('Suite seed').fill('seed-check-42');
await page.getByRole('button', { name: 'Run the suite', exact: true }).click();
await page.waitForSelector('.cell-fail', { timeout: 20_000 });
await page.waitForTimeout(800);
const cells = await page.locator('.cell-fail').count();
await page.getByRole('link', { name: /See the report card/ }).click();
await page.waitForTimeout(500);
const text = await page.locator('main').innerText();
console.log(JSON.stringify({ cells, seedShown: text.includes('seed-check-42'), errors }, null, 2));
await browser.close();

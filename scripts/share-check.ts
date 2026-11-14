import { chromium } from 'playwright-core';
import { PREVIEW_URL, chromePath } from './preview';

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 980 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
await context.addInitScript(() => {
  const original = navigator.clipboard?.writeText?.bind(navigator.clipboard);
  navigator.clipboard.writeText = async (text) => {
    // @ts-expect-error test hook
    window.__copied = text;
    if (original) await original(text);
  };
});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const base = PREVIEW_URL;
await page.goto(`${base}report`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Share', exact: true }).click();
await page.waitForTimeout(300);
const copied = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied);
const hasToast = await page.locator('.toast').isVisible().catch(() => false);

let sharedOk = false;
let sharedText = '';
if (copied) {
  await page.goto(copied, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  sharedOk =
    (await page.locator('.shared-banner').isVisible().catch(() => false)) &&
    (await page.getByText('Shared report').first().isVisible().catch(() => false));
  sharedText = (await page.locator('main').innerText()).slice(0, 200);
}

await page.goto(`${base}replay/timeout-after-transfer`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Seatbelt', exact: true }).click();
await page.waitForTimeout(300);
const survived = await page.getByText('Survived', { exact: true }).first().isVisible().catch(() => false);
const seatbeltText = await page.locator('.replay-verdict-box').innerText();

await page.goto(`${base}run?auto=naive`, { waitUntil: 'networkidle' });
await page.waitForSelector('.cell-fail', { timeout: 20_000 });
await page.waitForTimeout(1000);
const cells = await page.locator('.cell-fail').count();
const reportLink = await page.getByRole('link', { name: /See the report card/ }).count();

console.log(
  JSON.stringify(
    { hasToast, copied: copied?.slice(0, 80), sharedOk, sharedText, survived, seatbeltText, cells, reportLink, errors },
    null,
    2,
  ),
);
await browser.close();

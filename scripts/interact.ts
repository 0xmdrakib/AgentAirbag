import { chromium } from 'playwright-core';
import { PREVIEW_URL, chromePath } from './preview';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const executablePath = chromePath();
const out = process.env.AIRBAG_SCREEN_DIR ?? join(tmpdir(), 'airbag-screens');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const base = PREVIEW_URL;

// Runner: press Crash, wait for the grid to fill, then open the report.
await page.goto(`${base}run`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Run the suite', exact: true }).click();
await page.waitForSelector('.cell-fail, .cell-pass', { timeout: 15_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/runner-after.png`, fullPage: true });
const crashed = await page.locator('.cell-fail').count();
const passed = await page.locator('.cell-pass').count();

// Report link appears after the run.
const reportLink = page.getByRole('link', { name: /See the report card/ });
const hasReportLink = await reportLink.count();
if (hasReportLink) {
  await reportLink.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/report-live.png`, fullPage: false });
}

// Replay: skip to the crash.
await page.goto(`${base}replay/timeout-after-transfer`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Skip to the key moment/ }).click();
await page.waitForTimeout(400);
await page.evaluate(() => {
  (document.activeElement as HTMLElement | null)?.blur();
  window.scrollTo({ top: 0, behavior: 'instant' });
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/replay-crash.png`, fullPage: true });

// Scenario drawer.
await page.goto(`${base}scenarios`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'View YAML' }).first().click();
await page.waitForTimeout(300);
const drawerVisible = await page.locator('.drawer').isVisible();
await page.screenshot({ path: `${out}/scenarios-drawer.png`, fullPage: false });

// Mobile runner.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}run`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${out}/runner-mobile.png`, fullPage: false });

await browser.close();
console.log(JSON.stringify({ crashed, passed, hasReportLink, drawerVisible, errors }, null, 2));

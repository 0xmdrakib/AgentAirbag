/**
 * Captures the README images into docs/images at a fixed desktop size and one phone size.
 * Needs the demo running (pnpm demo). Run: pnpm screenshots
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { PREVIEW_URL, chromePath } from './preview';
import { settle } from './settle';

const out = 'docs/images';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const desktop: { name: string; path: string }[] = [
  { name: 'lab', path: '' },
  { name: 'report-card', path: 'report' },
  { name: 'replay', path: 'replay/timeout-after-transfer' },
  { name: 'scenarios', path: 'scenarios' },
  { name: 'connect', path: 'connect' },
];

for (const shot of desktop) {
  await page.goto(`${PREVIEW_URL}${shot.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await settle(page);
  await page.screenshot({ path: `${out}/${shot.name}.png`, fullPage: false });
  console.log(`captured ${shot.name}`);
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${PREVIEW_URL}report`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await settle(page);
await page.screenshot({ path: `${out}/report-card-mobile.png`, fullPage: false });
console.log('captured report-card-mobile');

await browser.close();

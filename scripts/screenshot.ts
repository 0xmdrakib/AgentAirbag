import { chromium } from 'playwright-core';
import { PREVIEW_URL, chromePath } from './preview';
import { settle } from './settle';
import { mkdirSync } from 'node:fs';

const executablePath = chromePath();
const out = 'artifacts/screens';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
const base = PREVIEW_URL;

const routes: { name: string; hash: string; fullPage?: boolean }[] = [
  { name: 'lab', hash: '#/' },
  { name: 'report', hash: '#/report' },
  { name: 'runner', hash: '#/run' },
  { name: 'replay', hash: '#/replay/timeout-after-transfer' },
  { name: 'scenarios', hash: '#/scenarios' },
  { name: 'connect', hash: '#/connect' },
];

for (const route of routes) {
  await page.goto(`${base}${route.hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await settle(page);
  await page.screenshot({ path: `${out}/${route.name}.png`, fullPage: route.fullPage ?? true });
  console.log(`captured ${route.name}`);
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}#/report`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/report-mobile.png`, fullPage: false });
console.log('captured report-mobile');

await browser.close();

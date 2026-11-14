import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { PREVIEW_URL, chromePath } from './preview';

/**
 * Above-the-fold check on real device viewports (CSS pixels, browser chrome excluded).
 * Writes artifacts/devices/<route>-<device>.png, one viewport-sized shot each, and reports
 * whether the primary call to action is visible without scrolling.
 *   tsx scripts/ui-devices.ts [route-hash]
 */
const DEVICES = [
  { name: 'phone-small', width: 360, height: 640 },
  { name: 'phone', width: 390, height: 760 },
  { name: 'phone-large', width: 430, height: 830 },
  { name: 'tablet', width: 768, height: 960 },
  { name: 'mini-pc', width: 1024, height: 600 },
  { name: 'laptop-small', width: 1280, height: 650 },
  { name: 'laptop', width: 1366, height: 660 },
  { name: 'laptop-125', width: 1536, height: 730 },
  { name: 'desktop', width: 1920, height: 960 },
  { name: 'desktop-qhd', width: 2560, height: 1300 },
];

const hash = process.argv[2] ?? '#/';
const name = hash.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'lab';
mkdirSync('artifacts/devices', { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const results: string[] = [];
for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(`${PREVIEW_URL}${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  const fold = await page.evaluate(() => {
    const cta = document.querySelector<HTMLElement>('.hero-actions .btn, .page-head ~ * .btn-primary');
    const box = cta?.getBoundingClientRect();
    return {
      ctaBottom: box ? Math.round(box.bottom) : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  const ctaVisible = fold.ctaBottom === null ? 'n/a' : fold.ctaBottom <= device.height ? 'yes' : `no (${fold.ctaBottom}px)`;
  results.push(`${device.name.padEnd(13)} ${`${device.width}x${device.height}`.padEnd(10)} CTA above fold: ${ctaVisible}  overflow: ${fold.overflow}`);
  await page.screenshot({ path: `artifacts/devices/${name}-${device.name}.png` });
  await context.close();
}
await browser.close();
console.log(results.join('\n'));

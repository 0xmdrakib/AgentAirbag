import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { PREVIEW_URL, chromePath } from './preview';

/**
 * Contact sheet: cuts a long page into equal slices and lays them side by side so a
 * narrow mobile page can be read at full size. Usage:
 *   tsx scripts/ui-sheet.ts <route-hash> <width> [slices] [theme]
 */
const hash = process.argv[2] ?? '#/';
const width = Number(process.argv[3] ?? 390);
const slices = Number(process.argv[4] ?? 4);
const theme = process.argv[5] ?? 'dark';
const sliceHeight = 1300;

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const context = await browser.newContext({ viewport: { width, height: 844 } });
await context.addInitScript((value) => localStorage.setItem('airbag-theme', value), theme);
const page = await context.newPage();
await page.goto(`${PREVIEW_URL}${hash}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const images: string[] = [];
for (let index = 0; index < slices; index += 1) {
  const buffer = await page.screenshot({
    fullPage: true,
    clip: { x: 0, y: index * sliceHeight, width, height: sliceHeight },
  });
  images.push(`data:image/png;base64,${buffer.toString('base64')}`);
}

const sheet = await context.newPage();
await sheet.setViewportSize({ width: (width + 12) * slices, height: sliceHeight });
await sheet.setContent(
  `<body style="margin:0;background:#444;display:flex;gap:12px">${images
    .map((src) => `<img src="${src}" width="${width}" height="${sliceHeight}">`)
    .join('')}</body>`,
);
mkdirSync('artifacts/audit', { recursive: true });
const name = hash.replace(/[^a-z0-9]+/gi, '-');
const out = `artifacts/audit/sheet-${theme}${name}-${width}.png`;
await sheet.screenshot({ path: out });
await browser.close();
console.log(out);

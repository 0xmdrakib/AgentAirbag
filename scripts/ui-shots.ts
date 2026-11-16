import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { PREVIEW_URL, chromePath } from './preview';
import { settle } from './settle';

/**
 * Full-page screenshots of chosen routes at chosen widths, for looking at a design change.
 *
 *   AIRBAG_PREVIEW_URL  site to shoot (default http://localhost:4321/)
 *   SHOT_TAG            file name prefix and folder: artifacts/shots/<tag>/ (default "now")
 *   SHOT_WIDTHS         comma list of viewport widths (default 1440,390)
 *   SHOT_ROUTES         comma list of: home run report replay scenarios connect (default all)
 *
 * Scroll-reveal sections are shown before each shot, so nothing is captured half hidden.
 */
const ROUTES: Record<string, string> = {
  home: '',
  run: 'run',
  report: 'report',
  replay: 'replay/timeout-after-transfer',
  scenarios: 'scenarios',
  connect: 'connect',
};

const tag = process.env.SHOT_TAG ?? 'now';
const widths = (process.env.SHOT_WIDTHS ?? '1440,390').split(',').map(Number);
const names = (process.env.SHOT_ROUTES ?? Object.keys(ROUTES).join(',')).split(',');
const base = PREVIEW_URL.endsWith('/') ? PREVIEW_URL : `${PREVIEW_URL}/`;
const dir = `artifacts/shots/${tag}`;
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const errors: string[] = [];
for (const width of widths) {
  const page = await browser.newPage({
    viewport: { width, height: width < 700 ? 844 : 900 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (error) => errors.push(`${width}: ${error.message}`));
  for (const name of names) {
    const path = ROUTES[name];
    if (path === undefined) throw new Error(`Unknown route "${name}"`);
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await settle(page);
    await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
console.log(`Shots written to ${dir} (${names.join(', ')} at ${widths.join(', ')}).`);
if (errors.length) console.log(`Page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);

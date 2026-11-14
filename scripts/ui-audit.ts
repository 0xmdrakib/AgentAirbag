import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { PREVIEW_URL, chromePath } from './preview';
import { settle } from './settle';

/**
 * Responsive audit. For every route at every width it checks:
 *  - no horizontal page overflow
 *  - no visible text below 12px
 *  - no console or page errors
 * and writes a full-page screenshot to artifacts/audit/<theme>/<route>-<width>.png.
 */
const WIDTHS = [360, 390, 768, 1024, 1280, 1440, 1920];
const ROUTES = [
  { name: 'lab', hash: '#/' },
  { name: 'run', hash: '#/run' },
  { name: 'report', hash: '#/report' },
  { name: 'replay', hash: '#/replay/timeout-after-transfer' },
  { name: 'scenarios', hash: '#/scenarios' },
  { name: 'connect', hash: '#/connect' },
];
const themes = ['light']; // the UI ships a single light theme
const shots = process.env.AUDIT_SHOTS !== '0';

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const problems: string[] = [];

for (const theme of themes) {
  mkdirSync(`artifacts/audit/${theme}`, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    for (const route of ROUTES) {
      await page.goto(`${PREVIEW_URL}${route.hash}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(250);
      const result = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = doc.scrollWidth - doc.clientWidth;
        const small: string[] = [];
        const clipped: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null = walker.nextNode();
        while (node) {
          const text = node.textContent?.trim();
          const el = node.parentElement;
          if (text && el) {
            const style = getComputedStyle(el);
            const box = el.getBoundingClientRect();
            const visible =
              box.width > 0 &&
              box.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              !el.closest('.sr-only');
            if (visible && parseFloat(style.fontSize) < 12) {
              small.push(`${style.fontSize} "${text.slice(0, 32)}"`);
            }
            if (visible && box.right > doc.clientWidth + 1 && !el.closest('pre, .timeline-wrap, .drawer, .code-line, .trace-list, .compare-table-wrap, .filter-chips, .section-nav')) {
              clipped.push(`"${text.slice(0, 32)}" right=${Math.round(box.right)}`);
            }
          }
          node = walker.nextNode();
        }
        const tiny: string[] = [];
        if (window.innerWidth < 700) {
          for (const el of document.querySelectorAll<HTMLElement>('a.btn, button, a.nav-link, a.law-scenario-pill')) {
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            if (box.height < 36) tiny.push(`${Math.round(box.height)}px ${el.className.toString().slice(0, 30)} "${(el.textContent ?? '').trim().slice(0, 20)}"`);
          }
        }
        return { overflow, small: [...new Set(small)], clipped: [...new Set(clipped)], tiny: [...new Set(tiny)] };
      });
      const label = `${theme}/${route.name}@${width}`;
      if (result.overflow > 1) problems.push(`${label}: horizontal overflow ${result.overflow}px`);
      if (result.small.length) problems.push(`${label}: text <12px → ${result.small.slice(0, 4).join(' | ')}`);
      if (result.clipped.length) problems.push(`${label}: text past viewport → ${result.clipped.slice(0, 3).join(' | ')}`);
      if (result.tiny.length) problems.push(`${label}: tap targets <36px → ${result.tiny.slice(0, 3).join(' | ')}`);
      if (shots) {
        await settle(page);
        await page.screenshot({
          path: `artifacts/audit/${theme}/${route.name}-${width}.png`,
          fullPage: true,
        });
      }
    }
  }
  if (errors.length) problems.push(`${theme}: console errors → ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  await context.close();
}

// Behaviour checks: mobile menu.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${PREVIEW_URL}#/`, { waitUntil: 'networkidle' });
  const navHidden = !(await page.locator('#primary-nav').isVisible());
  if (!navHidden) problems.push('menu: nav should be collapsed on mobile');
  await page.getByRole('button', { name: 'Open menu' }).click();
  if (!(await page.locator('#primary-nav').isVisible())) problems.push('menu: did not open');
  await page.locator('#primary-nav').getByRole('link', { name: 'Report', exact: true }).click();
  await page.waitForTimeout(200);
  if (!page.url().endsWith('#/report')) problems.push(`menu: Report link went to ${page.url()}`);
  if (await page.locator('#primary-nav').isVisible()) problems.push('menu: did not close after navigation');

  // Light only: there must be no theme toggle left in the header.
  if ((await page.getByRole('button', { name: /theme/i }).count()) > 0) {
    problems.push('theme: a theme toggle is still rendered');
  }
  await context.close();
}

await browser.close();
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const problem of problems) console.log(` - ${problem}`);
  process.exit(1);
}
console.log(`UI audit clean: ${ROUTES.length} routes × ${WIDTHS.length} widths (light only).`);

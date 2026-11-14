import type { Page } from 'playwright-core';

/**
 * Walks the whole page once so scroll-reveal sections are shown, then returns to the top.
 * Screenshots of a long page taken without this would capture sections still waiting to appear.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(320, Math.round(window.innerHeight * 0.8));
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y < height; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  });
  await page.waitForTimeout(260);
}

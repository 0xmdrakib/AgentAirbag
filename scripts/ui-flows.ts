import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { PREVIEW_URL, chromePath } from './preview';
import { settle } from './settle';

/**
 * Visual and interaction checks for the screens reached after the main pages: successful
 * reports, completed runs, replay tabs, YAML drawers and saved-run dialogs. The wallet API
 * is mocked here, so running this never writes to a user's database or opens a real wallet.
 */
const base = PREVIEW_URL.endsWith('/') ? PREVIEW_URL : `${PREVIEW_URL}/`;
const widths = [1440, 768, 390];
// Scratch output only, kept out of the repository.
const dir = process.env.AIRBAG_FLOW_DIR ?? join(tmpdir(), 'airbag-flows');
mkdirSync(dir, { recursive: true });
const report = JSON.parse(readFileSync('fixtures/report.hardened.json', 'utf8'));
const errors: string[] = [];
const failures: string[] = [];
const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const check = (ok: boolean, name: string) => {
  if (!ok) failures.push(name);
};

async function shot(page: Page, name: string, width: number) {
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    await dialog.last().screenshot({ path: `${dir}/${name}-${width}.png` });
    return;
  }
  await settle(page);
  await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
}

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${base}report`, { waitUntil: 'networkidle' });
  await page
    .locator('.rep-case')
    .first()
    .screenshot({
      path: `${dir}/case-file-${width}.png`,
    });
  await page.locator('.compare-link').nth(1).click();
  check((await page.locator('h1').innerText()).includes('Survived'), `Seatbelt report @${width}`);
  await page.locator('.law-acc-head').first().click();
  check(await page.locator('.law-scenario-pills').isVisible(), `expanded law @${width}`);
  await shot(page, 'report-survived', width);

  await page.goto(`${base}run`, { waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: /LLM replay/ }).click();
  check(
    (await page.locator('.run-note').innerText()).includes('No model run'),
    `LLM state @${width}`,
  );
  await shot(page, 'run-unrecorded', width);
  await page.getByRole('radio', { name: /Bring your own/ }).click();
  check(
    await page.getByRole('link', { name: /See the three steps/ }).isVisible(),
    `own-agent state @${width}`,
  );
  await page.getByRole('radio', { name: /^Seatbelt/ }).click();
  await page.getByRole('button', { name: 'Run the suite', exact: true }).click();
  await page.locator('.runx-outcome').waitFor();
  check((await page.locator('.cell-pass').count()) === 21, `completed run @${width}`);
  await shot(page, 'run-complete', width);

  await page.goto(`${base}replay/token-metadata-injection`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Skip to the key moment' }).click();
  await shot(page, 'replay-impact', width);
  await page.getByRole('button', { name: 'Seatbelt', exact: true }).click();
  if (width < 1180) {
    const tab = page.getByRole('tab', { name: 'Violations', exact: true });
    if (await tab.isVisible()) await tab.click();
  }
  check(
    await page.getByText('No invariant violated', { exact: true }).isVisible(),
    `survived replay @${width}`,
  );
  await shot(page, 'replay-survived', width);

  await page.goto(`${base}scenarios?law=5`, { waitUntil: 'networkidle' });
  check((await page.locator('.lib-row').count()) === 3, `law filter @${width}`);
  await page.getByRole('button', { name: 'View YAML', exact: true }).first().click();
  await shot(page, 'yaml-drawer', width);
  await page.getByRole('button', { name: 'Close YAML drawer' }).click();
  await page.getByRole('searchbox', { name: 'Search scenarios' }).fill('nothing-matches-this');
  check(
    await page.getByText('No crashes match that filter.', { exact: true }).isVisible(),
    `no search match @${width}`,
  );
  await shot(page, 'library-empty', width);
  await page.goto(`${base}replay/not-a-scenario`, { waitUntil: 'networkidle' });
  check(
    await page.getByRole('heading', { name: 'That crash does not exist.' }).isVisible(),
    `missing scenario @${width}`,
  );
  await shot(page, 'replay-missing', width);
  await page.close();

  // Render the real connected UI against a deterministic API fixture, not a real account.
  const connected = await browser.newPage({ viewport: { width, height: 900 } });
  connected.on('pageerror', (error) => errors.push(error.message));
  let hasSaved = false;
  let forceError = false;
  let storedReport = report;
  const summary = {
    id: 'design-test-run',
    createdAt: '2026-11-16T12:00:00.000Z',
    hash: report.hash,
    grade: report.overall.grade,
    score: report.overall.score,
    lossUsd: report.overall.simulatedLossUsd,
    passed: report.overall.passed,
    failed: report.overall.failed,
  };
  await connected.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    let status = 200;
    if (path === '/api/me') body = { accountId: 'design-check.near' };
    if (path === '/api/runs/design-test-run' && route.request().method() === 'DELETE') {
      hasSaved = false;
      body = { ok: true };
    } else if (path === '/api/runs') {
      if (route.request().method() === 'POST') {
        hasSaved = true;
        storedReport = route.request().postDataJSON().report;
        Object.assign(summary, {
          hash: storedReport.hash,
          grade: storedReport.overall.grade,
          score: storedReport.overall.score,
          lossUsd: storedReport.overall.simulatedLossUsd,
          passed: storedReport.overall.passed,
          failed: storedReport.overall.failed,
        });
        body = summary;
      } else {
        body = hasSaved ? [summary] : [];
        if (forceError) {
          status = 503;
          body = { error: 'The report service is temporarily unavailable. Try again.' };
        }
      }
    }
    if (path === '/api/runs/design-test-run') body = storedReport;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await connected.goto(base, { waitUntil: 'networkidle' });
  await connected.getByRole('button', { name: 'Wallet menu for design-check.near' }).click();
  await connected
    .locator('.wallet-popover')
    .screenshot({ path: `${dir}/account-menu-${width}.png` });
  await connected.getByRole('button', { name: 'My runs', exact: true }).click();
  await connected.getByText('No saved runs yet', { exact: true }).waitFor();
  await shot(connected, 'saved-empty', width);
  await connected.getByRole('button', { name: 'Close my runs' }).click();
  await connected.goto(`${base}report`, { waitUntil: 'networkidle' });
  await connected.getByRole('button', { name: 'Save to my runs', exact: true }).click();
  const savedRow = connected.getByRole('button', { name: /^Open the run from/ });
  await savedRow.waitFor();
  check(hasSaved, `saved report @${width}`);
  await shot(connected, 'saved-list', width);
  await savedRow.click();
  await connected.locator('.wallet-run-detail-body').waitFor();
  await shot(connected, 'saved-detail', width);
  await connected.getByRole('button', { name: 'All runs', exact: true }).click();
  const deleteButton = connected.getByRole('button', { name: /^Delete the run from/ }).first();
  await deleteButton.click();
  await connected
    .getByRole('button', { name: /^Confirm deleting the run from/ })
    .first()
    .click();
  await connected.getByText('No saved runs yet', { exact: true }).waitFor();
  check(!hasSaved, `deleted run @${width}`);
  await shot(connected, 'saved-deleted', width);
  await connected.getByRole('button', { name: 'Close my runs' }).click();
  forceError = true;
  await connected.getByRole('button', { name: 'View my runs', exact: true }).click();
  await connected.locator('.wallet-runs-error').waitFor();
  await shot(connected, 'saved-error', width);
  await connected.close();
}

await browser.close();
if (errors.length) failures.push(`Page errors: ${[...new Set(errors)].join(' | ')}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`UI flows passed at ${widths.join(', ')}px. Screenshots: ${dir} (wallet API mocked).`);

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('.monstats/matchup-qa', { recursive: true });
const browser = await chromium.launch({
  channel: process.env.MONSTATS_BROWSER_CHANNEL ?? 'chrome',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    colorScheme: 'dark',
  });
  const errors = [],
    upstream = [],
    reads = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1')
      upstream.push(request.url());
  });
  page.on('response', (response) => {
    if (response.url().includes('/matchups/'))
      reads.push({ status: response.status(), url: response.url() });
  });
  await page.goto('http://127.0.0.1:3200/matchups');
  const add = async (side, name) => {
    await page.getByRole('textbox', { name: `Search ${side}` }).fill(name);
    await page
      .getByRole('button', { name: `Add ${name} to ${side}`, exact: true })
      .click();
  };
  const heading = page.locator('.combination-results h2');
  for (const name of ['Sneasler', 'Gholdengo']) await add('Candidate A', name);
  await heading
    .filter({ hasText: 'Gholdengo + Sneasler teams · overall' })
    .waitFor();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.monstats/matchup-qa/overall-desktop.png' });
  await page
    .getByRole('combobox', { name: 'Opponent mode' })
    .selectOption('selected');
  for (const name of ['Sneasler', 'Gholdengo']) await add('Opponent B', name);
  await heading
    .filter({ hasText: 'into Gholdengo + Sneasler teams' })
    .waitFor();
  await page
    .locator('.combination-metrics')
    .getByText('50.0%', { exact: true })
    .waitFor();
  await page.locator('.combination-evidence summary').click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.monstats/matchup-qa/mirror-desktop.png' });
  await page
    .getByRole('button', { name: 'Discover combinations', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Combination size' })
    .selectOption('6');
  await heading.filter({ hasText: 'Best 6-Pokémon' }).waitFor();
  assert.equal(await page.locator('.combination-result').count(), 20);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .locator('.matchup-pagination')
    .getByText('21–29 of 29', { exact: true })
    .waitFor();
  assert.equal(await page.locator('.combination-result').count(), 9);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await page
    .locator('.matchup-pagination')
    .getByText('1–20 of 29', { exact: true })
    .waitFor();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.monstats/matchup-qa/discovery-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.monstats/matchup-qa/discovery-mobile.png' });
  await page
    .getByRole('button', { name: /^Inspect/ })
    .first()
    .click();
  await page
    .getByRole('textbox', { name: 'Search Candidate A' })
    .isDisabled()
    .then((disabled) => assert.equal(disabled, true));
  await heading.filter({ hasText: /teams into/ }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: '.monstats/matchup-qa/compare-six-mobile.png',
  });
  for (const name of ['Sneasler', 'Gholdengo'])
    await page
      .getByRole('button', {
        name: `Remove ${name} from Opponent B`,
        exact: true,
      })
      .click();
  await page.locator('.combination-results').waitFor({ state: 'detached' });
  await page.getByText('Add one to six Pokémon to Opponent B.').waitFor();
  await page.screenshot({
    path: '.monstats/matchup-qa/cleared-opponent-mobile.png',
  });
  await page
    .getByRole('combobox', { name: 'Opponent mode' })
    .selectOption('overall');
  await heading.filter({ hasText: /teams · overall/ }).waitFor();
  const removeCandidate = page.getByRole('button', {
    name: /Remove .* from Candidate A/,
  });
  while (await removeCandidate.count()) await removeCandidate.first().click();
  await page.locator('.combination-results').waitFor({ state: 'detached' });
  await page.getByText('Add one to six Pokémon to Candidate A.').waitFor();
  await page.screenshot({
    path: '.monstats/matchup-qa/cleared-candidate-mobile.png',
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: 'Tournaments', exact: true }).click();
  await page.locator('.usage-table').waitFor();
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  await page.locator('.ladder-table').waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(upstream, []);
  assert.ok(reads.every((read) => read.status === 200));
  await writeFile(
    '.monstats/matchup-qa/browser-review.json',
    JSON.stringify(
      {
        errors,
        upstream,
        reads,
        desktop: '1440x1080',
        narrow: '390x844',
        sixMemberRankedCompositions: 29,
        pagination: '20 + 9',
        mirrorRate: 50,
        overflow: false,
        clearedSelectionsRemoveResults: true,
      },
      null,
      2,
    ),
  );
  console.log({
    errors,
    upstream,
    matchupReads: reads.length,
    pagination: '20 + 9',
    overflow: false,
  });
} finally {
  await browser.close();
}

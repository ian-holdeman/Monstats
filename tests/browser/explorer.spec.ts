import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Store } from '../../src/server/store';
import { regulations } from '../../src/domain/regulations';
import { publicDataset } from '../../src/server/reader';
async function chooseSource(page: Page, id: 'limitless' | 'pokedata') {
  await page
    .getByRole('checkbox', { name: 'All sources', exact: true })
    .check();
  await page
    .getByRole('checkbox', { name: 'All sources', exact: true })
    .uncheck();
  await page
    .getByRole('checkbox', {
      name: id === 'limitless' ? 'Limitless' : 'RK9 (pokedata mirror)',
      exact: true,
    })
    .check();
}

test('filter edits stay pending until Apply Filter, including Reset', async ({
  page,
}) => {
  await page.goto('/');
  const table = page.getByRole('table', {
    name: 'Tournament registration usage and observed team win rates',
  });
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Team sheets', exact: true })
    .selectOption('closed');
  await expect(table).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No data for these filters' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No data for these filters' }),
  ).toBeVisible();
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No data for these filters' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(table).toBeVisible();
});

test('source toggles combine RK9 and Limitless without Victory Road and preserve saved results on a failed apply', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('About the data', { exact: true }).click();
  await expect(
    page.getByText(/48 teams · 3 events · 180 matches/),
  ).toBeVisible();
  const reads: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/data/'))
      reads.push(request.url());
  });
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Victory Road', exact: true })
    .uncheck();
  await expect(
    page.getByRole('checkbox', { name: 'Limitless', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'RK9 (pokedata mirror)', exact: true }),
  ).toBeChecked();
  expect(reads).toEqual([]);
  await expect(
    page.getByText(/48 teams · 3 events · 180 matches/),
  ).toBeVisible();
  await page.route('**/data/**', (route) => route.fulfill({ status: 503 }));
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'Saved results are still shown',
  );
  await expect(
    page.getByText(/48 teams · 3 events · 180 matches/),
  ).toBeVisible();
  await page.unroute('**/data/**');
  // Reapply the same draft after the read failure.
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(
    page.getByText(/32 teams · 2 events · 120 matches/),
  ).toBeVisible();
  expect(new URL(reads.at(-1)!).searchParams.get('source')).toBe(
    'limitless,pokedata',
  );
});
test('usage search, sort, filters, detail navigation and keyboard return', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await page.getByText('Filters', { exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Team sheets', exact: true }),
  ).toHaveValue('all');
  await expect(
    page.getByRole('checkbox', { name: 'All sources', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('option', { name: 'Unknown', exact: true }),
  ).toHaveCount(0);
  await page.getByText('Filters', { exact: true }).click();
  const table = page.getByRole('table', {
    name: 'Tournament registration usage and observed team win rates',
  });
  await expect(
    table.getByRole('button', { name: 'Incineroar', exact: true }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Search Pokémon' }).fill('rilla');
  await expect(table.getByRole('row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page
    .getByRole('button', { name: 'Overall win rate', exact: true })
    .click();
  await expect(table.getByRole('row').nth(1)).toContainText('Garchomp');
  const opener = table.getByRole('button', { name: 'Incineroar', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Incineroar', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('heading', {
      name: 'Best performers into Incineroar teams',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Pokémon navigation' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Registered builds' }),
  ).toBeVisible();
  await expect(page.getByText('Safety Goggles', { exact: true })).toBeVisible();
  const builds = page.getByRole('region', { name: 'Registered builds' });
  expect(
    (await builds.locator('tbody tr').first().boundingBox())!.height,
  ).toBeLessThanOrEqual(40);
  await expect(builds.locator('.build-card').last()).toHaveAttribute(
    'open',
    '',
  );
  await expect(
    builds.getByRole('rowheader', { name: 'Intimidate', exact: true }),
  ).toHaveCount(1);
  const best = page.getByRole('region', {
    name: 'Best performers into Incineroar teams',
    exact: true,
  });
  await expect(best.getByRole('row')).toHaveCount(5);
  await expect(best.getByRole('row').nth(1)).toContainText('Rillaboom');
  expect(
    (await best.locator('tbody > tr').first().boundingBox())!.height,
  ).toBeLessThanOrEqual(64);
  expect(
    (await best.locator('.sprite').first().boundingBox())!.width,
  ).toBeLessThanOrEqual(48);
  await best.getByRole('button', { name: 'Win rate', exact: true }).click();
  await expect(best.getByRole('row').nth(1)).toContainText('Garchomp');
  await best
    .getByRole('button', { name: 'Change vs overall', exact: true })
    .click();
  await expect(
    best.getByRole('columnheader', { name: 'Change vs overall' }),
  ).toHaveAttribute('aria-sort', 'descending');
  await expect(
    best.getByRole('button', { name: /View all|Show top 3/ }),
  ).toHaveCount(0);
  const sneasler = best.getByRole('row').filter({
    has: page.getByRole('button', { name: 'Sneasler', exact: true }),
  });
  await sneasler.getByText('+16.7 points', { exact: true }).click();
  await expect(best.getByText(/Sneasler overall: 50.0%/)).toBeVisible();
  await expect(best.getByText(/16.7 percentage points higher/)).toBeVisible();
  const worst = page.getByRole('region', {
    name: 'Worst performers into Incineroar teams',
    exact: true,
  });
  await expect(worst).toContainText('No qualifying negative matchups');
  await page
    .getByRole('button', { name: 'Select Rillaboom', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Rillaboom', exact: true }),
  ).toBeVisible();
  const performers = page.getByRole('region', {
    name: 'Best performers into Rillaboom teams',
    exact: true,
  });
  const scrollWidth = await performers
    .locator('.table-scroll')
    .evaluate((el) => ({ width: el.clientWidth, content: el.scrollWidth }));
  expect(scrollWidth.content).toBeLessThanOrEqual(scrollWidth.width);
  await page.getByRole('button', { name: 'Close Pokémon detail' }).click();
  await expect(opener).toBeFocused();
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Team sheets', exact: true })
    .selectOption('closed');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No data for these filters' }),
  ).toBeVisible();
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(table).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search Pokémon' })
    .fill('no-such-mon');
  await expect(
    page.getByRole('heading', { name: 'No Pokémon found' }),
  ).toBeVisible();
});
test('separate populations browse with only local requests', async ({
  page,
}) => {
  const upstream: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== '127.0.0.1') upstream.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  await page.getByText('Filters', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Showdown', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ladder-table')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Search Pokémon' }),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'All sources', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'BO3', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No archived regulations' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tournaments', exact: true }).click();
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Incineroar', exact: true }),
  ).toBeVisible();
  expect(upstream).toEqual([]);
  const serverAttempts = await readFile(
    '.monstats/e2e/upstream-attempts.log',
    'utf8',
  ).catch(() => '');
  expect(serverAttempts).toBe('');
});
test('narrow layouts keep search, navigation and table controls usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('textbox', { name: 'Search Pokémon' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Rillaboom', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Rillaboom', exact: true }),
  ).toBeVisible();
  const performers = page.getByRole('region', {
    name: 'Best performers into Rillaboom teams',
    exact: true,
  });
  const width = await performers
    .locator('.table-scroll')
    .evaluate((el) => ({ visible: el.clientWidth, content: el.scrollWidth }));
  expect(width.content).toBeLessThanOrEqual(width.visible);
  await page.getByRole('button', { name: 'Close Pokémon detail' }).click();
  await expect(
    page.getByRole('button', { name: 'Rillaboom', exact: true }),
  ).toBeFocused();
});
test('refresh failure and stale publication preserve usable statistics', async ({
  page,
}) => {
  const store = new Store('.monstats/e2e/monstats.sqlite');
  const saved = store.current()!;
  const stale = {
    ...saved,
    id: 'stale-browser-fixture',
    asOf: new Date(Date.now() - 2 * 86400000).toISOString(),
  };
  store.commit(stale);
  try {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Incineroar', exact: true }),
    ).toBeVisible();
    store.refreshFailure(new Date().toISOString(), 'fixture upstream failure');
    await page.reload();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Incineroar', exact: true }),
    ).toBeVisible();
  } finally {
    store.commit(saved);
    store.close();
  }
});

test('new cached publications preserve search, filter and detail state without a loading flash', async ({
  page,
}) => {
  const store = new Store('.monstats/e2e/monstats.sqlite');
  const saved = store.current()!;
  try {
    await page.clock.install();
    await page.goto('/');
    await page.getByText('Filters', { exact: true }).click();
    await chooseSource(page, 'limitless');
    await page
      .getByRole('combobox', { name: 'Team sheets', exact: true })
      .selectOption('open');
    await page
      .getByRole('button', { name: 'Apply Filter', exact: true })
      .click();
    await page.getByRole('textbox', { name: 'Search Pokémon' }).fill('incin');
    await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
    store.commit({
      ...saved,
      id: 'refreshed-browser-fixture',
      views: Object.fromEntries(
        Object.entries(saved.views).map(([key, view]) => [
          key,
          {
            ...view,
            pokemon: view.pokemon.map((p) =>
              p.id === 'incineroar' ? { ...p, usage: 99 } : p,
            ),
          },
        ]),
      ),
    });
    // Drive the local refresh interval without waiting a minute or changing user state.
    await page.clock.fastForward(60001);
    await expect(page.getByText('99.0%', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Incineroar', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Search Pokémon' }),
    ).toHaveValue('incin');
    await page.getByText('Filters', { exact: true }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Limitless', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', {
        name: 'RK9 (pokedata mirror)',
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('combobox', { name: 'Team sheets', exact: true }),
    ).toHaveValue('open');
  } finally {
    store.commit(saved);
    store.close();
  }
});

test('Official events is independent of provider selection and keyboard usable with honest empty cohorts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Filters', { exact: true }).click();
  const events = page.getByRole('combobox', { name: 'Events', exact: true });
  await expect(events).toHaveValue('false');
  await events.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(events).toHaveValue('true');
  await chooseSource(page, 'pokedata');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await page.getByText('About the data', { exact: true }).click();
  await expect(
    page.getByText(/16 teams · 1 events · 60 matches/),
  ).toBeVisible();
  await page.getByText('Filters', { exact: true }).click();
  await chooseSource(page, 'limitless');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No data for these filters' }),
  ).toBeVisible();
  await page.getByText('Filters', { exact: true }).click();
  await expect(events).toHaveValue('true');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Incineroar', exact: true }),
  ).toBeVisible();
});

test('an atomic regulation switch keeps displayed data and regulation together and exposes the frozen archive', async ({
  page,
}) => {
  const config = {
    ...regulations,
    cohorts: {
      ...regulations.cohorts,
      'M-D': {
        enabled: true,
        environment: 'champions-cartridge',
        season: '2027',
        evidence: 'Test-only transition fixture',
      },
    },
  };
  const store = new Store('.monstats/e2e/monstats.sqlite', false, config),
    saved = store.current()!;
  let release = () => {};
  try {
    await page.clock.install();
    await page.goto('/');
    await page.getByText('Filters', { exact: true }).click();
    await chooseSource(page, 'limitless');
    await page
      .getByRole('combobox', { name: 'Team sheets', exact: true })
      .selectOption('open');
    await page
      .getByRole('button', { name: 'Apply Filter', exact: true })
      .click();
    await page.getByRole('textbox', { name: 'Search Pokémon' }).fill('incin');
    await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
    const incoming = {
      ...saved,
      id: 'incoming-regulation-browser-fixture',
      regulation: 'M-D',
      // This simulated future cohort uses community evidence. Copying an
      // official M-C contract would fail the derived-index reconciliation.
      events: saved.events.map((e) => ({
        ...e,
        regulation: 'M-D',
        provenance:
          e.provenance?.official === 'verified'
            ? {
                ...e.provenance,
                official: 'unknown' as const,
                division: undefined,
              }
            : e.provenance,
      })),
      views: Object.fromEntries(
        Object.entries(saved.views).map(([key, v]) => [
          key,
          {
            ...v,
            options: {
              ...v.options,
              regulation: 'M-D',
              interval: v.options.interval
                ? { ...v.options.interval, regulation: 'M-D' }
                : undefined,
            },
            pokemon: v.pokemon.map((p) =>
              p.id === 'incineroar' ? { ...p, usage: 98 } : p,
            ),
          },
        ]),
      ),
    };
    store.commit(incoming, true);
    store.activate('M-D', incoming.id);
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`/data/${incoming.id}*`, async (route) => {
      await held;
      await route.fulfill({
        json: publicDataset(incoming, 'limitless', 'open'),
      });
    });
    await page.clock.fastForward(60001);
    await expect(page.locator('.header-context strong')).toHaveText('M-C');
    await expect(page.getByText('62.5%', { exact: true })).toBeVisible();
    release();
    await expect(page.getByText('98.0%', { exact: true })).toBeVisible();
    await expect(page.locator('.header-context strong')).toHaveText('M-D');
    await expect(
      page.getByRole('heading', { name: 'Incineroar', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Search Pokémon' }),
    ).toHaveValue('incin');
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.locator('.header-context strong')).toHaveText('M-C');
    await expect(
      page.getByRole('combobox', { name: 'Published regulation' }),
    ).toHaveValue(saved.id);
    await expect(
      page.getByRole('button', { name: 'Incineroar', exact: true }),
    ).toBeVisible();
  } finally {
    release();
    store.db.prepare('DELETE FROM pointers WHERE name=?').run('archive:M-C');
    store.db.prepare('DELETE FROM pointers WHERE name=?').run('active');
    store.clearState('retired:M-C');
    store.clearState('active-regulation');
    store.commit(saved);
    store.close();
  }
});

test('teammates show registration shares, navigate between team details and all cards start expanded with abilities last', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  const builds = page.getByRole('region', { name: 'Registered builds' });
  const cards = builds.locator('.build-card');
  expect(
    await builds
      .locator('.build-card > summary')
      .allTextContents()
      .then((labels) =>
        labels.map((label) => label.replace(/\d.*$/, '').trim()),
      ),
  ).toEqual(['Items', 'Moves', 'Teammates', 'Natures', 'Abilities']);
  for (const card of await cards.all())
    await expect(card).toHaveAttribute('open', '');
  const teammates = cards.filter({
    has: page.getByText('% of Incineroar teams', { exact: true }),
  });
  await expect(teammates.getByRole('row', { name: /Rillaboom/ })).toContainText(
    '50.0%',
  );
  await expect(teammates.getByRole('row', { name: /Sneasler/ })).toContainText(
    '50.0%',
  );
  await expect(
    teammates.getByRole('button', {
      name: 'View Incineroar teams',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', {
      name: 'Best performers into Incineroar teams',
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(async () =>
    Promise.all([...document.images].map((image) => image.decode())),
  );
  await page.screenshot({
    path: '.monstats/previews/teammates-desktop.png',
    fullPage: true,
  });
  await teammates
    .getByRole('button', { name: 'View Rillaboom teams', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Rillaboom', exact: true }),
  ).toBeFocused();
  const rillaboomMates = builds
    .locator('.build-card')
    .filter({ has: page.getByText('% of Rillaboom teams', { exact: true }) });
  await expect(
    rillaboomMates.getByRole('row', { name: /Incineroar/ }),
  ).toContainText('100.0%');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '.monstats/previews/teammates-mobile.png',
    fullPage: true,
  });
});

import { test, expect, type Page } from '@playwright/test';
import { Store } from '../../src/server/store';
import { mkdir } from 'node:fs/promises';
async function chooseSource(page: Page, name: 'Champions' | 'Showdown') {
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
}

test('both Ladder usage headers stay clean and sortable while source limits remain inspectable', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  for (const source of ['Showdown', 'Champions'] as const) {
    if (source === 'Champions') await chooseSource(page, source);
    const header = page.locator('.ladder-table thead');
    await expect(header.locator('.quality-info')).toHaveCount(0);
    await header
      .getByRole('button', {
        name: source === 'Showdown' ? 'Usage' : 'Usage rank',
        exact: true,
      })
      .click();
    await expect(
      header.locator('[aria-sort="ascending"], [aria-sort="descending"]'),
    ).toHaveCount(1);
    await page.getByText('About the data', { exact: true }).click();
    await expect(page.locator('.evidence-content')).toContainText(
      source === 'Showdown' ? 'Unique-team counts are unavailable' : 'ranks',
    );
    await page.getByText('About the data', { exact: true }).click();
  }
});

test('ladder detail navigation retains content during a cold read and reuses warmed details', async ({
  page,
}) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route('**/ladder/*?pokemon=rillaboom', async (route) => {
    reads++;
    await ready;
    await route.continue();
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Ladder', exact: true }).click();
    await expect(page.locator('.ladder-table')).toBeVisible();
    await page.getByRole('button', { name: 'Rillaboom', exact: true }).click();
    await expect(page.locator('.ladder-table')).toBeVisible();
    await expect(
      page.getByText('Loading saved build distributions…'),
    ).toHaveCount(0);
    release();
    await expect(
      page.getByRole('region', { name: 'Rillaboom Items list' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close Pokémon detail' }).click();
    await page.getByRole('button', { name: 'Rillaboom', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Rillaboom Items list' }),
    ).toBeVisible();
    expect(reads).toBe(1);
  } finally {
    release();
  }
});
test('ladder filters retain distinct regulation, month, format and rating populations until Apply', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  const table = page.locator('.ladder-table'),
    context = page.locator('.ladder-context');
  await expect(table).toBeVisible();
  await expect(context).toContainText('M-C');
  await expect(context).toContainText('BO1');
  await expect(context).toContainText('1630+');
  await expect(context).toContainText('09/26');
  await expect(
    page.locator('.ladder-filter-area .ladder-context'),
  ).toBeVisible();
  await page.getByText('Filters', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Rating' })).toContainText(
    '1500+',
  );
  await page
    .getByRole('combobox', { name: 'Ladder regulation' })
    .selectOption('M-B');
  await page
    .getByRole('combobox', { name: 'Reporting month' })
    .selectOption('2026-08');
  await page.getByRole('button', { name: 'BO3', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rating' }).selectOption('0');
  await expect(context).toContainText('M-C');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(context).toContainText('M-B');
  await expect(context).toContainText('08/26');
  await expect(context).toContainText('BO3');
  await expect(context).toContainText('All ratings');
  await expect(page.locator('.header-context strong')).toHaveText('M-B');
  await expect(page.locator('.header-context')).toContainText('Showdown');
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(context).toContainText('M-B');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(context).toContainText('M-C');
  await page.getByRole('button', { name: 'Pokémon', exact: true }).click();
  await expect(table.locator('tbody tr').first()).toContainText('Rillaboom');
  await page.getByRole('textbox', { name: 'Search Pokémon' }).fill('Salamence');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('0.0%');
  await page
    .getByRole('textbox', { name: 'Search Pokémon' })
    .fill('no-such-mon');
  await expect(
    page.getByRole('heading', { name: 'No Pokémon found' }),
  ).toBeVisible();
});
test('ladder local endpoints keep usage rows compact and return details from the same immutable version', async ({
  request,
}) => {
  const store = new Store('.monstats/e2e/monstats.sqlite');
  const row = store.db
    .prepare(
      "SELECT version_id FROM ladder_pointers WHERE cohort LIKE 'showdown:M-C:%:1630' LIMIT 1",
    )
    .get();
  store.close();
  const id = String(row!.version_id),
    list = await request.get(`/ladder/${id}`);
  expect(list.ok()).toBe(true);
  const data = await list.json();
  expect(data.id).toBe(id);
  expect(data.snapshots).toBeUndefined();
  expect(data.excluded).toBeUndefined();
  expect(data.rows[0].builds).toEqual({});
  const detail = await request.get(`/ladder/${id}?pokemon=rillaboom`),
    selected = await detail.json();
  expect(selected.publication).toBe(id);
  expect(selected.row.builds.moves.values[0].percent).toBe(90);
  expect(
    (await request.get(`/ladder/${id}?pokemon=imaginarymon`)).status(),
  ).toBe(404);
});

test('ladder colors follow primary types and spread numbers show explicit nature effects without repeated captions', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  const row = page.locator('.ladder-table tbody tr').filter({
    has: page.getByRole('button', { name: 'Rillaboom', exact: true }),
  });
  await expect(row).toHaveAttribute('style', /64 176 100/);
  await page.getByRole('button', { name: 'Rillaboom', exact: true }).click();
  const spreads = page.getByRole('region', {
    name: 'Rillaboom Stat spreads list',
  });
  await expect(spreads).toBeVisible();
  await expect(spreads).not.toContainText('Adamant');
  await expect(spreads.locator('.stat-raised')).toHaveText('32');
  await expect(spreads.locator('.stat-lowered')).toHaveText('0');
  await expect(page.locator('.build-context')).toHaveCount(0);
  await chooseSource(page, 'Champions');
  await page.getByRole('button', { name: 'Rillaboom', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Rillaboom Stat spreads list' }),
  ).toBeVisible();
  await expect(page.locator('.stat-raised, .stat-lowered')).toHaveCount(0);
});
test('Champions ranks and build details support keyboard navigation with no percentage usage or performance controls', async ({
  page,
}) => {
  const upstream: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== '127.0.0.1') upstream.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  await chooseSource(page, 'Champions');
  const table = page.locator('.ladder-table');
  await expect(table).toBeVisible();
  await expect(table).toContainText('Usage rank');
  await expect(table).not.toContainText('%');
  await expect(table.locator('.rank-column span')).toHaveCount(0);
  await expect(page.locator('.header-context')).toContainText('Champions');
  await expect(
    page.getByRole('button', { name: 'Overall win rate', exact: true }),
  ).toHaveCount(0);
  await page.getByText('Filters', { exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Ladder format' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'BO3', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.ladder-context')).toContainText('BO1');
  await expect(page.getByRole('combobox', { name: 'Rating' })).toHaveCount(0);
  await page.getByText('Filters', { exact: true }).click();
  const button = page.getByRole('button', { name: 'Rillaboom', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Rillaboom', exact: true }),
  ).toBeFocused();
  await expect(page.locator('.detail-metrics')).toContainText('#1');
  const items = page.getByRole('region', { name: 'Rillaboom Items list' }),
    moves = page.getByRole('region', { name: 'Rillaboom Moves list' }),
    teammates = page.getByRole('region', { name: 'Rillaboom Teammates list' });
  await expect(items).toContainText('58.2%');
  await expect(moves).toContainText('0.0%');
  await expect(teammates).toContainText('#1');
  await expect(teammates).not.toContainText('%');
  await teammates
    .getByRole('button', { name: 'Incineroar', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Incineroar', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Close Pokémon detail' }).click();
  await expect(
    page.getByRole('button', { name: 'Rillaboom', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Tournaments', exact: true }).click();
  await expect(page.locator('.usage-table')).toContainText('Overall win rate');
  expect(upstream).toEqual([]);
});

test('source selection stays inside Filters and applies source-specific options with an accurate header', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  await expect(page.locator('.ladder-table')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Showdown', exact: true }),
  ).toBeHidden();
  await expect(page.locator('.ladder-table .rank-column span')).toHaveCount(2);
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name: 'Champions', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Rating' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'BO3', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.header-context')).toContainText('Showdown');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(page.locator('.header-context')).toContainText('Champions');
  await expect(page.locator('.ladder-table .rank-column span')).toHaveCount(0);
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name: 'Showdown', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Ladder regulation' })
    .selectOption('M-B');
  await page.getByRole('button', { name: 'BO3', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rating' }).selectOption('1500');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(page.locator('.header-context')).toContainText('Showdown');
  await expect(page.locator('.header-context strong')).toHaveText('M-B');
  await expect(page.locator('.ladder-context')).toContainText('1500+');
});
test('ladder local read failures retain the displayed cohort and permit retry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  await expect(page.locator('.ladder-table')).toBeVisible();
  await page.route('**/ladder/*', (route) =>
    route.fulfill({ status: 500, body: '{}', contentType: 'application/json' }),
  );
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Ladder regulation' })
    .selectOption('M-B');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'saved ladder couldn’t be read',
  );
  await expect(page.locator('.ladder-context')).toContainText('M-C');
  await expect(page.locator('.header-context strong')).toHaveText('M-C');
  await page.unroute('**/ladder/*');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.ladder-context')).toContainText('M-B');
});
test('ladder unavailable and refresh failure states preserve tournament data', async ({
  page,
}) => {
  const store = new Store('.monstats/e2e/monstats.sqlite');
  const saved = store.db
    .prepare("SELECT * FROM ladder_pointers WHERE cohort LIKE 'champions:%'")
    .all();
  store.db
    .prepare("DELETE FROM ladder_pointers WHERE cohort LIKE 'champions:%'")
    .run();
  store.saveState('ladder-status:showdown', {
    state: 'failure',
    attemptedAt: new Date().toISOString(),
    message: 'fixture failure',
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Ladder', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(
      'last source refresh failed',
    );
    await expect(page.locator('.ladder-table')).toBeVisible();
    await chooseSource(page, 'Champions');
    await expect(
      page.getByRole('heading', { name: 'No ladder data available' }),
    ).toBeVisible();
    await page.getByText('Filters', { exact: true }).click();
    await expect(
      page.getByRole('combobox', { name: 'Ladder regulation' }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Tournaments', exact: true })
      .click();
    await expect(page.locator('.usage-table')).toBeVisible();
  } finally {
    for (const r of saved)
      store.db
        .prepare('INSERT INTO ladder_pointers VALUES (?,?)')
        .run(String(r.cohort), String(r.version_id));
    store.clearState('ladder-status:showdown');
    store.close();
  }
});
test('ladder desktop and narrow layouts keep controls and details within the viewport', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mkdir('.monstats/previews', { recursive: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  await expect(page.locator('.ladder-table')).toBeVisible();
  await page.screenshot({
    path: '.monstats/previews/ladder-showdown-desktop.png',
    fullPage: true,
  });
  await chooseSource(page, 'Champions');
  await expect(page.locator('.ladder-table')).toBeVisible();
  await page.getByRole('button', { name: 'Rillaboom', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Rillaboom Items list' }),
  ).toBeVisible();
  await page.screenshot({
    path: '.monstats/previews/ladder-champions-detail-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'Rillaboom', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '.monstats/previews/ladder-champions-detail-narrow.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close Pokémon detail' }).click();
  await page.getByText('Filters', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Apply Filter', exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: '.monstats/previews/ladder-champions-narrow.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

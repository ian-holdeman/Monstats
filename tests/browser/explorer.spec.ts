import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Store } from '../../src/server/store';
test('usage search, sort, filters, detail navigation and keyboard return', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
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
    page.getByRole('heading', { name: 'Best performers into Incineroar' }),
  ).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Pokémon navigation' }),
  ).toBeVisible();
  const best = page.getByRole('region', {
    name: 'Best performers into Incineroar',
    exact: true,
  });
  await expect(best.getByRole('row')).toHaveCount(4);
  await best.getByRole('button', { name: 'View all 4' }).click();
  await expect(best.getByRole('row')).toHaveCount(5);
  const sneasler = best.getByRole('row').filter({
    has: page.getByRole('button', { name: 'Sneasler', exact: true }),
  });
  await sneasler.getByText('+16.7 pp', { exact: true }).click();
  await expect(
    sneasler.getByText(/Comparable overall baseline: 50.0%/),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Select Rillaboom', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Rillaboom', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close Pokémon detail' }).click();
  await expect(opener).toBeFocused();
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Team sheets', exact: true })
    .selectOption('closed');
  await expect(
    page.getByRole('heading', { name: 'No data for these filters' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reset filters', exact: true })
    .last()
    .click();
  await expect(table).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search Pokémon' })
    .fill('no-such-mon');
  await expect(
    page.getByRole('heading', { name: 'No Pokémon found' }),
  ).toBeVisible();
});
test('unavailable populations are honest and browsing makes only local requests', async ({
  page,
}) => {
  const upstream: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== '127.0.0.1') upstream.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ladder Planned' }).click();
  await expect(
    page.getByRole('heading', { name: 'Ladder data isn’t available yet' }),
  ).toBeVisible();
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
      page.getByRole('status').filter({ hasText: 'Showing saved results' }),
    ).toBeVisible();
    store.refreshFailure(new Date().toISOString(), 'fixture upstream failure');
    await page.reload();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'New results couldn’t be loaded' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Incineroar', exact: true }),
    ).toBeVisible();
  } finally {
    store.commit(saved);
    store.close();
  }
});

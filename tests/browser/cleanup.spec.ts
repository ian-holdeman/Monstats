import { test, expect } from '@playwright/test';
test('table-first details load on selection and failed reads retry through Apply', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/data/*', async (route) => {
    if (
      new URL(route.request().url()).searchParams.get('detail') ===
        'incineroar' &&
      ++requests === 1
    )
      await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/');
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  await expect(
    page.getByText('Details unavailable. Reapply Filters to retry.'),
  ).toBeVisible();
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name: 'Apply Filter' }).click();
  await expect(page.locator('.build-cards')).toBeVisible();
  await expect(
    page.getByRole('region', {
      name: 'Best performers into Incineroar teams',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', {
      name: 'Worst performers into Incineroar teams',
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toBe(2);
  await page.getByRole('button', { name: 'Back to usage' }).click();
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  await expect(page.locator('.build-cards')).toBeVisible();
  expect(requests).toBe(2);
});
test('attribution follows applied providers and empty cohorts without listing tournaments', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#evidence > summary').click();
  await expect(page.locator('#evidence .source-list')).toContainText(
    'Tournament data from Limitless',
  );
  await expect(page.locator('#evidence .source-list li')).toHaveCount(3);
  await expect(page.locator('#evidence .source-list')).toContainText(
    'Tournament data from Victory Road',
  );
  await expect(page.locator('#evidence .source-list')).toContainText(
    'Tournament data from RK9 (pokedata mirror)',
  );
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'All sources', exact: true })
    .uncheck();
  await expect(page.locator('#evidence .source-list')).toContainText(
    'Tournament data from Limitless',
  );
  await page.getByRole('button', { name: 'Apply Filter' }).click();
  await expect(page.locator('#evidence .source-list')).toContainText(
    'No contributing providers',
  );
  await expect(page.locator('#evidence')).toContainText('0 teams');
});

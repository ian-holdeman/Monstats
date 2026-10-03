import { test, expect } from '@playwright/test';
import { Store } from '../../src/server/store';
import {
  backfillEvidence,
  readEvidence,
} from '../../src/server/evidence-index';

test('data notice checkbox applies explicitly and restores raw rows on reset', async ({
  page,
}) => {
  await page.goto('/');
  const rows = page.locator('.usage-table tbody tr');
  await expect(rows).toHaveCount(6);
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Hide entries with data notices' })
    .check();
  await expect(rows).toHaveCount(6);
  await page.getByRole('button', { name: 'Apply Filter' }).click();
  await expect(rows).toHaveCount(5);
  await expect(
    page.getByRole('button', { name: 'Farigiraf', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Overall performance: data context' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  await expect(page.locator('.matchup-section .quality-info')).toHaveCount(0);
  await expect(page.locator('.matchup-section .matchup-table')).toHaveCount(1);
  await expect(
    page.getByRole('region', {
      name: 'Worst performers into Incineroar teams',
      exact: true,
    }),
  ).toContainText('No qualifying negative matchups');
  await page.getByRole('button', { name: 'Back to usage' }).click();
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await page.getByRole('button', { name: 'Apply Filter' }).click();
  await expect(rows).toHaveCount(6);
});

test('dynamic filter hides sparse manual comparisons and restores them after reset', async ({
  page,
}) => {
  await page.goto('/matchups');
  await page
    .getByRole('textbox', { name: 'Search Candidate A' })
    .fill('Farigiraf');
  await page
    .getByRole('button', { name: 'Add Farigiraf to Candidate A' })
    .click();
  await expect(page.locator('.combination-result')).toContainText(
    'No observed results',
  );
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Hide entries with data notices' })
    .check();
  await page.getByRole('button', { name: 'Apply Filter' }).click();
  await expect(page.locator('.combination-result')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'No entries match these filters' }),
  ).toBeVisible();
  await page.getByText('Filters', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Apply Filter' }).click();
  await expect(page.locator('.combination-result')).toContainText(
    'No observed results',
  );
  await expect(page.locator('.dynamic-matchups')).not.toContainText(
    /player breadth|largest player/i,
  );
});

test('discreet shared and row disclosures support hover, focus, Escape and tap without shifting rows', async ({
  page,
}) => {
  await page.goto('/');
  const table = page.locator('.usage-table');
  await expect(table).toBeVisible();
  const usage = page.getByRole('button', {
    name: 'Usage population: data context',
    exact: true,
  });
  const before = await table.boundingBox();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await usage.hover();
  await expect(page.getByRole('tooltip')).toContainText(
    'Based on 48 registrations',
  );
  await page.getByRole('tooltip').hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(await table.boundingBox()).toEqual(before);
  await page.getByRole('textbox', { name: /Search/ }).hover();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await usage.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await usage.click();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.getByRole('textbox', { name: /Search/ }).click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Farigiraf overall win rate: data context' })
    .focus();
  await expect(page.getByRole('tooltip')).toContainText('0 matches');
  await expect(page.getByRole('tooltip')).not.toContainText('Player breadth');
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Most evidence', exact: true })
    .click();
  await expect(table.locator('thead th[aria-sort="descending"]')).toContainText(
    'Most evidence',
  );
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  const section = page.getByRole('region', {
    name: 'Best performers into Incineroar teams',
  });
  await section
    .getByRole('button', { name: 'Most evidence', exact: true })
    .click();
  await section.locator('.baseline-toggle').first().click();
  await expect(section.locator('.matchup-evidence')).toContainText(
    'Overall baseline:',
  );
  await expect(section.locator('.matchup-evidence')).toContainText(
    'Largest event:',
  );
  await expect(section.locator('.matchup-evidence')).toContainText(
    'Source records:',
  );
  await expect(section.locator('.matchup-evidence')).not.toContainText(
    'unique players',
  );
});

test('dynamic evidence volume ordering keeps the floor and manual zero results inspectable', async ({
  page,
}) => {
  await page.goto('/matchups');
  await page
    .getByRole('button', { name: 'Discover combinations', exact: true })
    .click();
  const sort = page.getByRole('combobox', { name: 'Sort by' });
  await expect(sort).toHaveValue('winRate');
  await sort.selectOption('evidence');
  await expect(page.locator('.combination-results h2')).toContainText(
    'Most evidenced',
  );
  const physical = await page
    .locator('.combination-evidence summary')
    .allTextContents();
  const counts = physical.map((t) => Number(t.match(/^(\d+) matches$/)![1]));
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  expect(Math.min(...counts)).toBeGreaterThanOrEqual(20);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search Candidate A' })
    .fill('Farigiraf');
  await page
    .getByRole('button', { name: 'Add Farigiraf to Candidate A' })
    .click();
  await expect(page.locator('.combination-result')).toContainText(
    'No observed results',
  );
  await page
    .getByRole('button', { name: 'Farigiraf performance: data context' })
    .focus();
  await expect(page.getByRole('tooltip')).toContainText('0 matches');
  await expect(page.locator('.combination-metrics')).toContainText(
    'Unavailable',
  );
});

test('narrow touch disclosures retain density and ladder samples stay unavailable', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.usage-table')).toBeVisible();
  await page
    .getByRole('button', { name: 'Usage population: data context' })
    .scrollIntoViewIfNeeded();
  const before = await page
    .locator('.usage-table tbody tr')
    .first()
    .boundingBox();
  await page
    .getByRole('button', { name: 'Usage population: data context' })
    .tap();
  await expect(page.getByRole('tooltip')).toContainText('48 registrations');
  expect(
    await page.locator('.usage-table tbody tr').first().boundingBox(),
  ).toEqual(before);
  const box = (await page.getByRole('tooltip').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '.monstats/evidence-qa/narrow-tooltip.png' });
  await page.getByRole('button', { name: 'Ladder', exact: true }).tap();
  await expect(page.locator('.ladder-table thead .quality-info')).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Rillaboom', exact: true }).tap();
  await page
    .getByRole('button', { name: 'Ladder samples: data context' })
    .tap();
  await expect(page.getByRole('tooltip')).toContainText(
    'known-field registration samples',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
test('missing supplemental evidence preserves raw results, never builds during browsing, and recovers after explicit backfill', async ({
  request,
}) => {
  const store = new Store('.monstats/e2e/monstats.sqlite');
  try {
    const current = store.current()!;
    const legacy = structuredClone(current);
    legacy.id = 'legacy-evidence-browser';
    for (const view of Object.values(legacy.views)) {
      for (const r of view.pokemon) delete r.evidence;
      for (const rows of Object.values(view.matchups))
        for (const r of rows) {
          delete r.evidence;
          delete r.baselineEvidence;
        }
    }
    store.commit(legacy);
    store.commit(current);
    const before = store.db
      .prepare('SELECT payload FROM versions WHERE id=?')
      .get(legacy.id)!.payload;
    const first = await request.get(
      `/data/${legacy.id}?evidence=evidence-context-v2`,
    );
    expect(first.ok()).toBe(true);
    expect(first.headers()['cache-control']).toBe('private, no-store');
    const output = await first.json();
    const raw = Object.values(legacy.views)[0].pokemon[0];
    const row = Object.values(output.views)[0] as {
      pokemon: (typeof legacy.views)[string]['pokemon'];
    };
    expect(row.pokemon[0].winRate).toBe(raw.winRate);
    expect(row.pokemon[0].matches).toBe(raw.matches);
    expect(row.pokemon[0].evidence).toBeUndefined();
    expect(
      readEvidence(store.db, legacy.id, Object.values(legacy.views)[0].options),
    ).toBeNull();
    backfillEvidence(store.db, legacy);
    const second = await request.get(
      `/data/${legacy.id}?evidence=evidence-context-v2`,
    );
    expect(second.headers()['cache-control']).toContain('immutable');
    const enriched = Object.values(
      (await second.json()).views,
    )[0] as typeof row;
    expect(enriched.pokemon[0].evidence!.matches).toBe(raw.matches);
    expect(enriched.pokemon[0].winRate).toBe(raw.winRate);
    expect(
      store.db
        .prepare('SELECT payload FROM versions WHERE id=?')
        .get(legacy.id)!.payload,
    ).toEqual(before);
    expect(store.current()!.id).toBe(current.id);
  } finally {
    store.close();
  }
});

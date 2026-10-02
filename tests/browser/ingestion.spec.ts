import { test, expect } from '@playwright/test';
import { Store } from '../../src/server/store';
import { regulations } from '../../src/domain/regulations';
import { lifecycle } from '../../src/server/operations';

test('automatic transition shows empty incoming coverage, outgoing Archive and truthful independent Ladder periods', async ({
  page,
}) => {
  const now = Date.now(),
    boundary = new Date(now + 1).toISOString();
  const config = {
    ...regulations,
    cohorts: {
      'M-C': { ...regulations.cohorts['M-C'], endsAt: boundary },
      'M-D': {
        ...regulations.cohorts['M-C'],
        startsAt: boundary,
        endsAt: new Date(now + 86400000).toISOString(),
        reviewed: true,
      },
    },
  };
  const store = new Store('.monstats/e2e/monstats.sqlite', false, config);
  const pointers = store.db
    .prepare('SELECT name,version_id FROM pointers')
    .all();
  const retired = store.state('retired:M-C');
  try {
    // Another transition test retains a populated M-D stage. This case specifically exercises an empty incoming publication.
    store.db.prepare('DELETE FROM pointers WHERE name=?').run('staged:M-D');
    lifecycle(store, now + 2);
    await page.goto('/');
    await expect(page.locator('.header-context')).toContainText('M-D');
    await expect(
      page.getByRole('heading', { name: 'No eligible results yet' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.locator('.header-context')).toContainText('M-C');
    await page.getByRole('button', { name: 'Ladder', exact: true }).click();
    await expect(page.locator('.header-context')).toContainText('M-C');
    await expect(page.getByText(/Archived reporting period/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  } finally {
    store.db.exec('BEGIN IMMEDIATE');
    store.db.exec('DELETE FROM pointers');
    for (const p of pointers)
      store.db
        .prepare('INSERT INTO pointers VALUES (?,?)')
        .run(String(p.name), String(p.version_id));
    if (retired === null) store.clearState('retired:M-C');
    else store.saveState('retired:M-C', retired);
    store.saveState('active-regulation', 'M-C');
    store.db.exec('COMMIT');
    store.close();
  }
});

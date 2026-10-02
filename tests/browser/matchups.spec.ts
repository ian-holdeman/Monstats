import { test, expect } from '@playwright/test';
import { Store } from '../../src/server/store';

async function add(
  page: import('@playwright/test').Page,
  side: 'Candidate A' | 'Opponent B',
  name: string,
) {
  await page.getByRole('textbox', { name: `Search ${side}` }).fill(name);
  await page
    .getByRole('button', { name: new RegExp(`^Add ${name} to ${side}$`, 'i') })
    .click();
}
test('detail links, keyboard selection, mirrors, evidence and removal', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Compare Incineroar teams', exact: true })
    .click();
  const result = page.locator('.combination-results');
  await expect(result.getByRole('heading', { level: 2 })).toHaveText(
    'Incineroar teams · overall',
  );
  await expect(result.getByText('25.0%', { exact: true })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Opponent mode' })
    .selectOption('selected');
  await page.getByRole('textbox', { name: 'Search Opponent B' }).fill('incin');
  await page
    .getByRole('button', { name: 'Add Incineroar to Opponent B', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(result.getByRole('heading', { level: 2 })).toContainText(
    'into Incineroar teams',
  );
  await expect(result.getByText('50.0%', { exact: true })).toBeVisible();
  await expect(result.getByText('+25.0 points', { exact: true })).toBeVisible();
  await result.getByText(/Evidence ·/).click();
  await expect(
    result.locator('.combination-evidence p').filter({ hasText: 'Against B:' }),
  ).toContainText('team perspectives');
  await expect(result.getByText(/Candidate’s overall baseline/)).toContainText(
    'includes B',
  );
  await page
    .getByRole('button', { name: 'Remove Incineroar from Opponent B' })
    .click();
  await expect(
    page.getByText('Add one to six Pokémon to Opponent B.'),
  ).toBeVisible();
  await expect(result).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Opponent mode' })
    .selectOption('overall');
  await expect(result.getByRole('heading', { level: 2 })).toHaveText(
    'Incineroar teams · overall',
  );
  await page
    .getByRole('button', { name: 'Remove Incineroar from Candidate A' })
    .click();
  await expect(result).toHaveCount(0);
  await expect(
    page.getByText('Add one to six Pokémon to Candidate A.'),
  ).toBeVisible();
});

test('clearing a selection discards failed results and late responses', async ({
  page,
}) => {
  await page.goto('/matchups');
  await add(page, 'Candidate A', 'Incineroar');
  await expect(page.locator('.combination-results h2')).toContainText(
    'Incineroar',
  );
  let release = () => {};
  let requested = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestSeen = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/matchups/*', async (route) => {
    const result = await route.fetch();
    requested();
    await held;
    await route.fulfill({ response: result });
  });
  await add(page, 'Candidate A', 'Rillaboom');
  await requestSeen;
  await page
    .getByRole('button', { name: 'Remove Incineroar from Candidate A' })
    .click();
  await page
    .getByRole('button', { name: 'Remove Rillaboom from Candidate A' })
    .click();
  await expect(page.locator('.combination-results')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Dynamic matchups' }),
  ).toHaveAttribute('aria-busy', 'false');
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.locator('.combination-results')).toHaveCount(0);
  await add(page, 'Candidate A', 'Sneasler');
  await expect(page.locator('.combination-results h2')).toContainText(
    'Sneasler',
  );
  await page.route('**/matchups/*', (route) =>
    route.fulfill({ status: 503, json: { error: 'Test read failure' } }),
  );
  await add(page, 'Candidate A', 'Pelipper');
  await expect(
    page.getByRole('region', { name: 'Dynamic matchups' }).getByRole('alert'),
  ).toContainText('Test read failure');
  await page
    .getByRole('button', { name: 'Remove Sneasler from Candidate A' })
    .click();
  await page
    .getByRole('button', { name: 'Remove Pelipper from Candidate A' })
    .click();
  await expect(page.locator('.combination-results')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Dynamic matchups' }).getByRole('alert'),
  ).toHaveCount(0);
});

test('retained results cannot navigate using changed filters', async ({
  page,
}) => {
  await page.goto('/matchups');
  await page.getByRole('button', { name: 'Discover combinations' }).click();
  const inspect = page
    .locator('.combination-results')
    .getByRole('button', { name: /Inspect/ })
    .first();
  await expect(inspect).toBeEnabled();
  await page.route('**/matchups/*', (route) =>
    route.fulfill({ status: 503, json: { error: 'Test read failure' } }),
  );
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Team sheets', exact: true })
    .selectOption('closed');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Dynamic matchups' }).getByRole('alert'),
  ).toContainText('Test read failure');
  await expect(inspect).toBeDisabled();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.locator('.combination-results')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Dynamic matchups' }).getByRole('alert'),
  ).toHaveCount(0);
});

test('cleared selections stay cleared across modes and fresh navigation', async ({
  page,
}) => {
  await page.goto('/matchups');
  await add(page, 'Candidate A', 'Incineroar');
  await expect(page.locator('.combination-results h2')).toContainText(
    'Incineroar',
  );
  await page
    .getByRole('combobox', { name: 'Opponent mode' })
    .selectOption('selected');
  await add(page, 'Opponent B', 'Sneasler');
  await expect(page.locator('.combination-results h2')).toContainText(
    'into Sneasler',
  );
  await page
    .getByRole('button', { name: 'Remove Sneasler from Opponent B' })
    .click();
  await page
    .getByRole('button', { name: 'Remove Incineroar from Candidate A' })
    .click();
  await page
    .getByRole('combobox', { name: 'Opponent mode' })
    .selectOption('overall');
  await page.getByRole('button', { name: 'Discover combinations' }).click();
  await expect(page.locator('.combination-results h2')).toContainText(
    'overall',
  );
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.locator('.combination-results')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Remove .* from Candidate A/ }),
  ).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Opponent mode' })
    .selectOption('selected');
  await expect(
    page.getByRole('button', { name: /Remove .* from Opponent B/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Tournaments', exact: true }).click();
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Discover combinations into Incineroar' })
    .click();
  await expect(page.locator('.combination-results h2')).toContainText(
    'into Incineroar',
  );
  await page.getByRole('button', { name: 'Matchups', exact: true }).click();
  await expect(page.locator('.combination-results h2')).toContainText(
    'into Incineroar',
  );
  await page.getByRole('button', { name: 'Tournaments', exact: true }).click();
  await page.getByRole('button', { name: 'Matchups', exact: true }).click();
  await expect(page.locator('.combination-results')).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: 'Opponent mode' }),
  ).toHaveValue('overall');
});
test('discovery supports all six sizes, valid mode sorts, and inspect direction', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Discover combinations into Incineroar' })
    .click();
  const results = page.locator('.combination-results');
  await expect(results.getByRole('heading', { level: 2 })).toContainText(
    '1-Pokémon',
  );
  await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveValue(
    'difference',
  );
  await expect(results.locator('.combination-result').first()).toContainText(
    'Rillaboom',
  );
  await page.getByRole('combobox', { name: 'Sort by' }).selectOption('winRate');
  await expect(results.locator('.combination-result').first()).toContainText(
    'Garchomp',
  );
  await expect(
    results.getByRole('region', { name: 'Best combinations', exact: true }),
  ).toBeVisible();
  await expect(
    results.getByRole('region', { name: 'Worst combinations', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Ranking', exact: true }),
  ).toHaveCount(0);
  for (let k = 2; k <= 6; k++) {
    await page
      .getByRole('combobox', { name: 'Combination size' })
      .selectOption(String(k));
    await expect(results.getByRole('heading', { level: 2 })).toContainText(
      `${k}-Pokémon`,
    );
  }
  await expect(
    results.getByRole('heading', { name: 'Insufficient evidence' }).first(),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Opponent mode' })
    .selectOption('overall');
  await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveValue(
    'winRate',
  );
  await expect(
    page.getByRole('option', { name: 'Change vs own overall' }),
  ).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Combination size' })
    .selectOption('1');
  await expect(results.getByRole('heading', { level: 2 })).toContainText(
    'overall',
  );
  await expect(
    results.getByText('Change vs overall', { exact: true }),
  ).toHaveCount(0);
  await results
    .getByRole('button', { name: /Inspect/ })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Compare', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});
test('six-member caps, canonical selections, sparse and zero-result states on narrow layouts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Matchups', exact: true }).click();
  for (const name of [
    'Incineroar',
    'Rillaboom',
    'Sneasler',
    'Garchomp',
    'Pelipper',
    'Farigiraf',
  ])
    await add(page, 'Candidate A', name);
  await expect(
    page.getByRole('textbox', { name: 'Search Candidate A' }),
  ).toBeDisabled();
  await expect(
    page.getByText('No observed results for this selection'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '.monstats/previews/matchups-mobile.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: /Remove Farigiraf from Candidate A/i })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Search Candidate A' }),
  ).toBeEnabled();
  await page
    .getByRole('textbox', { name: 'Search Candidate A' })
    .fill('missingmon');
  await expect(
    page.getByText('No Pokémon found in this publication.'),
  ).toBeVisible();
});
test('filter Apply retains displayed summaries and failures preserve results', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Matchups', exact: true }).click();
  await add(page, 'Candidate A', 'Incineroar');
  const heading = page.locator('.combination-results h2');
  await expect(heading).toContainText('Incineroar');
  await page.getByText('Filters', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Team sheets', exact: true })
    .selectOption('closed');
  await expect(page.locator('.matchup-filter-summary')).toContainText(
    'All sheets',
  );
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/matchups/*', async (route) => {
    await held;
    await route.fulfill({ status: 503, json: { error: 'Test read failure' } });
  });
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Calculating');
  await expect(page.locator('.matchup-filter-summary')).toContainText(
    'All sheets',
  );
  await expect(heading).toContainText('Incineroar');
  release();
  await expect(
    page.getByRole('region', { name: 'Dynamic matchups' }).getByRole('alert'),
  ).toContainText('Test read failure');
  await expect(page.locator('.matchup-filter-summary')).toContainText(
    'All sheets',
  );
  await page.unroute('**/matchups/*');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.matchup-filter-summary')).toContainText('CTS');
  await expect(
    page.getByText('No observed results for this selection'),
  ).toBeVisible();
});
test('stale responses cannot replace a newer discovery request', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Matchups', exact: true }).click();
  await page.getByRole('button', { name: 'Discover combinations' }).click();
  await expect(page.locator('.combination-results h2')).toContainText(
    '1-Pokémon',
  );
  let release = () => {};
  let requested = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestSeen = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/matchups/*', async (route) => {
    if (route.request().postDataJSON().candidateSize === 3) {
      requested();
      const result = await route.fetch();
      await held;
      await route.fulfill({ response: result });
    } else await route.continue();
  });
  await page
    .getByRole('combobox', { name: 'Combination size' })
    .selectOption('3');
  await requestSeen;
  await expect(page.locator('.combination-results h2')).toContainText(
    '1-Pokémon',
  );
  await page
    .getByRole('combobox', { name: 'Combination size' })
    .selectOption('4');
  await expect(page.locator('.combination-results h2')).toContainText(
    '4-Pokémon',
  );
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.locator('.combination-results h2')).toContainText(
    '4-Pokémon',
  );
});
test('missing indexes are unavailable and browsing never backfills them', async ({
  page,
}) => {
  const store = new Store('.monstats/e2e/monstats.sqlite');
  const saved = store.current()!;
  const missing = { ...saved, id: 'missing-matchup-index-fixture' };
  store.db
    .prepare('INSERT OR REPLACE INTO versions VALUES (?,?,?,?)')
    .run(missing.id, 'M-C', missing.publishedAt, JSON.stringify(missing));
  store.db
    .prepare("UPDATE pointers SET version_id=? WHERE name='active'")
    .run(missing.id);
  const before = store.db
    .prepare('SELECT count(*) n FROM matchup_indexes')
    .get()!.n;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Matchups', exact: true }).click();
    await add(page, 'Candidate A', 'Incineroar');
    await expect(
      page.getByRole('region', { name: 'Dynamic matchups' }).getByRole('alert'),
    ).toContainText('Matchup index unavailable');
    expect(
      store.db.prepare('SELECT count(*) n FROM matchup_indexes').get()!.n,
    ).toBe(before);
  } finally {
    store.commit(saved);
    store.close();
  }
});
test('API bounds requests, rejects unknown identities and shares immutable results', async ({
  page,
}) => {
  const store = new Store('.monstats/e2e/monstats.sqlite', true);
  const id = store.current()!.id;
  store.close();
  const body = {
    mode: 'compare',
    a: ['incineroar'],
    b: [],
    candidateSize: 1,
    sort: 'winRate',
    direction: 'best',
    offset: 0,
    limit: 20,
    source: 'all',
    sheet: 'all',
    minPlayers: 0,
    official: false,
  };
  for (const change of [
    { a: ['unknown'] },
    { a: Array(7).fill('incineroar') },
    { a: ['incineroar', 'incineroar'] },
    { limit: 51 },
    { candidateSize: 7 },
    { sort: 'difference' },
    { source: 5 },
    { a: null },
  ]) {
    expect(
      (
        await page.request.post(`/matchups/${id}`, {
          data: { ...body, ...change },
        })
      ).status(),
    ).toBe(400);
  }
  const [one, two] = await Promise.all([
    page.request.post(`/matchups/${id}`, { data: body }),
    page.request.post(`/matchups/${id}`, { data: body }),
  ]);
  expect(one.status()).toBe(200);
  expect(await one.json()).toEqual(await two.json());
  expect(
    (
      await page.request.post(`/matchups/${id}`, {
        data: { ...body, padding: 'x'.repeat(5000) },
      })
    ).status(),
  ).toBe(413);
});

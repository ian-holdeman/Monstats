import { test, expect } from '@playwright/test';
import { Store } from '../../src/server/store';
import { Dex } from '@pkmn/dex';

const candidates = [
  'venusaur',
  'charizard',
  'blastoise',
  'butterfree',
  'beedrill',
  'pidgeot',
  'raticate',
  'fearow',
  'arbok',
  'pikachu',
  'raichu',
  'sandslash',
  'clefable',
  'ninetales',
  'wigglytuff',
  'golbat',
  'vileplume',
  'parasect',
  'venomoth',
  'dugtrio',
  'persian',
  'golduck',
  'primeape',
  'arcanine',
  'poliwrath',
  'alakazam',
  'machamp',
  'victreebel',
  'tentacruel',
  'golem',
  'rapidash',
  'slowbro',
  'magneton',
  'dodrio',
  'dewgong',
];

test('detail groups scroll independently, keep sticky sorts, reset ordering, disclose evidence and stack without overflow', async ({
  page,
}) => {
  const store = new Store('.monstats/e2e/monstats.sqlite');
  const saved = store.current()!;
  const d = structuredClone(saved);
  d.id = 'compact-detail-fixture';
  const modifiedMetrics = new Set<unknown>();
  for (const view of new Set(Object.values(d.views))) {
    if (modifiedMetrics.has(view.matchups)) continue;
    modifiedMetrics.add(view.matchups);
    if (!view.matchups.incineroar?.length) continue;
    const base = view.matchups.incineroar[0];
    const pokemon = view.pokemon[0];
    for (const [i, id] of candidates.entries()) {
      if (!view.pokemon.some((p) => p.id === id))
        view.pokemon.push({ ...pokemon, id, name: Dex.species.get(id).name });
      view.matchups.incineroar.push({
        ...base,
        id,
        name: Dex.species.get(id).name,
        winRate: 50 + (i % 2 ? -1 : 1),
        baseline: 50,
        difference: i % 2 ? -1 : 1,
        matches: 200,
        events: 3,
        players: 5,
      });
    }
  }
  store.commit(d);
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
    const best = page.getByRole('region', {
      name: 'Best performers into Incineroar teams',
      exact: true,
    });
    const worst = page.getByRole('region', {
      name: 'Worst performers into Incineroar teams',
      exact: true,
    });
    const bestRows = best.getByRole('region', {
      name: 'Best matchup rows',
      exact: true,
    });
    const worstRows = worst.getByRole('region', {
      name: 'Worst matchup rows',
      exact: true,
    });
    await expect(bestRows.locator('tbody > tr')).toHaveCount(22);
    await expect(worstRows.locator('tbody > tr')).toHaveCount(17);
    const geometry = await bestRows.evaluate((el) => ({
      height: el.clientHeight,
      content: el.scrollHeight,
      row: el.querySelector('tbody tr')!.getBoundingClientRect().height,
    }));
    expect(geometry.content).toBeGreaterThan(geometry.height);
    expect(geometry.height / geometry.row).toBeGreaterThan(4.5);
    expect(geometry.height / geometry.row).toBeLessThan(7);
    const [a, b] = await page.locator('.results-pair').evaluate((el) =>
      [...el.querySelectorAll('.matchup-section')].map((section) => {
        const r = section.getBoundingClientRect();
        return { x: r.x, y: r.y };
      }),
    );
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x);
    await bestRows.focus();
    await page.keyboard.press('End');
    await expect
      .poll(() => bestRows.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    expect(await worstRows.evaluate((el) => el.scrollTop)).toBe(0);
    const top = await bestRows.evaluate((el) => ({
      region: el.getBoundingClientRect().top,
      header: el.querySelector('thead')!.getBoundingClientRect().top,
    }));
    expect(Math.abs(top.region - top.header)).toBeLessThan(3);
    await best.getByRole('button', { name: 'Win rate', exact: true }).click();
    await expect.poll(() => bestRows.evaluate((el) => el.scrollTop)).toBe(0);
    await best.locator('.baseline-toggle').first().click();
    await expect(best.locator('.matchup-evidence')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect((await worst.boundingBox())!.y).toBeGreaterThan(
      (await best.boundingBox())!.y,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    store.commit(saved);
    store.close();
  }
});

test('conditional discovery keeps both bounded groups, independent pagination, scrolling and empty membership under all sorts', async ({
  page,
}) => {
  let emptyWorst = false;
  await page.route('**/matchups/*', async (route) => {
    const upstream = await route.fetch();
    const meta = await upstream.json();
    const q = route.request().postDataJSON();
    const baseline = {
      wins: 5000000,
      losses: 5000000,
      outcomes: 10000000,
      winRate: 50,
      matches: 200,
      events: 3,
      players: 5,
    };
    const all = candidates.map((id) => ({
      key: id,
      members: [id],
      sample: {
        ...baseline,
        winRate: 50 + (q.direction === 'best' ? 0.00001 : -0.00001),
      },
      overall: baseline,
      difference: q.direction === 'best' ? 0.00001 : -0.00001,
      sufficient: true,
    }));
    await route.fulfill({
      response: upstream,
      json: {
        ...meta,
        request: q,
        catalog: [
          ...meta.catalog,
          ...candidates.map((id) => ({ id, name: Dex.species.get(id).name })),
        ],
        rows:
          emptyWorst && q.direction === 'worst'
            ? []
            : all.slice(q.offset, q.offset + q.limit),
        total: emptyWorst && q.direction === 'worst' ? 0 : all.length,
        eligibleTotal: all.length * 2,
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Discover combinations into Incineroar' })
    .click();
  const best = page.getByRole('region', {
    name: 'Best combinations',
    exact: true,
  });
  const worst = page.getByRole('region', {
    name: 'Worst combinations',
    exact: true,
  });
  await expect(best.locator('.combination-result')).toHaveCount(20);
  await expect(worst.locator('.combination-result')).toHaveCount(20);
  await expect(best).toContainText('+0.0 points');
  await expect(worst).toContainText('0.0 points');
  const scroll = best.getByRole('region', {
    name: 'Best combination rows',
    exact: true,
  });
  await scroll.focus();
  await page.keyboard.press('End');
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await best.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(best.locator('.combination-result')).toHaveCount(15);
  await expect(worst.locator('.combination-result')).toHaveCount(20);
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0);
  for (const sort of ['winRate', 'evidence', 'difference']) {
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption(sort);
    await expect(best.locator('.combination-result')).toHaveCount(20);
    await expect(worst.locator('.combination-result')).toHaveCount(20);
  }
  await best.locator('.combination-evidence summary').first().click();
  await expect(best.locator('.combination-evidence[open]')).toContainText(
    'Candidate’s overall baseline',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await worst.boundingBox())!.y).toBeGreaterThan(
    (await best.boundingBox())!.y,
  );
  emptyWorst = true;
  await page
    .getByRole('combobox', { name: 'Combination size' })
    .selectOption('2');
  await expect(worst).toContainText('No qualifying negative matchups');
  await expect(worst.locator('.combination-result')).toHaveCount(0);
});

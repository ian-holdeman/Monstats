import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSlot } from '../src/domain/normalize';
import { aggregate } from '../src/domain/analytics';
import { fixture, slot } from './fixtures';
import {
  correctPublication,
  correctSavedIdentities,
} from '../src/server/identity-correction';
import { Store, publish } from '../src/server/store';
import {
  canonicalizeLadder,
  parseChampions,
  parseShowdown,
  validateLadder,
} from '../src/domain/ladder';
import {
  championsResponse,
  showdownChaos,
  showdownUsage,
} from './ladder-fixtures';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { speciesSearch } from '../src/domain/species-identity';

test('Sinistcha cosmetic aliases share one identity without losing source evidence', () => {
  for (const name of [
    'Sinistcha',
    'Sinistcha-Masterpiece',
    'Sinistcha [Masterpiece Form]',
    'Sinistcha [Unremarkable Form]',
  ]) {
    const row = normalizeSlot({
      name,
      id: 'sinistchamasterpiece',
      item: 'Leftovers',
    });
    assert.equal(row.id, 'sinistcha');
    assert.equal(row.name, 'Sinistcha');
    assert.equal(row.originalName, name);
    assert.equal(row.originalId, 'sinistchamasterpiece');
    assert.equal(row.item, 'Leftovers');
  }
  assert.throws(
    () => normalizeSlot({ name: 'Sinistcha', id: 'poltchageist' }),
    /conflicting/,
  );
  assert.equal(
    normalizeSlot({ name: 'Poltchageist-Artisan' }).id,
    'poltchageistartisan',
  );
  assert.equal(normalizeSlot({ name: 'Maushold-Four' }).id, 'mausholdfour');
});

const snapshots = [
  {
    url: 'https://example.test',
    checksum: 'a'.repeat(64),
    retrievedAt: '2026-09-30T12:00:00.000Z',
  },
];
test('Ladder cosmetic correction rejects duplicate evidence for the same form or unrelated species', () => {
  const source = parseShowdown(showdownUsage, showdownChaos(), {
    month: '2026-09',
    formatId: 'gen9championsvgc2026regmc',
    rating: 1630,
    snapshots,
  });
  for (const rawName of ['Incineroar', 'Sinistcha', 'Sinistcha-Masterpiece']) {
    const species = normalizeSlot({ name: rawName });
    const row = {
      ...source.rows[0],
      id: species.id,
      name: species.name,
      rawName,
    };
    assert.throws(
      () =>
        validateLadder(
          canonicalizeLadder({ ...source, rows: [row, { ...row, rank: 2 }] }),
        ),
      /Duplicate ladder/,
    );
  }
});
test('tournament correction recomputes mirrors, aliases and known-field denominators once per registration', () => {
  const event = fixture();
  event.registrations[0].slots = [
    { ...slot('sinistcha'), item: 'Leftovers' },
    { ...slot('sinistchamasterpiece'), item: 'Sitrus Berry' },
    slot('rillaboom'),
  ];
  event.registrations[1].slots = [
    slot('sinistchamasterpiece'),
    slot('sneasler'),
  ];
  const old = {
    id: '1234567890abcdef',
    publishedAt: '2026-09-30T00:00:00Z',
    asOf: '2026-09-30T00:00:00Z',
    normalizationVersion: 'old',
    calculationVersion: 'fixture',
    scope: 'fixture',
    events: [event],
    floor: { matches: 1, events: 1, players: 1 },
    views: {
      'all:0': aggregate([event], {
        regulation: 'M-C',
        asOf: '2026-09-30T00:00:00Z',
        days: 30,
        sheet: 'all',
        minPlayers: 0,
      }),
    },
  };
  const corrected = correctPublication(old);
  const row = corrected.views['all:0'].pokemon.find(
    (r) => r.id === 'sinistcha',
  )!;
  assert.equal(row.registrations, 2);
  assert.equal(row.matches, 3);
  assert.equal(row.outcomes, 4);
  assert.equal(row.wins, 1);
  assert.equal(corrected.views['all:0'].builds!.sinistcha.items.total, 2);
  assert.equal(corrected.views['all:0'].builds!.sinistcha.items.known, 0);
  assert.equal(
    corrected.views['all:0'].pokemon.some(
      (r) => r.id === 'sinistchamasterpiece',
    ),
    false,
  );
  assert.deepEqual(
    corrected.events[0].registrations[0].slots!.map((s) => s.originalId),
    event.registrations[0].slots!.map((s) => s.originalId),
  );
  assert.ok(speciesSearch('sinistcha', 'Sinistcha', 'Masterpiece'));
});
test('saved correction is repeatable, atomic and does not reopen frozen final state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-identity-'));
  const store = new Store(join(directory, 'db.sqlite'));
  try {
    const event = fixture();
    event.registrations[0].slots!.push({
      ...slot('sinistchamasterpiece'),
      name: 'Sinistcha-Masterpiece',
    });
    const old = publish(store, [event], '2026-09-30T00:00:00Z', 'fixture');
    store.archiveCurrent('M-C');
    store.saveState('final:M-C', {
      id: 'fixed',
      state: 'complete',
      publication: old.id,
      deadline: 1,
    });
    const ledger = store.state('final:M-C');
    store.db.exec(
      "CREATE TRIGGER fail_correction BEFORE UPDATE ON pointers BEGIN SELECT RAISE(ABORT,'correction interrupted'); END",
    );
    assert.throws(
      () => correctSavedIdentities(store),
      /correction interrupted/,
    );
    assert.equal(store.archives()[0].id, old.id);
    assert.deepEqual(store.state('final:M-C'), ledger);
    store.db.exec('DROP TRIGGER fail_correction');
    const first = correctSavedIdentities(store);
    assert.equal(first.length, 1);
    assert.equal(store.archives()[0].id, first[0].after);
    assert.equal(store.archives()[0].asOf, old.asOf);
    assert.equal(
      store.version(old.id)!.events[0].registrations[0].slots!.at(-1)!.id,
      'sinistchamasterpiece',
    );
    assert.deepEqual(store.state('final:M-C'), ledger);
    assert.deepEqual(correctSavedIdentities(store), []);
    assert.ok(store.acquireLease('another', Date.now()));
    assert.throws(() => correctSavedIdentities(store), /idle/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test('Ladder pooling uses source weights and never adds ranks or equally averages builds', () => {
  const source = parseShowdown(showdownUsage, showdownChaos(), {
    month: '2026-09',
    formatId: 'gen9championsvgc2026regmc',
    rating: 1630,
    snapshots,
  });
  const sample = source.rows[0];
  const corrected = canonicalizeLadder({
    ...source,
    rows: [
      {
        ...sample,
        id: 'sinistcha',
        name: 'Sinistcha',
        rawName: 'Sinistcha',
        usage: 10,
        rank: 2,
        builds: {
          items: {
            kind: 'percent',
            denominator: 10,
            basis: 'weights',
            values: [
              { name: 'Leftovers', percent: 100, rank: null, weight: 10 },
            ],
          },
        },
      },
      {
        ...sample,
        id: 'sinistchamasterpiece',
        name: 'Sinistcha-Masterpiece',
        rawName: 'Sinistcha-Masterpiece',
        usage: 20,
        rank: 3,
        builds: {
          items: {
            kind: 'percent',
            denominator: 30,
            basis: 'weights',
            values: [
              { name: 'Sitrus Berry', percent: 100, rank: null, weight: 30 },
            ],
          },
        },
      },
    ],
  });
  const row = validateLadder(corrected).rows[0];
  assert.equal(row.usage, 30);
  assert.equal(row.rank, null);
  assert.equal(row.builds.items!.denominator, 40);
  assert.equal(
    row.builds.items!.values.find((v) => v.name === 'Leftovers')!.percent,
    25,
  );
  const missing = canonicalizeLadder({
    ...source,
    rows: [
      { ...sample, id: 'sinistcha', name: 'Sinistcha', rawName: 'Sinistcha' },
      {
        ...sample,
        id: 'sinistchamasterpiece',
        name: 'Sinistcha-Masterpiece',
        rawName: 'Sinistcha-Masterpiece',
        builds: {},
      },
    ],
  });
  assert.deepEqual(missing.rows[0].builds, {});
  const response = championsResponse();
  response.pokemon_names = [
    ['Sinistcha', '#1', [], ''],
    ['Sinistcha-Masterpiece', '#2', [], ''],
  ];
  response.selected_pokemon = 'Sinistcha';
  response.current_pokemon = ['Sinistcha', '', '1', []];
  response.teammates_list = [];
  const champions = parseChampions([response], snapshots);
  assert.equal(champions.rows.length, 1);
  assert.equal(champions.rows[0].rank, null);
  assert.deepEqual(champions.rows[0].builds, {});
  assert.equal(champions.rows[0].usage, null);
});

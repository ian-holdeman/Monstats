import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import {
  parseChampions,
  parseShowdown,
  discoverShowdown,
  ladderKey,
  validateLadder,
} from '../src/domain/ladder';
import { LadderStore } from '../src/server/ladder-store';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import {
  championsResponse,
  showdownUsage,
  showdownChaos,
} from './ladder-fixtures';
const snapshot = {
  url: 'https://example.test/evidence',
  checksum: 'a'.repeat(64),
  retrievedAt: '2026-10-01T19:00:00.000Z',
};
const options = {
  month: '2026-09',
  formatId: 'gen9championsvgc2026regmc',
  rating: 1630,
  snapshots: [snapshot],
};
test('Champions quarantines unresolved teammate labels without losing the resolved ranking or other build fields', () => {
  const input = championsResponse();
  input.teammates_list.push(['Slowboo)~=Ctié@R,', '#2']);
  const d = parseChampions([input], [snapshot]);
  assert.equal(d.rows.length, 2);
  assert.equal(d.detailCoverage, 1);
  assert.equal(d.rows[0].builds.teammates?.values.length, 1);
  assert.equal(d.rows[0].builds.items?.values[0].percent, 58.2);
  assert.deepEqual(d.excluded[0], {
    rawName: 'Slowboo)~=Ctié@R,',
    pokemon: 'Rillaboom',
    reason: 'Unresolved canonical teammate; original evidence retained.',
  });
});
test('Champions preserves rank, zero marginal percentages, teammate rank and separate form identity', () => {
  const d = parseChampions([championsResponse()], [snapshot]);
  assert.equal(d.regulation, 'M-C');
  assert.equal(d.season, 'M-6');
  assert.equal(d.rows[0].usage, null);
  assert.equal(d.rows[0].rank, 1);
  assert.equal(
    d.rows[0].builds.moves?.values.find((v) => v.name === 'Protect')?.percent,
    0,
  );
  assert.equal(d.rows[0].builds.teammates?.kind, 'rank');
  assert.equal(d.rows[0].builds.teammates?.values[0].percent, null);
  assert.equal(d.rows[0].builds.teammates?.values[0].rank, 1);
  assert.equal(d.capturedAt, '2026-09-30T12:00:00.000Z');
  assert.equal(d.rows[1].builds.items, undefined);
});

test('Champions coalesces identical build tuples and excludes conflicting canonical labels without guessing ranks', () => {
  const input = championsResponse();
  input.teammates_list = [
    ['Incineroar', '#1'],
    ['incineroar', '#4'],
    ['Garchomp', '#7'],
  ];
  input.natures_list = [
    ['Naughty', '0.6'],
    ['naughty', '0.6'],
    ['Gentle', '0.2'],
    ['gentle', '0.1'],
  ];
  const unchanged = structuredClone(input);
  const d = parseChampions([input], [snapshot]);
  assert.deepEqual(input, unchanged);
  assert.deepEqual(
    d.rows[0].builds.teammates?.values.map((v) => [v.name, v.rank]),
    [['Garchomp', 7]],
  );
  assert.deepEqual(
    d.rows[0].builds.natures?.values.map((v) => [v.name, v.percent]),
    [['Naughty', 0.6]],
  );
  assert.equal(d.excluded.length, 2);
  assert.ok(d.excluded.every((v) => /Conflicting duplicate/.test(v.reason)));
  assert.ok(d.notes.some((v) => /Conflicting duplicate/.test(v)));
});

test('legacy Champions read correction preserves immutable bytes, identities and timestamps while updating visible exclusions', () => {
  const store = new Store(':memory:');
  const ladder = new LadderStore(store);
  try {
    const original = ladder.publish(
      parseChampions([championsResponse()], [snapshot]),
    );
    const legacy = structuredClone(original);
    legacy.rows[0].builds.teammates!.values.push({
      ...legacy.rows[0].builds.teammates!.values[0],
      rank: 4,
    });
    legacy.rows[0].builds.natures!.values.push({
      ...legacy.rows[0].builds.natures!.values[0],
    });
    Reflect.deleteProperty(legacy, 'buildNormalizationVersion');
    const bytes = gzipSync(JSON.stringify(legacy));
    store.db
      .prepare('UPDATE ladder_versions SET payload=? WHERE id=?')
      .run(bytes, original.id);
    const metadata = JSON.parse(
      String(
        store.db
          .prepare('SELECT payload FROM ladder_summaries WHERE version_id=?')
          .get(original.id)!.payload,
      ),
    );
    delete metadata.buildNormalizationVersion;
    store.db
      .prepare('UPDATE ladder_summaries SET payload=? WHERE version_id=?')
      .run(JSON.stringify(metadata), original.id);
    const read = ladder.version(original.id)!;
    assert.deepEqual(read.rows[0].builds.teammates?.values, []);
    assert.equal(read.rows[0].builds.natures?.values.length, 1);
    assert.equal(read.excluded.length, original.excluded.length + 1);
    assert.equal(ladder.catalog()[0].excludedCount, read.excluded.length);
    assert.equal(read.id, original.id);
    assert.equal(read.publishedAt, original.publishedAt);
    assert.equal(read.capturedAt, original.capturedAt);
    assert.deepEqual(read.snapshots, original.snapshots);
    assert.deepEqual(ladder.version(original.id), read);
    assert.deepEqual(
      store.db
        .prepare('SELECT payload FROM ladder_versions WHERE id=?')
        .get(original.id)!.payload,
      new Uint8Array(bytes),
    );
  } finally {
    store.close();
  }
});
test('Champions rejects mixed capture, wrong mode, unknown identity and unsupported season evidence', () => {
  const first = championsResponse();
  const second = {
    ...first,
    selected_pokemon: 'Incineroar',
    current_pokemon: ['Incineroar', '', '2', []],
    champions_updated: 'September 29, 2026 at 12:00 UTC',
  };
  assert.throws(() => parseChampions([first, second], [snapshot]), /capture/i);
  assert.throws(() =>
    parseChampions([{ ...first, champions_slug: 'singles' }], [snapshot]),
  );
  assert.throws(() =>
    parseChampions(
      [{ ...first, pokemon_names: [['Imaginarymon', '#1', [], '']] }],
      [snapshot],
    ),
  );
  assert.throws(
    () =>
      parseChampions(
        [{ ...first, champions_updated: 'December 20, 2026 at 12:00 UTC' }],
        [snapshot],
      ),
    /season|contract/i,
  );
});
test('Showdown separates raw usage appearances, real appearances and set observations with weighted denominators', () => {
  const d = parseShowdown(showdownUsage, showdownChaos(), options);
  assert.equal(d.rows[0].usage, 45);
  assert.equal(d.rows[0].rawCount, 90);
  assert.equal(d.rows[0].setCount, 110);
  assert.equal(d.rows[0].realCount, 40);
  assert.equal(d.rows[0].builds.moves?.denominator, 10);
  assert.equal(d.rows[0].builds.moves?.values[0].percent, 90);
  assert.equal(d.rows[0].builds.natures?.values[0].name, 'Adamant');
  assert.equal(d.rows[0].builds.natures?.values[0].percent, 100);
  assert.equal(d.rows[1].usage, 0);
  assert.equal(d.rows[1].id, 'salamencemega');
  assert.equal(d.periodStart, '2026-09-01T00:00:00.000Z');
  assert.equal(d.periodEnd, '2026-10-01T00:00:00.000Z');
  assert.equal('winRate' in d.rows[0], false);
});
test('Showdown changed schemas, mismatched reports and duplicate canonical identities fail closed', () => {
  assert.throws(() =>
    parseShowdown(
      showdownUsage,
      { ...showdownChaos(), info: { ...showdownChaos().info, cutoff: 0 } },
      options,
    ),
  );
  assert.throws(() =>
    parseShowdown(
      showdownUsage.replace('45.00000%', '40.00000%'),
      showdownChaos(),
      options,
    ),
  );
  assert.throws(() =>
    parseShowdown(
      showdownUsage.replace('Salamence-Mega', 'Rillaboom'),
      showdownChaos(),
      options,
    ),
  );
  assert.throws(() =>
    parseShowdown('<html>error</html>', showdownChaos(), options),
  );
});
test('a missing low-usage set report preserves its usage and leaves build fields unavailable', () => {
  const source = showdownChaos();
  delete (source.data as Record<string, unknown>)['Salamence-Mega'];
  const d = parseShowdown(showdownUsage, source, options);
  assert.equal(d.rows[1].usage, 0);
  assert.equal(d.rows[1].setCount, null);
  assert.deepEqual(d.rows[1].builds, {});
  assert.equal(d.detailCoverage, 1);
});
test('empty move-slot multiplicity is not presented as move adoption above 100 percent', () => {
  const c = showdownChaos();
  (c.data.Rillaboom.Moves as Record<string, number>)[''] = 30;
  const d = parseShowdown(showdownUsage, c, options);
  assert.equal(
    d.rows[0].builds.moves?.values.some((v) => v.name === 'Nothing'),
    false,
  );
});
test('discovery admits only observed audited doubles formats and overlapping ratings remain separate', () => {
  const listing =
    '<a href="gen9championsvgc2026regmc-0.txt">x</a><a href="gen9championsvgc2026regmcbo3-1630.txt">x</a><a href="gen9championsbssregmc-1630.txt">x</a>';
  assert.equal(discoverShowdown(listing, '2026-09').length, 2);
  const a = parseShowdown(showdownUsage, showdownChaos(), options);
  const b = { ...a, rating: 0 as const };
  const c = {
    ...a,
    format: 'BO3' as const,
    formatId: options.formatId + 'bo3',
  };
  assert.notEqual(ladderKey(a), ladderKey(b));
  assert.notEqual(ladderKey(a), ladderKey(c));
  assert.throws(() => validateLadder({ ...a, environment: 'champions' }));
  assert.throws(() => validateLadder({ ...a, period: '2026-08' }));
  assert.throws(() =>
    validateLadder({
      ...parseChampions([championsResponse()], [snapshot]),
      regulation: 'M-B',
    }),
  );
});
test('ladder publication failure rolls back, retains history and never changes tournament pointers', () => {
  const store = new Store(':memory:');
  const tournament = publish(
    store,
    [fixture()],
    '2026-09-30T18:00:00Z',
    'test',
  );
  const ladder = new LadderStore(store);
  const first = ladder.publish(
    parseShowdown(showdownUsage, showdownChaos(), options),
  );
  assert.equal(store.current()?.id, tournament.id);
  store.db.exec(
    "CREATE TRIGGER reject_ladder BEFORE INSERT ON ladder_pointers BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
  );
  assert.throws(
    () =>
      ladder.publish({
        ...parseShowdown(showdownUsage, showdownChaos(), options),
        averageWeight: 0.082,
      }),
    /injected failure/,
  );
  assert.equal(ladder.catalog()[0].id, first.id);
  assert.equal(
    store.db.prepare('SELECT count(*) n FROM ladder_versions').get()?.n,
    1,
  );
  assert.equal(store.current()?.id, tournament.id);
  store.db.exec('DROP TRIGGER reject_ladder');
  const second = ladder.publish({
    ...parseShowdown(showdownUsage, showdownChaos(), options),
    averageWeight: 0.082,
  });
  assert.notEqual(second.id, first.id);
  assert.equal(ladder.version(first.id)?.id, first.id);
  ladder.failure('showdown', '2026-10-01T19:01:00.000Z', 'source failed');
  assert.equal(ladder.status('showdown')?.state, 'failure');
  assert.equal(ladder.catalog()[0].id, second.id);
  store.close();
});

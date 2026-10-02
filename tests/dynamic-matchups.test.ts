import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, publish } from '../src/server/store';
import { queryMatchups, backfillMatchups } from '../src/server/matchup-index';
import { referenceMatchups } from './matchup-reference';
import { fixture, slot } from './fixtures';
import { aggregate } from '../src/domain/analytics';
import {
  rankCombinations,
  type MatchupRequest,
} from '../src/domain/dynamic-matchups';

const asOf = '2026-09-30T18:00:00Z';
const floor = { matches: 1, events: 1, players: 1 };
const request: MatchupRequest = {
  mode: 'compare',
  a: ['rillaboom'],
  b: ['sneasler'],
  candidateSize: 1,
  sort: 'difference',
  direction: 'best',
  offset: 0,
  limit: 50,
  source: 'all',
  sheet: 'all',
  minPlayers: 0,
  official: false,
};

test('conditional sign groups and notice filtering precede totals and every page under every sort', async () => {
  const store = new Store(':memory:');
  try {
    const original = publish(store, [sixes()], asOf, 'sign pagination');
    const d = { ...original, id: 'sign-pages', floor };
    store.commit(d);
    for (const b of [['sneasler'], ['incineroar']])
      for (const sort of ['difference', 'winRate', 'evidence'] as const)
        for (const hideNotices of [false, true]) {
          const q = {
            ...request,
            mode: 'discover' as const,
            b,
            candidateSize: 2,
            sort,
            hideNotices,
            limit: 1,
          };
          const groups = await Promise.all(
            (['best', 'worst'] as const).map(async (direction) => {
              const full = referenceMatchups(d, { ...q, direction, limit: 50 });
              for (let offset = 0; offset <= full.total; offset++) {
                const page = await queryMatchups(store.db, d.id, {
                  ...q,
                  direction,
                  offset,
                });
                assert.equal(page.total, full.total);
                assert.deepEqual(
                  page.rows.map((r) => r.key),
                  full.rows.slice(offset, offset + 1).map((r) => r.key),
                );
                for (const row of page.rows)
                  assert.ok(
                    direction === 'best'
                      ? row.difference! >= 0
                      : row.difference! < 0,
                  );
              }
              return full.rows.map((r) => r.key);
            }),
          );
          assert.equal(
            groups[0].some((key) => groups[1].includes(key)),
            false,
          );
          if (!hideNotices) assert.ok(groups.flat().length > 0);
        }
    // Explicit comparison remains available even with the opposing discovery direction.
    const comparison = await queryMatchups(store.db, d.id, {
      ...request,
      a: ['incineroar', 'rillaboom'],
      b: ['garchomp'],
      direction: 'best',
    });
    assert.equal(comparison.rows[0].difference, -50);
  } finally {
    store.close();
  }
});
test('notice filter runs before pagination and preserves raw comparisons and floor', async () => {
  const store = new Store(':memory:');
  try {
    const event = fixture();
    event.matches = Array.from({ length: 100 }, (_, i) => ({
      ...event.matches[0],
      id: `physical-${i}`,
    }));
    event.matches.push({ ...fixture().matches[1], id: 'sparse' });
    const original = publish(store, [event], asOf, 'notice fixture');
    const d = { ...original, id: 'notice-pagination', floor };
    store.commit(d);
    const q = {
      ...request,
      mode: 'discover' as const,
      b: [],
      sort: 'winRate' as const,
      direction: 'worst' as const,
      limit: 1,
    };
    const raw = await queryMatchups(store.db, d.id, { ...q, limit: 50 });
    const eligible = raw.rows.filter((r) => r.sample.matches >= 100);
    assert.ok(eligible.length > 1);
    assert.ok(eligible.length < raw.total);
    for (let offset = 0; offset < eligible.length; offset++) {
      const hidden = await queryMatchups(store.db, d.id, {
        ...q,
        hideNotices: true,
        offset,
      });
      assert.equal(hidden.total, eligible.length);
      assert.deepEqual(hidden.rows, [eligible[offset]]);
    }
    const sparse = {
      ...request,
      a: ['garchomp'],
      b: [],
      sort: 'winRate' as const,
    };
    assert.equal((await queryMatchups(store.db, d.id, sparse)).rows.length, 1);
    assert.equal(
      (await queryMatchups(store.db, d.id, { ...sparse, hideNotices: true }))
        .total,
      0,
    );
    assert.deepEqual(
      (await queryMatchups(store.db, d.id, sparse)).rows,
      (await queryMatchups(store.db, d.id, { ...sparse, hideNotices: false }))
        .rows,
    );
  } finally {
    store.close();
  }
});
function sixes() {
  const e = fixture();
  e.registrations[0].slots = [
    'incineroar',
    'rillaboom',
    'pelipper',
    'amoonguss',
    'garchomp',
    'gholdengo',
  ].map(slot);
  e.registrations[1].slots = [
    'incineroar',
    'sneasler',
    'pelipper',
    'amoonguss',
    'dragonite',
    'gholdengo',
  ].map(slot);
  e.registrations[2].slots = [
    'sneasler',
    'garchomp',
    'dragonite',
    'farigiraf',
    'kingambit',
    'annihilape',
  ].map(slot);
  return e;
}
test('hand-calculated joint baseline, mirror evidence, zero and unavailable', async () => {
  const store = new Store(':memory:');
  try {
    const d = publish(store, [fixture()], asOf, 'test');
    backfillMatchups(store.db, d);
    const read = (q: Partial<MatchupRequest>) =>
      queryMatchups(store.db, d.id, { ...request, ...q });
    const joint = (
      await read({ a: ['incineroar', 'rillaboom'], b: ['garchomp'] })
    ).rows[0];
    assert.equal(joint.overall.winRate, 50);
    assert.equal(joint.sample.winRate, 0);
    assert.equal(joint.difference, -50);
    const mirror = (await read({ a: ['incineroar'], b: ['incineroar'] }))
      .rows[0];
    assert.equal(mirror.sample.winRate, 50);
    assert.equal(mirror.sample.outcomes, 2);
    assert.equal(mirror.sample.matches, 1);
    assert.equal(mirror.sample.players, 2);
    const empty = (await read({ a: ['rillaboom', 'sneasler'] })).rows[0];
    assert.equal(empty.overall.winRate, null);
    assert.equal(empty.difference, null);
    const single = await read({ a: ['sneasler'], b: ['incineroar'] });
    const old = aggregate(
      d.events,
      d.views['all:0'].options,
    ).matchups.incineroar.find((r) => r.id === 'sneasler')!;
    assert.equal(single.rows[0].sample.winRate, old.winRate);
    assert.equal(single.rows[0].overall.winRate, old.baseline);
    assert.equal(single.rows[0].difference, old.difference);
  } finally {
    store.close();
  }
});
test('indexed engine matches independent reference across sizes, modes, filters and sort directions', async () => {
  const store = new Store(':memory:');
  try {
    const e = sixes();
    e.matches.push(
      e.matches[0],
      { ...e.matches[0], id: 'tie', winner: 0 },
      { ...e.matches[0], id: 'admin', administrative: true },
    );
    const second = {
      ...sixes(),
      id: 'second',
      sheet: { ...e.sheet, visibility: 'closed' as const },
    };
    const original = publish(store, [e, second], asOf, 'test');
    const d = { ...original, id: 'reference-fixture', floor };
    store.commit(d);
    for (let k = 1; k <= 6; k++)
      for (const mode of ['compare', 'discover'] as const)
        for (const b of [
          [],
          ...Array.from({ length: 6 }, (_, i) =>
            e.registrations[1]
              .slots!.slice(0, i + 1)
              .map((s) => s.id)
              .reverse(),
          ),
        ])
          for (const direction of ['best', 'worst'] as const)
            for (const sort of b.length
              ? (['difference', 'winRate', 'evidence'] as const)
              : (['winRate', 'evidence'] as const)) {
              const q = {
                ...request,
                mode,
                a: e.registrations[0]
                  .slots!.slice(0, k)
                  .map((s) => s.id)
                  .reverse(),
                b,
                candidateSize: k,
                direction,
                sort,
              };
              const actual = await queryMatchups(store.db, d.id, q);
              assert.deepEqual(actual.rows, referenceMatchups(d, q).rows);
              assert.equal(actual.total, referenceMatchups(d, q).total);
            }
    for (const q of [
      { sheet: 'closed' as const },
      { source: 'none' },
      { official: true },
      { minPlayers: 100 },
    ]) {
      assert.deepEqual(
        (await queryMatchups(store.db, d.id, { ...request, ...q })).rows,
        referenceMatchups(d, { ...request, ...q }).rows,
      );
    }
  } finally {
    store.close();
  }
});
test('backfill is idempotent, validates before ready, and failed publication retains the prior pair', async () => {
  const store = new Store(':memory:');
  try {
    const d = publish(store, [sixes()], asOf, 'test');
    const before = await queryMatchups(store.db, d.id, request);
    backfillMatchups(store.db, d);
    assert.deepEqual(await queryMatchups(store.db, d.id, request), before);
    store.db.exec(
      "CREATE TRIGGER fail_index BEFORE INSERT ON matchup_results BEGIN SELECT RAISE(ABORT, 'interrupted build'); END",
    );
    assert.throws(
      () => publish(store, [sixes()], '2026-09-30T19:00:00Z', 'test'),
      /interrupted build/,
    );
    assert.equal(store.current()?.id, d.id);
    assert.deepEqual(await queryMatchups(store.db, d.id, request), before);
    store.db.exec('DROP TRIGGER fail_index');
    const next = publish(store, [sixes()], '2026-09-30T19:00:00Z', 'test');
    assert.notEqual(next.id, d.id);
    assert.equal(
      (await queryMatchups(store.db, next.id, request)).publication,
      next.id,
    );
    await assert.rejects(
      queryMatchups(store.db, 'missing', request),
      /index unavailable/i,
    );
    await assert.rejects(
      queryMatchups(store.db, d.id, { ...request, a: ['unknown'] }),
      /identity/i,
    );
    await assert.rejects(
      queryMatchups(store.db, d.id, {
        ...request,
        a: Array(7).fill('incineroar'),
      }),
      /selection/i,
    );
  } finally {
    store.close();
  }
});

test('ranking floor boundaries use distinct physical results, events and own participants', async () => {
  const store = new Store(':memory:');
  try {
    const events = [0, 1].map((index) => {
      const e = sixes();
      e.id = `floor-${index}`;
      const [left, right] = e.registrations;
      e.registrations = [];
      e.matches = [];
      for (let p = 0; p < 5; p++) {
        e.registrations.push(
          { ...left, player: `a${p}` },
          { ...right, player: `b${p}` },
        );
        for (let round = 1; round <= 2; round++)
          e.matches.push({
            id: `${p}-${round}`,
            phase: 1,
            round,
            player1: `a${p}`,
            player2: `b${p}`,
            winner: round === 1 ? `a${p}` : `b${p}`,
          });
      }
      return e;
    });
    const d = publish(store, events, asOf, 'floor-test');
    const q = { ...request, mode: 'discover' as const, a: [], b: ['sneasler'] };
    const eligible = await queryMatchups(store.db, d.id, q);
    const row = eligible.rows.find((r) => r.key === 'rillaboom')!;
    assert.ok(row);
    assert.equal(row.sample.matches, 20);
    assert.equal(row.sample.events, 2);
    assert.equal(row.sample.players, 5);
    for (const changed of [{ matches: 21 }, { events: 3 }, { players: 6 }]) {
      const next = {
        ...d,
        id: `floor-${Object.keys(changed)[0]}`,
        floor: { ...d.floor, ...changed },
      };
      store.commit(next);
      assert.equal((await queryMatchups(store.db, next.id, q)).rows.length, 0);
      const manual = (
        await queryMatchups(store.db, next.id, {
          ...q,
          mode: 'compare',
          a: ['rillaboom'],
        })
      ).rows[0];
      assert.equal(manual.sample.winRate, 50);
      assert.equal(manual.sufficient, false);
    }
    // Shared members are allowed; only exact identical sets are omitted automatically.
    const shared = await queryMatchups(store.db, d.id, {
      ...q,
      b: ['incineroar'],
    });
    assert.ok(shared.rows.some((r) => r.key === 'gholdengo'));
    assert.ok(!shared.rows.some((r) => r.key === 'incineroar'));
    const mirror = await queryMatchups(store.db, d.id, {
      ...q,
      mode: 'compare',
      a: ['incineroar'],
      b: ['incineroar'],
    });
    assert.equal(mirror.rows[0].sample.outcomes, 40);
    assert.equal(mirror.rows[0].sample.matches, 20);
  } finally {
    store.close();
  }
});
test('six identities mean exact unordered composition, joint baseline differs from members, and unobserved selections remain null', async () => {
  const store = new Store(':memory:');
  try {
    const e = sixes(),
      d = publish(store, [e], asOf, 'six-test');
    const a = e.registrations[0].slots!.map((s) => s.id),
      q = { ...request, a, b: [], sort: 'winRate' as const };
    const one = await queryMatchups(store.db, d.id, q),
      reversed = await queryMatchups(store.db, d.id, {
        ...q,
        a: [...a].reverse(),
      });
    assert.deepEqual(one, reversed);
    assert.equal(one.rows[0].overall.winRate, 50);
    assert.equal(one.rows[0].overall.outcomes, 2);
    const member = await queryMatchups(store.db, d.id, {
      ...q,
      a: ['incineroar'],
    });
    assert.equal(member.rows[0].overall.winRate, 25);
    const unknownCore = await queryMatchups(store.db, d.id, {
      ...q,
      a: ['rillaboom', 'farigiraf'],
    });
    assert.equal(unknownCore.rows[0].sample.winRate, null);
  } finally {
    store.close();
  }
});
test('mirrored record sources deduplicate, exclusions precede both baselines and provider filters pool counts', async () => {
  const store = new Store(':memory:');
  try {
    const e = sixes();
    e.provenance = {
      canonicalEvent: 'shared-event',
      participantNamespace: 'shared',
      environment: 'champions-cartridge',
      official: 'unknown',
      population: 'registrations',
      sources: [
        {
          provider: 'limitless',
          originalId: e.id,
          url: 'https://example.test',
        },
      ],
    };
    for (const [id, winner] of [
      ['tie', 0],
      ['losses', -1],
      ['unknown', null],
      ['bad', 'unknown'],
    ] as const)
      e.matches.push({ ...e.matches[0], id, winner });
    e.matches.push(
      e.matches[0],
      { ...e.matches[0], id: 'bye', player2: null },
      { ...e.matches[0], id: 'admin', administrative: true },
      { ...e.matches[0], id: 'phase', phase: 5 },
    );
    const mirror = {
      ...e,
      id: 'mirror',
      provenance: {
        ...e.provenance,
        sources: [
          {
            provider: 'victory-road',
            originalId: 'mirror',
            url: 'https://example.test/mirror',
          },
        ],
      },
    };
    const original = publish(store, [e, mirror], asOf, 'mirror-test');
    const d = { ...original, id: 'mirror-low-floor', floor };
    store.commit(d);
    const q = { ...request, a: ['incineroar'], b: ['sneasler'] };
    const all = await queryMatchups(store.db, d.id, q);
    assert.equal(all.rows[0].overall.matches, 3);
    assert.equal(all.rows[0].overall.outcomes, 4);
    for (const source of [
      'limitless',
      'victory-road',
      'victory-road,limitless',
    ])
      assert.deepEqual(
        (await queryMatchups(store.db, d.id, { ...q, source })).rows,
        all.rows,
      );
    assert.deepEqual(all.rows, referenceMatchups(d, q).rows);
    const missing = sixes();
    missing.id = 'missing-team';
    missing.registrations[2].slots = null;
    const incomplete = publish(store, [missing], asOf, 'missing-team-test');
    const result = await queryMatchups(store.db, incomplete.id, {
      ...q,
      b: ['incineroar'],
    });
    assert.equal(result.rows[0].overall.matches, 1);
    assert.equal(result.rows[0].overall.winRate, 50);
  } finally {
    store.close();
  }
});
test('ties use unrounded metrics, then physical evidence, then canonical keys, with bounded pagination', async () => {
  const store = new Store(':memory:');
  try {
    const d = publish(store, [sixes()], asOf, 'ties');
    const manual = (
      await queryMatchups(store.db, d.id, {
        ...request,
        a: ['garchomp'],
        b: ['incineroar'],
      })
    ).rows[0];
    const rows = ['rillaboom', 'incineroar', 'sneasler'].map((key) => ({
      ...manual,
      key,
      members: [key],
      sufficient: true,
      difference: 10,
    }));
    rows[2].sample = { ...rows[2].sample, matches: 5 };
    const q = { ...request, mode: 'discover' as const, b: ['gholdengo'] };
    assert.deepEqual(
      rankCombinations(rows, q).map((r) => r.key),
      ['sneasler', 'incineroar', 'rillaboom'],
    );
    rows[1].difference = 10.001;
    assert.equal(rankCombinations(rows, q)[0].key, 'incineroar');
    const lowFloor = { ...d, id: 'page-test', floor };
    store.commit(lowFloor);
    const page = await queryMatchups(store.db, lowFloor.id, {
      ...q,
      limit: 1,
      offset: 1,
    });
    const whole = await queryMatchups(store.db, lowFloor.id, {
      ...q,
      limit: 50,
      offset: 0,
    });
    assert.deepEqual(page.rows, whole.rows.slice(1, 2));
    assert.equal(page.total, whole.total);
  } finally {
    store.close();
  }
});
test('indexed time boundaries compare instants rather than source timestamp spellings', async () => {
  const store = new Store(':memory:');
  try {
    const e = sixes();
    e.date = '2026-10-01T00:00:00+06:00';
    const d = publish(store, [e], asOf, 'instant-boundary');
    const q = { ...request, b: [], sort: 'winRate' as const };
    assert.deepEqual(
      (await queryMatchups(store.db, d.id, q)).rows,
      referenceMatchups(d, q).rows,
    );
  } finally {
    store.close();
  }
});
test('explicit legacy backfill preserves immutable source bytes and pointers through interruption and retry', async () => {
  const store = new Store(':memory:');
  try {
    const d = publish(store, [sixes()], asOf, 'legacy-backfill');
    const legacy = { ...d, id: 'legacy-without-index' },
      bytes = JSON.stringify(legacy);
    store.db
      .prepare('INSERT INTO versions VALUES (?,?,?,?)')
      .run(legacy.id, 'M-C', legacy.publishedAt, bytes);
    store.db.exec(
      "CREATE TRIGGER interrupt_backfill BEFORE INSERT ON matchup_results BEGIN SELECT RAISE(ABORT, 'interrupted backfill'); END",
    );
    assert.throws(
      () => backfillMatchups(store.db, legacy),
      /interrupted backfill/,
    );
    assert.equal(store.current()?.id, d.id);
    assert.equal(
      store.db.prepare('SELECT count(*) n FROM matchup_indexes').get()!.n,
      1,
    );
    await assert.rejects(
      queryMatchups(store.db, legacy.id, request),
      /index unavailable/,
    );
    store.db.exec('DROP TRIGGER interrupt_backfill');
    backfillMatchups(store.db, legacy);
    backfillMatchups(store.db, legacy);
    assert.equal(store.current()?.id, d.id);
    assert.equal(
      store.db
        .prepare('SELECT payload FROM versions WHERE id=?')
        .get(legacy.id)!.payload,
      bytes,
    );
    assert.equal(
      (await queryMatchups(store.db, legacy.id, request)).asOf,
      asOf,
    );
  } finally {
    store.close();
  }
});

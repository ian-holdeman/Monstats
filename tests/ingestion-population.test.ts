import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { queryMatchups } from '../src/server/matchup-index';
import { publicDataset } from '../src/server/reader';
import type { MatchupRequest } from '../src/domain/dynamic-matchups';
test('retained old population is identical in rows, detail baselines, evidence, source selection and indexed Matchups', async () => {
  const store = new Store(':memory:');
  const old = { ...fixture(), date: '2026-09-10T12:00:00.000Z' };
  const d = publish(store, [old], '2026-11-01T18:00:00Z', 'full');
  assert.equal(d.views['all:0'].coverage.matches, 3);
  const row = d.views['all:0'].pokemon.find((r) => r.id === 'incineroar')!;
  assert.equal(row.evidence?.matches, row.matches);
  const q: MatchupRequest = {
    mode: 'compare',
    a: ['incineroar'],
    b: ['rillaboom'],
    source: 'all',
    sheet: 'all',
    official: false,
    minPlayers: 0,
    candidateSize: 1,
    sort: 'difference',
    direction: 'best',
    limit: 20,
    offset: 0,
  };
  const result = await queryMatchups(store.db, d.id, q);
  const matchup = d.views['all:0'].matchups.rillaboom.find(
    (r) => r.id === 'incineroar',
  )!;
  assert.equal(result.rows[0].sample.winRate, matchup.winRate);
  assert.equal(result.rows[0].overall.winRate, matchup.baseline);
  const publicView = publicDataset(d, 'limitless', 'all', 0, false, store.db);
  assert.equal(Object.values(publicView.views)[0].coverage.matches, 3);
  assert.equal(publicView.sources.length, 1);
  const repeat = publish(store, [old], '2026-11-01T18:00:00Z', 'full');
  assert.equal(repeat.id, d.id);
  assert.equal(store.db.prepare('SELECT count(*) n FROM versions').get()?.n, 1);
  store.close();
});

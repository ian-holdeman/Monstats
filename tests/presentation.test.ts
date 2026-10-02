import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pokemonColor,
  spreadParts,
  monthLabel,
  formatDifference,
} from '../src/domain/presentation';
test('difference display normalizes negative zero without changing raw membership or inventing unavailable values', () => {
  assert.equal(formatDifference(0), '0.0 points');
  assert.equal(formatDifference(-0), '0.0 points');
  assert.equal(formatDifference(-0.00001), '0.0 points');
  assert.equal(formatDifference(0.00001), '+0.0 points');
  assert.equal(formatDifference(-1), '−1.0 points');
  assert.equal(formatDifference(null), '—');
  for (const n of [NaN, Infinity, -Infinity])
    assert.equal(formatDifference(n, 'Unavailable'), 'Unavailable');
});
test('row colors follow canonical primary typing, including forms', () => {
  assert.equal(pokemonColor('rillaboom'), pokemonColor('venusaur'));
  assert.notEqual(pokemonColor('rillaboom'), pokemonColor('incineroar'));
  assert.equal(pokemonColor('salamencemega'), pokemonColor('blastoise'));
  assert.equal(pokemonColor('sneasler'), pokemonColor('hariyama'));
});
test('spread styling preserves values and uses only an explicitly supplied nature', () => {
  const s = spreadParts('Adamant:32/32/0/0/0/2');
  assert.deepEqual(s?.values, ['32', '32', '0', '0', '0', '2']);
  assert.equal(s?.plus, 1);
  assert.equal(s?.minus, 3);
  assert.equal(spreadParts('32/32/0/0/0/2')?.plus, -1);
  assert.equal(spreadParts('Hardy:32/32/0/0/0/2')?.minus, -1);
  assert.equal(spreadParts('unrecognized source value'), null);
  assert.equal(monthLabel('2026-09-30T12:00:00.000Z'), '09/26');
});

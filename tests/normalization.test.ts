import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSlot,
  normalizeEvent,
  completedIds,
  classifySheet,
} from '../src/domain/normalize';
import { reconcileRecords } from '../src/domain/reconciliation';
const details = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  game: 'VGC',
  format: 'M-C',
  name: 'Fixture',
  date: '2026-09-20T12:00:00.000Z',
  players: 2,
  platform: 'SWITCH',
  decklists: true,
  isPublic: true,
  phases: [{ phase: 1, type: 'SWISS', mode: 'BO1', rounds: 3 }],
};
test('canonical forms preserve original species, item and separately derived Mega identity', () => {
  const slot = normalizeSlot({
    id: 'charizard',
    name: 'Charizard',
    item: 'Charizardite Y',
    attacks: ['Heat Wave'],
  });
  assert.equal(slot.name, 'Charizard-Mega-Y');
  assert.equal(slot.originalName, 'Charizard');
  assert.equal(slot.derivedForm, 'Charizard-Mega-Y');
  assert.equal(slot.item, 'Charizardite Y');
  assert.equal(
    normalizeSlot({ id: 'indeedee-f', name: 'Indeedee ♀' }).name,
    'Indeedee-F',
  );
  assert.equal(
    normalizeSlot({
      id: 'floette-eternal',
      name: 'Eternal Flower Floette',
      item: 'Floettite',
    }).name,
    'Floette-Mega',
  );
  assert.throws(
    () => normalizeSlot({ id: 'arcanine', name: 'Hisuian Arcanine' }),
    /conflicting identity/,
  );
  assert.throws(() => normalizeSlot({ name: 'Mysterymon' }), /Unresolved/);
});
test('malformed records and conflicting duplicate outcomes cannot become eligible losses', () => {
  const pairing = {
    phase: 1,
    round: 1,
    table: 1,
    player1: 'a',
    player2: 'b',
    winner: 'a',
  };
  const event = normalizeEvent(
    details,
    [],
    [
      pairing,
      pairing,
      { ...pairing, winner: 'b' },
      { ...pairing, round: 2 },
      { bad: true },
    ],
    { visibility: 'unknown', basis: 'unknown', evidence: '' },
    [],
    true,
  );
  assert.equal(event.matches.length, 1);
  assert.equal(event.matches[0].round, 2);
  assert.ok(event.quarantine.some((x) => x.reason === 'conflicting-duplicate'));
  assert.ok(event.quarantine.some((x) => x.reason === 'malformed-match'));
  const report = reconcileRecords(event);
  assert.equal(report.representedMatchRecords, 5);
  assert.equal(report.accounting?.conflictingMatchRecords, 3);
  assert.equal(report.accounting?.malformedMatchRecords, 1);
});
test('incomplete or unresolved teams are retained as unavailable rather than partial memberships', () => {
  const e = normalizeEvent(
    details,
    [{ player: 'a', decklist: [{ name: 'Incineroar' }] }],
    [],
    { visibility: 'unknown', basis: 'unknown', evidence: '' },
    [],
    true,
  );
  assert.equal(e.registrations[0].slots, null);
  assert.equal(e.quarantine.length, 1);
});

test('a six-slot registration with duplicate canonical species is unavailable as a whole', () => {
  const team = [
    'Incineroar',
    'Incineroar',
    'Rillaboom',
    'Sneasler',
    'Garchomp',
    'Pelipper',
  ].map((name) => ({ name }));
  const e = normalizeEvent(
    details,
    [{ player: 'a', decklist: team }],
    [],
    { visibility: 'unknown', basis: 'unknown', evidence: '' },
    [],
    true,
  );
  assert.equal(e.registrations[0].slots, null);
  assert.ok(e.quarantine.some((q) => /Duplicate team species/.test(q.reason)));
});
test('completion links must match exactly; public submission alone does not prove OTS', () => {
  const html =
    '<title>Completed Tournaments | Limitless</title><a href="/tournament/aaaaaaaaaaaaaaaaaaaaaaaa/standings">x</a>';
  assert.deepEqual([...completedIds(html)], ['aaaaaaaaaaaaaaaaaaaaaaaa']);
  assert.throws(() => completedIds('error page'));
  assert.equal(
    classifySheet('<div class="description">Open Team Sheets</div>', 'url')
      .visibility,
    'open',
  );
  assert.equal(
    classifySheet(
      '<div class="description">Team submission required</div>',
      'url',
    ).visibility,
    'unknown',
  );
  assert.equal(
    classifySheet('<div class="description">OTS / CTS</div>', 'url').visibility,
    'unknown',
  );
});

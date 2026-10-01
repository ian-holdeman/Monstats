import { mkdir, rm } from 'node:fs/promises';
import { Store, publish } from '../src/server/store';
import { fixture, slot } from '../tests/fixtures';
await mkdir('.monstats/e2e', { recursive: true });
// This directory is reserved for isolated browser fixtures; never touch the owner's DB.
for (const suffix of ['', '-wal', '-shm'])
  await rm(`.monstats/e2e/monstats.sqlite${suffix}`, { force: true });
await rm('.monstats/e2e/upstream-attempts.log', { force: true });
const store = new Store('.monstats/e2e/monstats.sqlite');
const template = fixture();
template.registrations[2].slots!.push(slot('pelipper'));
const events = [0, 1].map((eventIndex) => {
  const e = fixture();
  e.id = `browser-event-${eventIndex}`;
  e.date = new Date().toISOString();
  e.registrations = [];
  e.matches = [];
  for (let group = 0; group < 5; group++) {
    for (const r of template.registrations)
      e.registrations.push({
        ...r,
        player: `${r.player}${group}`,
        slots:
          r.slots?.map((s) => ({
            ...s,
            name: s.id[0].toUpperCase() + s.id.slice(1),
          })) ?? null,
      });
    for (let repeat = 0; repeat < 4; repeat++)
      for (const m of template.matches)
        e.matches.push({
          ...m,
          id: `${m.id}-${group}-${repeat}`,
          round: m.round + repeat * 3,
          player1: `${m.player1}${group}`,
          player2: `${m.player2}${group}`,
          winner: `${m.winner}${group}`,
        });
  }
  e.registrations.push({
    player: 'no-matches',
    drop: null,
    slots: [slot('farigiraf')],
  });
  return e;
});
publish(
  store,
  events,
  new Date().toISOString(),
  'DETERMINISTIC BROWSER FIXTURE — not tournament data',
);
store.close();

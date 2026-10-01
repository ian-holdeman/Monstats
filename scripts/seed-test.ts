import { mkdir, rm } from 'node:fs/promises';
import { Store, publish } from '../src/server/store';
import { fixture, slot } from '../tests/fixtures';
import { LadderStore } from '../src/server/ladder-store';
import { parseShowdown, parseChampions } from '../src/domain/ladder';
import {
  championsResponse,
  showdownUsage,
  showdownChaos,
} from '../tests/ladder-fixtures';
await mkdir('.monstats/e2e', { recursive: true });
// This directory is reserved for isolated browser fixtures; never touch the owner's DB.
for (const suffix of ['', '-wal', '-shm'])
  await rm(`.monstats/e2e/monstats.sqlite${suffix}`, { force: true });
await rm('.monstats/e2e/upstream-attempts.log', { force: true });
const store = new Store('.monstats/e2e/monstats.sqlite');
const template = fixture();
template.registrations[0].slots![0].item = 'Safety Goggles';
template.registrations[0].slots![0].moves = ['Fake Out', 'Flare Blitz'];
template.registrations[0].slots![0].ability = 'Intimidate';
template.registrations[0].slots![0].nature = 'Adamant';
template.registrations[2].slots!.push(slot('pelipper'));
const events = [0, 1, 2].map((eventIndex) => {
  const e = fixture();
  e.id = `browser-event-${eventIndex}`;
  e.name = `Deterministic browser event ${eventIndex}`;
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
            item: eventIndex === 0 ? (s.item?.toLowerCase() ?? null) : s.item,
            ability:
              eventIndex === 0 ? (s.ability?.toLowerCase() ?? null) : s.ability,
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
  if (eventIndex === 2)
    e.provenance = {
      canonicalEvent: 'victory-road:browser',
      participantNamespace: 'victory-road:browser',
      environment: 'champions-cartridge',
      official: 'unknown',
      population: 'registrations',
      sources: [
        {
          provider: 'victory-road',
          originalId: 'browser',
          url: 'https://example.test/community',
        },
      ],
    };
  if (eventIndex === 1) {
    e.provenance = {
      canonicalEvent: 'rk9:browser:masters',
      participantNamespace: 'rk9:browser:masters',
      environment: 'champions-cartridge',
      official: 'verified',
      population: 'registrations',
      division: 'masters',
      eventType: 'regional',
      season: '2027',
      roster: 'complete',
      regulationEvidence: 'Explicit browser fixture',
      divisionEvidence: 'Masters fixture',
      entrantEvidence: [20],
      sources: [
        {
          provider: 'pokedata',
          originalId: 'browser',
          url: 'https://example.test/official',
        },
      ],
    };
    for (let i = e.registrations.length; i < 20; i++)
      e.registrations.push({
        player: `unresolved-${i}`,
        drop: null,
        slots: null,
      });
  }
  return e;
});
publish(
  store,
  events,
  new Date().toISOString(),
  'DETERMINISTIC BROWSER FIXTURE — not tournament data',
);
const ladder = new LadderStore(store);
const snapshot = {
  url: 'https://example.test/ladder-fixture',
  checksum: 'a'.repeat(64),
  retrievedAt: new Date().toISOString(),
};
const drafts = [];
for (const regulation of ['mb', 'mc'])
  for (const month of regulation === 'mb'
    ? ['2026-08', '2026-09']
    : ['2026-09'])
    for (const mode of ['', 'bo3'])
      for (const rating of [0, 1500, 1630, 1760]) {
        const formatId = `gen9championsvgc2026reg${regulation}${mode}`;
        const chaos = showdownChaos();
        chaos.info.metagame = formatId;
        chaos.info.cutoff = rating;
        const d = parseShowdown(showdownUsage, chaos, {
          month,
          formatId,
          rating,
          snapshots: [snapshot],
        });
        d.notes.push(
          'DETERMINISTIC BROWSER FIXTURE — not actual ladder statistics',
        );
        drafts.push(d);
      }
ladder.publishBatch(drafts);
const first = championsResponse(),
  second = {
    ...first,
    selected_pokemon: 'Incineroar',
    current_pokemon: ['Incineroar', '', '2', []],
    moves_list: [['Fake Out', '50.0']],
    items_list: [['Sitrus Berry', '40.0']],
    abilities_list: [['Intimidate', '100.0']],
    teammates_list: [['Rillaboom', '#1']],
  };
const champions = parseChampions([first, second], [snapshot]);
champions.notes.push(
  'DETERMINISTIC BROWSER FIXTURE — not actual ladder statistics',
);
ladder.publish(champions);
store.close();

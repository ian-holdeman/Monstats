import { writeFile, mkdir } from 'node:fs/promises';
import { Store } from '../src/server/store';
import { rejection, selectEvents } from '../src/domain/analytics';
import { databasePath, dataDirectory } from '../src/server/paths';
import { provenance } from '../src/domain/sources';
import { resolve } from 'node:path';
import { cohortKey } from '../src/domain/regulations';
const selected = process.argv[2] ?? 'incineroar',
  rowId = process.argv[3] ?? 'rillaboom';
const store = new Store(databasePath(), true);
const d = store.current();
store.close();
if (!d) throw new Error('No published dataset');
const official = process.argv.includes('--official');
const source =
  process.argv
    .find((a) => a.startsWith('--source='))
    ?.slice('--source='.length) ?? 'all';
const view = d.views[cohortKey(source, 'all', 0, official)];
if (!view) throw new Error('Requested source cohort is unavailable');
const rows = [];
for (const e of selectEvents(d.events, view.options)) {
  const teams = new Map(e.registrations.map((r) => [r.player, r.slots]));
  for (const m of e.matches) {
    if (rejection(m, e)) continue;
    const left = teams.get(m.player1),
      right = teams.get(m.player2 ?? '');
    if (!left || !right) continue;
    for (const [own, opp, player] of [
      [left, right, m.player1],
      [right, left, m.player2!],
    ] as const) {
      if (own.some((s) => s.id === rowId) && opp.some((s) => s.id === selected))
        rows.push({
          event: e.id,
          match: m.id,
          player,
          win: m.winner === player,
          sources: provenance(e).sources,
          snapshots: e.snapshots,
          phase: m.phase,
          round: m.round,
          registrationEvidence: e.registrations
            .filter((r) => r.player === m.player1 || r.player === m.player2)
            .map((r) => ({
              player: r.player,
              sourcePlayer: r.sourcePlayer,
              teamList:
                provenance(e).official === 'verified' &&
                !r.player.startsWith('unresolved:')
                  ? `https://rk9.gg/teamlist/public/${r.player}`
                  : null,
            })),
        });
    }
  }
}
const wins = rows.filter((r) => r.win).length,
  outcomes = rows.length,
  matches = new Set(rows.map((r) => r.event + ':' + r.match)).size;
const published = view.matchups[selected]?.find((r) => r.id === rowId);
if (
  !published ||
  published.wins !== wins ||
  published.outcomes !== outcomes ||
  published.matches !== matches
)
  throw new Error('Source trace differs from published counts');
await mkdir(resolve(dataDirectory(), 'audit'), { recursive: true });
await writeFile(
  resolve(
    dataDirectory(),
    `audit/trace-${rowId}-into-${selected}${official ? '-official' : ''}${source !== 'all' ? '-' + source : ''}.json`,
  ),
  JSON.stringify({ dataset: d.id, published, rows }, null, 2),
);
console.log(
  JSON.stringify(
    {
      dataset: d.id,
      official,
      source,
      row: rowId,
      into: selected,
      matches,
      outcomes,
      rate: outcomes ? (wins / outcomes) * 100 : null,
      baseline: published.baseline,
      difference: published.difference,
      verified: true,
    },
    null,
    2,
  ),
);

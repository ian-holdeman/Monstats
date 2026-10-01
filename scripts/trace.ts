import { writeFile, mkdir } from 'node:fs/promises';
import { Store } from '../src/server/store';
import { rejection, selectEvents } from '../src/domain/analytics';
const selected = process.argv[2] ?? 'incineroar',
  rowId = process.argv[3] ?? 'rillaboom';
const store = new Store('.monstats/monstats.sqlite', true);
const d = store.current();
store.close();
if (!d) throw new Error('No published dataset');
const view = d.views['open:0'];
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
          source: `https://play.limitlesstcg.com/tournament/${e.id}/pairings`,
          snapshots: e.snapshots,
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
await mkdir('.monstats/audit', { recursive: true });
await writeFile(
  `.monstats/audit/trace-${rowId}-into-${selected}.json`,
  JSON.stringify({ dataset: d.id, published, rows }, null, 2),
);
console.log(
  JSON.stringify(
    {
      dataset: d.id,
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

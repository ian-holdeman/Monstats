import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { eligibleResult, selectEvents } from '../domain/analytics';
import {
  provenance,
  reconcileSources,
  recordProviders,
} from '../domain/sources';
import type { PublishedDataset } from '../domain/types';
import {
  MATCHUP_CALCULATION,
  MATCHUP_INDEX,
  combinationRow,
  counter,
  subsets,
  rankCombinations,
  sample,
  sufficient,
  validateMatchupRequest,
  type Counter,
  type MatchupRequest,
  type MatchupResponse,
} from '../domain/dynamic-matchups';

export function matchupSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS matchup_indexes (version TEXT PRIMARY KEY, metadata TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS matchup_events (version TEXT NOT NULL, event TEXT NOT NULL, canonical TEXT NOT NULL, regulation TEXT NOT NULL, date TEXT NOT NULL, players INTEGER NOT NULL, sheet TEXT NOT NULL, official INTEGER NOT NULL, PRIMARY KEY(version,event));
    CREATE TABLE IF NOT EXISTS matchup_sources (version TEXT NOT NULL, event TEXT NOT NULL, provider TEXT NOT NULL, PRIMARY KEY(version,event,provider));
    CREATE TABLE IF NOT EXISTS matchup_teams (id INTEGER PRIMARY KEY, version TEXT NOT NULL, event TEXT NOT NULL, player TEXT NOT NULL, participant TEXT NOT NULL, composition TEXT NOT NULL, UNIQUE(version,event,player));
    CREATE TABLE IF NOT EXISTS matchup_members (version TEXT NOT NULL, member TEXT NOT NULL, team INTEGER NOT NULL, PRIMARY KEY(version,member,team));
    CREATE TABLE IF NOT EXISTS matchup_results (version TEXT NOT NULL, event TEXT NOT NULL, physical TEXT NOT NULL, left_team INTEGER NOT NULL, right_team INTEGER NOT NULL, winner INTEGER NOT NULL, PRIMARY KEY(version,physical));
    CREATE INDEX IF NOT EXISTS matchup_left ON matchup_results(version,left_team);
    CREATE INDEX IF NOT EXISTS matchup_right ON matchup_results(version,right_team);
    CREATE INDEX IF NOT EXISTS matchup_result_event ON matchup_results(version,event);
  `);
}
export const indexKey = (id: string) =>
  `${id}:${MATCHUP_CALCULATION}:${MATCHUP_INDEX}`;
type Metadata = Pick<
  MatchupResponse,
  | 'publication'
  | 'calculation'
  | 'index'
  | 'asOf'
  | 'regulation'
  | 'floor'
  | 'catalog'
> & {
  options: PublishedDataset['views'][string]['options'];
  physicalResults: number;
  teams: number;
};
export function indexMetadata(db: DatabaseSync, id: string): Metadata | null {
  const exists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='matchup_indexes'",
    )
    .get();
  if (!exists) return null;
  const row = db
    .prepare('SELECT metadata FROM matchup_indexes WHERE version=?')
    .get(indexKey(id));
  return row ? JSON.parse(String(row.metadata)) : null;
}
// Called inside the publication transaction; ready metadata is written last.
export function buildMatchupIndex(db: DatabaseSync, d: PublishedDataset) {
  if (indexMetadata(db, d.id)) return;
  const version = indexKey(d.id),
    options = (d.views['all:0'] ?? Object.values(d.views)[0]).options;
  const events = selectEvents(reconcileSources(d.events).events, {
    ...options,
    source: 'all',
    sheet: 'all',
    minPlayers: 0,
    official: false,
  });
  const catalog = new Map<string, string>();
  const eventInsert = db.prepare(
    'INSERT INTO matchup_events VALUES (?,?,?,?,?,?,?,?)',
  );
  const sourceInsert = db.prepare('INSERT INTO matchup_sources VALUES (?,?,?)');
  const teamInsert = db.prepare(
    'INSERT INTO matchup_teams(version,event,player,participant,composition) VALUES (?,?,?,?,?)',
  );
  const memberInsert = db.prepare('INSERT INTO matchup_members VALUES (?,?,?)');
  const resultInsert = db.prepare(
    'INSERT INTO matchup_results VALUES (?,?,?,?,?,?)',
  );
  let physicalResults = 0,
    teams = 0;
  for (const e of events) {
    const p = provenance(e);
    eventInsert.run(
      version,
      e.id,
      p.canonicalEvent,
      e.regulation,
      new Date(e.date).toISOString(),
      e.players,
      e.sheet.visibility,
      Number(p.official === 'verified'),
    );
    for (const provider of new Set(recordProviders(e)))
      sourceInsert.run(version, e.id, provider);
    const registered = new Map<string, number>();
    for (const r of e.registrations) {
      if (!r.slots?.length) continue;
      const members = [...new Set(r.slots.map((s) => s.id))].sort();
      if (members.length > 6) throw new Error('Invalid registered composition');
      for (const s of r.slots) catalog.set(s.id, s.name);
      const id = Number(
        teamInsert.run(
          version,
          e.id,
          r.player,
          `${p.participantNamespace}:${r.player}`,
          JSON.stringify(members),
        ).lastInsertRowid,
      );
      registered.set(r.player, id);
      teams++;
      for (const member of members) memberInsert.run(version, member, id);
    }
    const seen = new Set<string>();
    for (const m of e.matches) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const left = registered.get(m.player1),
        right = registered.get(m.player2 ?? '');
      if (!eligibleResult(m, e, left !== undefined, right !== undefined))
        continue;
      if (left === undefined || right === undefined)
        throw new Error('Unresolved eligible teams');
      resultInsert.run(
        version,
        e.id,
        `${p.canonicalEvent}:${m.id}`,
        left,
        right,
        m.winner === m.player1 ? left : right,
      );
      physicalResults++;
    }
  }
  const counted = Number(
    db
      .prepare('SELECT count(*) n FROM matchup_results WHERE version=?')
      .get(version)!.n,
  );
  const expected = d.views['all:0']?.coverage.matches;
  if (
    counted !== physicalResults ||
    (expected !== undefined && counted !== expected)
  )
    throw new Error('Derived result count does not reconcile with publication');
  const broken = db
    .prepare(
      'SELECT 1 FROM matchup_results r LEFT JOIN matchup_teams l ON l.id=r.left_team LEFT JOIN matchup_teams t ON t.id=r.right_team WHERE r.version=? AND (l.id IS NULL OR t.id IS NULL OR r.winner NOT IN (r.left_team,r.right_team)) LIMIT 1',
    )
    .get(version);
  if (broken) throw new Error('Invalid derived result join');
  const metadata: Metadata = {
    publication: d.id,
    calculation: MATCHUP_CALCULATION,
    index: MATCHUP_INDEX,
    asOf: d.asOf,
    regulation: options.regulation,
    floor: d.floor,
    options,
    physicalResults,
    teams,
    catalog: [...catalog]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  db.prepare('INSERT INTO matchup_indexes VALUES (?,?)').run(
    version,
    JSON.stringify(metadata),
  );
}
export function backfillMatchups(db: DatabaseSync, d: PublishedDataset) {
  matchupSchema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    buildMatchupIndex(db, d);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
type Perspective = {
  physical: string;
  canonical: string;
  participant: string;
  composition: string;
  win: number;
};
export function perspectiveQuery(
  id: string,
  q: MatchupRequest,
  meta: Metadata,
  restrict: boolean,
) {
  const version = indexKey(id),
    values: SQLInputValue[] = [
      version,
      meta.regulation,
      new Date(meta.options.asOf).toISOString(),
      new Date(
        Date.parse(meta.options.asOf) - meta.options.days * 86400000,
      ).toISOString(),
      Math.max(20, q.minPlayers),
    ];
  let where =
    'e.version=? AND e.regulation=? AND e.date<=? AND e.date>=? AND e.players>=?';
  if (q.sheet !== 'all') {
    where += ' AND e.sheet=?';
    values.push(q.sheet);
  }
  if (q.official) where += ' AND e.official=1';
  if (q.source === 'none') where += ' AND 0';
  else if (q.source !== 'all') {
    const providers = q.source.split(',');
    where += ` AND EXISTS (SELECT 1 FROM matchup_sources s WHERE s.version=e.version AND s.event=e.event AND s.provider IN (${providers.map(() => '?').join(',')}))`;
    values.push(...providers);
  }
  values.push(version, version);
  const conditions: string[] = [];
  const intersection = (members: string[], column: string) => {
    if (!members.length) return;
    conditions.push(
      `${column} IN (SELECT team FROM matchup_members WHERE version=? AND member IN (${members.map(() => '?').join(',')}) GROUP BY team HAVING count(*)=?)`,
    );
    values.push(version, ...members, members.length);
  };
  if (q.mode === 'compare') intersection(q.a, 'own');
  if (restrict) intersection(q.b, 'opp');
  const sql = `WITH cohort AS (SELECT e.event,e.canonical FROM matchup_events e WHERE ${where}), perspectives AS (
    SELECT r.physical,c.canonical,r.left_team own,r.right_team opp,(r.winner=r.left_team) win FROM cohort c JOIN matchup_results r ON r.version=? AND r.event=c.event
    UNION ALL SELECT r.physical,c.canonical,r.right_team own,r.left_team opp,(r.winner=r.right_team) win FROM cohort c JOIN matchup_results r ON r.version=? AND r.event=c.event
  ) SELECT p.physical,p.canonical,t.participant,t.composition,p.win FROM perspectives p JOIN matchup_teams t ON t.id=p.own ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}`;
  return { sql, values };
}
function groups(rows: Perspective[]) {
  const grouped = new Map<string, Counter>();
  for (const p of rows) {
    let c = grouped.get(p.composition);
    if (!c) {
      c = counter();
      grouped.set(p.composition, c);
    }
    c.wins += p.win;
    c.outcomes++;
    c.matches.add(p.physical);
    c.events.add(p.canonical);
    c.players.add(p.participant);
  }
  return grouped;
}
function merge(to: Counter, from: Counter) {
  to.wins += from.wins;
  to.outcomes += from.outcomes;
  for (const id of from.matches) to.matches.add(id);
  for (const id of from.events) to.events.add(id);
  for (const id of from.players) to.players.add(id);
}
export async function queryMatchups(
  db: DatabaseSync,
  id: string,
  input: MatchupRequest,
  scan?: (
    sql: string,
    values: SQLInputValue[],
  ) => Promise<Map<string, Counter>>,
): Promise<MatchupResponse> {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid publication');
  const meta = indexMetadata(db, id);
  if (!meta) throw new Error('Matchup index unavailable');
  const q = validateMatchupRequest(
    input,
    new Set(meta.catalog.map((p) => p.id)),
  );
  const read = async (restrict: boolean) => {
    const { sql, values } = perspectiveQuery(id, q, meta, restrict);
    if (scan) return scan(sql, values);
    return groups(db.prepare(sql).all(...values) as Perspective[]);
  };
  const conditional = await read(true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  let rows;
  if (q.mode === 'compare') {
    const baselines = q.b.length ? await read(false) : conditional;
    const c = counter(),
      s = counter();
    for (const g of conditional.values()) merge(c, g);
    for (const g of baselines.values()) merge(s, g);
    rows = [combinationRow(q.a, c, s, meta.floor)];
  } else {
    const candidates = new Map<
      string,
      { members: string[]; conditional: Counter; baseline: Counter }
    >();
    const expansions = new Map<string, string[][]>();
    const expand = (key: string) => {
      if (!expansions.has(key))
        expansions.set(key, subsets(JSON.parse(key), q.candidateSize));
      return expansions.get(key)!;
    };
    let processed = 0;
    for (const [key, c] of conditional) {
      for (const members of expand(key)) {
        const k = members.join('+');
        if (!candidates.has(k)) {
          const conditional = counter();
          candidates.set(k, {
            members,
            conditional,
            baseline: q.b.length ? counter() : conditional,
          });
        }
        merge(candidates.get(k)!.conditional, c);
      }
      if (++processed % 32 === 0)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
    // The floor depends only on the ranked sample. Do not compute baselines for
    // candidates already known to be ineligible, especially with rare targets.
    for (const [key, c] of candidates) {
      if (
        !sufficient(sample(c.conditional), meta.floor) ||
        (q.b.length && key === q.b.join('+'))
      )
        candidates.delete(key);
    }
    conditional.clear();
    const baselines =
      q.b.length && candidates.size
        ? await read(false)
        : new Map<string, Counter>();
    for (const [key, c] of baselines) {
      for (const members of expand(key)) {
        const candidate = candidates.get(members.join('+'));
        if (candidate) merge(candidate.baseline, c);
      }
      if (++processed % 32 === 0)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
    rows = rankCombinations(
      [...candidates.values()].map((c) =>
        combinationRow(c.members, c.conditional, c.baseline, meta.floor),
      ),
      q,
    );
  }
  const { options, physicalResults, teams, ...publicMeta } = meta;
  void options;
  void physicalResults;
  void teams;
  return {
    ...publicMeta,
    request: q,
    rows: rows.slice(q.offset, q.offset + q.limit),
    total: rows.length,
  };
}

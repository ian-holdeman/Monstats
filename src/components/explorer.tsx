'use client';
/* eslint-disable @next/next/no-img-element -- artwork is a small, already local PNG served without an upstream optimizer */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
  X,
  Database,
  Info,
  Layers,
  CircleOff,
  Archive,
  ChartNoAxesColumnIncreasing,
} from 'lucide-react';
import { rankMatchups } from '@/domain/analytics';
import type {
  Aggregate,
  MatchupRow,
  PokemonRow,
  Visibility,
} from '@/domain/types';
import type { AppData, PublicDataset } from '@/server/reader';
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);
const pp = (n: number | null) =>
  n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)} pp`;
const number = (n: number) => n.toLocaleString('en-US');
function rowColor(id: string): CSSProperties {
  const colors: Record<string, string> = {
    rillaboom: '63 151 103',
    incineroar: '192 71 65',
    sneasler: '130 106 193',
    raichumegay: '206 153 61',
    garchompmegaz: '70 109 183',
    gholdengo: '183 153 53',
    volcarona: '203 99 63',
    floettemega: '171 108 155',
  };
  const palette = [
    '79 124 180',
    '137 103 172',
    '59 147 136',
    '168 109 76',
    '102 128 173',
  ];
  const hash = [...id].reduce((n, c) => n + c.charCodeAt(0), 0);
  return {
    '--row-color': colors[id] ?? palette[hash % palette.length],
  } as CSSProperties;
}
const date = (s: string) =>
  new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Denver',
  });
const stamp = (s: string) =>
  new Date(s).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Denver',
  });
function Sprite({ id, large = false }: { id: string; large?: boolean }) {
  return (
    <img
      className={`sprite ${large ? 'large' : ''}`}
      src={`/sprites/${id}`}
      width={96}
      height={96}
      alt=""
    />
  );
}
function Empty({
  icon = 'data',
  title,
  children,
}: {
  icon?: 'data' | 'ladder' | 'archive';
  title: string;
  children: React.ReactNode;
}) {
  const Icon =
    icon === 'ladder'
      ? ChartNoAxesColumnIncreasing
      : icon === 'archive'
        ? Archive
        : Database;
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
export function Explorer({ data }: { data: AppData }) {
  const [tab, setTab] = useState<'tournaments' | 'ladder' | 'archive'>(
    'tournaments',
  );
  const [sheet, setSheet] = useState<Visibility>('open');
  const [minPlayers, setMinPlayers] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<{
    key: 'name' | 'usage' | 'winRate' | 'matches';
    direction: 'asc' | 'desc';
  }>({ key: 'usage', direction: 'desc' });
  const [archiveId, setArchiveId] = useState(data.archives[0]?.id ?? '');
  const heading = useRef<HTMLHeadingElement>(null);
  const openerId = useRef<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const dataset =
    tab === 'archive'
      ? (data.archives.find((d) => d.id === archiveId) ?? null)
      : data.current;
  const view = dataset?.views[`${sheet}:${minPlayers}`] ?? null;
  const pokemon = view?.pokemon.find((r) => r.id === selected);
  const filtered = (view?.pokemon ?? []).filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase().trim()),
  );
  const rows = [...filtered].sort((a, b) => {
    const av = a[sort.key],
      bv = b[sort.key];
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    const difference =
      typeof av === 'string'
        ? av.localeCompare(String(bv))
        : Number(av) - Number(bv);
    return (
      (sort.direction === 'asc' ? difference : -difference) ||
      a.name.localeCompare(b.name)
    );
  });
  useEffect(() => {
    if (selected) heading.current?.focus();
    else if (openerId.current) buttons.current.get(openerId.current)?.focus();
  }, [selected]);
  function choose(row: PokemonRow, button?: HTMLButtonElement) {
    if (button) openerId.current = row.id;
    setSelected(row.id);
  }
  function close() {
    setSelected(null);
  }
  function changeTab(next: typeof tab) {
    setTab(next);
    setSelected(null);
    setQuery('');
  }
  function changeSort(key: typeof sort.key) {
    setSort((s) => ({
      key,
      direction: s.key === key && s.direction === 'desc' ? 'asc' : 'desc',
    }));
  }
  const stale =
    dataset && Date.parse(data.now) - Date.parse(dataset.asOf) > 86400000;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to analysis
      </a>
      <header className="app-header">
        <Link
          className="brand"
          href="/"
          onClick={() => changeTab('tournaments')}
          aria-label="Monstats home"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          monstats
        </Link>
        <div className="header-context">
          <span>Pokémon Champions</span>
          <span className="header-divider" />
          <strong>M-C</strong>
        </div>
      </header>
      <main id="main" className="workspace">
        <h1 className="sr-only">
          {tab === 'archive' ? 'Regulation archive' : 'Pokémon usage'}
        </h1>
        <nav className="tabs" aria-label="Data views">
          <button
            aria-current={tab === 'tournaments' ? 'page' : undefined}
            onClick={() => changeTab('tournaments')}
          >
            <Layers size={16} />
            Tournaments
          </button>
          <button
            aria-current={tab === 'ladder' ? 'page' : undefined}
            onClick={() => changeTab('ladder')}
          >
            <ChartNoAxesColumnIncreasing size={16} />
            Ladder<span className="soon">Planned</span>
          </button>
          <button
            aria-current={tab === 'archive' ? 'page' : undefined}
            onClick={() => changeTab('archive')}
          >
            <Archive size={16} />
            Archive
          </button>
        </nav>
        {tab === 'ladder' ? (
          <Empty icon="ladder" title="Ladder data isn’t available yet">
            <p>
              A separate view for Champions closed team sheet play is planned.
            </p>
            <p className="muted">A reliable ladder source is still needed.</p>
          </Empty>
        ) : tab === 'archive' && !dataset ? (
          <Empty icon="archive" title="No archived regulations">
            <p>
              Published datasets will remain here when their regulations retire.
            </p>
          </Empty>
        ) : !dataset ? (
          <Empty
            title={
              data.readError
                ? 'The local dataset couldn’t be read'
                : 'Ready for your first dataset'
            }
          >
            <p>
              {data.readError
                ? 'Check the local database, then reload this page.'
                : 'Run the local ingestion command to publish verified tournament data.'}
            </p>
            <code>npm run ingest</code>
          </Empty>
        ) : (
          <>
            {tab === 'archive' && (
              <label className="archive-select">
                Published regulation
                <select
                  value={archiveId}
                  onChange={(e) => {
                    setArchiveId(e.target.value);
                    setSelected(null);
                  }}
                >
                  {data.archives.map((d) => (
                    <option key={d.id} value={d.id}>
                      M-C · {date(d.views['open:0'].coverage.from ?? d.asOf)} –{' '}
                      {date(d.views['open:0'].coverage.to ?? d.asOf)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {data.status?.state === 'failure' && tab === 'tournaments' && (
              <div className="notice warning" role="status">
                <CircleOff size={17} />
                <span>
                  New results couldn’t be loaded. Your saved results are still
                  available.
                </span>
              </div>
            )}
            {stale &&
              data.status?.state !== 'failure' &&
              tab === 'tournaments' && (
                <div className="notice warning" role="status">
                  <Info size={17} />
                  <span>
                    Showing saved results. Recent tournaments may be missing.
                  </span>
                </div>
              )}
            <section className="analysis-panel" aria-label="Pokémon analysis">
              <div className="toolbar">
                <label className="search">
                  <Search size={17} />
                  <span className="sr-only">Search Pokémon</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Pokémon…"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <div className="toolbar-right">
                  <span className="sheet-context">
                    {sheet === 'open'
                      ? 'Open sheets'
                      : sheet === 'closed'
                        ? 'Closed sheets'
                        : 'Unknown sheets'}
                  </span>
                  <details className="filters">
                    <summary>
                      <SlidersHorizontal size={15} />
                      Filters
                      {(sheet !== 'open' || minPlayers > 0) && (
                        <span className="filter-dot" />
                      )}
                    </summary>
                    <div className="filter-popover">
                      <label>
                        Team sheets
                        <select
                          value={sheet}
                          onChange={(e) => {
                            setSheet(e.target.value as Visibility);
                            setSelected(null);
                          }}
                        >
                          <option value="open">Open</option>
                          <option value="closed">Closed</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </label>
                      <label>
                        Event size
                        <select
                          value={minPlayers}
                          onChange={(e) => {
                            setMinPlayers(Number(e.target.value));
                            setSelected(null);
                          }}
                        >
                          <option value={0}>All sampled events</option>
                          <option value={50}>50+ entrants</option>
                          <option value={100}>100+ entrants</option>
                        </select>
                      </label>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSheet('open');
                          setMinPlayers(0);
                          setSelected(null);
                        }}
                      >
                        Reset filters
                      </button>
                    </div>
                  </details>
                </div>
              </div>
              {!view?.pokemon.length ? (
                <Empty title="No data for these filters">
                  <p>
                    No published registrations match this sheet population and
                    event size.
                  </p>
                  <button
                    onClick={() => {
                      setSheet('open');
                      setMinPlayers(0);
                    }}
                  >
                    Reset filters
                  </button>
                </Empty>
              ) : selected && pokemon ? (
                <div className="detail-layout">
                  <aside
                    className="pokemon-rail"
                    aria-label="Pokémon navigation"
                  >
                    <button
                      className="rail-back"
                      aria-label="Back to usage"
                      onClick={close}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    {filtered.map((r) => (
                      <button
                        key={r.id}
                        className={r.id === selected ? 'selected' : ''}
                        aria-label={`Select ${r.name}`}
                        aria-pressed={r.id === selected}
                        onClick={() => choose(r)}
                        title={r.name}
                      >
                        <Sprite id={r.id} />
                      </button>
                    ))}
                  </aside>
                  <div className="detail-content">
                    <div className="detail-heading">
                      <div className="pokemon-identity">
                        <div className="portrait">
                          <Sprite id={pokemon.id} large />
                        </div>
                        <div>
                          <h2 tabIndex={-1} ref={heading}>
                            {pokemon.name}
                          </h2>
                        </div>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Close Pokémon detail"
                        onClick={close}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className="detail-metrics">
                      <div>
                        <span>Usage</span>
                        <strong>{pct(pokemon.usage)}</strong>
                        <small>
                          {number(pokemon.registrations)} registered teams
                        </small>
                      </div>
                      <div>
                        <span>Overall win rate</span>
                        <strong>{pct(pokemon.winRate)}</strong>
                        <small>
                          {number(pokemon.matches)} eligible matches
                        </small>
                      </div>
                    </div>
                    <Matchups
                      selected={pokemon.id}
                      name={pokemon.name}
                      view={view}
                      dataset={dataset}
                      direction="best"
                      choose={(id) => {
                        const row = view.pokemon.find((r) => r.id === id);
                        if (row) choose(row);
                      }}
                    />
                    <Matchups
                      selected={pokemon.id}
                      name={pokemon.name}
                      view={view}
                      dataset={dataset}
                      direction="worst"
                      choose={(id) => {
                        const row = view.pokemon.find((r) => r.id === id);
                        if (row) choose(row);
                      }}
                    />
                  </div>
                </div>
              ) : !rows.length ? (
                <Empty title="No Pokémon found">
                  <p>
                    Try another name or{' '}
                    <button
                      className="text-button"
                      onClick={() => setQuery('')}
                    >
                      clear your search
                    </button>
                    .
                  </p>
                </Empty>
              ) : (
                <div className="table-scroll">
                  <table className="usage-table">
                    <caption className="sr-only">
                      Tournament registration usage and observed team win rates
                    </caption>
                    <thead>
                      <tr>
                        <th className="rank-column" scope="col">
                          Rank
                        </th>
                        {(['name', 'usage', 'winRate', 'matches'] as const).map(
                          (key) => (
                            <th
                              key={key}
                              scope="col"
                              aria-sort={
                                sort.key === key
                                  ? sort.direction === 'desc'
                                    ? 'descending'
                                    : 'ascending'
                                  : 'none'
                              }
                            >
                              <button onClick={() => changeSort(key)}>
                                {key === 'name'
                                  ? 'Pokémon'
                                  : key === 'usage'
                                    ? 'Usage'
                                    : key === 'winRate'
                                      ? 'Overall win rate'
                                      : 'Matches'}
                                {sort.key === key ? (
                                  sort.direction === 'desc' ? (
                                    <ArrowDown size={13} />
                                  ) : (
                                    <ArrowUp size={13} />
                                  )
                                ) : null}
                              </button>
                            </th>
                          ),
                        )}
                        <th className="arrow-column">
                          <span className="sr-only">Detail</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} style={rowColor(r.id)}>
                          <td className="rank-column">
                            <span>
                              #
                              {view.pokemon.findIndex((p) => p.id === r.id) + 1}
                            </span>
                          </td>
                          <td>
                            <button
                              className="pokemon-button"
                              ref={(button) => {
                                if (button) buttons.current.set(r.id, button);
                                else buttons.current.delete(r.id);
                              }}
                              onClick={(e) => choose(r, e.currentTarget)}
                            >
                              <span className="row-sprite">
                                <Sprite id={r.id} />
                              </span>
                              <span>{r.name}</span>
                            </button>
                          </td>
                          <td>
                            <div className="usage-cell">
                              <strong>{pct(r.usage)}</strong>
                              <span className="usage-track">
                                <span style={{ width: `${r.usage}%` }} />
                              </span>
                            </div>
                          </td>
                          <td className="numeric">{pct(r.winRate)}</td>
                          <td className="numeric muted">{number(r.matches)}</td>
                          <td>
                            <ChevronRight
                              size={15}
                              className="row-chevron"
                              aria-hidden="true"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="panel-footer">
                <span>
                  {rows.length} of {view?.pokemon.length ?? 0} Pokémon
                </span>
                <span>Partial tournament sample</span>
              </div>
            </section>
            {view && <Evidence dataset={dataset} view={view} />}
          </>
        )}
      </main>
    </div>
  );
}
function Matchups({
  selected,
  name,
  view,
  dataset,
  direction,
  choose,
}: {
  selected: string;
  name: string;
  view: Aggregate;
  dataset: PublicDataset;
  direction: 'best' | 'worst';
  choose: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const all = rankMatchups(view, selected, direction, dataset.floor),
    rows = expanded ? all : all.slice(0, 3);
  return (
    <section
      className="matchup-section"
      aria-label={`${direction === 'best' ? 'Best' : 'Worst'} performers into ${name}`}
    >
      <div className="section-heading">
        <h3>
          {direction === 'best' ? 'Best' : 'Worst'} performers into{' '}
          <span>{name}</span>
        </h3>
        {all.length > 3 && (
          <button
            className="text-button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show top 3' : `View all ${all.length}`}
            <ChevronRight size={13} />
          </button>
        )}
      </div>
      {!rows.length ? (
        <p className="matchup-empty">
          No matchups meet the evidence floor in this cohort.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="matchup-table">
            <caption className="sr-only">
              {direction} observed team matchups into {name}
            </caption>
            <thead>
              <tr>
                <th scope="col">Pokémon</th>
                <th scope="col">Win rate</th>
                <th scope="col">Δ baseline</th>
                <th scope="col">Matches</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Matchup key={r.id} row={r} choose={choose} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function Matchup({
  row,
  choose,
}: {
  row: MatchupRow;
  choose: (id: string) => void;
}) {
  return (
    <tr style={rowColor(row.id)}>
      <td>
        <button className="pokemon-button" onClick={() => choose(row.id)}>
          <Sprite id={row.id} />
          {row.name}
        </button>
      </td>
      <td className="numeric">
        <strong>{pct(row.winRate)}</strong>
      </td>
      <td
        className={`numeric difference ${row.difference !== null && row.difference >= 0 ? 'positive' : 'negative'}`}
      >
        <details className="baseline">
          <summary>{pp(row.difference)}</summary>
          <span>
            Comparable overall baseline: {pct(row.baseline)}
            <br />
            {row.events} events · {row.players} unique players · {row.outcomes}{' '}
            team perspectives
          </span>
        </details>
      </td>
      <td className="numeric muted">{number(row.matches)}</td>
    </tr>
  );
}
function Evidence({
  dataset,
  view,
}: {
  dataset: PublicDataset;
  view: Aggregate;
}) {
  return (
    <details className="evidence" id="evidence">
      <summary>
        <Info size={15} />
        About the data
        <ChevronRight size={15} />
      </summary>
      <div className="evidence-content">
        <div>
          <h3>What these numbers mean</h3>
          <p>
            Usage counts each resolved team registration once, irrespective of
            rounds played. Win rates use decisive competitive series with both
            complete teams known. BO1 and BO3 are pooled.
          </p>
          <p>
            Matches count unique physical series. Rates count eligible team
            perspectives: when both teams register the row Pokémon, the series
            contributes two perspectives and one displayed match. Overlapping
            teams can contribute to several matchup rows. Self-matchups are
            excluded from rankings.
          </p>
          <p>
            Baseline differences are descriptive percentage points within the
            same sheet, regulation, event-size and date cohort. They do not
            measure direct combat or causal counter strength. Registration does
            not establish what was brought, led, transformed or used.
          </p>
          <p>
            Rankings require at least {dataset.floor.matches} matches,{' '}
            {dataset.floor.events} events and {dataset.floor.players} distinct
            row-side players. Sorted by raw matchup win rate. This provisional
            floor is conservative for the initial sample; sparse rows remain
            unranked.
          </p>
        </div>
        <div>
          <h3>Published coverage</h3>
          <p>
            {view.coverage.registrations} resolved registrations /{' '}
            {view.coverage.entrants} entrants in this cohort.{' '}
            {view.coverage.matches} eligible matches;{' '}
            {view.coverage.excludedMatches} excluded. Exclusions retain their
            source evidence locally.
          </p>
          <p>
            {dataset.scope}. Window ends {stamp(dataset.asOf)} MT.
          </p>
          <p>
            The API does not expose a general administrative-result flag.
            Identifiable byes and nondecisive results are excluded; unmarked
            administrative wins remain a source limitation.
          </p>
          <p>
            Sheet labels are based on explicit organizer descriptions. Unknown
            sheets remain a separate population.
          </p>
          <ul className="source-list">
            {dataset.sources.map((e) => (
              <li key={e.id}>
                <a
                  href={`https://play.limitlesstcg.com/tournament/${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.name}
                  <ArrowUpRight size={12} />
                </a>
                <small>
                  {e.teams} resolved teams · {e.sheet.visibility} sheets ·{' '}
                  {e.sheet.basis}
                </small>
              </li>
            ))}
          </ul>
          <p className="small muted">
            Dataset {dataset.id} · {dataset.normalizationVersion} ·{' '}
            {dataset.calculationVersion}
          </p>
        </div>
      </div>
    </details>
  );
}

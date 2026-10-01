'use client';
/* eslint-disable @next/next/no-img-element -- artwork is a small, already local PNG served without an upstream optimizer */
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
  X,
  Database,
  Info,
  Layers,
  Archive,
  ChartNoAxesColumnIncreasing,
} from 'lucide-react';
import { rankMatchups } from '@/domain/rankings';
import { sourceMatches, toggleSource } from '@/domain/filters';
import type {
  Aggregate,
  MatchupRow,
  PokemonRow,
  Visibility,
  Builds,
} from '@/domain/types';
import type { AppData, PublicDataset } from '@/server/reader';
import { cohortKey } from '@/domain/regulations';
import { LadderPanel } from './ladder';
import { rowColor } from './pokemon-color';
import { StatSpread } from './stat-spread';
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);
const pp = (n: number | null) =>
  n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)} points`;
const defaultFilters = {
  sheet: 'all' as Visibility | 'all',
  source: 'all',
  official: false,
  minPlayers: 0,
};
const number = (n: number) => n.toLocaleString('en-US');
const date = (s: string) =>
  new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
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
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [router]);
  const [tab, setTab] = useState<'tournaments' | 'ladder' | 'archive'>(
    'tournaments',
  );
  const [ladderContext, setLadderContext] = useState({
    source: 'Showdown',
    regulation: 'M-C',
  });
  const [filters, setFilters] = useState(defaultFilters);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const { sheet, source, official, minPlayers } = filters;
  const filtersActive =
    sheet !== 'all' || source !== 'all' || official || minPlayers > 0;
  function editFilter(
    field: 'sheet' | 'source' | 'size' | 'official',
    value: string,
  ) {
    setDraftFilters((d) => ({
      ...d,
      ...(field === 'sheet'
        ? { sheet: value as Visibility | 'all' }
        : field === 'source'
          ? { source: value }
          : field === 'official'
            ? { official: value === 'true' }
            : { minPlayers: Number(value) }),
    }));
  }
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<{
    key: 'name' | 'usage' | 'winRate' | 'matches';
    direction: 'asc' | 'desc';
  }>({ key: 'usage', direction: 'desc' });
  const [archiveId, setArchiveId] = useState(data.archives[0]?.id ?? '');
  const [loadedDataset, setLoadedDataset] = useState<PublicDataset | null>(
    data.current,
  );
  const [cohortPending, setCohortPending] = useState(false);
  const [cohortError, setCohortError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const openerId = useRef<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const requestedDataset =
    tab === 'archive'
      ? (data.archives.find((d) => d.id === archiveId) ??
        data.archives[0] ??
        null)
      : data.current;
  useEffect(() => {
    const controller = new AbortController();
    const key = cohortKey(source, sheet, minPlayers, official);
    async function load() {
      await Promise.resolve();
      if (!requestedDataset || tab === 'ladder') {
        setLoadedDataset(requestedDataset);
        setCohortPending(false);
        return;
      }
      setCohortPending(true);
      setCohortError(false);
      try {
        const next = requestedDataset.views[key]
          ? requestedDataset
          : await fetch(
              `/data/${encodeURIComponent(requestedDataset.id)}?${new URLSearchParams({ source, sheet, size: String(minPlayers), official: String(official) })}`,
              { signal: controller.signal },
            ).then((r) => {
              if (!r.ok) throw new Error('Cached cohort unavailable');
              return r.json() as Promise<PublicDataset>;
            });
        if (!controller.signal.aborted) {
          setLoadedDataset(next);
          setCohortPending(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setCohortPending(false);
          setCohortError(true);
        }
      }
    }
    void load();
    return () => controller.abort();
    // Publication identity changes trigger an immutable local read; interaction state persists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDataset?.id, filters, tab]);
  const dataset = requestedDataset ? loadedDataset : null;
  const view = dataset ? (Object.values(dataset.views)[0] ?? null) : null;
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
        <div
          className={`header-context ${tab === 'ladder' ? 'ladder-header-context' : ''}`}
        >
          <span>
            {tab === 'ladder' ? ladderContext.source : 'Pokémon Champions'}
          </span>
          <span className="header-divider" />
          <strong>
            {tab === 'ladder'
              ? ladderContext.regulation
              : (dataset?.regulation ?? data.current?.regulation ?? 'M-C')}
          </strong>
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
            Ladder
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
          <LadderPanel data={data} onContext={setLadderContext} />
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
                  value={requestedDataset?.id ?? archiveId}
                  onChange={(e) => {
                    setArchiveId(e.target.value);
                    setSelected(null);
                  }}
                >
                  {data.archives.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.regulation} ·{' '}
                      {date(Object.values(d.views)[0]?.coverage.from ?? d.asOf)}{' '}
                      – {date(Object.values(d.views)[0]?.coverage.to ?? d.asOf)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <section
              className="analysis-panel"
              aria-label="Pokémon analysis"
              aria-busy={cohortPending}
            >
              <Toolbar
                query={query}
                setQuery={setQuery}
                {...draftFilters}
                appliedSheet={sheet}
                active={filtersActive}
                providers={dataset.providers}
                onFilter={editFilter}
                reset={() => setDraftFilters(defaultFilters)}
                apply={() => setFilters({ ...draftFilters })}
              />
              {cohortError && (
                <p role="status" className="small muted">
                  These filters couldn’t be loaded. Saved results are still
                  shown.
                </p>
              )}
              {!view?.pokemon.length ? (
                <Empty title="No data for these filters">
                  <p>No published registrations match these filters.</p>
                  <p>Choose other filters, then select Apply Filter.</p>
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
                    <BuildCards
                      builds={view.builds?.[pokemon.id]}
                      name={pokemon.name}
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
  const [sort, setSort] = useState<'difference' | 'winRate'>('difference');
  const all = rankMatchups(view, selected, direction, dataset.floor, sort),
    rows = expanded ? all : all.slice(0, 3);
  return (
    <section
      className="matchup-section"
      aria-label={`${direction === 'best' ? 'Best' : 'Worst'} performers into ${name} teams`}
    >
      <div className="section-heading">
        <h3>
          {direction === 'best' ? 'Best' : 'Worst'} performers into{' '}
          <span>{name} teams</span>
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
              {direction} observed team matchups into {name} teams
            </caption>
            <thead>
              <tr>
                <th scope="col">Pokémon</th>
                <th
                  scope="col"
                  aria-sort={
                    sort === 'winRate'
                      ? direction === 'best'
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                  }
                >
                  <button onClick={() => setSort('winRate')}>
                    Win rate
                    {sort === 'winRate' &&
                      (direction === 'best' ? (
                        <ArrowDown size={13} />
                      ) : (
                        <ArrowUp size={13} />
                      ))}
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sort === 'difference'
                      ? direction === 'best'
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                  }
                >
                  <button onClick={() => setSort('difference')}>
                    Change vs overall
                    {sort === 'difference' &&
                      (direction === 'best' ? (
                        <ArrowDown size={13} />
                      ) : (
                        <ArrowUp size={13} />
                      ))}
                  </button>
                </th>
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
  const [expanded, setExpanded] = useState(false);
  const evidenceId = useId();
  return (
    <>
      <tr>
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
          <button
            className="baseline-toggle"
            aria-expanded={expanded}
            aria-controls={evidenceId}
            onClick={() => setExpanded(!expanded)}
            aria-label={`${row.name}: ${pp(row.difference)} vs its overall win rate`}
          >
            {pp(row.difference)}
          </button>
        </td>
        <td className="numeric muted">{number(row.matches)}</td>
      </tr>
      {expanded && (
        <tr className="matchup-evidence" id={evidenceId}>
          <td colSpan={4}>
            {row.name} overall: {pct(row.baseline)}
            {' · '}
            In this matchup: {pct(row.winRate)}
            {' · '}
            {row.difference === null
              ? 'Change unavailable'
              : row.difference === 0
                ? 'No change in win rate'
                : `${Math.abs(row.difference).toFixed(1)} percentage points ${row.difference > 0 ? 'higher' : 'lower'}`}
            <br />
            {row.events} events · {row.players} unique players · {row.outcomes}{' '}
            team perspectives
          </td>
        </tr>
      )}
    </>
  );
}
function Toolbar({
  query,
  setQuery,
  sheet,
  source,
  official,
  minPlayers,
  providers,
  onFilter,
  reset,
  apply,
  appliedSheet,
  active,
  unavailable = false,
}: {
  query: string;
  setQuery: (value: string) => void;
  sheet: Visibility | 'all';
  source: string;
  official: boolean;
  minPlayers: number;
  providers: PublicDataset['providers'];
  onFilter: (
    field: 'sheet' | 'source' | 'size' | 'official',
    value: string,
  ) => void;
  reset: () => void;
  apply: () => void;
  appliedSheet: Visibility | 'all';
  active: boolean;
  unavailable?: boolean;
}) {
  const popover = useRef<HTMLDetailsElement>(null);
  const available = [
    ...providers,
    ...(source === 'all' || source === 'none'
      ? []
      : source
          .split(',')
          .filter((id) => !providers.some((p) => p.id === id))
          .map((id) => ({ id, name: id }))),
  ];
  return (
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
          <button onClick={() => setQuery('')} aria-label="Clear search">
            <X size={15} />
          </button>
        )}
      </label>
      <div className="toolbar-right">
        <span className="sheet-context">
          {unavailable
            ? 'Ladder'
            : appliedSheet === 'all'
              ? 'All sheets'
              : appliedSheet === 'open'
                ? 'OTS'
                : 'CTS'}
        </span>
        <details className="filters" ref={popover}>
          <summary>
            <SlidersHorizontal size={15} />
            Filters
            {active && !unavailable && <span className="filter-dot" />}
          </summary>
          <div className="filter-popover">
            <fieldset className="source-options" disabled={unavailable}>
              <legend>Sources</legend>
              <label>
                <input
                  type="checkbox"
                  checked={source === 'all'}
                  onChange={() =>
                    onFilter('source', source === 'all' ? 'none' : 'all')
                  }
                />
                All sources
              </label>
              {available.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={sourceMatches(source, [p.id])}
                    onChange={() =>
                      onFilter(
                        'source',
                        toggleSource(
                          source,
                          p.id,
                          available.map((p) => p.id),
                        ),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
            {!unavailable && (
              <>
                <label>
                  Events
                  <select
                    value={String(official)}
                    onChange={(e) => onFilter('official', e.target.value)}
                  >
                    <option value="false">All</option>
                    <option value="true">Official events</option>
                  </select>
                </label>
                <label>
                  Team sheets
                  <select
                    value={sheet}
                    onChange={(e) => onFilter('sheet', e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="open">OTS</option>
                    <option value="closed">CTS</option>
                  </select>
                </label>
                <label>
                  Event size
                  <select
                    value={minPlayers}
                    onChange={(e) => onFilter('size', e.target.value)}
                  >
                    <option value={0}>All events (20+)</option>
                    <option value={100}>Large (100+)</option>
                  </select>
                </label>
                <div className="filter-actions">
                  <button className="text-button" onClick={reset}>
                    Reset
                  </button>
                  <button
                    className="apply-filter"
                    onClick={() => {
                      apply();
                      if (popover.current) popover.current.open = false;
                    }}
                  >
                    Apply Filter
                  </button>
                </div>
              </>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
function BuildCards({
  builds,
  name,
  choose,
}: {
  builds?: Builds;
  name: string;
  choose: (id: string) => void;
}) {
  if (!builds) return null;
  return (
    <section className="build-cards" aria-label="Registered builds">
      {(
        [
          'items',
          'moves',
          'teammates',
          'natures',
          'spreads',
          'abilities',
        ] as const
      )
        .filter((field) => builds[field]?.known > 0)
        .map((field) => {
          const distribution = builds[field];
          return (
            <details
              key={field}
              className={`build-card ${['items', 'moves', 'teammates'].includes(field) ? 'build-card-primary' : ''}`}
              open
            >
              <summary>
                {field === 'spreads'
                  ? 'Registered stats'
                  : field[0].toUpperCase() + field.slice(1)}
                <span>
                  {field === 'teammates'
                    ? `${number(distribution.total)} teams`
                    : `${distribution.known} / ${distribution.total} sets`}
                </span>
              </summary>
              <div className="build-content">
                {field === 'teammates' && (
                  <p className="build-context">% of {name} teams</p>
                )}
                <div
                  className="build-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={`${field === 'spreads' ? 'Registered stats' : field[0].toUpperCase() + field.slice(1)} list`}
                >
                  <BuildTable
                    values={distribution.values}
                    field={field}
                    choose={choose}
                  />
                </div>
              </div>
            </details>
          );
        })}
    </section>
  );
}
function BuildTable({
  values,
  field,
  choose,
}: {
  values: Builds['items']['values'];
  field: string;
  choose: (id: string) => void;
}) {
  return (
    <table className="build-table">
      <caption className="sr-only">Registered {field} distribution</caption>
      <tbody>
        {values.map((v) => (
          <tr key={v.id ?? v.name}>
            <th scope="row">
              {field === 'teammates' && v.id ? (
                <button
                  className="teammate-button"
                  aria-label={`View ${v.name} teams`}
                  onClick={() => choose(v.id!)}
                >
                  <Sprite id={v.id} />
                  {v.name}
                </button>
              ) : field === 'spreads' ? (
                <StatSpread value={v.name} />
              ) : (
                v.name
              )}
            </th>
            <td>{pct(v.percent)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
          <p>
            Usage counts registered teams. Win rate shows how often teams
            containing this Pokémon won eligible matches. Matchups compare those
            teams against teams containing another Pokémon, with both complete
            teams known.
          </p>
          <p>
            A BO3 series counts as one match. Overlapping teams can contribute
            to multiple comparisons. Change vs overall compares a performer’s
            matchup win rate with its overall rate in these same filters. A
            change from 50% to 55% is +5 percentage points. Build percentages
            use sets with that field known; a set can include multiple moves.
            Teammates shows the share of complete registrations containing the
            selected Pokémon that also register each teammate; a team can
            register multiple teammates.
          </p>
        </div>
        <div>
          <p>
            {view.coverage.registrations} teams · {view.coverage.events} events
            · {view.coverage.matches} matches. Saved coverage through{' '}
            {date(dataset.asOf)}. Missing teams and unresolved results are
            excluded. All sheets includes events with unknown sheet type.
            Sources can have incomplete coverage.
          </p>
          <ul className="source-list">
            {dataset.sources
              .filter(
                (e) =>
                  e.players >= view.options.minPlayers &&
                  (!view.options.official || e.official) &&
                  sourceMatches(view.options.source, e.providers) &&
                  (view.options.sheet === 'all' ||
                    e.sheet.visibility === view.options.sheet),
              )
              .map((e) => (
                <li key={e.id}>
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.name}
                  </a>
                  <small>
                    {e.teams} teams{e.official ? ' · Masters' : ''}
                    {e.missingTeams > 0
                      ? ` · ${e.missingTeams} unavailable`
                      : ''}
                  </small>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

'use client';
import { sampleReasons } from '@/domain/evidence';
import { QualityInfo } from './evidence-context';
/* eslint-disable @next/next/no-img-element -- existing local cached artwork */
import { useEffect, useRef, useState } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Info,
  ArrowUp,
  ArrowDown,
  Gamepad2,
  Monitor,
} from 'lucide-react';
import type {
  LadderEnvironment,
  LadderSummary,
  LadderBuilds,
  LadderPokemon,
} from '@/domain/ladder';
import { ladderKey } from '@/domain/ladder';
import type { AppData } from '@/server/reader';
import { rowColor } from './pokemon-color';
import { StatSpread } from './stat-spread';
import { monthLabel } from '@/domain/presentation';
import {
  cohortCache,
  detailCache,
  readDetail,
  type PublicLadder,
} from './ladder-cache';
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);
const count = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US');
function Sprite({ id }: { id: string }) {
  return (
    <img
      className="sprite"
      src={`/sprites/${id}`}
      alt=""
      width={96}
      height={96}
    />
  );
}
function defaultCohort(
  catalog: LadderSummary[],
  environment: LadderEnvironment,
) {
  return (
    catalog
      .filter((d) => d.environment === environment)
      .sort(
        (a, b) =>
          b.regulation.localeCompare(a.regulation) ||
          b.period.localeCompare(a.period) ||
          a.format.localeCompare(b.format) ||
          Math.abs((a.rating ?? 1630) - 1630) -
            Math.abs((b.rating ?? 1630) - 1630),
      )[0] ?? null
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
export function LadderPanel({
  data,
  onContext,
}: {
  data: AppData;
  onContext: (context: { source: string; regulation: string }) => void;
}) {
  const catalog = data.ladder?.catalog ?? [];
  const [environment, setEnvironment] = useState<LadderEnvironment>('showdown');
  const [draftEnvironment, setDraftEnvironment] =
    useState<LadderEnvironment>('showdown');
  const initial = defaultCohort(catalog, environment);
  const [applied, setApplied] = useState<string>(
    initial ? ladderKey(initial) : '',
  );
  const [draft, setDraft] = useState<string>(initial ? ladderKey(initial) : '');
  const [loaded, setLoaded] = useState<PublicLadder | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<{
    publication: string;
    row: LadderPokemon;
  } | null>(null);
  const [detailPending, setDetailPending] = useState(false),
    [detailError, setDetailError] = useState(false);
  const choiceRequest = useRef(0);
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<{
    key: 'name' | 'usage' | 'rank' | 'rawCount';
    ascending: boolean;
  }>({ key: 'usage', ascending: false });
  const popover = useRef<HTMLDetailsElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    opener = useRef<string | null>(null),
    buttons = useRef(new Map<string, HTMLButtonElement>());
  const available = catalog.filter((d) => d.environment === draftEnvironment);
  const requested =
    catalog.find(
      (d) => d.environment === environment && ladderKey(d) === applied,
    ) ?? defaultCohort(catalog, environment);
  const edited =
    available.find((d) => ladderKey(d) === draft) ??
    defaultCohort(catalog, draftEnvironment);
  // Track pointer corrections for the same cohort without silently changing requested filters.
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      await Promise.resolve();
      if (!requested) {
        if (!data.ladder?.readError) setLoaded(null);
        setPending(false);
        if (!data.ladder?.readError)
          onContext({
            source: environment === 'showdown' ? 'Showdown' : 'Champions',
            regulation: '—',
          });
        return;
      }
      setPending(true);
      setError(false);
      try {
        let next = cohortCache.get(requested.id);
        if (!next) {
          const response = await fetch(`/ladder/${requested.id}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('Saved ladder unavailable');
          next = (await response.json()) as PublicLadder;
        }
        if (
          next.id !== requested.id ||
          next.environment !== environment ||
          !Array.isArray(next.rows)
        )
          throw new Error('Invalid ladder response');
        cohortCache.set(next.id, next);
        if (!controller.signal.aborted) {
          choiceRequest.current++;
          setDetailPending(false);
          setSelected(null);
          setLoaded(next);
          setPending(false);
          onContext({
            source: next.environment === 'showdown' ? 'Showdown' : 'Champions',
            regulation: next.regulation,
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setPending(false);
          setError(true);
        }
      }
    }
    void load();
    return () => controller.abort();
    // Immutable publication ID is the fetch dependency; a failed read retains the visible cohort and label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested?.id, environment, retry]);
  useEffect(() => {
    if (selected) heading.current?.focus();
    else if (opener.current) buttons.current.get(opener.current)?.focus();
  }, [selected]);
  const visible = loaded;
  const shownEnvironment = visible?.environment ?? environment;
  useEffect(() => {
    if (!visible) return;
    const index = selected
      ? visible.rows.findIndex((r) => r.id === selected)
      : 0;
    // Warm only neighbors; pointer and keyboard focus warm other targets.
    for (const row of visible.rows.slice(Math.max(0, index - 1), index + 3))
      void readDetail(visible.id, row.id).catch(() => {});
  }, [visible, selected]);
  useEffect(
    () => () => {
      choiceRequest.current++;
    },
    [],
  );
  const pokemon =
    detail?.publication === visible?.id && detail?.row.id === selected
      ? detail.row
      : visible?.rows.find((r) => r.id === selected);
  const detailLoaded =
    detail?.publication === visible?.id && detail?.row.id === selected;
  const filtered = (visible?.rows ?? []).filter((r) =>
    r.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const rows = [...filtered].sort((a, b) => {
    const av = a[sort.key],
      bv = b[sort.key];
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    const delta =
      typeof av === 'string' ? av.localeCompare(String(bv)) : av - Number(bv);
    return (sort.ascending ? delta : -delta) || a.rank - b.rank;
  });
  function changeEnvironment(next: LadderEnvironment) {
    const nextDefault = defaultCohort(catalog, next);
    setDraftEnvironment(next);
    setDraft(nextDefault ? ladderKey(nextDefault) : '');
  }
  function edit(
    field: 'regulation' | 'period' | 'format' | 'rating',
    value: string,
  ) {
    const matches = available.filter((d) => String(d[field]) === value);
    const best = matches.sort((a, b) => {
      const score = (d: LadderSummary) =>
        Number(d.regulation === edited?.regulation) +
        Number(d.period === edited?.period) +
        Number(d.format === edited?.format) +
        Number(d.rating === edited?.rating);
      return score(b) - score(a) || b.period.localeCompare(a.period);
    })[0];
    if (best) setDraft(ladderKey(best));
  }
  function choose(r: LadderPokemon, recordOpener = false) {
    if (!visible) return;
    if (recordOpener) opener.current = r.id;
    const request = ++choiceRequest.current,
      publication = visible.id;
    const show = (row: LadderPokemon) => {
      if (request !== choiceRequest.current) return;
      setDetail({ publication, row });
      setSelected(row.id);
      setDetailPending(false);
      setDetailError(false);
    };
    const cached = detailCache.get(`${publication}:${r.id}`);
    if (cached) {
      show(cached);
      return;
    }
    setDetailPending(true);
    setDetailError(false);
    void readDetail(publication, r.id)
      .then(show)
      .catch(() => {
        if (request !== choiceRequest.current) return;
        setSelected(r.id);
        setDetailPending(false);
        setDetailError(true);
      });
  }
  function warm(id: string) {
    if (visible) void readDetail(visible.id, id).catch(() => {});
  }
  function closeDetail() {
    choiceRequest.current++;
    setDetailPending(false);
    setSelected(null);
  }
  function changeSort(key: typeof sort.key) {
    setSort((s) => ({
      key,
      ascending:
        s.key === key ? !s.ascending : key === 'name' || key === 'rank',
    }));
  }
  const status = data.ladder?.status[environment];
  const stale =
    environment === 'champions' &&
    visible?.capturedAt &&
    Date.parse(data.now) - Date.parse(visible.capturedAt) > 48 * 3600000;
  return (
    <section
      className="analysis-panel ladder-panel"
      aria-label="Ladder analysis"
      aria-busy={pending || detailPending}
    >
      <div className="toolbar">
        <label className="search">
          <Search size={17} />
          <span className="sr-only">Search Pokémon</span>
          <input
            value={query}
            placeholder="Search Pokémon…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={15} />
            </button>
          )}
        </label>
        <div className="toolbar-right ladder-filter-area">
          <details className="filters" ref={popover}>
            <summary>
              <SlidersHorizontal size={15} />
              Filters
              {requested &&
                requested.id !== defaultCohort(catalog, environment)?.id && (
                  <span className="filter-dot" />
                )}
            </summary>
            <div className="filter-popover">
              <nav className="ladder-tabs" aria-label="Ladder source">
                {(['showdown', 'champions'] as const).map((e) => (
                  <button
                    key={e}
                    aria-pressed={e === draftEnvironment}
                    onClick={() => changeEnvironment(e)}
                  >
                    {e === 'showdown' ? (
                      <Monitor size={18} />
                    ) : (
                      <Gamepad2 size={18} />
                    )}
                    {e === 'showdown' ? 'Showdown' : 'Champions'}
                  </button>
                ))}
              </nav>
              <label>
                Regulation
                <select
                  aria-label="Ladder regulation"
                  disabled={!edited}
                  value={edited?.regulation ?? ''}
                  onChange={(e) => edit('regulation', e.target.value)}
                >
                  {[...new Set(available.map((d) => d.regulation))]
                    .sort()
                    .reverse()
                    .map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                </select>
              </label>
              <label>
                {draftEnvironment === 'showdown' ? 'Month' : 'Season / capture'}
                <select
                  aria-label={
                    draftEnvironment === 'showdown'
                      ? 'Reporting month'
                      : 'Season and capture'
                  }
                  disabled={!edited}
                  value={edited?.period ?? ''}
                  onChange={(e) => edit('period', e.target.value)}
                >
                  {available
                    .filter((d) => d.regulation === edited?.regulation)
                    .filter(
                      (d, i, all) =>
                        all.findIndex((a) => a.period === d.period) === i,
                    )
                    .sort((a, b) => b.period.localeCompare(a.period))
                    .map((d) => (
                      <option key={d.period} value={d.period}>
                        {d.season ? `${d.season} · ` : ''}
                        {monthLabel(d.month ?? d.capturedAt!)}
                        {draftEnvironment === 'champions' &&
                        available.some(
                          (a) =>
                            a.period !== d.period &&
                            a.capturedAt?.slice(0, 7) ===
                              d.capturedAt?.slice(0, 7),
                        )
                          ? ` · day ${d.capturedAt!.slice(8, 10)}, ${d.capturedAt!.slice(11, 16)} UTC`
                          : ''}
                      </option>
                    ))}
                </select>
              </label>
              {draftEnvironment === 'showdown' && (
                <>
                  <fieldset className="format-toggle">
                    <legend>Format</legend>
                    {[
                      ...new Set(
                        available
                          .filter(
                            (d) =>
                              d.regulation === edited?.regulation &&
                              d.period === edited.period,
                          )
                          .map((d) => d.format),
                      ),
                    ]
                      .sort()
                      .map((v) => (
                        <button
                          type="button"
                          key={v}
                          aria-pressed={edited?.format === v}
                          onClick={() => edit('format', v)}
                        >
                          {v}
                        </button>
                      ))}
                  </fieldset>
                  <label>
                    Rating
                    <select
                      aria-label="Rating"
                      disabled={!edited}
                      value={edited?.rating ?? ''}
                      onChange={(e) => edit('rating', e.target.value)}
                    >
                      {[
                        ...new Set(
                          available
                            .filter(
                              (d) =>
                                d.regulation === edited?.regulation &&
                                d.period === edited.period &&
                                d.format === edited.format,
                            )
                            .map((d) => d.rating),
                        ),
                      ]
                        .sort((a, b) => a! - b!)
                        .map((v) => (
                          <option key={v} value={v ?? ''}>
                            {v === 0 ? 'All ratings' : `${v}+`}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              <div className="filter-actions">
                <button
                  className="text-button"
                  disabled={!edited}
                  onClick={() => {
                    const d = defaultCohort(catalog, draftEnvironment);
                    setDraft(d ? ladderKey(d) : '');
                  }}
                >
                  Reset
                </button>
                <button
                  className="apply-filter"
                  disabled={!edited && draftEnvironment === environment}
                  onClick={() => {
                    choiceRequest.current++;
                    setDetailPending(false);
                    setEnvironment(draftEnvironment);
                    if (draftEnvironment !== environment) {
                      setQuery('');
                      setSort(
                        draftEnvironment === 'showdown'
                          ? { key: 'usage', ascending: false }
                          : { key: 'rank', ascending: true },
                      );
                    }
                    setApplied(edited ? ladderKey(edited) : '');
                    setRetry((n) => n + 1);
                    setSelected(null);
                    if (popover.current) popover.current.open = false;
                  }}
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </details>
          {visible && (
            <div className="ladder-context" aria-live="polite">
              <strong>{visible.regulation}</strong>
              <span>{monthLabel(visible.month ?? visible.capturedAt!)}</span>
              <span>{visible.format}</span>
              {shownEnvironment === 'showdown' && (
                <>
                  <span>
                    {visible.rating === 0
                      ? 'All ratings'
                      : `${visible.rating}+`}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div
        className={`ladder-progress ${pending || detailPending ? 'is-active' : ''}`}
        role={pending || detailPending ? 'status' : undefined}
      >
        {(pending || detailPending) && (
          <span className="sr-only">Loading selection</span>
        )}
      </div>
      {(error || data.ladder?.readError) && (
        <p className="ladder-notice" role="status">
          The saved ladder couldn’t be read.
          {visible ? ' Previously loaded results remain visible.' : ''}{' '}
          <button
            className="text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {status?.state === 'failure' && (
        <p className="ladder-notice" role="status">
          The last source refresh failed. Saved data remains available.
        </p>
      )}
      {stale && (
        <p className="ladder-notice" role="status">
          This Champions capture is over two days old.
        </p>
      )}
      {!requested && !visible ? (
        <Empty title="No ladder data available">
          <p>
            No verified{' '}
            {shownEnvironment === 'showdown' ? 'Showdown' : 'Champions'} Doubles
            dataset is saved.
          </p>
        </Empty>
      ) : !visible ? (
        error ? (
          <Empty title="Ladder data unavailable">
            <p>Retry the local read.</p>
          </Empty>
        ) : null
      ) : pokemon ? (
        <div className="detail-layout">
          <aside className="pokemon-rail" aria-label="Pokémon navigation">
            <button
              className="rail-back"
              aria-label="Back to usage"
              onClick={closeDetail}
            >
              <ChevronLeft size={20} />
            </button>
            {filtered.map((r) => (
              <button
                key={r.id}
                aria-label={`Select ${r.name}`}
                aria-pressed={r.id === selected}
                className={r.id === selected ? 'selected' : ''}
                onClick={() => choose(r)}
                onPointerEnter={() => warm(r.id)}
                onFocus={() => warm(r.id)}
                title={r.name}
              >
                <Sprite id={r.id} />
              </button>
            ))}
          </aside>
          <div className="detail-content" style={rowColor(pokemon.id)}>
            <div className="detail-heading">
              <div className="pokemon-identity">
                <div className="portrait">
                  <Sprite id={pokemon.id} />
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
                onClick={closeDetail}
              >
                <X size={18} />
              </button>
            </div>
            <div className="detail-metrics">
              <div>
                <span>
                  {shownEnvironment === 'champions' ? 'Usage rank' : 'Usage'}
                  <QualityInfo
                    label="Ladder samples"
                    reasons={[
                      'Sample unavailable. The source does not establish a usage population or known-field registration samples.',
                    ]}
                  />
                </span>
                <strong>
                  {shownEnvironment === 'champions'
                    ? `#${pokemon.rank}`
                    : pct(pokemon.usage)}
                </strong>
              </div>
              {shownEnvironment === 'showdown' && (
                <div>
                  <span>Raw appearances</span>
                  <strong>{count(pokemon.rawCount)}</strong>
                </div>
              )}
            </div>
            {detailError && (
              <p role="status" className="muted">
                The saved detail couldn’t be read.{' '}
                <button className="text-button" onClick={() => choose(pokemon)}>
                  Retry detail
                </button>
              </p>
            )}
            <LadderBuildCards
              builds={pokemon.builds}
              name={pokemon.name}
              choose={(id) => {
                const row = visible.rows.find((r) => r.id === id);
                if (row) choose(row);
              }}
            />
            {detailLoaded && !Object.keys(pokemon.builds).length && (
              <p className="muted">
                No detailed build distributions are published for this Pokémon
                in this report.
              </p>
            )}
            {!!pokemon.trend?.length && (
              <details className="build-card" open>
                <summary>Usage rank history</summary>
                <div
                  className="build-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={`${pokemon.name} usage rank history`}
                >
                  <table className="build-table">
                    <tbody>
                      {pokemon.trend.map((t) => (
                        <tr key={t.date}>
                          <th scope="row">
                            {t.date.slice(5).replace('-', '/')}/
                            {t.date.slice(2, 4)}
                          </th>
                          <td>#{t.rank}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </div>
      ) : !rows.length ? (
        <Empty title="No Pokémon found">
          <p>
            Try another name or{' '}
            <button className="text-button" onClick={() => setQuery('')}>
              clear your search
            </button>
            .
          </p>
        </Empty>
      ) : (
        <div className="table-scroll">
          <table
            className={`usage-table ladder-table ${shownEnvironment === 'champions' ? 'ladder-ranks' : ''}`}
          >
            <caption className="sr-only">
              {shownEnvironment === 'champions'
                ? 'Champions Doubles published usage ranks'
                : 'Showdown Champions VGC monthly usage'}
            </caption>
            <thead>
              <tr>
                <th
                  className="rank-column"
                  aria-hidden={shownEnvironment === 'champions'}
                >
                  {shownEnvironment === 'showdown' ? 'Rank' : ''}
                </th>
                {(
                  [
                    'name',
                    shownEnvironment === 'champions' ? 'rank' : 'usage',
                    ...(shownEnvironment === 'showdown'
                      ? ['rawCount' as const]
                      : []),
                  ] as const
                ).map((key) => (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={
                      sort.key === key
                        ? sort.ascending
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button onClick={() => changeSort(key)}>
                      {key === 'name'
                        ? 'Pokémon'
                        : key === 'rank'
                          ? 'Usage rank'
                          : key === 'usage'
                            ? 'Usage'
                            : 'Raw appearances'}
                      {sort.key === key &&
                        (sort.ascending ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        ))}
                    </button>
                    {(key === 'rank' || key === 'usage') && (
                      <QualityInfo
                        label="Ladder population"
                        reasons={sampleReasons(null, 'usage')}
                      />
                    )}
                  </th>
                ))}
                <th className="arrow-column">
                  <span className="sr-only">Detail</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={rowColor(r.id)}>
                  <td
                    className="rank-column"
                    aria-hidden={shownEnvironment === 'champions'}
                  >
                    {shownEnvironment === 'showdown' && <span>#{r.rank}</span>}
                  </td>
                  <td>
                    <button
                      className="pokemon-button"
                      ref={(button) => {
                        if (button) buttons.current.set(r.id, button);
                        else buttons.current.delete(r.id);
                      }}
                      onClick={() => choose(r, true)}
                      onPointerEnter={() => warm(r.id)}
                      onFocus={() => warm(r.id)}
                    >
                      <span className="row-sprite">
                        <Sprite id={r.id} />
                      </span>
                      <span>{r.name}</span>
                    </button>
                  </td>
                  <td className="numeric">
                    {shownEnvironment === 'champions'
                      ? `#${r.rank}`
                      : pct(r.usage)}
                  </td>
                  {shownEnvironment === 'showdown' && (
                    <td className="numeric muted">{count(r.rawCount)}</td>
                  )}
                  <td>
                    <ChevronRight className="row-chevron" size={17} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible && (
        <>
          <div className="panel-footer">
            {rows.length} of {visible.rows.length} Pokémon
          </div>
          <details className="evidence">
            <summary>
              <Info size={15} />
              About the data
              <ChevronRight size={15} />
            </summary>
            <div className="evidence-content">
              <p>
                Usage-population and unique-player counts are unavailable.
                Showdown battles and raw appearances do not establish
                independent registrations or BO3 series. Champions publishes
                ranks and marginal builds without sample counts. These sources
                remain separate from tournament outcomes; percentages never
                imply missing counts.
              </p>
              <div>
                {visible.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
                <p>{visible.periodBasis}</p>
                {visible.battles !== null && (
                  <p>
                    {count(visible.battles)} source battles. Rating reports
                    overlap and remain separate.
                  </p>
                )}
                <p>
                  {visible.detailCoverage} Pokémon with saved detail coverage.{' '}
                  {visible.excludedCount} unresolved source entries excluded.
                </p>
              </div>
              <div>
                <p>
                  Source{' '}
                  {visible.environment === 'champions'
                    ? `capture: ${visible.capturedAt}`
                    : `month: ${visible.month}`}
                  . Published locally: {visible.publishedAt}.
                </p>
                <p>
                  Details are marginal distributions. Empty Showdown move slots
                  are omitted because multiple empty slots can occur in one set.
                  Spreads use source stat ordering HP / Atk / Def / SpA / SpD /
                  Spe. Green stats are raised by the source nature; red stats
                  are lowered. Champions spreads do not supply a paired nature
                  and stay neutral.
                </p>
                <ul className="source-list">
                  {visible.sources
                    .filter((u) => !u.includes('/api/championsdoubles/'))
                    .map((u) => (
                      <li key={u}>
                        <a href={u} target="_blank" rel="noreferrer">
                          {u.includes('smogon')
                            ? 'Smogon source report'
                            : 'Official season evidence'}
                        </a>
                      </li>
                    ))}
                  {shownEnvironment === 'champions' && (
                    <li>
                      <a
                        href="https://www.munchstats.com/about/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        MunchStats capture methodology
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
function LadderBuildCards({
  builds,
  name,
  choose,
}: {
  builds: LadderBuilds;
  name: string;
  choose: (id: string) => void;
}) {
  const labels = {
    items: 'Items',
    moves: 'Moves',
    teammates: 'Teammates',
    spreads: 'Stat spreads',
    natures: 'Natures',
    abilities: 'Abilities',
  };
  return (
    <div className="build-cards">
      {(
        [
          'items',
          'moves',
          'teammates',
          'spreads',
          'natures',
          'abilities',
        ] as const
      ).map((key) => {
        const d = builds[key];
        if (!d?.values.length) return null;
        return (
          <details
            key={key}
            className={`build-card ${['items', 'moves', 'teammates'].includes(key) ? 'build-card-primary' : ''}`}
            open
          >
            <summary>{labels[key]}</summary>
            <div className="build-content">
              <div
                className="build-scroll"
                tabIndex={0}
                role="region"
                aria-label={`${name} ${labels[key]} list`}
              >
                <table className="build-table">
                  <caption className="sr-only">
                    {labels[key]} {d.kind === 'rank' ? 'ranks' : 'percentages'}
                  </caption>
                  <tbody>
                    {d.values.map((v, i) => (
                      <tr key={`${v.name}:${i}`}>
                        <th scope="row">
                          {v.id ? (
                            <button
                              className="teammate-button"
                              onClick={() => choose(v.id!)}
                            >
                              <Sprite id={v.id} />
                              {v.name}
                            </button>
                          ) : key === 'spreads' ? (
                            <StatSpread value={v.name} />
                          ) : (
                            v.name
                          )}
                        </th>
                        <td>
                          {d.kind === 'rank' ? `#${v.rank}` : pct(v.percent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

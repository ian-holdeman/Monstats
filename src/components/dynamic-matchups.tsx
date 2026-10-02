'use client';
/* eslint-disable @next/next/no-img-element -- local cached artwork */
import { useEffect, useState, useRef } from 'react';
import { Toolbar } from './tournament-toolbar';
import { rowColor } from './pokemon-color';
import { BoundedCache } from '@/domain/bounded-cache';
import {
  MATCHUP_CALCULATION,
  MATCHUP_INDEX,
  type MatchupRequest,
  type MatchupResponse,
  type CombinationRow,
  type Sample,
} from '@/domain/dynamic-matchups';
import type { PublicDataset } from '@/server/reader';
import type { Options } from '@/domain/types';
import { EVIDENCE_VERSION } from '@/domain/evidence';
import {
  PerformanceInfo,
  EvidenceDetails,
  evidenceSortHelp,
} from './evidence-context';

type Filters = Pick<
  MatchupRequest,
  'source' | 'sheet' | 'official' | 'minPlayers' | 'hideNotices'
>;
const defaults: Filters = {
  source: 'all',
  sheet: 'all',
  official: false,
  minPlayers: 0,
  hideNotices: false,
};
const cache = new BoundedCache<MatchupResponse>(16);
const pending = new Map<string, Promise<MatchupResponse>>();
function load(publication: PublicDataset, request: MatchupRequest) {
  const key = JSON.stringify([
    publication.id,
    MATCHUP_CALCULATION,
    MATCHUP_INDEX,
    EVIDENCE_VERSION,
    publication.floor,
    request,
  ]);
  const saved = cache.get(key);
  if (saved) return Promise.resolve(saved);
  const flight = pending.get(key);
  if (flight) return flight;
  if (pending.size >= 16)
    return Promise.reject(new Error('Queries are busy. Try again.'));
  const promise = fetch(`/matchups/${publication.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
    .then(async (r) => {
      const value = await r.json();
      if (!r.ok)
        throw new Error(value.error ?? 'The comparison could not be loaded');
      return cache.set(key, value as MatchupResponse);
    })
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
const pct = (n: number | null) =>
  n === null ? 'Unavailable' : `${n.toFixed(1)}%`;
const pp = (n: number | null) =>
  n === null
    ? 'Unavailable'
    : `${n > 0 ? '+' : n < 0 && Math.abs(n) >= 0.05 ? '−' : ''}${Math.abs(n).toFixed(1)} points`;

function Selector({
  label,
  members,
  catalog,
  change,
}: {
  label: string;
  members: string[];
  catalog: MatchupResponse['catalog'];
  change: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  function edit(ids: string[]) {
    change(ids);
    requestAnimationFrame(() => {
      if (ids.length < 6) input.current?.focus();
      else
        (chips.current?.lastElementChild as HTMLButtonElement | null)?.focus();
    });
  }
  const choices = catalog
    .filter(
      (p) =>
        !members.includes(p.id) &&
        p.name.toLowerCase().includes(search.toLowerCase().trim()),
    )
    .slice(0, 12);
  return (
    <fieldset className="combination-selector">
      <legend>
        {label} <span>{members.length}/6</span>
      </legend>
      <div className="selected-members" ref={chips}>
        {members.map((id) => (
          <button
            key={id}
            className="selected-member"
            onClick={() => edit(members.filter((member) => member !== id))}
            aria-label={`Remove ${catalog.find((p) => p.id === id)?.name ?? id} from ${label}`}
          >
            <img src={`/sprites/${id}`} alt="" width={40} height={40} />
            {catalog.find((p) => p.id === id)?.name ?? id}
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <label className="search">
        <span className="sr-only">Search {label}</span>
        <input
          ref={input}
          disabled={members.length === 6}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            members.length === 6
              ? 'Six Pokémon selected'
              : 'Search and add Pokémon…'
          }
        />
      </label>
      {search.trim() && members.length < 6 && (
        <div
          className="selector-options"
          role="group"
          aria-label={`Add to ${label}`}
        >
          {choices.length ? (
            choices.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  edit([...members, p.id].sort());
                  setSearch('');
                }}
                aria-label={`Add ${p.name} to ${label}`}
              >
                <img src={`/sprites/${p.id}`} alt="" width={36} height={36} />
                {p.name}
              </button>
            ))
          ) : (
            <p className="muted">No Pokémon found in this publication.</p>
          )}
        </div>
      )}
    </fieldset>
  );
}
function Evidence({ sample, label }: { sample: Sample; label: string }) {
  return (
    <p>
      <strong>{label}:</strong> {sample.wins} wins / {sample.losses} losses ·{' '}
      {sample.outcomes} team perspectives · {sample.players} participant
      identities
      <br />
      <EvidenceDetails evidence={sample.evidence} />
    </p>
  );
}
function ResultRow({
  row,
  response,
  inspect,
  interactive,
}: {
  row: CombinationRow;
  response: MatchupResponse;
  inspect: (members: string[]) => void;
  interactive: boolean;
}) {
  const matchup = response.request.b.length > 0;
  const names = row.members
    .map((id) => response.catalog.find((p) => p.id === id)?.name ?? id)
    .join(' + ');
  return (
    <article className="combination-result" style={rowColor(row.members[0])}>
      <div className="combination-result-main">
        <button
          className="combination-name"
          disabled={!interactive}
          onClick={() => inspect(row.members)}
          aria-label={`Inspect ${names}`}
        >
          <span className="combination-sprites">
            {row.members.map((id) => (
              <img
                key={id}
                src={`/sprites/${id}`}
                alt=""
                width={48}
                height={48}
              />
            ))}
          </span>
          <strong>{names}</strong>
        </button>
        <div className="combination-metrics">
          <div>
            <span>{matchup ? 'Win rate into B' : 'Overall win rate'}</span>
            <strong>
              {pct(row.sample.winRate)}
              <PerformanceInfo
                label={`${names} performance`}
                evidence={row.sample.evidence}
                matches={row.sample.matches}
                baseline={matchup ? row.overall.evidence : undefined}
                baselineMatches={matchup ? row.overall.matches : undefined}
              />
            </strong>
            <small>
              {row.sample.wins}W – {row.sample.losses}L
            </small>
          </div>
          {matchup && (
            <>
              <div>
                <span>Overall baseline</span>
                <strong>{pct(row.overall.winRate)}</strong>
                <small>
                  {row.overall.wins}W – {row.overall.losses}L
                </small>
              </div>
              <div>
                <span>Change vs overall</span>
                <strong
                  className={
                    row.difference !== null && row.difference >= 0
                      ? 'positive'
                      : 'negative'
                  }
                >
                  {pp(row.difference)}
                </strong>
              </div>
            </>
          )}
        </div>
      </div>
      {!row.sufficient && (
        <p className="evidence-status">
          {row.sample.outcomes
            ? 'Insufficient evidence for ranking'
            : 'No observed results for this selection'}
        </p>
      )}
      <details className="combination-evidence">
        <summary>Evidence · {row.sample.matches} physical matches</summary>
        <Evidence
          sample={row.sample}
          label={matchup ? 'Against B' : 'Overall'}
        />
        {matchup && (
          <Evidence
            sample={row.overall}
            label="Candidate’s overall baseline (includes B)"
          />
        )}
        <p>
          Both orientations can qualify. Mirrors contribute one win and one loss
          per physical result. Participant identities are namespaced source
          identities.
        </p>
      </details>
    </article>
  );
}
export function DynamicMatchups({
  dataset,
  initialA = [],
  initialB = [],
  initialFilters,
  onContext,
}: {
  dataset: PublicDataset;
  initialA?: string[];
  initialB?: string[];
  initialFilters?: Partial<Options>;
  onContext: (regulation: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>({
    hideNotices: false,
    source: initialFilters?.source ?? defaults.source,
    sheet: initialFilters?.sheet ?? defaults.sheet,
    minPlayers: initialFilters?.minPlayers ?? defaults.minPlayers,
    official: initialFilters?.official ?? defaults.official,
  });
  const [draft, setDraft] = useState(filters);
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [opponent, setOpponent] = useState(initialB.length > 0);
  const [mode, setMode] = useState<'compare' | 'discover'>(
    initialB.length ? 'discover' : 'compare',
  );
  const [candidateSize, setSize] = useState(1);
  const [sort, setSort] = useState<MatchupRequest['sort']>(
    initialB.length ? 'difference' : 'winRate',
  );
  const [direction, setDirection] = useState<'best' | 'worst'>('best');
  const [offset, setOffset] = useState(0);
  const [savedResponse, setResponse] = useState<MatchupResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const request: MatchupRequest = {
    ...filters,
    a: mode === 'compare' ? a : [],
    b: opponent ? b : [],
    mode,
    candidateSize,
    sort: sort === 'evidence' ? sort : opponent && b.length ? sort : 'winRate',
    direction,
    offset,
    limit: 20,
  };
  const encoded = JSON.stringify(request);
  const ready =
    (mode === 'discover' || a.length > 0) && (!opponent || b.length > 0);
  // An incomplete selection has no result. Retention only bridges valid reads.
  const response = ready ? savedResponse : null;
  const current =
    response?.publication === dataset.id &&
    Object.entries(request).every(
      ([key, value]) =>
        JSON.stringify(value) ===
        JSON.stringify(response.request[key as keyof MatchupRequest]),
    );
  useEffect(() => {
    let stale = false;
    async function read() {
      await Promise.resolve();
      if (stale) return;
      if (!ready) {
        setResponse(null);
        setError('');
        setLoading(false);
        onContext(dataset.regulation ?? 'M-C');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const result = await load(dataset, JSON.parse(encoded));
        if (!stale) {
          setResponse(result);
          setLoading(false);
          onContext(result.regulation);
        }
      } catch (e) {
        if (!stale) {
          setLoading(false);
          setError(
            e instanceof Error
              ? e.message
              : 'The comparison could not be loaded',
          );
        }
      }
    }
    void read();
    return () => {
      stale = true;
    };
    // Immutable publication and complete request identities govern reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.id, encoded, ready, retry]);
  const catalog =
    response?.catalog ??
    Object.values(dataset.views)[0].pokemon.map((p) => ({
      id: p.id,
      name: p.name,
    }));
  const shown = response?.request;
  const displayedFilters = shown ?? filters;
  const names = (members: string[]) =>
    members
      .map((id) => catalog.find((p) => p.id === id)?.name ?? id)
      .join(' + ');
  function changeOpponent(value: boolean) {
    setOpponent(value);
    setSort(value ? 'difference' : 'winRate');
    setOffset(0);
  }
  function inspect(members: string[]) {
    setA(members);
    setMode('compare');
    setOffset(0);
  }
  return (
    <section
      className="analysis-panel dynamic-matchups"
      aria-label="Dynamic matchups"
      aria-busy={ready && loading}
    >
      <Toolbar
        query=""
        setQuery={() => {}}
        hideSearch
        {...draft}
        providers={dataset.providers}
        appliedSheet={displayedFilters.sheet}
        active={
          displayedFilters.sheet !== 'all' ||
          displayedFilters.source !== 'all' ||
          displayedFilters.official ||
          displayedFilters.minPlayers > 0 ||
          !!displayedFilters.hideNotices
        }
        onFilter={(field, value) =>
          setDraft((d) => ({
            ...d,
            ...(field === 'size'
              ? { minPlayers: Number(value) }
              : field === 'official' || field === 'hideNotices'
                ? { [field]: value === 'true' }
                : { [field]: value }),
          }))
        }
        reset={() => setDraft(defaults)}
        apply={() => {
          setFilters({ ...draft });
          setOffset(0);
          setRetry((r) => r + 1);
        }}
      />
      <p className="matchup-filter-summary">
        {displayedFilters.source === 'all'
          ? 'All sources'
          : displayedFilters.source === 'none'
            ? 'No sources'
            : displayedFilters.source
                .split(',')
                .map(
                  (id) =>
                    dataset.providers.find((p) => p.id === id)?.name ?? id,
                )
                .join(' + ')}{' '}
        ·{' '}
        {displayedFilters.sheet === 'all'
          ? 'All sheets'
          : displayedFilters.sheet === 'open'
            ? 'OTS'
            : 'CTS'}{' '}
        · {displayedFilters.official ? 'Official events' : 'All events'} ·{' '}
        {displayedFilters.minPlayers ? '100+' : '20+'} entrants · Published
        30-day window
        {displayedFilters.hideNotices && ' · Entries with data notices hidden'}
      </p>
      <div className="matchup-controls">
        <div className="matchup-mode" role="group" aria-label="Calculation">
          <button
            aria-pressed={mode === 'compare'}
            onClick={() => {
              setMode('compare');
              setOffset(0);
            }}
          >
            Compare
          </button>
          <button
            aria-pressed={mode === 'discover'}
            onClick={() => {
              setMode('discover');
              setOffset(0);
            }}
          >
            Discover combinations
          </button>
        </div>
        <label>
          Opponents
          <select
            aria-label="Opponent mode"
            value={opponent ? 'selected' : 'overall'}
            onChange={(e) => changeOpponent(e.target.value === 'selected')}
          >
            <option value="overall">Overall · all opponents</option>
            <option value="selected">Selected opponent B</option>
          </select>
        </label>
        {mode === 'discover' && (
          <>
            <label>
              Combination size
              <select
                value={candidateSize}
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  setOffset(0);
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((k) => (
                  <option key={k} value={k}>
                    {k} Pokémon
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ranking
              <select
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value as 'best' | 'worst');
                  setOffset(0);
                }}
              >
                <option value="best">Best</option>
                <option value="worst">Worst</option>
              </select>
            </label>
            <label>
              Sort by
              <select
                value={sort === 'evidence' ? sort : opponent ? sort : 'winRate'}
                onChange={(e) => {
                  setSort(e.target.value as MatchupRequest['sort']);
                  setOffset(0);
                }}
              >
                {opponent && (
                  <option value="difference">Change vs own overall</option>
                )}
                <option value="winRate">
                  {opponent ? 'Matchup win rate' : 'Overall win rate'}
                </option>
                <option value="evidence">Most evidence</option>
              </select>
            </label>
          </>
        )}
      </div>
      <div className="combination-selectors">
        {mode === 'compare' && (
          <Selector
            key="candidate"
            label="Candidate A"
            members={a}
            catalog={catalog}
            change={(ids) => {
              setA(ids);
              setOffset(0);
            }}
          />
        )}
        {opponent && (
          <Selector
            key="opponent"
            label="Opponent B"
            members={b}
            catalog={catalog}
            change={(ids) => {
              setB(ids);
              setOffset(0);
            }}
          />
        )}
      </div>
      {ready && loading && (
        <p role="status" className="matchup-loading">
          Calculating… {response ? 'Previous results remain below.' : ''}
        </p>
      )}
      {ready && error && (
        <p role="alert" className="matchup-error">
          {error} {response && 'Previous results remain below.'}{' '}
          <button
            className="text-button"
            onClick={() => setRetry((r) => r + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {!ready && (
        <p className="matchup-prompt">
          {mode === 'compare' && !a.length
            ? 'Add one to six Pokémon to Candidate A.'
            : 'Add one to six Pokémon to Opponent B.'}
        </p>
      )}
      {response && (
        <div className="combination-results">
          <h2>
            {shown!.mode === 'compare'
              ? `${names(shown!.a)} teams`
              : `${shown!.sort === 'evidence' ? 'Most evidenced' : shown!.direction === 'best' ? 'Best' : 'Worst'} ${shown!.candidateSize}-Pokémon combinations`}
            {shown!.b.length ? ` into ${names(shown!.b)} teams` : ' · overall'}
          </h2>
          {response.rows.length ? (
            response.rows.map((row) => (
              <ResultRow
                key={row.key}
                row={row}
                response={response}
                inspect={inspect}
                interactive={current && !loading}
              />
            ))
          ) : (
            <div className="empty">
              <h3>
                {shown!.hideNotices
                  ? 'No entries match these filters'
                  : 'Insufficient evidence'}
              </h3>
              <p>
                No observed combinations meet the ranking floor for these
                filters and selections.{' '}
                {shown!.hideNotices &&
                  'Change the data notice filter, then select Apply Filter.'}
              </p>
            </div>
          )}
          {shown!.mode === 'discover' && response.total > shown!.limit && (
            <nav className="matchup-pagination" aria-label="Combination pages">
              <button
                disabled={shown!.offset === 0 || loading || !current}
                onClick={() =>
                  setOffset(Math.max(0, shown!.offset - shown!.limit))
                }
              >
                Previous
              </button>
              <span>
                {shown!.offset + 1}–
                {Math.min(shown!.offset + shown!.limit, response.total)} of{' '}
                {response.total}
              </span>
              <button
                disabled={
                  shown!.offset + shown!.limit >= response.total ||
                  loading ||
                  !current
                }
                onClick={() => setOffset(shown!.offset + shown!.limit)}
              >
                Next
              </button>
            </nav>
          )}
          <details className="matchup-methodology">
            <summary>About these results</summary>
            <p>
              Small match samples contain fewer than 100 distinct physical
              matches/series. Matchup and baseline samples are assessed
              separately. Largest-event share counts distinct physical results.
            </p>
            <p>
              {evidenceSortHelp} Event attendance and source classification are
              context; comparable official and community events receive equal
              treatment.
            </p>
            <p>
              Registered teams containing every selected Pokémon qualify; extra
              members are unrestricted. Six selections identify species
              composition, regardless of sets or slot order. These are
              tournament associations, not predictions of individual battles or
              evidence of brought Pokémon.
            </p>
            <p>
              Automatic rankings require {response.floor.matches} distinct
              physical matches, {response.floor.events} events and{' '}
              {response.floor.players} candidate-side participant identities.
              This provisional floor is not a confidence guarantee. Candidate
              rows overlap and counts cannot be summed. Exact identical
              combinations are omitted from matchup discovery; manual mirrors
              remain available.
            </p>
            <p>
              Publication {response.publication} · Source window ends{' '}
              {new Date(response.asOf).toISOString()} · {response.calculation} /{' '}
              {response.index}. Ladder captures and monthly usage do not enter
              these calculations.
            </p>
          </details>
        </div>
      )}
    </section>
  );
}

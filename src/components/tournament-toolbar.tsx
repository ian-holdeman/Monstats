'use client';
import { useRef } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { sourceMatches, toggleSource } from '@/domain/filters';
import type { PublicDataset } from '@/server/reader';
import type { Visibility } from '@/domain/types';
export function Toolbar({
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
  hideSearch = false,
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
  hideSearch?: boolean;
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
      {!hideSearch && (
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
      )}
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

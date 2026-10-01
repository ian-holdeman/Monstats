# Next slice proposal: reviewed coverage or artwork reliability

The expanded data, official Masters and detail-formatting slice is complete and accepted; see the [official report](official-coverage.md). Independent source toggles, Apply Filter, baseline-first rankings, canonical build labels, teammate shares and compact scrollable detail tables are implemented. Remaining future work is a permitted direct RK9 export, additional reviewed event contracts, better administrative/BO evidence and a verified ladder export. M-D activation, deployment and unrelated analysis remain separate decisions.

The initial draft is complete and accepted. Preserve its glossy usage rows, readable minimalist headers, monochrome Poké Ball logo, expanded detail view and image-only navigation rail.

The [coverage report](data-slice.md) documents integrated sources, deferred sources and concrete follow-ups. A next data slice should select one additional permitted event contract or one compatible M-C ladder rank/build export, establish its evidence and review the proposed scope before broad collection. A smaller alternative is the artwork-reliability maintenance slice below. This proposal is not authorization to start another implementation.

For RK9, verify original event IDs, regulation, entrant counts, full team sheets, stable participant joins and competitive result flags. pokedata.ovh is a discovery/reconciliation lead, not another independent sample. For ladder, establish capture/season/regulation metadata and denominators; preserve Champions usage ranks as ranks. Monthly Showdown and selected replays need distinct environments and coverage. Keep pair-versus-pair tools deferred until these cohorts are reliable.

The prior artwork proposal below remains a separate small maintenance option.

## Outcomes

- Audit each unavailable variant against its canonical statistical identity and the available artwork sources.
- Correct mappings where suitable artwork exists. Preserve neutral placeholders where the exact form is unavailable; do not silently substitute a different form.
- Keep collection explicit and artwork local. Browsing must continue to work without contacting upstream services.
- Make missing or failed artwork requests degrade cleanly in usage rows, the detail hero, matchup rows and the navigation rail.
- Preserve existing statistics, filters, sort behavior, keyboard focus and layout.

## Starting point

The initial local cache covered 84 of 88 identities; expanded coverage introduces additional forms. Unavailable artwork uses neutral placeholders. Canonical identity logic lives in `src/domain/normalize.ts`, artwork collection in `scripts/sprites.ts`, local serving in `src/app/sprites/[id]/route.ts`, and presentation in `src/components/explorer.tsx` and `src/app/rows.css`.

Ignored `.monstats/` contains the owner's database, cached artwork, source audit, traces and preview captures. Retain it locally; never commit it. A clean checkout needs explicit ingestion and artwork collection as described in the README.

## Completion checks

Document resolved and unavailable variants with their source basis. Verify valid artwork and fallback responses, inspect desktop and narrow layouts, and rerun the relevant offline and browser regressions. Confirm browsing remains local and no statistical publication changes accidentally.

Pagination, correction/revisit policy, official joins, registered set summaries and set-label canonicalization now exist. Additional source contracts, compatible ladder exports, modeling and hosted operations remain separate decisions.

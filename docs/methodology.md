# Methodology and architecture

Monstats measures registered teams and observed match results, not individual Pokémon combat or causal counter strength.

## Collection and identity

The collector cross-checks exact event IDs against Limitless's completed-events listing, then rejects future event starts. This matters: a completed entry in the audit had a future scheduled date. Public standard cartridge M-C events with submitted lists are required; reported custom bans/rules are rejected. Discovery is bounded, incomplete and disclosed in the UI.

Source dates are scheduled event start times, not individual match or completion times. Retrieval times belong to separate observations. Unmodified API responses and completed-list HTML are preserved with SHA-256 checksums. These reads require no API key according to [Limitless documentation](https://docs.limitlesstcg.com/developer).

Explicit organizer description text classifies open/closed sheets; absent or conflicting evidence stays unknown. Public team submission alone is not OTS evidence. Provenance accompanies each event and unknown sheets form a separate population.

Runtime schemas validate payloads. @pkmn/dex and centralized aliases resolve canonical identities. Conflicting IDs/names or unresolved species quarantine the whole team rather than silently dropping one slot. Mega stones derive forms separately from original species; this is a registered option, not observed transformation. Slots preserve original names/IDs, items, abilities, moves, natures and available stats. Snapshots preserve all other source fields. Missing data stays null.

Physical match identity uses event, phase, round and bracket label or unordered participants. Duplicated ingestion does not add outcomes; different rounds retain rematches. Conflicting duplicate results are quarantined. Corrected event facts enter a new complete publication. Drops do not erase prior legitimate outcomes.

Nondecisive, malformed, unknown, ambiguous, missing-opponent, identifiable administrative and unsupported results are excluded. An absent opponent may represent a bye or automatic loss; neither contributes. The API cannot identify all unmarked administrative wins, which remains a material limitation.

## Counts and baselines

Usage divides registrations containing an identity by all complete resolved registrations in the selected cohort. It does not weight by rounds or standings. Match calculations require both complete resolved teams and a decisive competitive result.

Derive two team perspectives from each physical match. A row's numerator counts winning perspectives whose team registers that identity; its denominator counts eligible perspectives containing it. Its match count counts distinct physical series. A mirror adds one win, one loss and one physical match.

For a row Pokémon into a selected Pokémon, retain a perspective if its team contains the row identity and the opponent contains the selected identity. Both perspectives can qualify when teams overlap; the rate denominator can therefore exceed the displayed physical match count. This is intentional. Self identities are excluded from rankings.

Overall baselines use the identical both-teams-known decisive cohort and filter rules, across all opponents. Difference is raw matchup rate minus baseline in percentage points. Compatible cohorts combine counts, never averaged percentages. Only display formatting rounds rates. Zero, null and negative differences remain distinct.

The configurable floor requires 20 matches, two events and five distinct row-side players. In the audit, 389 eligible OTS series span two events; the floor suppresses isolated teams/event-specific rows while retaining raw-rate ranking. It is provisional, not a confidence guarantee. Event/player/perspective counts are available in each row's baseline details. Best/worst lists can overlap when few rows qualify.

## Local architecture

```text
Owner CLI → snapshots → normalized facts + quarantine → validated aggregates
          → SQLite transaction → active publication pointer
Browser   → read-only published dataset → UI + local artwork
```

SQLite stores content-addressed snapshots, retrieval observations, immutable publication versions, active/archive pointers and refresh state. Normalized facts and precomputed cohort aggregates live in versioned JSON payloads. Indexed relational facts are deferred until scale warrants them.

PostgreSQL was evaluated first; psql and Docker were unavailable locally. Node 24's built-in SQLite avoids an additional service or Python runtime for this personal draft. Pure domain calculations and normalization remain separate from persistence for future migration.

Ingestion uses sequential deadline-bound reads, at most two attempts, rate-aware cooldown and finite event/response bounds. Complete datasets are validated before atomically changing the active pointer. Failure records status and preserves the previous version. Page requests use read-only storage and never initialize a database or contact providers. Client props contain aggregates/event provenance, not raw snapshots, teams or player IDs.

Explicit retirement saves the published pointer as an archive and removes it from active browsing. Original windows and actual coverage remain frozen; archives never enter rolling aggregation. The initial collector only supports M-C. Automatic transitions and subsequent datasets are deferred.

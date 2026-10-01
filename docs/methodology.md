# Methodology and architecture

Monstats measures registered teams and observed match results, not individual Pokémon combat or causal counter strength.

Ladder uses separate aggregate contracts: monthly rating-weighted Showdown usage and captured in-game Champions ranks/build marginals. Ladder facts never enter tournament registration or outcome calculations. See the [ladder methodology and source report](ladder-coverage.md) for denominators, available periods, exclusions and reproduction.

## Collection and identity

Limitless discovery exhausts paginated API listings and verified completed-list pagination. Exact IDs must match completion evidence; future starts are rejected. Public standard cartridge M-C events with submitted lists are required; custom bans/rules are excluded. A request budget pauses/resumes collection rather than implying complete coverage. Repeated pages, changed schemas and failed reads stop publication. Public-listing exhaustion does not prove worldwide coverage or a simultaneous upstream snapshot.

Victory Road discovery follows public 2027 circuit result links. Organizer articles establish game, M-C regulation, attendance and sheets; circuit pages establish a matching UTC start and original Battlefy event ID. Roster size must match attendance. A reciprocal decisive final establishes completion. Eligible histories must agree on round, opponent, result and reversed BO3 score. Partial teams and unsupported/ambiguous records retain evidence. Registered species/items use the shared normalizer; absent set fields remain null.

Every provider requires 20 evidenced entrants; 100+ is large. Official thresholds use Masters attendance only. Unknown or contradictory divisions/counts are excluded. Original identity and participant namespace are separate from provider labels. Identical copies with a verified original key/division count once. Supplemental records can fill missing teams or results through compatible stable identities; conflicting joins are quarantined. Suspected same-name/date mirrors without a verified join are held out. Selective top-team samples, Showdown observations and ladder populations cannot enter whole-event usage.

Official coverage uses the audited pokedata mirror and explicit event metadata, preserving original RK9 links. Direct automated RK9 extraction is disabled under its terms. Complete Masters rosters can contribute partial resolved-team coverage. Reciprocal round histories establish one physical result per round; exact BO length and game scores remain unknown where absent. Unique original team-list keys establish participant identities, with source indexes retained separately. See the [official audit report](official-coverage.md) for division evidence, ledgers, traces and remaining limits.

Source dates are scheduled event start times, not individual match or completion times. Retrieval times belong to separate observations. Unmodified API responses and completed-list HTML are preserved with SHA-256 checksums. These reads require no API key according to [Limitless documentation](https://docs.limitlesstcg.com/developer).

Explicit organizer statements classify open/closed sheets; absent or conflicting evidence stays unknown. Public submission alone is not OTS evidence. Source and sheet controls default to All. All sheets includes open, closed and unknown evidence; OTS/CTS select explicitly classified events. Unknown remains preserved internally.

Runtime schemas validate payloads. @pkmn/dex and centralized aliases resolve canonical identities. Conflicting IDs/names or unresolved species quarantine the whole team rather than silently dropping one slot. Mega stones derive forms separately from original species; this is a registered option, not observed transformation. Slots preserve original names/IDs, items, abilities, moves, natures and available stats. Snapshots preserve all other source fields. Missing data stays null.

Physical match identity uses event, phase, round and bracket label or unordered participants. Duplicated ingestion does not add outcomes; different rounds retain rematches. Conflicting duplicate results are quarantined. Corrected event facts enter a new complete publication. Drops do not erase prior legitimate outcomes.

Nondecisive, malformed, unknown, ambiguous, missing-opponent, identifiable administrative and unsupported results are excluded. An absent opponent may represent a bye or automatic loss; neither contributes. The API cannot identify all unmarked administrative wins, which remains a material limitation.

## Counts and baselines

Usage divides registrations containing an identity by all complete resolved registrations in the selected cohort. It does not weight by rounds or standings. Match calculations require both complete resolved teams and a decisive competitive result.

Derive two team perspectives from each physical match. A row's numerator counts winning perspectives whose team registers that identity; its denominator counts eligible perspectives containing it. Its match count counts distinct physical series. A mirror adds one win, one loss and one physical match.

For a row Pokémon into a selected Pokémon, retain a perspective if its team contains the row identity and the opponent contains the selected identity. Both perspectives can qualify when teams overlap; the rate denominator can therefore exceed the displayed physical match count. This is intentional. Self identities are excluded from rankings.

Overall baselines use the identical both-teams-known decisive cohort and regulation/Official/provider/sheet/size/date rules. Provider controls select record suppliers; supporting metadata is preserved separately. Independent provider selections pool compatible deduplicated event counts, never averaged percentages or arbitrary weights. Selecting no providers gives an empty cohort. Filter edits, including Reset, stay pending until Apply Filter; a failed read retains saved results and allows reapplying. New provider combinations are read from the same immutable local publication without collection or pointer changes. Large events are a subset of All. Only display formatting rounds rates. Zero, null and signed differences remain distinct.

Change vs overall is matchup win rate minus the performer's comparable overall rate, in percentage points. A 50% overall rate and 55% matchup rate gives +5 points; it is not a 5% relative improvement. The expandable value shows both rates and the evidence counts. Best performers default to descending change; worst default to ascending change. Win rate is an alternative sort using the same evidence floor and cohort. Ranking describes observations, not causal counter strength.

Build summaries count registrations with the Pokémon and each field known. Missing fields remain absent from that field's denominator and retain coverage counts. Versioned set-label identities use the shared Dex names for items, abilities, moves and natures, matching casing and spacing variants. Unknown labels match only by casing/whitespace and remain unverified; raw slot fields stay unchanged. A move counts once per registered slot after identity matching; several moves can occur in one slot, so move shares need not sum to 100%. Recorded stats remain recorded stats, never inferred EVs or spreads. These summaries do not describe moves actually used in matches.

Teammates counts complete registrations containing both the selected Pokémon and each other canonical identity. Its denominator is all complete registrations containing the selected Pokémon in the same applied cohort; missing teams are excluded, the selected identity is omitted and each teammate counts once per registration. Rows sort by descending share and open that teammate's detail in the same cohort. Shares need not sum to 100%, since a team registers multiple teammates. This is registration co-occurrence, not pair-conditioned matchup performance or a causal explanation of outcomes. Performer headings explicitly refer to opposing Pokémon teams. All available detail cards start expanded, with Abilities last.

The configurable floor requires 20 matches, two events and five distinct row-side players. It suppresses isolated teams/event-specific rows and applies to both ranking sorts. It is provisional, not a confidence guarantee. Event/player/perspective counts are available in each row's comparison details. Best/worst lists can overlap when few rows qualify.

## Local architecture

```text
Owner CLI/local worker → snapshots → normalized facts + quarantine → validated aggregates
          → SQLite transaction → active publication pointer
Browser   → read-only published dataset → UI + local artwork
```

SQLite stores snapshots, observations, immutable publications, pointers, refresh state, resumable checkpoints, event caches and ingestion leases. Publications pack compressed fact/cohort payloads; selected cohorts decode lazily and legacy JSON remains readable. Indexed relational facts remain deferred. Each event's record ledger must reconcile before publication; malformed/conflicting raw records are distinct from excluded normalized physical series.

PostgreSQL was evaluated first; psql and Docker were unavailable locally. Node 24's built-in SQLite avoids an additional service or Python runtime for this personal draft. Pure domain calculations and normalization remain separate from persistence for future migration.

Ingestion uses sequential deadline-bound reads, at most two attempts, provider-controlled cooldown and finite request/response bounds. Daily is the worker default; hourly discovery is configurable. Valid event facts are reused for 24 hours, then revisited for corrections; manual force bypasses caches. Failed or bounded runs retry no sooner than five minutes or a longer provider cooldown. Leases renew at request/publication boundaries and expire after interruption. The machine and worker must remain running; no installed scheduler/service is required.

Validated datasets atomically replace the active pointer. Failure records diagnostics and preserves surviving facts. Local rolling-window expiry can advance the publication without successful upstream collection, explicitly retaining partial/carried coverage. Discovery absence alone does not erase previously eligible events. Page/cohort requests use read-only storage, never initialize a database and never contact providers. Browser props carry only the selected aggregate and public event provenance, not snapshots, teams, raw quarantine or player IDs. Immutable publication IDs prevent mixing versions; background local checks preserve interaction state.

Explicit retirement freezes coverage and disables that regulation's collection. Only M-C is enabled. Independently validated incoming cohorts stage without replacing active data; deliberate activation atomically freezes the outgoing publication, retires its cohort and switches the pointer. Mixed publications and empty incoming staging are rejected. Browser labels follow the displayed immutable cohort during refresh. Archives never enter rolling aggregation or silently recalculate; historical corrections require separate audit and review. See the [transition procedure](official-coverage.md#operation-and-regulation-transitions).

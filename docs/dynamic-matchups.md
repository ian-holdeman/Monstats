# Dynamic matchup calculator: agreed design

Status: completed and accepted on October 1, 2026. The calculator uses observed tournament results in the dedicated Matchups view (also available at `/matchups`). It supports one to six Pokémon per selection, direct comparison, overall performance and discovery of combinations of a chosen size. Hosting and deployment are deferred. The contract below remains the calculation and acceptance specification.

Release validation passes 81 offline tests and the complete 29-test browser suite, plus TypeScript, lint, production build and formatting checks. Saved-data review includes 403 single-Pokémon ranking parity checks and 42 direct comparisons against the independent reference across A sizes 1–6 and B sizes 0–6. Desktop and narrow browser review confirms clearing, navigation, mirrors and pagination without provider requests. Source facts, publication ID and source timestamp are preserved.

## Implementation and reproduction

New tournament publications build and validate their derived SQLite index inside the same transaction as the immutable publication and active/staged pointer. Ready metadata is written last. A failed build or pointer replacement rolls back the pair. Existing publication IDs, source timestamps and original facts remain unchanged during explicit backfill:

```powershell
npm run matchups:backfill
# A particular saved publication, or every saved version:
npm run matchups:backfill -- PUBLICATION_ID
npm run matchups:backfill -- --all
npm run matchups:benchmark
```

Backfill defaults to the current publication. It is idempotent for the same publication/calculation/index versions and does not switch pointers or collect providers. An absent index is unavailable in browsing until explicitly backfilled. Index tables retain event/filter metadata, provider membership, registered compositions, indexed canonical members and one row per eligible physical result. Derived dates are normalized to UTC instants; original source timestamps remain in the immutable publication. Current versions are `joint-perspectives-v1` and `members-results-v2`.

Queries use indexed member intersections and both result orientations. Discovery first filters into B, expands only the requested subset size from observed compositions, applies the configured floor, then batches baselines for remaining candidates. Overall discovery reuses its overall counters. It does not generate a species universe or cross-products of both teams' subsets. SQL/grouping uses two bounded read-only Node workers; subset expansion yields between composition batches. At most two calculations run concurrently, with a bounded pending queue. Server/client immutable result caches hold 32/16 responses, deduplicate in-flight requests and do not retain failures. Requests are limited to 4 KiB, six distinct members per side and 50 rows per page. The interface pages 20 rows, retains previous results and their labels during reads/failures, and rejects stale responses.

The offline reference calculator scans individual perspectives separately for every candidate and enumerates subsets by bit mask. It does not use the SQL index, production subset enumeration, counters or ranking implementation. Regression checks cover all six sizes, joint baselines, source deduplication, mirrors, exclusions, evidence boundaries, timestamps, exact-six composition, deterministic ties and atomic interruption. Existing single-Pokémon numerical metrics agree on fixtures and 403 ranked rows across three targets in saved publication `19d9614a81c3d516`; the new tie breaker is canonical key, while the older detail ranking uses display name.

Local benchmark on that publication (7,081 registrations, 21,196 eligible physical results): index backfill approximately 0.85 seconds, source-publication decoding 0.31 seconds, direct cold reads approximately 21–130 ms, common-target discovery 231–368 ms, sparse rare-target discovery 4–6 ms and overall discovery 222–336 ms across sizes 1–6. Warm cached reads were approximately 1–3 ms. The first cold query includes worker startup. Peak main heap was approximately 391 MiB and process RSS 671 MiB in the benchmark process, which also retained the decoded source publication for parity checks; these are not isolated per-query memory costs. Maximum observed main-thread timer interval was approximately 29 ms. Query plans use canonical-member covering indexes and left/right result indexes. Timings are local measurements, not guarantees. Per-query CPU, memory, plans and exact queries are saved privately under `.monstats/matchup-qa/benchmark.json`.

## Product behavior

Discover starts with a candidate combination size of one. Clicking a discovered Pokémon or group replaces selected opponent B with the complete row and stays in Discover, showing Best/Worst combinations into that opponent. Each such exploration resets candidate size to one and sorting to change versus own overall, with both result pages reset. Active filters and the manually selected Candidate A are preserved; Compare remains available for explicit interactions.

| Operation        | Inputs                                                           | Primary output and default sort                                                                                       |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Compare          | Selected combination A and selected combination B, each size 1–6 | A's win rate against B, A's overall baseline and signed percentage-point difference                                   |
| Overall          | Selected combination A, size 1–6; no opponent restriction        | A's overall win rate and record                                                                                       |
| Discover into B  | Fixed B, size 1–6; candidate size k, 1–6                         | Best/worst observed candidate combinations A, default sorted by difference from each candidate's own overall baseline |
| Discover overall | Candidate size k, 1–6; no opponent restriction                   | Best/worst observed combinations, default sorted by overall win rate                                                  |

Discovery into B also offers matchup win rate as an alternative sort. Overall mode does not show a redundant zero difference or offer difference sorting. Changing modes must select a valid sort. Conditional discovery partitions finite, unrounded changes against each candidate’s own overall baseline: Best includes changes >= 0; Worst includes changes < 0. Exact zero belongs only to Best, tiny values keep their sign, and unavailable/nonfinite changes enter neither group. Membership is independent of sorting. Best orders descending and Worst ascending by the selected metric; use more distinct physical matches first for ties, then a stable canonical combination key. Sort using unrounded values and round only for presentation.

Removing the last required member of A or selected opponent B clears the displayed result, errors and loading state. Late responses cannot restore a cleared comparison. Previous results remain visible only while a valid replacement loads or fails, with their original labels; inspection and pagination are disabled until they match the current controls. Cleared selections stay empty when switching calculation/opponent modes. Clicking the active Matchups tab preserves the current session; returning from another view starts a fresh selection, while Pokémon detail links initialize the indicated candidate or opponent.

Selections are unordered sets of distinct canonical statistical identities, using the existing identity/form rules. Reject unknown identities and invalid or oversized requests. A team qualifies when it contains every selected member. Additional teammates are unrestricted. Six members therefore identify the complete species composition, independent of slot order, items, moves, nature or spreads. Teams mean registered teams; the sources do not establish brought Pokémon or leads.

Opposing selections may share members. Exclude only the exact same combination from automatic matchup self rankings, not every combination sharing a Pokémon. Manual identical-combination comparisons remain inspectable. Overall discovery has no target and therefore no self exclusion. Rank only observed combinations; never synthesize rates for unobserved selections or average members' individual statistics.

## Cohort and eligibility

Start with an immutable tournament publication and the same supported filters as Tournaments: regulation, published time window, source selection, sheet visibility, entrant threshold and official-event restriction. Preserve current source reconciliation, physical result identity, participant namespaces, phase/series semantics and eligibility rules. Source All pools deduplicated counts; it does not average source percentages. Do not broaden cohorts, activate new regulations or refresh sources for this feature.

October 2 ingestion publications use the shared `regulation-v1` interval from the reviewed regulation beginning through cutoff, bounded by its end. Matchups, details and evidence use that identical population. Legacy saved publications keep their original interval. Measured full-regulation query/build capacity is recorded in the [operating guide](ingestion-operations.md).

Both registered teams must resolve completely and the result must be an eligible decisive competitive outcome. Preserve exclusions for byes, ties, double losses, administrative results, unknown or malformed winners, unsupported phases and ambiguous joins. Apply exclusions before constructing either conditional or baseline samples. Preserve the existing round-result/series unit; do not expand BO3 results into invented games.

Neither monthly Showdown usage nor Champions rank/build captures provide the required joint team outcomes. The calculator uses tournament evidence only. A future replay-derived cohort would require its own reviewed source contract and separation from aggregate ladder usage.

## Calculation contract

Let M be the eligible, deduplicated physical results after all cohort filters. Each result generates two oriented team perspectives: one for each side. Let P be this collection of perspectives. Each perspective p has an own team T(p), opposing team O(p), result identifier m(p), canonical event identifier e(p), namespaced own-side participant identifier u(p), and win indicator w(p), which is 1 for a win and 0 for a loss.

For selected combinations A and B:

```text
S(A)    = {p in P : A is a subset of T(p)}
Q(A, B) = {p in P : A is a subset of T(p)
                    and B is a subset of O(p)}

outcomes(X) = number of perspectives in X
wins(X)     = sum of w(p) over X
losses(X)   = outcomes(X) - wins(X)
winRate(X)  = 100 * wins(X) / outcomes(X), if outcomes(X) > 0
              null otherwise

overall(A)   = winRate(S(A))
matchup(A,B) = winRate(Q(A,B))
change(A,B)  = matchup(A,B) - overall(A), in percentage points
              null if either rate is unavailable

matches(X) = count of distinct m(p) in X
events(X)  = count of distinct e(p) in X
players(X) = count of distinct u(p) in X
```

The baseline is specific to the complete candidate combination A, using the same eligible publication and filters, with only the opponent restriction removed. It includes the observations against B. It is neither B's baseline nor an average of A's members' rates nor a comparison only against opponents without B. Team registration frequency is not the performance denominator.

Example for test fixtures only: if A wins 40 of 100 overall perspectives and 12 of 20 perspectives against B, display 40% overall, 60% matchup and +20 percentage points. The 20 against B are included in the 100 overall. A joint pair's baseline can differ from both constituent Pokémon's baselines.

A physical result can satisfy both orientations. Include each qualifying perspective once in its record, but count the physical result once for evidence. When both teams contain A and B, the result contributes one win and one loss to Q(A,B), with one distinct match. Manual A-versus-A comparisons consequently yield 50% whenever observed. A-versus-all can also include both sides of a mirror. Different candidate rows overlap; their evidence counts must not be summed into a total sample or treated as independent trials.

Zero wins with a nonempty denominator is 0%, not unavailable. A zero denominator is unavailable, never 0%. Preserve signed differences and normalize display-only negative zero. When no comparison meets the ranking floor, show insufficient evidence; when eligible comparisons exist only in the other sign group, say no qualifying positive/neutral or negative matchups. An active notice filter can separately produce no matching entries; do not silently relax filters or minimums.

## Evidence and interpretation

Apply the existing configured evidence floor, currently 20 distinct physical matches, two events and five namespaced candidate-side participant identities. For matchup discovery use Q(A,B); for overall discovery use S(A). Read/version the configuration rather than duplicating thresholds in UI code. A participant namespace identifies the source's participant, not necessarily one globally identified human.

Manual comparisons may show observed records below the floor with a clear insufficient-evidence status. Automatic best/worst rankings omit them. Expose conditional and baseline records and evidence in expandable details so their different denominators can be inspected. The floor is provisional, not a confidence guarantee. Repeated participants, overlapping cores, other teammates and tournament selection affect interpretation. Results are descriptive associations, not predictions of an isolated battle or causal advantages. Confidence modeling, skill adjustment and multiple-comparison corrections are outside this slice; do not attach unvalidated certainty labels.

## Query and publication design

Use the existing Next.js/TypeScript/SQLite stack. Build a derived, versioned query index of event/filter metadata, registered compositions and canonical members, eligible physical results, winners and participant keys. Share cohort/eligibility semantics with existing calculations; keep an independently simple reference implementation for tests. Preserve raw facts and source timestamps.

Index species-to-team membership and result joins. First restrict to the filtered cohort and target B, then enumerate observed candidate subsets of the requested size from eligible opposing teams. A complete team has 63 nonempty subsets, with counts by size of 6, 15, 20, 15, 6 and 1. Reuse subset expansion for identical compositions without collapsing their independent registrations/results. Batch candidate-specific baseline calculation. Avoid expanding all 63 × 63 cross-team subset pairs per result or all combinations in the species universe.

Choose concrete SQL/index layouts after measuring realistic query plans and memory. Reuse decoded immutable publications where helpful; do not decompress the full dataset independently for each candidate. Keep bounded response sizes/pagination and safe request validation. If synchronous heavy calculations block normal navigation, move that work off the request thread or precompute the measured bottleneck; do not add a database service merely on speculation.

Key derived artifacts by source publication and calculation/index schema versions. Response caches also include `baseline-sign-v1` ranking semantics, without rebuilding statistical indexes. For future refreshes, validate the index before exposing the corresponding ready publication. Backfill existing immutable publications with an explicit local command, preserving publication IDs and source timestamps. Never mutate frozen source publications or trigger index construction/provider reads from browser requests. On failure preserve the prior complete usable publication/index pair and its displayed provenance; never combine a new header with old results. An absent index is an explicit unavailable state until built.

Cache bounded results by publication, calculation/index versions, floor configuration, complete cohort filters, normalized selections, mode, candidate size and ranking/pagination options. Deduplicate concurrent reads. Invalidate via immutable version changes. Drop stale client responses, retain current results while replacements load and ensure the header/summary describe what is actually shown.

## Interface and verification

Use a dedicated Matchups navigation destination and entry points from existing Pokémon detail. Keep selected Pokémon visible with accessible search/add/remove controls and a six-member cap. Make the direction of each record clear: candidate A into target B. Provide overall/opponent modes and candidate size without crowding the results. Conditional discovery shows Best and Worst together in independent, keyboard-focusable bounded scroll panels, stacked on narrow screens, with approximately five collapsed entries visible. Each panel paginates independently in requests of at most 20 rows. Overall discovery keeps its existing ranking direction control without inventing sign membership. Share existing tournament filter semantics and Apply behavior. Preserve glossy primary-type colors, compact sprites, minimal chrome, MM/YY periods where applicable and active summaries below Filters. Put methodology in expandable evidence. Reuse existing local artwork/fallbacks and smooth loading patterns.

Establish failing hand-calculated regressions before implementing the engine. Prove one-versus-one numerical parity with current matchup calculations on fixtures and the saved publication; account explicitly for any existing tie-order difference. Test all six sizes, unordered selections, true joint baselines, exact six-member compositions, mirrors/overlap, deduplication, excluded outcomes, zero and missing data, floor boundaries, deterministic sorting and cohort isolation. Compare the optimized engine with the independent reference for direct, overall and discovery queries.

Test explicit backfill, repeated builds, version changes and interrupted/failed publication without corrupting the prior ready index. Browser checks cover selection/search/removal, filter application, sorting, detail entry links, keyboard navigation, narrow layouts, sparse/unavailable/failure states, stale response races and retained displayed results. Benchmark cold and warm queries for direct comparisons and discovery sizes 1–6, including common and rare targets; report timings and memory honestly, separating index build/load time from query time. Run offline tests, typecheck, lint, build and focused browser tests. Keep source audits separate and owner data distinct from fixtures.

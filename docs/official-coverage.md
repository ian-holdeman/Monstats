# Official Masters coverage — September 30, 2026

October 2 update: the [full-regulation backfill and operating guide](ingestion-operations.md) supersedes the original collection cadence and transition procedure below. Current All coverage is 79 events, 7,621 complete registrations and 22,342 eligible results. The three official populations and traces in this report remain retained facts, not a claim of fresh complete mirror observations.

Implemented and published locally for review. Existing uncommitted work was preserved. No commit, push, deployment, hosted resource, paid service or machine setting change was made.

Publication `59153f7ab2270dab`, with a window ending October 1 at 03:00 UTC (September 30 in America/Denver), contains **70 events, 7,081 complete registrations, 7,158 evidenced entrants and 21,196 eligible physical results**. Existing community coverage was carried forward; this collection revisited official sources only. It does not establish fresh community observations or worldwide coverage.

The later detail/filter review produced local version `9fe1500fd4245285` from these same saved facts, combining equivalent build labels. Every published usage row, matchup row and coverage count was checked against the preceding version and stayed unchanged. The observation time, raw evidence and frozen archives were preserved; this was not a new source collection.

The Teammates addition is local version `19d9614a81c3d516`. It derives registration co-occurrence from the same saved facts and preserves all existing build distributions, usage, matchup metrics, coverage, observation time and archives. No additional provider reads were performed.

## Integrated events

| Original official event / Masters population                       | Explicit format evidence                                                                                 | Masters entrants | Complete teams | Eligible results | Excluded normalized results | Malformed raw histories |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------: | -------------: | ---------------: | --------------------------: | ----------------------: |
| [Frankfurt Regional](https://rk9.gg/pairings/FR002-fiunEHp9wx4mh4) | [Champions, 2027, M-C, division attendance and 13 Swiss rounds](https://victoryroad.pro/2027-frankfurt/) |            1,129 |          1,126 |            4,710 |                          36 |                       2 |
| [Brisbane Regional](https://rk9.gg/pairings/BR002-IU5yO1W76UpdyA)  | [Champions, 2027, M-C, division attendance and 11 Swiss rounds](https://victoryroad.pro/2027-brisbane/)  |              327 |            325 |            1,322 |                          27 |                       0 |
| [Baltimore Regional](https://rk9.gg/pairings/BA002-JL3KVbvivVKNAc) | [Champions, 2027, M-C, division attendance and 13 Swiss rounds](https://victoryroad.pro/2027-baltimore/) |            1,081 |          1,071 |            4,276 |                          89 |                       7 |
| **Official total**                                                 | **M-C Masters only**                                                                                     |        **2,537** |      **2,522** |       **10,308** |                     **152** |                   **9** |

All three exceed the 100-Masters large threshold. The original RK9 tournament key and Masters division identify one population. [pokedata's public standings](https://pokedata.ovh/standings2/) supplies the mirrored roster, sets and indexed opponent histories. Select Frankfurt, Brisbane or Baltimore and Masters; the form uses IDs `1000070`, `1000068` and `1000034`. Original RK9 and event-report links are supporting provenance, not independent samples. Provider filtering selects record suppliers; metadata-only Victory Road references do not add these populations to the circuit filter.

Frankfurt was audited first. Its mirror has 1,129 roster records; the reported 1,173 combined attendance is not its Masters denominator. Division selection, roster division fields and independently reported Masters attendance agree. Missing teams remain unavailable although the division roster is complete. Unique original team-list keys establish stable registration identities; mirror indexes remain separate. No cross-division or cross-provider name matching is performed.

The mirror publishes one opponent/result/table entry per round. Reciprocal entries must agree. Swiss and top cut preserve phase identities and rematches. A single decisive final agrees with the published champion, corroborating completion without deriving outcomes from standings. **Individual game scores and BO length are not exposed**: the adapter records evidenced physical round results in the pooled BO1/BO3 cohort, keeping exact BO length unknown. It does not recover individual games or infer 2–0/2–1 scores.

## Reconciliation and gaps

- Frankfurt: three unresolved/missing team joins; 11 byes/automatic results, 24 results without both complete teams, one double loss and two malformed histories.
- Brisbane: two unavailable registrations (one partial team and one unresolved roster/team join); 11 byes/automatic results and 16 results without both complete teams.
- Baltimore: ten unavailable registrations (one incomplete team and nine unresolved roster/team joins); 12 byes/automatic results, 73 results without both complete teams, four double losses and seven malformed histories.

Accounting is exact: Frankfurt's 9,483 raw histories = 4,710 eligible + 36 excluded + 4,735 reciprocal duplicate records + 2 malformed. Brisbane's 2,687 = 1,322 + 27 + 1,338. Baltimore's 8,725 = 4,276 + 89 + 4,353 + 7. Excluded physical results and malformed raw records are different quantities. Original evidence stays in ignored snapshots and quarantine. Fifteen unavailable registrations are excluded from usage/build denominators; their opponents' results are also excluded from comparable rates.

Joins require the same original event, a unique team-list key, matching source roster metadata and Masters evidence. Missing or conflicting fields are not guessed. Available species, form code, item, nature, ability, moves and slot order are retained through the central versioned normalizer. Unknown fields and legality remain unverified. Unmarked administrative awards cannot be distinguished from competitive-looking wins; this remains a material limitation.

The original listing observed three eligible completed Regionals and a Recife lead without an audited contract. October 2 discovery also finds Louisville, whose final attendance/completion contract is unverified. Fresh Brisbane/Frankfurt responses lack the formerly explicit final marker; validated saved facts remain with actionable exclusions. Neither public listings nor the season calendar proves global coverage.

The adapter now discovers Regionals, Special Events, Internationals and Worlds for the configured championship season without per-event ID mappings. It resolves an article through the actual season-calendar link and verifies the exact event name, game, regulation, Masters attendance and numeric phase contract. Original RK9 identity must agree across unique roster team-list namespaces and independent article links; direct mirror links, when present, must match. JSON payloads are parsed without executing provider JavaScript. The later runtime spread reassignment in the mirror is ignored; ambiguous literal payloads are rejected.

New compatible events enter automatically when those contracts establish completion, full division roster and reciprocal results. No additional compatible M-C Special/International/Worlds result feed was established. The [2026 Worlds metadata](https://victoryroad.pro/2026-worlds/) describes M-B and a phase structure unsupported by the current numeric phase parser; no M-C Worlds population is fabricated. Contract gaps stay explicit rather than silently omitting a class.

## Source traces

Official Rillaboom into Incineroar reconciles **2,896 physical results / 3,293 perspectives**, 48.4361% observed wins, a 50.4872% matching overall baseline, **−2.0512 percentage points**. Garchomp into Sneasler reconciles **740 results / 741 perspectives**, 51.9568%, a 52.3810% baseline and **−0.4241 points**. The pokedata provider gives identical counts to Official All in this publication.

For a concrete Frankfurt trace, the final is Masters round 17, table 2. Mirror row 1025 records opponent 519/result 3; row 519 records opponent 1025/result 0. Both original team-list keys resolve. Rillaboom on the winning registration against Incineroar on the opposing registration supplies one winning perspective and one physical result. The [original pairing page](https://rk9.gg/pairings/FR002-fiunEHp9wx4mh4) and preserved mirror snapshot expose the evidence; no game score is inferred.

```powershell
npm run trace -- incineroar rillaboom --official
npm run trace -- sneasler garchomp --official
npm run trace -- incineroar rillaboom --source=pokedata
```

These commands verify the full cohort and write private traces with physical identities, round, registration keys and snapshot references.

## Access and follow-ups

| Source                                               | Disposition                                                                                                                                                                                               | Concrete follow-up                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [RK9 terms](https://rk9.gg/terms)                    | Section 5.3 prohibits automated extraction, including noncommercial scraping. Rechecked October 2; no direct RK9 collector is enabled.                                                                    | Obtain an authorized structured export/API before enabling direct ingestion. Preserve original links meanwhile.      |
| [pokedata](https://pokedata.ovh/)                    | Public mirror through its published read-only form. Public availability does not establish redistribution permission for underlying records. No authentication/restriction bypass or copied code is used. | Confirm production access/reuse requirements, retain automatic identity checks, and seek administrative/BO metadata. |
| [Victory Road](https://victoryroad.pro/2027-season/) | Supplemental explicit event metadata. Top-team tables are not ingested as event-wide teams or outcomes.                                                                                                   | Audit new Special/International datasets when compatible result mirrors become available.                            |
| [LabMaus](https://labmaus.net/home)                  | Prior retrieval failed; no additional compatible contract established.                                                                                                                                    | Verify public exports, permissions, original IDs and full population coverage before ingestion.                      |
| Recife / future formats                              | Discovered lead retained with an unaudited-contract exclusion. M-D has no enabled verified contract.                                                                                                      | Audit independently and use the deliberate transition procedure.                                                     |

## Operation and regulation transitions

Compiled `npm run ingest` and the daily worker include official Masters mirrors alongside Limitless and Victory Road. `--official-only` carries forward compatible community facts. `npm run audit:official` uses a separate ignored report/store. Browsing never collects data. Recent events are checked daily, settled active events weekly; durable work resumes after budgets/interruption. Keys include provider/event, division, regulation and normalizer version. Failures retain facts and disclose stale observations.

Only M-C is enabled in `config/regulations.json`. Championship season, ranked season and regulation remain distinct. A future transition requires advance configuration review:

1. Audit the incoming regulation, environment and source contracts. Record explicit evidence, add reviewed mappings/adapters as necessary and deliberately enable the cohort. Confirm offline/live audits first. Configuration alone does not establish an event's format.
2. Configure reviewed UTC start/end boundaries, environment and source mappings. Rebuild and restart the same release for app/workers. Optional independent staging supports advance validation; no manual approval is needed at each due transition.
3. The worker automatically activates the reviewed incoming cohort, including empty coverage, and atomically places the outgoing publication in Archive. At end plus seven days, exactly one bounded final job may atomically update that archive; failure/missed finalization preserves its last version and stops permanently.
4. Scoped saved state and immutable publication IDs keep outgoing/incoming facts separate. Browser headers follow displayed data through delayed reads and retain matching interaction state.

Archives retain their original publication contract and cannot be reactivated. Only the authorized final job can update a retired archive, inside its bounded opportunity. Historical archives receive no silent migration or later automatic correction. Backup/restore and production commands are documented in the [operating guide](ingestion-operations.md).

The original slice passed 54 offline tests and seven focused browser checks. October 2 verification expands interval, lifecycle, recovery, provider, production and browser coverage; current results are recorded in the operating guide. Live source audits remain separate from offline fixtures.

Validation commands are in the README. Local review is not deployment or a claim of production readiness.

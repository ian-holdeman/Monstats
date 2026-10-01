# Official Masters coverage — September 30, 2026

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

The public mirror listing observed three eligible completed Regionals and a Recife lead without an audited contract. It was exhausted, but neither it nor the supplementary season calendar proves global coverage. No eligible Special Event or International Championship dataset was established. New IDs remain held out until metadata, identity, division, roster, completion and phase contracts are audited; they are not assigned M-C by date.

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

| Source                                               | Disposition                                                                                                                                                                                                             | Concrete follow-up                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [RK9 terms](https://rk9.gg/terms)                    | Section 7 prohibits automated extraction, including noncommercial scraping. No direct RK9 collector is enabled; older discovery audits now skip record pages.                                                           | Obtain an authorized structured export/API before enabling direct ingestion. Preserve original links meanwhile.            |
| [pokedata](https://pokedata.ovh/)                    | Integrated public mirror through its published read-only form. No robots file or restriction notice was found in audited entry points. No authentication or restriction bypass is used. No third-party code was copied. | Re-audit access notices/schema changes; review every new original event mapping and seek administrative flags/BO metadata. |
| [Victory Road](https://victoryroad.pro/2027-season/) | Supplemental explicit event metadata. Top-team tables are not ingested as event-wide teams or outcomes.                                                                                                                 | Audit new Special/International datasets when compatible result mirrors become available.                                  |
| [LabMaus](https://labmaus.net/home)                  | Prior retrieval failed; no additional compatible contract established.                                                                                                                                                  | Verify public exports, permissions, original IDs and full population coverage before ingestion.                            |
| Recife / future formats                              | Discovered lead retained with an unaudited-contract exclusion. M-D has no enabled verified contract.                                                                                                                    | Audit independently and use the deliberate transition procedure.                                                           |

## Operation and regulation transitions

`npm run ingest` and the daily worker include official Masters mirrors alongside Limitless and Victory Road. `npm run ingest -- --official-only` updates official data and carries forward surviving community facts. `npm run audit:official` uses a separate ignored database/report without publishing to the app. Browsing never collects data. Optional hourly cadence, bounded responses/requests, deadlines, retries and the ingestion lease remain. Events are revisited after 24 hours or on `--force`; bounded forced runs resume after durable completed-event progress. Official keys include provider/event, division, regulation and normalizer version. Failure retains prior coverage and schedules retries; listing disappearance does not delete facts. Local rolling expiry is independent.

Only M-C is enabled in `config/regulations.json`. Season and regulation are distinct. No date-based inference or invented M-D rules are configured. A future transition requires:

1. Audit the incoming regulation, environment and source contracts. Record explicit evidence, add reviewed mappings/adapters as necessary and deliberately enable the cohort. Confirm offline/live audits first. Configuration alone does not establish an event's format.
2. Collect independently with `npm run ingest -- --regulation M-X --stage`. Review the staged ID, coverage, traces and quarantine. Active data remains unchanged; empty or failed incoming collection retains outgoing coverage.
3. Activate the reviewed version with `npm run regulation:activate -- M-X publication-id`. One transaction freezes outgoing coverage, retires its worker cohort and changes the active pointer. Failure rolls back all changes. Mixed-regulation publications are rejected.
4. The worker follows the active identity and scoped progress. Browser cohorts use immutable publication IDs; the header takes its regulation from the same displayed publication. Delayed/failed reads retain matching saved data and label. Search, sorting, filters and detail state survive refresh.

Archive retains its original window, metrics, version and coverage. Rolling expiry never recalculates it. Automatic replacement/reactivation is blocked. A historical correction requires a separate evidence audit, a candidate built in an isolated store, documented old/new coverage and metrics, and explicit owner review before pointer replacement. This slice has no automatic historical rewrite command.

Validation: all 54 offline tests pass, including provider failure retention, physical-result joins and atomic regulation transitions. Seven focused browser checks pass, covering keyboard navigation, search/sorting, filters, unavailable/empty/failure states, refresh state preservation and a delayed regulation switch. Typecheck, lint, the production build and formatting checks pass. Desktop (1440px) and narrow (390px) production layouts were inspected, including Official controls, details and the honest empty state; the preview recorded no page errors or horizontal overflow. Live source audits and representative traces were run separately from fixtures.

Validation commands are in the README. Local review is not deployment or a claim of production readiness.

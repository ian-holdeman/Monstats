# Ladder source contract and coverage — October 1, 2026

Monstats stores separate Showdown Champions VGC and cartridge Champions Doubles publications. Neither population enters tournament aggregation, and there is no pooled ladder environment. This is local data and local ingestion.

## Showdown

Direct HTTP reads verified [August](https://www.smogon.com/stats/2026-08/) and [September](https://www.smogon.com/stats/2026-09/) listings. September became accessible through direct reads even though an earlier browsing-tool read returned 404. Publication uses actual listed filenames, not inferred month/regulation mappings.

| Month          | Regulation | Formats  | Rating reports      | Pokémon rows per report |
| -------------- | ---------- | -------- | ------------------- | ----------------------- |
| August 2026    | M-B        | BO1, BO3 | 0, 1500, 1630, 1760 | 310                     |
| September 2026 | M-B        | BO1      | 0, 1500, 1630, 1760 | 310                     |
| September 2026 | M-B        | BO3      | 0, 1500, 1630, 1760 | 307                     |
| September 2026 | M-C        | BO1, BO3 | 0, 1500, 1630, 1760 | 341                     |

The 24 validated cohorts preserve monthly usage tables and structured `chaos` set reports. They remain separate by environment, regulation, format ID, month and rating cutoff. Defaults select M-C, the latest saved month, BO1 and 1630 weighting. Rating settings are overlapping weighting reports, not disjoint populations to sum. The [primary format definitions](https://github.com/smogon/pokemon-showdown/blob/master/config/formats.ts) establish Doubles and forced best-of-three for the `bo3` IDs. The ordinary format allows optional best-of play; its UI BO1 label identifies the ordinary ladder, not proof that every recorded battle is an independent series.

Usage is the source's published weighted team-appearance percentage. Raw usage appearances, real appearances and raw set-observation counts are separate fields. They are not unique players or tournament registrations. For example, September M-C BO1/1630 Rillaboom has 45.95769% published usage, 1,261,126 raw usage appearances, 641,413 real appearances and 1,410,840 raw set observations. The report contains 1,631,943 source battles. Its BO3 counterpart still labels the denominator “battles”; a series denominator is not established by these reports.

Build weights use the Pokémon's sum of ability weights as denominator, matching the [primary statistics display definitions](https://github.com/pkmn/stats/blob/main/stats/src/display.ts). Moves and teammates overlap. A spread keeps its source nature and six-stat ordering; the nature marginal sums the explicitly named nature's spread weights against the same denominator. Independent fields are never reconstructed into joint sets. Empty move slots are omitted from adoption displays: Ditto's three empty slots can total 300%, and that is slot multiplicity rather than adoption of a move. Original values remain in snapshots. Numeric roundoff near exactly 100% is corrected only within 1e-9 percentage points.

Detailed reports omit some low-usage identities that still occur in the usage table. Those usage rows remain present with unavailable set counts/build fields, rather than becoming zeros or being dropped. Signed and zero values retain their meanings; rounding occurs only for display.

## Champions

[MunchStats](https://www.munchstats.com/about/) describes its own nightly capture of in-game Battle Data. Its public page links and browser data response establish the Doubles endpoint `/api/championsdoubles/0/{name}`. The observed capture is **September 30, 2026 at 12:00 UTC**. The source's `selected_month` is unrelated Showdown navigation metadata and is not used as a cartridge reporting period.

The [official M-6 notice](https://champions-news.pokemon-home.com/en/page/822.html) explicitly states M-C and September 9, 02:00 UTC through October 7, 01:59 UTC. The [official regulation notice](https://champions-news.pokemon-home.com/en/page/816.html) independently describes M-C. These establish the reviewed season/capture contract. Future seasons fail closed until their contract is reviewed; capture dates alone do not create a new regulation mapping.

The ranking response lists 259 entries with ranks reaching 262; gaps remain gaps. All 259 detail responses were captured and validated against matching capture/list metadata. **258 resolvable Pokémon and all 258 detail records are published**. The ranking label `Fenann` and Audino's malformed teammate label `Slowboo)~=Ctié@R,` are excluded with original evidence retained. No guessed replacements are assigned; Audino's other fields remain available. An additional source read after the sweep confirmed the same capture and ranking list.

Pokémon usage and teammate values are **ranks**. Moves, items, abilities, natures and stat-point spreads are independent published percentages, often limited to leading values. Percentages such as 0.0 remain zero. Sample counts, ranked-tier population and the underlying Battle Data aggregation window are unknown. No team counts, usage percentage or performance is inferred from ranks. Base/form identities follow the published ranking; item percentages do not establish Mega-form usage.

Available daily usage-rank histories are preserved as source observations, not interpolated. Selection is by saved season/capture. Freshness uses the source capture timestamp, independently of local publication time; a capture over two days old gets a notice.

The [MunchStats robots policy](https://www.munchstats.com/robots.txt) requests ten-second crawl spacing and excludes historical `?month=` reads. The collector spaces requests accordingly and uses direct Smogon files for Showdown history. No third-party application code is incorporated.

## Historical cartridge and performance audit

Pikalytics documents a public [M-B S3 export](https://pikalytics.com/ai/pokedex/battledataregmbs3), but its observed response mixes a cartridge format title with “Pokemon Scarlet Violet,” May 2026, tournament teams and a recent tournament sampling description. A [Kingambit response](https://pikalytics.com/ai/pokedex/battledataregmbs3/Kingambit) includes a tournament-style record while usage is N/A. This does not establish a coherent historical cartridge population. It is held out; historical M-B is populated through verified Showdown reports. MunchStats' current cartridge endpoint offers no audited prior M-B capture export.

The additional win-rate investigation resolved the apparent ladder claim. Pikalytics' [Kingambit ranked-data FAQ](https://pikalytics.com/pokedex/battledataregmbs3/Kingambit) explicitly says “Winrates are aggregated from Limitless tours over the past 4 weeks.” Its [Sinistcha page](https://pikalytics.com/pokedex/battledataregmbs3/Sinistcha) gives the same attribution. Direct reads at 20:00 UTC on October 1 returned **49.739%, 9,141 wins, 9,237 losses and 17 ties** for Kingambit in both the ranked-data export and the [tournament export](https://pikalytics.com/ai/pokedex/championstournaments/Kingambit). The identical records corroborate the documented tournament attribution; they do not establish cartridge ladder outcomes. No separate cartridge results feed was found. The responses, hashes and attribution excerpts are saved under `.monstats/ladder-audit/winrate-*` for later investigation.

Neither integrated source supplies decisive team outcomes. Smogon checks/counters describe Pokémon encounters and cannot be relabeled team matchup win rates. Ladder performance controls are therefore omitted.

A bounded audit found two public M-C ordinary-ladder replays ([2691201975](https://replay.pokemonshowdown.com/gen9championsvgc2026regmc-2691201975), [2691201084](https://replay.pokemonshowdown.com/gen9championsvgc2026regmc-2691201084)) with six-species previews and a game winner, but no `showteam` payload. Both preview teams list six while their battle teams have four. Two BO3 Game 1 replays ([2691211950](https://replay.pokemonshowdown.com/gen9championsvgc2026regmcbo3-2691211950), [2691208534](https://replay.pokemonshowdown.com/gen9championsvgc2026regmcbo3-2691208534)) include both packed `showteam` payloads, a winner and a shared `game-bestof3` room ID. The latter supplies a next-game link; its [Game 2](https://replay.pokemonshowdown.com/gen9championsvgc2026regmcbo3-2691210689) is publicly retrievable. The series-room JSON request returned 404. Upload time, observed rating and privacy fields do not prove the full ladder sampling population.

This establishes a concrete next slice: a separate public-replay performance cohort, with complete series recovery before BO3 series metrics. It must normalize both full teams, distinguish registered options from transformations/selected four, validate player identities and terminal results, deduplicate games/series, quarantine incomplete or ambiguous series, and document public-upload selection bias. It must use its own period/rating evidence and cannot claim to be the Smogon monthly population or cartridge ladder. Exact saved IDs and source bodies remain in `.monstats/ladder-audit/`.

## Storage and reproduction

Raw reads are checksum-addressed snapshots in the existing local SQLite database. Immutable compressed ladder versions, independent cohort pointers and compact metadata are separate from tournament versions/pointers. Source batches validate before an atomic pointer transaction. Errors retain previous publications, with failure status scoped to the relevant environment. Captures retain their own keys/history. Browsing reads compact usage rows, then a Pokémon's details from the same immutable publication, entirely locally.

The source buttons live inside Filters. Showdown offers BO1/BO3 and All ratings / 1500+ / 1630+ / 1760+; Champions supplies BO1 with no rating selector. The inclusive labels identify Smogon's rating-cutoff reports, whose underlying weighting is retained; they do not re-filter individual battles. Apply commits the selected source and options, and the header follows the displayed publication. Reporting periods display MM/YY. Champions omits the duplicate corner rank. Explicit nature/spread pairs use green for raised and red for lowered stats, while unpaired Champions spreads stay neutral. Repeated distribution captions are omitted from cards.

Server reads keep the two most recent immutable publications decoded. The browser keeps eight usage reports and 24 Pokémon details, deduplicates in-flight detail requests, and warms nearby, hovered or keyboard-focused Pokémon. A cold detail read retains the current view until the new detail is ready; failure offers a retry. Cache keys include publication identity, so different populations never share metrics.

After building compiled workers, run `npm run ingest:ladder`, or select `--environment showdown --months 2026-08,2026-09` / `--environment champions`. Reviewed mappings and season contracts live in `config/ladder-sources.json`. Showdown discovers every missing supported period after downtime and rechecks the latest month; settled saved cohorts remain separate. Unknown cartridge season rollover fails closed. Archived reporting periods are labeled without carrying the old capture as fresh incoming data.

The optional Ladder worker checks daily, shares the tournament ingestion lease and verifies ownership through atomic publication. Jobs have a 45-minute deadline, graceful shutdown, persisted provider cooldowns and capture-safe resumable detail reads. Failure retries respect both five-minute spacing and longer `Retry-After`. No machine scheduler or hosted resource is created. Artwork failure remains independent. See [installation, health and recovery](ingestion-operations.md).

Offline regressions cover metric contracts, identity errors, quarantined labels, omitted details, empty-slot multiplicity, cohort isolation, atomic rollback, source failure, missing-period catch-up and persisted cooldowns. Browser checks cover Apply/Reset, all ladder dimensions, search/sorting, keyboard details/teammates, local endpoint boundaries, unavailable/failed reads and desktop/narrow layouts. The October 2 tournament backfill is separate and does not alter Ladder denominators.

Final validation: 70 offline tests and eight focused browser checks passed, along with typecheck, lint, production build, formatting and whitespace checks. Real-data desktop and narrow previews showed 341 Pokémon in September M-C BO1/1630 and 258 in Champions, with no browser errors, overflow or upstream browsing requests. Eleven exact artwork variants remain unavailable and use neutral placeholders.

The subsequent interface follow-up passes 72 offline tests and all 19 browser checks, including delayed-read content retention, cached repeat navigation, source controls inside Filters, header accuracy, type colors, nature effects and Champions-only corner-rank removal. Typecheck, lint, build, formatting and desktop/narrow visual review also pass.

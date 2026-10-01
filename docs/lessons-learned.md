# Initial draft lessons

The owner accepted the initial draft on September 30, 2026. This slice established tournament usage and matchup browsing with real, bounded source coverage and durable local publications.

## Design

- Transfer principles from reference products, not their visual identity. Monstats needs a vibrant game aesthetic while retaining clear hierarchy, restraint and careful engineering.
- Treat the owner's sketches as layout requirements. Full-width glossy rows, oversized faded Pokémon imagery, bold names and metrics, and corner ranks define this interface.
- Give data the page. Large matchup rows and an image-only navigation rail work better than compact panels, captions and feature placeholders.
- Minimalism still needs readable text. Site navigation and table headings need sufficient size and contrast. Put source details and methodology behind an explicit disclosure, with a concise partial-coverage label in the main view.
- Preserve the monochrome Poké Ball brand. Decorative row colors must not imply statistical meaning.

## Data and architecture

- Audit a small live sample before broad collection. Completed-event listings can include future start dates; validate eligibility independently.
- Preserve unknown sheet visibility. The approved data slice adds All as an explicit union; absence of an organizer statement remains distinct from closed sheets.
- Distinguish physical series, team perspectives and registrations. Mirrors and overlapping matchup rows require different denominators and counts.
- Preserve raw identities and held items separately from derived forms. Canonical metadata and artwork filename conventions need explicit mappings; missing artwork is not a missing statistical identity.
- Preserve source snapshots and publish atomically. Browsing should remain local and usable when collection fails.
- SQLite fits this local draft. Keep calculations independent of storage so a later migration does not rewrite statistical rules.
- A successful bounded audit does not establish exhaustive coverage or resolve upstream administrative-result limitations.

## Verification

- Returning keyboard focus requires finding the remounted row button, rather than retaining a detached element reference.
- Position hidden table captions relative to their scroll container to avoid page overflow at narrow widths.
- Use semantic control locators in browser tests. A nested select's accessible name can differ from its label's complete text content.
- Separate deterministic browser fixtures from the owner's database and verify both client and server browsing make no upstream requests.
- Inspect rendered desktop and narrow layouts after behavior checks. Passing interaction tests alone does not establish visual quality.

At slice completion, 13 offline domain/storage tests and four browser tests passed. Type checking, lint, formatting and the production build passed. Local preview captures reported no page errors or document overflow. Four artwork variants remain unavailable; broader source coverage, ladder data and set summaries remain future work.

## Expanded data slice

- Exhausting discovery pages and reconciling all raw records are different checks; neither establishes a worldwide census.
- Provider identity is not original event identity. Mirrors need verified keys and compatible participant joins before pooling.
- Reciprocal public round histories can recover physical series, but disagreements must stay excluded with evidence.
- Aggregate rank/build pages are useful discovery leads; rank is not usage percentage, and marginal fields cannot supply head-to-head results.
- Broader coverage made sending every cached cohort to the browser impractical. Serve one immutable cohort and decode compressed publications on demand.
- Automated collection must respect explicit retirement and expiry while preserving valid results during failures.

## Official coverage and transitions

- Audit access conditions before broad collection. Public record pages can still prohibit automated extraction; original links and an accessible mirror serve different roles.
- Combined attendance is not a division denominator. Complete rosters with missing teams differ from selective top-team samples.
- Use original team-list identities for participants and retain mirror indexes separately; corrections can change presentation indexes.
- Per-round results establish physical outcomes without establishing individual game scores or exact BO length. Preserve that distinction.
- Regulation belongs in publication, cache, checkpoint, worker and browser identities. Stage independently and switch active/archive pointers in one transaction.
- Test delayed cohort reads during activation. The displayed label must follow the data currently on screen, including when a replacement fails.

## Detail browsing and slice closeout

- Keep draft filters separate from the displayed cohort. Apply commits the selection; Reset edits the draft, and a failed read preserves the saved results while allowing a retry.
- Rank best/worst performers by their change from the comparable baseline by default. Offer win-rate sorting and explain percentage-point differences beside the underlying rates.
- Say teams containing a Pokémon when describing registration-based performance. Teammate shares provide context without implying individual Pokémon matchups or causal effects.
- Canonicalize set labels before grouping or deduplicating moves. Preserve the original slot fields so presentation cleanup never destroys source evidence.
- Use compact sprite tables for detail comparisons while keeping the main usage view's visual identity. Let dense lists scroll, reserve room beside percentages and keep scroll regions keyboard accessible.
- Match the heights of primary detail cards, order small categories last and inspect both desktop and narrow layouts after changes.
- Close a slice with an accurate handoff, verified commit and stopped local servers. Retain ignored databases, source snapshots, artwork and QA evidence for reproducible follow-up work.

At this closeout, 58 offline tests, all 10 browser tests, type checking, lint, the production build and formatting checks pass. Browser fixtures remain separate from the owner's saved data. Accepted UI changes do not constitute new observations or refresh the publication's source timestamp.

## Ladder integration

- Diagnose direct permitted HTTP reads before interpreting a browsing-tool error as missing monthly coverage. Import only formats actually listed by the source.
- Calendar reports, ranked seasons, source captures and aggregation windows are different facts. Preserve each independently; unknown population counts stay unknown.
- Rankings and build percentages need different display contracts. Raw usage appearances, real appearances and set observations also have distinct meanings.
- A full detail sweep can expose malformed fields absent from a small audit. Quarantine unresolved labels with original evidence and retain the independently valid fields.
- Validate the capture and complete rank list across every detail response, then recheck them before publication. Respect source pacing and resume through saved snapshots.
- Keep metadata catalogs small, serve usage rows separately and fetch details from the same immutable version. Decompressing every cohort for a page request is unnecessary.
- Empty move slots can exceed 100% through multiplicity. Their source weights are evidence, but they are not move adoption percentages.
- Public BO3 replays can expose full teams and next-game links without a retrievable series-room record. Recover and validate the series before computing series performance, and keep replay populations separate from monthly usage.

## Interface rules for future slices

- Keep the glossy, vibrant Pokémon rows and minimal chrome. Use canonical primary typing for row colors consistently across Tournament, Ladder and Archive; colors do not imply performance.
- Put data-source buttons at the top of Filters and show only controls supported by that source. Apply commits source and filter edits together. Headers and summaries must describe the displayed data, including after failed reads.
- Use MM/YY for reporting periods, inclusive rating labels such as 1500+, and All ratings for the zero-cutoff report. Keep precise dates and statistical definitions in provenance.
- Place active filters below the Filter control. Remove repeated technical captions from cards and avoid displaying the same ranking twice.
- Preserve context during navigation. Cache immutable results with bounded memory, deduplicate requests, warm likely destinations and use restrained progress feedback instead of replacing content with loading panels.
- Show nature effects through the affected spread numbers, with accessible explanations. Never infer a joint nature/spread from independently published marginals.

## MVP closeout

The owner accepted the local MVP on October 1, 2026. Final validation covers 72 offline tests and 19 browser checks, plus typecheck, lint, production build, formatting and desktop/narrow visual review. The next proposed delivery slice is hosting; deployment must account for durable SQLite publications, artwork, independent collection, backups and restart persistence. Preserve source evidence and private handoffs locally, and document exactly what a clean clone needs to reproduce populated browsing.

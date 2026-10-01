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
- Keep unknown sheet visibility separate. Absence of an organizer statement is not evidence of closed sheets.
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

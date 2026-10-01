# Monstats

A local, dark-first Pokémon Champions analytics application. Browse tournament registration usage, then inspect observed performance of teams containing each Pokémon against teams containing another.

The initial draft and expanded data/formatting slice are accepted. Official Masters coverage and safe regulation transitions are implemented locally: see the [official coverage and transition report](docs/official-coverage.md), [earlier coverage report](docs/data-slice.md), and [lessons learned](docs/lessons-learned.md).

The glossy usage rows and monochrome Poké Ball brand remain; detail pages use compact tables with small sprites. Source/sheet filters default to All. Sources toggle independently, so RK9's pokedata mirror and Limitless can be selected together without Victory Road. Filter edits and Reset wait for Apply Filter. Events require 20+ entrants and large means 100+. Performer columns sort by win rate or change versus that Pokémon's overall rate, with change selected by default. Registered build summaries combine equivalent casing/spacing while preserving raw evidence. Ladder remains unavailable pending a verified dataset. Archive preserves frozen publications. Row colors are decorative.

Teammates shows the percentage of the selected Pokémon's complete registered teams that also include each teammate, sorted from most common. Click a teammate to continue exploring its team context. All available detail cards are expanded by default, with Abilities last. Best/worst performer headings refer explicitly to opposing Pokémon teams.

Detail-card lists scroll to show all values. Items, Moves and Teammates use matching card heights; the remaining categories stay compact and scroll when needed.

## Run locally

Requires Node **24.19+ in the 24.x line** and npm. No database service, account or hosted infrastructure is needed.

```powershell
npm ci
npm run ingest
npm run assets:cache
npm run dev
```

Open [Monstats locally](http://127.0.0.1:3000). Production-style local preview: `npm run build`, then `npm start`. Servers bind only to loopback. Browsing reads local publications and artwork; it never triggers collection.

`npm run ingest` discovers all available Limitless M-C listing/completed pages and public Victory Road circuit results. Completed standard Champions events require 20 evidenced entrants within the rolling 30-day window. Listing exhaustion is **not a worldwide census or complete team coverage**. Existing facts are cached for 24 hours; `--force` revisits them. `--max-reads 500` sets a resumable Limitless request budget. The old `--limit` option is retired. Failure preserves saved facts; local date expiry still applies. Polling details stay outside the UI.

Start the independent local worker in a separate terminal:

```powershell
npm run ingest:watch
# Optional hourly discovery:
npm run ingest:watch -- --interval-hours 1
```

Daily is the default. The computer and worker must remain running. Restarting catches up when overdue; failures retry after at least five minutes or the provider's longer cooldown. Ctrl+C stops it. `--once` checks once and exits. No scheduled task, service or hosted resource is installed. Browsing reads one cached immutable cohort and retains interaction state during local publication checks.

Raw snapshots, observations, quarantine, slots, checkpoints and compressed publication versions live in ignored `.monstats/`. Back up this directory; it is never served statically. `MONSTATS_DATA_DIR` consistently selects the directory for app readers, ingestion, audits, traces and artwork.

`npm run ingest -- --archive` freezes the active publication, removes active browsing and disables that cohort's collection. Only M-C is enabled. Incoming regulations require verified configuration, independent staging and deliberate activation; see the [transition procedure](docs/official-coverage.md#operation-and-regulation-transitions). M-D evidence is never relabeled M-C.

## Statistical contract

- **Usage:** one count per complete, resolved registration, never per round. Missing teams are excluded from the denominator, with coverage reported.
- **All:** pool compatible deduplicated counts, never average source percentages. Official events is a separate Masters filter; provider filters select record suppliers. Unknown sheets stay unknown internally; All includes them and OTS/CTS require explicit evidence.
- **Win rate:** wins divided by eligible decisive team perspectives with both complete teams known. One BO3 series is one physical result. Swiss/top cut and BO1/BO3 are pooled.
- **Matches:** distinct physical series contributing to a row. A mirror contributes two perspectives but one displayed match. Overlap can contribute to several matchup rows.
- **Difference:** matchup percentage minus the row Pokémon's overall baseline within identical regulation, date, sheet and event-size rules, in percentage points. It is descriptive and unadjusted.
- **Rankings:** top three by change versus the row Pokémon's overall baseline, with an expanded list and optional win-rate sorting. Self-matchups are excluded. A provisional floor requires 20 physical matches, two events and five row-side players. Edit [config/evidence-floor.json](config/evidence-floor.json), then ingest again to change it.

Ties, double losses, identifiable byes/automatic losses, administrative flags, unsupported phases, missing teams, malformed records and ambiguous winners never become losses. Raw evidence remains available for audit. Real rematches and legitimate results before a player drops remain eligible. Zero is valid; missing rates are distinct from zero.

Registration does not establish what was brought, led, transformed or used a move. Mega identities derive from registered species and held stones; they do not assert that evolution occurred. Original names, source IDs and items stay separate from derived forms.

## Audit and limitations

The latest local publication adds three official Masters Regionals through the pokedata RK9 mirror: **70 events, 7,081 complete registrations and 21,196 eligible physical results** in All. Official alone has 2,522 complete teams and 10,308 results. Community facts were carried forward in this official-only refresh. See the [official report](docs/official-coverage.md) for exclusions, traces and access limits.

The API exposes no general administrative-win marker; unmarked administrative wins cannot currently be identified. Sheet evidence relies on organizer descriptions. Unknown identities or changed payloads can reduce coverage or stop publication. Unavailable artwork uses neutral placeholders. See [methodology](docs/methodology.md) and [roadmap](docs/roadmap.md).

## Validation

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.monstats\browsers'
npx playwright install chromium
npm run test:e2e
```

Browser tests create labeled deterministic fixtures in `.monstats/e2e/` and use a separate server on port 3100. They never replace the owner's database. Client requests are observed; server upstream attempts are blocked and logged. These checks verify behavior, not independent upstream accuracy.

`npm run trace -- incineroar rillaboom`, optionally with `--official` or `--source=pokedata`, verifies a published matchup against source perspectives and writes a private trace. Live audits are separate from offline tests. Local success does not establish production readiness.

`npm run audit:official` separately audits official Masters mirrors; `npm run ingest -- --official-only` publishes their coverage while retaining saved community facts. `npm run audit:sources` snapshots leads and skips RK9 record extraction under its terms. `npm run audit:source` audits Limitless separately. Raw evidence remains ignored.

## Attribution

Data: [Limitless API](https://docs.limitlesstcg.com/developer/tournaments.html), organizer descriptions, [Victory Road circuit results](https://circuit.victoryroad.pro/) and the [pokedata public RK9 mirror](https://pokedata.ovh/standings2/). Parsers are original code. Canonical identities and stones: [@pkmn/dex](https://github.com/pkmn/ps). Artwork: locally cached [Pokémon Showdown sprites](https://play.pokemonshowdown.com/sprites/). Pokémon characters and artwork belong to their respective rights holders. This is an unofficial personal project.

[MunchStats](https://github.com/PizzaTimeJoshua/munchstats) was studied for separating source caches, normalization and aggregates. No license was declared at audit time; no code was incorporated. This application was drafted with OpenAI Codex assistance.

# Next slice proposal: host the accepted MVP

The owner accepted the local MVP on October 1, 2026, including Tournament, Ladder and Archive browsing, and authorized committing/pushing the completed slice as “added ladder data.” Hosting is the next proposed slice; implementation awaits agreed hosting scope.

The smallest hosting slice should make the existing app accessible at an agreed URL with durable published data, local-only request handling and reliable refresh. First choose the hosting account, domain, budget and public access policy. The current Node 24 / Next.js app uses SQLite and local artwork, so the runtime needs persistent storage and a controlled ingestion process. Review which published data and artwork may be distributed; preserve private audit evidence separately. A clean clone has no populated owner database.

Prepare a reproducible deployment package, import validated publications without changing their source timestamps, keep web reads independent of ingestion, and provide refresh ownership, backups, restore checks, health checks and rollback. Verify restart persistence, source failure preservation, concurrent browsing/refresh, accessibility and responsive layouts at the hosted URL. Review the concrete configuration before provisioning or deployment. Account changes, paid services and deployment require the agreed scope; no hosting resource has been created.

Audited replay performance remains the next analysis option after hosting, described below. The source evidence is preserved for resumption.

## Analysis follow-up: audited replay performance or reviewed event coverage

The October 1 Ladder slice implements separate Showdown/Champions Doubles tabs, M-B/M-C monthly BO1/BO3 reports, cartridge M-6 ranks/builds, local atomic publication and independent refresh. See the [ladder report](ladder-coverage.md). The immediate proposed analysis slice is a separate public Showdown replay cohort with complete both-team evidence and BO3 series recovery. The bounded source audit found packed teams and series/next-game links in BO3, while ordinary replays exposed species previews only. Monthly usage and cartridge capture data supply no win/loss outcomes. Agree that performance scope before implementation.

The expanded data, official Masters and detail-formatting slice is complete and accepted; see the [official report](official-coverage.md). Independent source toggles, Apply Filter, baseline-first rankings, canonical build labels, teammate shares and compact scrollable detail tables are implemented. Remaining future work includes a permitted direct RK9 export, additional reviewed event contracts, better administrative/BO evidence, coherent historical cartridge exports and future reviewed ladder seasons. M-D activation, deployment and unrelated analysis remain separate decisions.

The initial draft is complete and accepted. Preserve its glossy usage rows, readable minimalist headers, monochrome Poké Ball logo, expanded detail view and image-only navigation rail.

The [coverage report](data-slice.md) documents integrated tournament sources, deferred sources and concrete follow-ups. A further data slice can select one additional permitted event contract or a coherent historical cartridge export, establish its evidence and review the proposed scope before broad collection. A smaller alternative is the artwork-reliability maintenance slice below. This proposal is not authorization to start another implementation.

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

Pagination, correction/revisit policy, official joins, registered set summaries, set-label canonicalization and audited ladder publications now exist. Additional source contracts, future season contracts, modeling and hosted operations remain separate decisions.

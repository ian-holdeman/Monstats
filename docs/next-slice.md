# Next slice proposal: artwork reliability

The initial draft is complete and accepted. Preserve its glossy usage rows, readable minimalist headers, monochrome Poké Ball logo, expanded detail view and image-only navigation rail.

Artwork reliability is the recommended next slice because missing variants are visible in the accepted interface. This is a prepared proposal, not authorization to start implementation.

## Outcomes

- Audit each unavailable variant against its canonical statistical identity and the available artwork sources.
- Correct mappings where suitable artwork exists. Preserve neutral placeholders where the exact form is unavailable; do not silently substitute a different form.
- Keep collection explicit and artwork local. Browsing must continue to work without contacting upstream services.
- Make missing or failed artwork requests degrade cleanly in usage rows, the detail hero, matchup rows and the navigation rail.
- Preserve existing statistics, filters, sort behavior, keyboard focus and layout.

## Starting point

The local cache covers 84 of 88 identities in the default open-sheet publication. Four use neutral placeholders. Canonical identity logic lives in `src/domain/normalize.ts`, artwork collection in `scripts/sprites.ts`, local serving in `src/app/sprites/[id]/route.ts`, and presentation in `src/components/explorer.tsx` and `src/app/rows.css`.

Ignored `.monstats/` contains the owner's database, cached artwork, source audit, traces and preview captures. Retain it locally; never commit it. A clean checkout needs explicit ingestion and artwork collection as described in the README.

## Completion checks

Document resolved and unavailable variants with their source basis. Verify valid artwork and fallback responses, inspect desktop and narrow layouts, and rerun the relevant offline and browser regressions. Confirm browsing remains local and no statistical publication changes accidentally.

After this slice, the next data priority is expanding bounded discovery toward reviewed 30-day coverage with pagination and a correction/revisit policy. Ladder, set summaries, modeling and hosted operations remain separate decisions.

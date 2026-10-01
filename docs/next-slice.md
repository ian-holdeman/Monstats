# Next slice

The dynamic matchup calculator is completed and accepted as of October 1, 2026. It supports observed tournament performance for one to six registered Pokémon on either side, direct and overall comparisons, and best/worst combination discovery. Clearing and navigation cleanup are included. The [calculation contract and implementation report](dynamic-matchups.md) records behavior, reproduction, evidence rules and local benchmark results; [reusable lessons](lessons-learned.md) cover calculation, indexing and interface decisions.

The owner will prepare the next slice. No further implementation scope has been agreed. Hosting and deployment remain deferred.

## Preserved context

- Tournament, Ladder, Archive and Matchups remain distinct evidence populations. Monthly usage and cartridge rank/build captures do not establish joint team outcomes.
- Preserve immutable publications, raw source evidence, participant namespaces, exclusions and original timestamps. Browsing reads local data and never collects providers or constructs missing indexes.
- Continue the accepted glossy primary-type rows, minimal chrome, source-aware Filters, explicit Apply, accurate displayed summaries and accessible keyboard navigation.
- Resolve routine implementation choices independently once the next scope is agreed; preserve owner data and existing changes.

Possible future work remains recorded in the [roadmap](roadmap.md), [ladder report](ladder-coverage.md), [official report](official-coverage.md) and [coverage report](data-slice.md). These are source leads and planning context, not authorization or delivery commitments. Hosting eventually needs agreed account/domain/budget, distribution rights, durable storage, refresh ownership, backups and rollback.

# Roadmap

The owner accepted the local MVP and completed dynamic matchup calculator on October 1, 2026, then accepted housekeeping and production ingestion on October 2. Tournament, Ladder, Archive and dynamic Matchups browsing are implemented locally. Matchups supports observed tournament performance of one to six Pokémon on either side, including overall performance and best/worst combination discovery. See the [calculation contract and implementation report](dynamic-matchups.md). Hosting is the final planned slice; its [preparation and launch requirements](next-slice.md) target zero additional monthly cost and begin with the owner's existing Google Cloud setup. Exact resources, account/credit headroom and URL choice require verification before provisioning.

The October 2 production-ingestion slice implements daily full-regulation collection, reviewed automatic transitions, immediate Archive placement, one bounded final poll, durable incremental work, compiled workers, diagnostics and isolated recovery/capacity verification. See [operating commands and actual coverage](ingestion-operations.md). Infrastructure provisioning and production access/reuse review remain deployment work.

The initial local draft covers the sketch-based usage/detail interface, real bounded M-C data, separate sheet populations, comparable series performance, evidence-based raw rankings, preserved snapshots/slots/quarantine, atomic SQLite publication and offline/browser verification.

The owner accepted the initial draft on September 30, 2026 and subsequently approved the data slice. That slice now implements paginated Limitless coverage, Victory Road ingestion, source-aware pooled counts, All/OTS/CTS filters, build summaries and an independent local worker. See the [coverage report](data-slice.md) and [next steps](next-slice.md). Further implementation requires agreed scope.

Deferred work:

- Extend audited official Masters coverage beyond the three integrated Regionals when accessible permitted records exist.
- Improve sheet evidence and administrative-outcome detection if richer sources become available.
- Verify incoming UTC regulation/environment/source contracts before enabling automatic transitions. M-D remains disabled.
- Extend build summaries only where sources expose reliable full set fields.
- Add an audited public Showdown replay performance cohort with complete BO3 series recovery, kept separate from monthly usage.
- Review future cartridge seasons and coherent historical exports; current Champions rank/build capture and monthly M-B/M-C Showdown usage are implemented.
- Move/item/set-conditioned analysis beyond the completed species-combination calculator, accounting for sparse evidence.
- Modeling for repeated players, team composition, skill and event/time variation without causal claims or final-event-record leakage.
- Extensive mobile/light-theme polish, more browser engines and improved artwork coverage.
- Broader relational indexing or PostgreSQL beyond the implemented matchup index only when scale warrants it.
- Hosted operations, distribution, authentication and paid features only under separately agreed scope.

Roadmap entries are possible future work, not authorization or delivery commitments.

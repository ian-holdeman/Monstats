# Next slice

The data-integrity slice is completed and accepted as of October 1, 2026. It adds discreet sample notices, event/source evidence, Most evidence ordering and an explicit Apply checkbox to hide entries with notices. Unverifiable player-breadth metrics are omitted. Raw statistics and immutable publications are preserved. The [evidence contract](evidence-context.md) records definitions, versioned backfill, filter behavior and verification.

The dynamic matchup calculator is completed and accepted as of October 1, 2026. It supports observed tournament performance for one to six registered Pokémon on either side, direct and overall comparisons, and best/worst combination discovery. Clearing and navigation cleanup are included. The [calculation contract and implementation report](dynamic-matchups.md) records behavior, reproduction, evidence rules and local benchmark results; [reusable lessons](lessons-learned.md) cover calculation, indexing and interface decisions.

The owner accepted the housekeeping and production-ingestion work on October 2 and authorized committing/pushing the accumulated changes as “improved automated data ingestion.” The final planned slice is hosting for personal use, friends and the local community. Target zero additional monthly cost for as long as practical. The owner has an active Google Cloud trial and is comfortable with a setup similar to the SDET Market Tracker, which uses Cloud Run. Confirm the exact project, billing status and remaining credits before provisioning; no domain or paid plan is approved.

## Hosting preparation

The tested local architecture shares durable SQLite storage between the app and separate tournament/Ladder workers. Its fourfold worker footprint was about 2.8 GB, with 8 GB host headroom proposed for a continuously running combined server. This is capacity evidence, not a requirement to purchase that server.

Evaluate a cost-conscious Cloud Run design first: scale-to-zero browsing with immutable read-only publication artifacts, plus separately scheduled, bounded ingestion and durable publication/evidence storage. Cloud Run's [container filesystem is temporary and memory-backed](https://docs.cloud.google.com/run/docs/container-contract); an active shared SQLite WAL directory cannot simply be deployed there unchanged. Any adaptation must preserve atomic ready publication, durable checkpoints, overlap protection, restart recovery and the exact final-poll window. Do not mount an object-store bucket as a live writable SQLite database.

The [Google Cloud Free Tier](https://cloud.google.com/free/docs/free-cloud-features) has product quotas shared across the billing account. Trial credits are separate from ongoing free usage. Compare combined usage with the existing tracker, including compute, storage, image retention, builds, scheduling, logs and network transfer. Prove the proposed design with measured workloads and a post-trial estimate; do not guarantee a zero bill or silently consume an unapproved paid allocation.

A shareable HTTPS provider URL can avoid buying a domain. Google documents [clean custom Cloud Run URLs](https://docs.cloud.google.com/run/docs/custom-urls) in the `chosen-name.cloud.run` format without domain purchase, DNS or an external load balancer; this feature is Preview and name availability must be checked. Preserve the stable default URL as fallback. A purchased custom domain can be a later optional decision.

The hosting slice should deliver these steps:

1. Confirm the Google project/account, free-tier and credit headroom, region, URL choice and small-community audience. Prepare a concrete zero-cost target with post-trial costs and explicit approval for any recurring paid component. Review source/artwork access and reuse requirements before public distribution; retain the documented exclusions and disabled direct RK9 scraping.
2. Build the accepted Git revision in a clean environment using Node 24.19+ in the 24.x line. Produce the app and compiled workers together, install runtime dependencies, and keep release files separate from persistent data. Do not include private evidence in the repository or static files.
3. Create a consistent owner-data backup, verify its manifest and privately transfer into the selected durable storage design. Verify tournament/Ladder publications, ready indexes and artwork before serving traffic. A Git clone alone does not contain the owner database or cached artwork.
4. Configure least-privilege identities, host-appropriate app/job lifecycles, graceful shutdown and durable restart recovery. Adapt the app's listen address/port to the chosen container contract and preserve `MONSTATS_DATA_DIR` semantics for local materialized reads/work. Dispatch must cover UTC transitions and the final archive opportunity, not only the daily collection slot.
5. Configure the selected HTTPS URL and host access controls. Domain/DNS work is needed only if a separately approved domain is chosen. Keep SQLite files, snapshots, raw registrations, operational diagnostics and private handoffs inaccessible through public HTTP.
6. Set up consistent off-host backups, restore verification, resource/log monitoring and a reviewed notification destination if requested. Establish release rollback with compatible data backups; do not delete evidence or archives as deployment cleanup.
7. Verify the actual host under concurrent browsing/publication, restart and failure scenarios. Check tournament/Archive/Ladder periods, empty/stale/unavailable states, filters, details, Matchups, keyboard/narrow layouts and local-only browser requests. Recheck HTTPS and public-path boundaries.
8. Complete a controlled cutover and record the live URL, deployed revision, worker schedule, backup/rollback commands, operating cost and remaining source limits. Preserve a recovery path to the previous release and publication.

Operating commands, backup procedures, lifecycle boundaries and capacity measurements are in the [ingestion guide](ingestion-operations.md). Google Cloud is the preferred starting point; no cloud resources have been provisioned and no account or domain settings changed during this preparation.

## Preserved context

- Tournament, Ladder, Archive and Matchups remain distinct evidence populations. Monthly usage and cartridge rank/build captures do not establish joint team outcomes.
- Preserve immutable publications, raw source evidence, participant namespaces, exclusions and original timestamps. Browsing reads local data and never collects providers or constructs missing indexes.
- Continue the accepted glossy primary-type rows, minimal chrome, source-aware Filters, explicit Apply, accurate displayed summaries and accessible keyboard navigation.
- Resolve routine implementation choices independently once the next scope is agreed; preserve owner data and existing changes.

Possible future work remains recorded in the [roadmap](roadmap.md), [ladder report](ladder-coverage.md), [official report](official-coverage.md) and [coverage report](data-slice.md). These are source leads and planning context, not authorization or delivery commitments. Hosting eventually needs agreed account/domain/budget, distribution rights, durable storage, refresh ownership, backups and rollback.

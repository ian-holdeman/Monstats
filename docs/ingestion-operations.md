# Daily ingestion and regulation coverage

Monstats runs as a single-host application with separate tournament and Ladder workers, using one persistent local SQLite WAL database and companion artwork directory. Browsing opens read-only local publications and ready indexes; it never contacts providers. This implementation supplies operating commands without installing a service, scheduler or hosted resource.

## Regulation contract

`config/regulations.json` records enabled, reviewed regulation/environment contracts and explicit UTC start/end boundaries. M-C runs from **2026-09-09 02:00 UTC through 2026-12-02 02:00 UTC, exclusive**. The [official regulation notice](https://champions-news.pokemon-home.com/en/page/816.html) and [tournament application](https://victoryroad.pro/champions-regulations/) establish this interval independently of ranked season M-6. Every event must still establish its own compatible rules; dates never relabel an event.

The versioned `regulation-v1` coverage interval starts at that boundary and ends at the lesser of collection cutoff and regulation end. Tournaments, builds, details, evidence, source summaries, baselines and Matchups use the same selected events. Evidenced multi-day official events must finish within the interval; conflicting or unsupported dates are excluded. Legacy immutable publications retain their original recorded options and remain readable.

Before an incoming regulation begins, review its rules, environment, dates and source mappings, set `reviewed: true`, and rebuild the app and workers. Overlapping reviewed intervals are rejected. At the boundary, the worker activates the incoming cohort, even if empty, and atomically places the outgoing publication in Archive. Without a reviewed incoming contract it archives the outgoing cohort and exposes no invented successor. Empty incoming coverage says “No eligible results yet.” Only M-C is presently configured.

Daily collection stops at regulation end. One durable final job becomes due **seven days after the exclusive end**, with a one-hour execution window and a maximum 45-minute attempt. For M-C that is **2026-12-09 02:00–03:00 UTC**. Final reads use the outgoing regulation's saved state and its original coverage interval. A complete final publication and final-job completion commit atomically to Archive. Duplicate dispatch cannot repeat it. Interrupted work may resume only inside the original window. Failure or a missed window permanently retains the last archive and records incomplete finalization; there is no subsequent-day catch-up or later correction sweep.

## Build and start

Requires Node **24.19+ in the 24.x line**. Build with development dependencies in a build workspace:

```sh
npm ci
npm run typecheck
npm run build
```

Deploy the source release's `package.json`, lockfile, `.next`, `public` and `dist/workers` together. Install runtime dependencies with `npm ci --omit=dev` in that release. Compiled workers include reviewed configuration and use Node directly; production does not require `tsx`, TypeScript or esbuild. The app and workers must come from the same build. Keep the data directory outside release replacement. Bundled configuration changes require a rebuild/restart.

Set `MONSTATS_DATA_DIR` to the same **absolute persistent directory** for all processes. It contains `monstats.sqlite`, SQLite WAL files and `sprites`; never serve it statically. The app binds loopback; reverse proxy and hosting setup remain deployment work.

```sh
MONSTATS_DATA_DIR=/srv/monstats-data npm start -- --port 3200
MONSTATS_DATA_DIR=/srv/monstats-data MONSTATS_DAILY_UTC=06:00 npm run ingest:watch
MONSTATS_DATA_DIR=/srv/monstats-data npm run ingest:ladder:watch
```

Equivalent PowerShell environment setup:

```powershell
$env:MONSTATS_DATA_DIR = 'C:\MonstatsData'
$env:MONSTATS_DAILY_UTC = '06:00'
npm run ingest:watch
```

Use a supervisor that restarts interrupted workers and forwards SIGTERM/SIGINT. The continuous tournament worker checks due work every 30 seconds, collects once per configured daily UTC slot, catches up the latest active slot after downtime, and makes at most three attempts per slot with at least five minutes between failures and longer provider cooldowns respected. It does not replay every missed day. Daily jobs have a 45-minute deadline; concurrent dispatch returns contention without consuming the opportunity. A shared ingestion lease prevents overlapping tournament/Ladder publication and is checked through commit. Ctrl+C stops collection gracefully; durable work resumes at the next eligible dispatch.

`npm run ingest:daily` is a one-shot dispatch for an external scheduler. Schedule dispatch frequently enough to cover reviewed transition boundaries and the final one-hour window. **A daily 06:00 dispatch alone misses M-C's 02:00 final window.** Prefer the continuous supervised worker or minute-level dispatch. No machine scheduler is installed by these commands. The retired `--interval-hours` option is rejected.

## Incremental collection and diagnostics

Limitless discovery checkpoints and per-event reads survive interruption and budgets beyond 24 hours. New/unfinished events precede settled coverage. Recent events are checked after 24 hours; events older than seven days use a weekly correction check while active. Forced/final runs bypass normal caches and retain progress scoped to their job. Official and Victory Road adapters preserve partial event reads and saved validated facts. Malformed events have isolated exclusions; provider failures and request limits retain progress. Repeated/unknown pagination cannot assert complete discovery.

```sh
npm run operations -- health
npm run operations -- verify
npm run ingest -- --max-reads 500
npm run regulation:backfill
```

Health JSON exposes durable run/final states, leases, discovery progress, per-source attempt/check/observation/change/publication times, observation lag, carried coverage and exclusions. `alert` is the future external integration point; these commands send no notifications. An exhausted supported listing does not certify worldwide completeness or a fresh complete official response. HTTP access denial, unsupported evidence, validation errors, rate limits, transient failures and lease loss have distinct diagnostics. Total failure preserves the publication; unexpected unexplained event loss or a registration drop greater than 10% blocks replacement for review.

Backfill first uses saved event evidence, stages full-regulation coverage, saves the before/after report and checks overlapping aggregates. Review the staged report before `npm run regulation:activate -- M-C PUBLICATION_ID`. This explicit same-regulation activation retains prior immutable versions. Automatic reviewed future transitions need no per-transition approval. Manual staging does not rewrite frozen historical archives.

Ladder uses `config/ladder-sources.json`: explicitly reviewed Showdown formats and cartridge season contracts remain separate from tournaments. Missing supported months after August 2026 are discovered after downtime, already saved nonlatest monthly cohorts are reused, and the latest report is checked again. M-6/M-C is the sole current cartridge contract; unknown rollover fails closed and saved periods retain their labels. Cartridge reads respect ten-second source spacing and consistent capture/list checks. Persistent `Retry-After` cooldowns survive restarts. The Ladder worker checks daily and retries failures after five minutes or the longer provider cooldown. No outcome feed is inferred.

```sh
npm run ingest:ladder
npm run ingest:ladder -- --environment showdown --months 2026-08,2026-09
npm run ingest:ladder -- --environment champions
npm run assets:cache -- --ladder
```

Artwork follows the separately reviewed [acquisition workflow](artwork.md). Run it after new identities are published. Broken/unavailable exact variants retain neutral placeholders; artwork health is separate and never blocks a valid statistical publication.

## Backup, upgrade and rollback

Use the SQLite backup API rather than copying a live database/WAL pair. Backup includes companion sprites, a SHA-256 manifest, SQLite integrity/foreign-key checks, pointed publication/ready-index checks and Ladder publication/metadata checks. Coordinate with artwork acquisition so companion files remain stable during copying. The destination must be new.

```sh
npm run operations -- backup /backups/monstats-2026-10-02
npm run operations -- restore /backups/monstats-2026-10-02 /srv/monstats-restored
```

Restore validates hashes before creating a new data directory, refuses overwrite and clears expired process leases. It preserves run identities and bounded final deadlines: restoring a missed final job does not authorize a later poll. Keep backups outside the served release and protect their raw evidence/player records.

Before an upgrade, stop writers, create a backup, restore into an isolated directory, set `MONSTATS_DATA_DIR` to it, run `npm run operations -- upgrade`, then `verify`, and start/read the app locally. The additive schema is version 1; schema 0 remains readable and upgrades without changing source publications. Unknown newer schemas are refused. Switch the app/workers together to the verified directory only after validation. Rollback switches to the old release with a separately restored pre-upgrade backup; it never attempts a destructive down-migration. No owner resources are removed by rehearsal.

`npm run operations -- retention` is a dry run. Pin every active/staged/archive pointer, final archive, evidence snapshot, event cache and artwork. Retain the seven newest unpinned derived publications; older redundant versions and their derived indexes may be reviewed for coordinated removal after backup. The command performs no deletion. Raw evidence is not redundant derived data.

## Audited October 2 backfill

| Population                      | Before |  After | Added |
| ------------------------------- | -----: | -----: | ----: |
| Events                          |     70 |     79 |     9 |
| Complete resolved registrations |  7,081 |  7,621 |   540 |
| Eligible physical results       | 21,196 | 22,342 | 1,146 |
| Evidenced entrants              |  7,158 |  7,702 |   544 |

The active full-regulation publication is `c4e63d7e5d2f0e9b`; the prior `19d9614a81c3d516` remains saved. All additions are newly admitted Limitless events; there were no overlapping raw-fact corrections. Overlapping usage/outcome rows and coverage match, and identical inputs do not inflate counts. Eligible observed event starts run September 12 through October 2; no eligible earlier event was established. Supported listing discovery finished, which is a narrower claim than worldwide completeness.

Three previously validated Masters Regionals and compatible Victory Road coverage remain. Fresh Brisbane/Frankfurt mirror responses lack the former explicit final marker, so their saved facts are retained with exclusions rather than promoted as newly completed. Louisville lacks verified final entrant/completion evidence. The future Victory Road event has contradictory attendance. Special/International/Worlds classes are explicitly discovered, but no additional compatible current M-C result contract was established in this audit. The [2026 Worlds article](https://victoryroad.pro/2026-worlds/) establishes M-B and a phase structure outside the currently supported numeric phase contract; it cannot enter M-C. See [official evidence and access limits](official-coverage.md).

Production access/reuse remains a deployment prerequisite. The public [Limitless API documentation](https://docs.limitlesstcg.com/developer.html) describes programmatic access; it is not a blanket redistribution license. [RK9 terms](https://rk9.gg/terms) prohibit automated extraction, so direct scraping stays disabled. Public mirrors/organizer metadata do not establish blanket rights to republish underlying records. No authentication, access restriction or third-party licensing bypass is used.

## Capacity and recovery evidence

Fresh isolated stores measured the expanded owner population and a fourfold synthetic population with distinct canonical events/participants spread across the regulation. Synthetic replication is capacity evidence, not additional real coverage. Both measurements built new publication/index pairs and kept a concurrent read-only SQLite process running.

| Measurement                  | 79 events / 7,621 registrations / 22,342 results | 316 synthetic events / 30,484 registrations / 89,368 results |
| ---------------------------- | -----------------------------------------------: | -----------------------------------------------------------: |
| Publication plus index build |                                           22.9 s |                                                       80.6 s |
| Writer transaction           |                                           0.80 s |                                                       2.72 s |
| Fresh derived database       |                                          51.4 MB |                                                     135.8 MB |
| End process RSS              |                                          1.44 GB |                                                      2.78 GB |
| Concurrent pointer reads     |                                            3,695 |                                                       13,060 |
| Maximum concurrent read      |                                           5.0 ms |                                                       1.4 ms |
| Cold compare, sizes 1–6      |                                     19.6–88.0 ms |                                                61.8–145.6 ms |
| Cold discovery, sizes 1–6    |                                      0.43–0.83 s |                                                  1.94–3.21 s |
| Warm queries                 |                                       2.2–2.5 ms |                                                   2.3–2.8 ms |

RSS is the process footprint measured after work, not a continuously sampled peak. Fresh database sizes exclude owner snapshots, old versions and artwork; actual persistent storage is larger and grows with evidence. CPU/disk and cohort shape affect latency. Reserve at least 8 GB host memory for the tested worker plus app/OS and monitor further growth; these local results do not prove unlimited full-regulation capacity.

The expanded population exposed monolithic JSON serialization limits. Publication hashing now processes bounded sections, storage version 2 shares equal cohort metrics while preserving each cohort's options, and redundant single-copy source serialization was removed. Streaming physical-result counting reduced unnecessary set allocation; independent statistical reference checks remain unchanged. Index creation and ready-pointer publication stay atomic.

An additional fourfold publication rehearsal ran against a populated isolated store with the actual app open. Publication/index replacement took 94.7 seconds, with a 4.0-second writer transaction. All 68 browser reads succeeded (maximum 2.63 seconds), search remained usable, and the browser read the newly published data after reload. There were no page errors or upstream browser requests. This includes concurrent app work; the fresh-store table above isolates publication cost.

An isolated clean `npm ci --omit=dev` installation ran compiled Node workers without local TypeScript/tsx. Consistent backup/restore included artwork and ready indexes. Schema 0 upgraded to 1 and retained the publication across reopen; rollback restored a separate pre-upgrade copy. Offline recovery tests additionally cover interrupted active dispatch, lease contention/loss, index rollback, checksum rejection, final-window restart and duplicate dispatch. Required source evidence is preserved independently of redundant derived versions.

Final checks pass 108 offline tests and all 39 browser checks across the full run and focused fixture/accessibility repair run, plus typecheck, lint, production builds, formatting and whitespace checks. Real-data desktop/narrow review has no overflow, page errors or upstream browser requests. Saved-data Matchups checks agree on 203 ranked rows across three targets. The reviewed artwork refresh validates all 348 saved identities with no unresolved images. Current backup/restore also preserves the expanded publication and independent Ladder datasets.

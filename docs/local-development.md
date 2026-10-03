# Local setup

Requires Node 24.19+ in the 24.x line and npm. SQLite is included in Node; no separate database service is required.

```sh
npm ci
npm run dev
```

Open [127.0.0.1:3000](http://127.0.0.1:3000). Servers bind to loopback. For a production-style local preview:

```sh
npm run build
npm start
```

## Saved data

An empty installation has no statistics. Explicit collection commands contact the configured providers:

```sh
npm run build:workers
npm run ingest
npm run ingest:ladder
npm run assets:cache
```

Only configured source and regulation contracts are collected. Unsupported periods remain unavailable. Failure retains the last valid publication. Browsing never initiates collection.

Data, source evidence, images, and operational state are stored in `.monstats/` and excluded from Git. `MONSTATS_DATA_DIR` selects a different directory consistently for the app and workers. Back up before upgrades; runtime data is not disposable build output.

```sh
npm run operations -- health
npm run operations -- verify
npm run operations -- backup /absolute/path/to/new-backup
npm run operations -- restore /absolute/path/to/backup /absolute/path/to/new-data-directory
```

Backup and restore destinations must be new directories. Backup includes SQLite and cached sprites; retain additional raw evidence files separately. Rehearse recovery into a separate directory before replacing an active installation.

## Tests

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
npx playwright install chromium
npm run test:e2e
```

Browser tests use deterministic fixtures in `.monstats/e2e/` and a separate server on port 3100. Server-side upstream requests are blocked. To use an installed Chrome on PowerShell:

```powershell
$env:MONSTATS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e
```

Offline tests verify application behavior. Live source audits are separate.

# Sleep tools

Two small phone apps for keeping sleep debt low. Each is a single static page that installs as its own app, keeps its data on the device, and exports through the share sheet.

| App | What it does | URL |
|---|---|---|
| [`nights/`](nights/) | One-tap morning check-in (tried / slept well / rested) with a streak for the nights you tried | https://orpheon.github.io/sleep/nights/ |
| [`pvt/`](pvt/) | 3-minute psychomotor vigilance test (PVT-B), trended against yourself | https://orpheon.github.io/sleep/pvt/ |

The root `index.html` is a landing page linking to both. GitHub Pages serves `main` from the repo root.

## Shared origin

Both apps live on `orpheon.github.io`, so they share browser storage:

- **Data:** their localStorage keys are namespaced (`pvt.*`, `nights.*`). Clearing site data for either one clears both, so export backups first.
- **Service workers:** each app only deletes its own old caches (the `pvt-` or `nights-` prefix). Keep that prefix when bumping `CACHE` in a `sw.js`.

## Tests

Each app has its own headless-Chrome suite: `node pvt/test/run.mjs` and `node nights/test/run.mjs`.

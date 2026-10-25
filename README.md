# Personal Boundaries & Identity Atlas

A privacy-first, local-first app for creating and selectively sharing personal preference charts.
Nothing you enter is sent anywhere. See `docs/ATLAS_SPEC_AND_PROGRESS.md` for the specification and progress tracker.

## Commands

| Command | Purpose |
|---|---|
| `npm ci` | Install exact pinned dependencies |
| `npm run dev` | Dev server |
| `npm run verify` | Lint, source scans, tests, production build, build checks |
| `npm run test:e2e` | Playwright against the production build (needs `npx playwright install chromium` once) |

## Layout rules

`src/domain/` is plain JavaScript with no React and no browser storage. Anything imported goes through `src/domain/validation.js` first.

## Docs

- `docs/ATLAS_SPEC_AND_PROGRESS.md`: specification, decisions, progress tracker
- `docs/DATA_MODEL.md`: how the data is shaped and stored
- `docs/SECURITY_AND_PRIVACY.md`: guarantees and what proves them
- `docs/decisions/`: short records of non-obvious choices

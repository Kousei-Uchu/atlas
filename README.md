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

## Templates and modules (M3)

The app bundles 22 templates in `src/content/templates/`, one plain data file each. A template becomes a *module* when it is added to a profile. Adding a module only adds categories and items, never answers. Modules about relationships, intimacy, attraction or the body are intended for adults, start hidden, and show a short note before they are turned on. No age is asked or stored.

- Read the wording without reading code: `npm run templates:wording` writes `docs/TEMPLATE_WORDING.md`.
- Writing or editing a template: see `src/content/templates/README.md`. A template key never changes after release; change the label instead.
- Decisions: `docs/decisions/0010` to `0012`.

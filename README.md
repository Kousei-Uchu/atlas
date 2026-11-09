# Personal Boundaries & Identity Atlas

A privacy-first, local-first app for creating and selectively sharing personal preference charts.
Nothing you enter is sent anywhere. See `docs/ATLAS_SPEC_AND_PROGRESS.md` for the specification and progress tracker.

## Commands

| Command | Purpose |
|---|---|
| `npm ci` | Install exact pinned dependencies |
| `npm run dev` | Dev server |
| `npm run build` | Builds the app and writes the offline service worker (`dist/sw.js`) |
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

- Mature phrasing (D-043): adult modules can carry a direct wording for some entries. The choice is under Modules, with a note first, and it is saved in the profile.
- Read the wording without reading code: `npm run templates:wording` writes `docs/TEMPLATE_WORDING.md`.
- Writing or editing a template: see `src/content/templates/README.md`. A template key never changes after release; change the label instead.
- Decisions: `docs/decisions/0010` to `0012`.

## Audiences, views and exports (M4)

An audience can see a different answer from your own for an item, through an override. Your own answer never changes (I-04). A view is a list of picked items for one audience. It includes an item only if its category is showing, its level passes (sensitive needs the view's switch, restricted needs its own tick), and it has no conflict. Notes need the view's switch and the note's own share switch. The review screen says what is included and what is held back, and why. Markdown, SVG and PNG exports come from one model and each carries the consent statement and a key. Nothing is uploaded.

- Compare an audience with your own answers, and print the comparison, from the audience card.
- The leak tests are `tests/export/export-selection.test.js` (random profiles checked against a plain-words version of the rule) and `tests/export/export.test.js`.
- Decisions: `docs/decisions/0013` to `0016`, and D-048.

## Sharing (M5, in progress)

A view can be shared as a link (`#atlas=1.…`) or as a QR code for short links. The link holds the view's contents and nothing else, is not encrypted, and says so. Opening a link shows a read-only preview, and "Save a copy" adds a new profile without touching the others. Code is in `src/share/`; `jsqr` is a dev dependency used only to test the QR encoder.


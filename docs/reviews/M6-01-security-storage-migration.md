# M6-01: security, storage-failure and migration review

Date: 2026-11-09. Scope: everything built in M1 to M5. Method: read the code paths, then write a test for each doubt, so the answer is a test and not an opinion.

## Security

| Question | Answer | Evidence |
|---|---|---|
| Does the shipped CSP match the headers in `vercel.json`? | Yes, one source (`config/security.js`) | `tests/config/security.test.js` |
| Does any flow, including views, share, QR and print, trigger a CSP block? | No. The e2e fixture now fails any test that logs a CSP violation, in all 130-odd flows | `tests/e2e/fixtures.js` |
| Are test-only libraries (jsQR, axe, fake-indexeddb) in the shipped build? | No | `scripts/check-dist.mjs` now checks this |
| Is the runtime list still react, react-dom, zod, idb, and are all versions exact? | Yes | `tests/config/dependencies.test.js` |
| Known vulnerabilities? | `npm audit` and `npm audit --omit=dev`: 0 | run 2026-11-09 |
| Can a link, backup or template run code, load a resource or change the page? | No: strict schemas, text-only rendering, hex-only colours, a fixed set of icons and patterns, SVG built from an allowlist of elements | share, export and backup tests |
| Does the fragment leave the browser? | No. Browsers do not send it, and `Referrer-Policy: no-referrer` is set anyway | headers test |

No security defect was found in this review. One hardening was added (the CSP guard above).

## Storage failure

| Situation | What the person sees | Evidence |
|---|---|---|
| IndexedDB refuses to open | A plain message, and the heading stays | `storage-failure.spec.js` |
| **IndexedDB does not exist at all** | **Defect found.** `openDB` threw at once inside an effect, React unmounted, and the page was blank. `openAtlasDb` now always returns a rejection, so the message shows | `storage-failure.spec.js`, `open-without-indexeddb.test.js` |
| A save fails (quota full) | "Could not save", the explanation, the change stays on screen, "Try saving again" stores it, and a reload shows it | `storage-failure.spec.js` |
| A stored record is unreadable | It is shown as unreadable and not overwritten | `storage-failure.spec.js` |
| Storage is broken and a share link is opened | The chart shows; "Save a copy" says it could not save and keeps the chart on screen | `storage-failure.spec.js` |

Known limit, not changed: with no storage at all the app offers no in-memory editor, only the message. That is deliberate for now, because work in a page that cannot save is easy to lose. A share link can still be read.

## Migration

The schema is at version 1, so there was nothing to migrate and no framework to test. Before the first schema change needs one, there is now a harness (`src/domain/migrations.js`) with the guarantees the spec asks for:

- Each step is an explicit function from N to N+1, run on a copy, in order. A missing step, a step that throws, or a result at the wrong version fails the whole migration, and nothing half-done is returned.
- Reading never writes. The stored record stays as it was until the person next saves, and then it is replaced by the migrated profile.
- A failed migration is reported as an unreadable record that still offers its original for export (the existing path), with the words "Your original has not been changed".
- Newer data is refused, never converted or trimmed (I-14). Backups from an older version go through the same path.
- Tested with a made-up registry, and through the real repository and backup paths with the schema pretending to be at version 2.

One change to existing behaviour: `saveProfile` used to refuse a stored record of any other version. It now refuses only a newer one, because an older record is meant to be replaced by its migrated profile.

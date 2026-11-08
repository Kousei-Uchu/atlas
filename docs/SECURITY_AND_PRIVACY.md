# Security and privacy (M1 to M6)

Summarises what the app guarantees today and what proves it. Invariant IDs refer to spec section 2.

## What the app does with data

Everything stays in this browser's IndexedDB. There are no accounts, no server, no analytics, no third-party scripts, fonts or CDNs (I-06). The only way data leaves is a file the person downloads. A full backup contains everything including notes, is not encrypted, and is labelled that way next to the button.

## Controls and where they are checked

| Control | Check |
|---|---|
| CSP `default-src 'none'`, `connect-src 'none'`, `script-src 'self'`, no inline script or style | `config/security.js` is the single source. `tests/config/security.test.js`, `scripts/check-dist.mjs`, and e2e (meta tag present; the browser blocks a cross-origin fetch) |
| `vercel.json` headers match the CSP and add `Referrer-Policy: no-referrer`, `nosniff`, a restrictive `Permissions-Policy` | Test fails if `vercel.json` drifts from `config/security.js` |
| No requests to other origins | The e2e fixture fails any test that sees one |
| No logging, network APIs, `innerHTML`, `eval`, or analytics references in `src` | `npm run check:source`, ESLint `no-console` and a ban on `dangerouslySetInnerHTML` |
| Untrusted import: size before read, parse in isolation, forbidden keys (`__proto__`, `constructor`, `prototype`), depth limit, strict schemas, count limits, integrity checks | `tests/domain/validation.test.js`, `tests/storage/backup.test.js`, `tests/components/profiles-backup.test.jsx` |
| Imported data never overwrites (I-12) and failed imports change nothing (byte-identical storage) | `profiles-backup.test.jsx` |
| User text rendered as text only (I-08) | React text nodes, lint ban, no HTML parsing |
| Two tabs cannot overwrite each other | Revision check, `session.test.jsx`, `profile-repository.test.js` |
| A failed save is visible; "Saved" only after commit (I-13) | `session.test.jsx` |
| Exact-pinned dependencies; runtime deps are exactly react, react-dom, zod, idb | `.npmrc save-exact`, CI check, `npm audit --omit=dev` |
| Consent statement always visible (I-02) | `tests/components/notices.test.jsx` |
| Views and exports hold only what the inclusion rule allows; 300 random profiles are checked against an independent oracle (I-11) | `tests/export/export-selection.test.js` |
| Share links are untrusted input: size budget before decoding, streamed inflate that stops at the budget, strict UTF-8, JSON, reserved keys, depth, strict schema, markup shown as text (I-08) | `tests/share/share-codec.test.js`, `tests/e2e/share-preview.spec.js` |
| Opening a link never touches stored profiles; "Save a copy" asks first and merges nothing (I-12) | `tests/components/shared-chart.test.jsx`, `tests/e2e/share-preview.spec.js` |
| The fixed privacy copy is shown before a link is made; nothing calls a link private or secure (I-07) | `tests/components/share-link.test.jsx` |
| No library is shipped for QR codes or tests; test-only libraries are not in the build | `tests/config/dependencies.test.js`, `scripts/check-dist.mjs` |
| Nothing the Content-Security-Policy blocks happens in any end-to-end flow | the e2e fixture fails any test that logs a CSP violation |
| Older data is converted on a copy, never written on read; newer data is refused; a failed conversion leaves the record as it was | `tests/domain/migrations.test.js`, `tests/storage/migration-flow.test.js` |
| Storage that cannot open, a full disk, and an unreadable record are shown plainly and lose nothing | `tests/e2e/storage-failure.spec.js` |

## Known limits

- Browser storage is not a backup and other users of the same browser profile may read it. The app says so on screen.
- Backups are not encrypted (D-020; password protection is M8).
- A share link is a bearer copy. Anyone who has it can read it, it is not encrypted, and browser history, messaging apps, screenshots and synced devices may keep copies. The app says this before a link is made (I-07). A link cannot be recalled.
- If browser storage cannot be opened at all, the app shows a message and does not run an in-memory editor. A share link can still be opened and read.
- A compromised build or hosting account could ship different code. CSP limits what shipped code can do but cannot stop a malicious deploy. Review dependency changes and Vercel access accordingly.
- Dev-only: the dev server has no CSP because hot reload needs inline scripts.

## Reporting and review

Run before each release: `npm run verify`, `npm run test:e2e`, `npm audit --omit=dev`, `npm ls --omit=dev`.

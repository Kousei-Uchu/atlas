# Security and privacy (M1)

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

## Known limits in M1

- Browser storage is not a backup and other users of the same browser profile may read it. The app says so on screen.
- Backups are not encrypted (D-020; password protection is M8).
- Share URLs, exports for audiences and restricted-item opt-in do not exist yet (M4, M5). I-07 and I-11 are enforced when they arrive.
- A compromised build or hosting account could ship different code. CSP limits what shipped code can do but cannot stop a malicious deploy. Review dependency changes and Vercel access accordingly.
- Dev-only: the dev server has no CSP because hot reload needs inline scripts.

## Reporting and review

Run before each release: `npm run verify`, `npm run test:e2e`, `npm audit --omit=dev`, `npm ls --omit=dev`.

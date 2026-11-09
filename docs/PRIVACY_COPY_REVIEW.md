# Privacy copy review (M6-05)

Every fixed sentence about data, sharing and limits, with what makes it true. Wording lives in `src/content/notices.js` and `src/content/about.js`; `tests/content/copy-review.test.js` runs the rules below on all of it.

## Rules
1. Never call the Atlas, a link, a backup or an export private, secure, safe, anonymous, confidential or protected. "Private browsing" is the browser's mode and is allowed.
2. No absolutes ("completely", "guaranteed", "nobody can").
3. Say what leaves the device, who can read it, and that links and backups are not encrypted.
4. Say what the app cannot do: it is not consent, not advice, and it cannot control what others do with a copy.
5. Plain words, short sentences, text only (I-08).

## Sentences and their evidence
| Where | Claim | Why it is true |
|---|---|---|
| Consent notice (always visible, every export) | A chart is not permission | Fixed text, I-02, `notices.test.jsx`, export tests |
| Where your data lives | Stored in this browser; can be lost; others on this profile may read it | IndexedDB only (SECURITY_AND_PRIVACY.md) |
| Nothing is uploaded | Nothing you enter is sent; no accounts or analytics; the host sees a page load; own files kept offline | CSP `connect-src 'none'` on the page, `check-source`, `check-dist`, service worker lists only built files (D-059) |
| Backup notice | Holds everything, including notes; not encrypted | `serialiseBackup`; encryption is M8 |
| Import notice | Import always creates a new profile | I-12, import tests |
| Share notice (wherever a link is made) | Anyone with the link can read it; not encrypted; copies may persist | I-07, share tests |
| Delete-all description | Removes every profile, answer and note in this browser; not downloaded files | delete-all test |
| Notes hints (item and bulk) | Notes are left out of views and exports unless shared on purpose | inclusion rule D-044, leak tests |
| "How the Atlas handles your data" | The same facts in one place, including: host sees a page load; text after the # of a share link is not sent; delete cannot reach copies already made | Fragments are never sent in an HTTP request; delete-all scope |

## Changes made in this review
- "Keep it somewhere private" became "Keep it somewhere only you can open" (it claimed a property the app cannot give).
- "Notes stay private unless..." (item hint, bulk bar) became "Notes are left out of views and exports unless...".
- "Nothing is uploaded" gained two true sentences: the host sees a page load, and the app's own files are kept on the device.
- Added the "How the Atlas handles your data" section in the footer.
- Added the copy rules as a test, so new text cannot reintroduce these words.

## Needs the owner's sign-off (the wording is the owner's, not mine)
- The changed notices above (D-060).
- The review reason text in `view-inclusion.js` and the consent statement (M4-AC-12, still open).
- M3 module wording (D-010, still open).

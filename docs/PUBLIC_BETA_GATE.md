# Public beta gate

Gate (spec 16): "M6 complete: hardened security and accessibility, offline shell, privacy copy reviewed, known limitations documented."

| Criterion | Status | Evidence |
|---|---|---|
| Hardened security | Met | M6-01 review, CSP, share and storage tests, `npm audit` clean |
| Accessibility | Met for automated checks | M6-02 review; manual screen reader pass still open |
| Storage failure and migration safety | Met | M6-01 |
| Cross-browser and mobile | Partly met | M6-03 in Chromium; other engines not yet run |
| Offline shell | Met | M6-04, D-059 |
| Privacy copy reviewed | Met, awaiting owner sign-off on wording | M6-05, `PRIVACY_COPY_REVIEW.md`, copy rules in tests |
| Known limitations documented | Met | `KNOWN_LIMITATIONS.md`, in-app data-handling section |
| No open critical or high privacy or data-loss issue | Met as far as known | tracker risk table |

## Before announcing the beta (owner actions)
1. Run Firefox, Safari and iPhone Playwright projects and the short real-device check in `docs/reviews/M6-03-cross-browser-mobile.md`.
2. Walk one chart with VoiceOver (Mac or iPhone) and TalkBack or NVDA if available.
3. Sign off wording: changed notices (D-060), M4-AC-12, M3 module wording (D-010).
4. After deploying, check in the browser's network panel that `/sw.js` is sent with `connect-src 'self'` and `Cache-Control: no-cache`, and that the page still has `connect-src 'none'`.
5. Open the live site on a phone, make a chart, make a link, open the link, go offline, reload.
6. Decide the public name (O-001) or keep the working title.

When 1 to 5 are done and nothing serious turns up, the beta gate is reached. Findings go in the tracker's risk table, and anything serious becomes a fix before announcing.

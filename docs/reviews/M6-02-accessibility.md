# M6-02 Accessibility review

Scope: every screen together, with all panels open, on desktop and phone (`tests/e2e/a11y-review.spec.js`).

| Check | Result |
|---|---|
| axe, serious and critical, in Light, Dark and High contrast, all panels open | Pass |
| axe under forced colours | Pass |
| One `main`, one `h1`, no skipped heading levels, page title, `lang` | Pass |
| Skip link is the first Tab stop and moves focus into the chart | Fixed (was missing) |
| Every Tab stop shows a visible focus indicator; Tab never gets stuck | Pass |
| Dialog: Escape closes it and focus returns to the opener | Pass |
| Reflow at 320 px, no sideways scrolling | Fixed (Backup panel overflowed to 377 px) |
| Text spacing (WCAG 1.4.12) clips nothing | Pass |
| Reduced motion: no animation or transition left | Pass |
| Actions announced in the polite live region | Pass |
| Phone: buttons, links and fields at least 24 px | Fixed (checkboxes and radios were 13 to 22 px) |

## Fixes
- `App.jsx`: "Skip to the chart" link and `id="main"` on `main`.
- `accessibility.css`: skip link style; checkboxes and radios 1.5rem and not stretched by grid parents; `min-width: 0` on panel blocks and full-width file picker.
- `base.css`: two 1.4rem checkbox rules raised to 1.5rem.

## Not covered here
Real screen readers (VoiceOver, NVDA, TalkBack) and browsers other than Chromium. Those belong to M6-03 and a manual pass before the public beta.

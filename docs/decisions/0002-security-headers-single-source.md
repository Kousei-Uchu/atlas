# 0002. Security headers come from one file

Date: 2026-10-26. Status: accepted.

The CSP must exist in two places: as a response header on Vercel (D-024) and as a meta tag in the built HTML, so it still applies when the static files are served elsewhere. Two hand-written copies would drift.

`config/security.js` defines the policy once. The build injects the meta tag from it, `vercel.json` is generated from it, and a test fails if the committed `vercel.json` differs. The meta tag omits `frame-ancestors`, which browsers ignore in meta tags; it appears only in the header. The dev server gets no CSP because hot reload needs inline scripts.

No `unsafe-inline` is needed: React sets the state colours through the CSSOM (`style.setProperty`), which `style-src 'self'` allows. If a future change adds inline `style=` attributes in markup, the e2e axe and console checks and `check:dist` will catch it.

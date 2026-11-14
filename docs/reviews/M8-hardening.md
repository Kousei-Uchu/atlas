# M8 hardening review (2026-11-14)

Scope: the features added after the public beta gate was written (M7 visualisations, M8 exports, locked backup, item types, audience inheritance, community template files).

## Checks run
| Check | Result |
|---|---|
| `npm audit --omit=dev` | 0 vulnerabilities |
| Runtime dependencies | idb 8.0.4, react 18.3.1, react-dom 18.3.1, zod 4.6.7, all exact pins; no new runtime dependency since M8 began |
| Network audit (e2e, every spec) | no request to another origin; CSP console violations fail tests |
| Inheritance and exports | `tests/export/inheritance-leak.test.js`: an inheriting audience's Markdown, CSV, HTML, SVG and model never contain the parent's name or reason, never show a wider parent setting, never say "inherited" |
| Community template gate | `tests/domain/community-template-fuzz.test.js`: 6000 seeded mutations plus hostile text; nothing throws, every accepted file adds to a valid profile as hidden, no prototype pollution |
| Override reasons | not carried by the export model or share links (grep of `src/share`, `src/export`, `export-model.js`), so inherited reasons stay local |

## Findings
None serious. Two notes:
1. The "(inherited from a parent audience)" note exists only in the in-app Views panel. It is deliberately not in any file, so a recipient cannot learn the audience structure (checked by the test above).
2. Community template text rules match common web-address endings only (stated in D-074).

## Still open, owner side (see PUBLIC_BETA_GATE.md)
Firefox, Safari and iPhone projects, a real-device pass, a screen reader pass, wording sign-offs, deployed header check.
